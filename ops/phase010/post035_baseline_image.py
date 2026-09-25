"""Local disposable image build/audit. Does not start containers or contact VPS."""
import argparse
import datetime
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile

import post035_baseline_build as b


def run(args):
    result = subprocess.run(args, capture_output=True)
    b.require(result.returncode == 0, 'LOCAL_IMAGE_OPERATION_FAILED')
    return result.stdout


def audit(archive, repo):
    """Read archive in memory; never extract or report matching bytes."""
    original = b.git(repo, 'show', b.SOURCE+':backend/database_roles.go')
    # The existing value is compared in memory only, never persisted or printed.
    secret = re.search(rb'^const localDevelopmentDSN = "([^"\n]+)"', original, re.M)
    b.require(secret is not None, 'HISTORICAL_SIGNATURE_UNAVAILABLE')
    findings = set()
    binaries = 0
    with tarfile.open(archive) as outer:
        manifests = json.load(outer.extractfile('manifest.json'))
        b.require(len(manifests) == 1, 'SINGLE_IMAGE_REQUIRED')
        manifest = manifests[0]
        config_raw = outer.extractfile(manifest['Config']).read()
        config = json.loads(config_raw)
        blobs = [('CONFIG_HISTORY', config_raw)]
        for layer in manifest['Layers']:
            with tarfile.open(fileobj=io.BytesIO(outer.extractfile(layer).read()), mode='r:*') as inner:
                for entry in inner:
                    name = entry.name.lstrip('./')
                    if entry.isfile():
                        data = inner.extractfile(entry).read()
                        if name == 'app/skia-api':
                            binaries += 1
                        if re.search(r'(^|/)(\.env(?:\..*)?|.*\.(dump|sql|bak|p12|pfx))$|(^|/)(uploads|sessions|backups)/', name, re.I):
                            findings.add('RUNTIME_DATA_OR_SECRET_FILE')
                        if name.startswith('app/') and name != 'app/skia-api':
                            findings.add('UNEXPECTED_APPLICATION_FILE')
                        # System package installation logs are not application logs.
                        if name.endswith('.log') and name != 'var/log/apk.log':
                            findings.add('UNREVIEWED_LOG_FILE')
                        blobs.append(('LAYER_FILE', data))
        for _, data in blobs:
            if secret.group(1) in data:
                findings.add('HISTORICAL_CREDENTIAL')
            if re.search(rb'(?:postgres(?:ql)?|mysql|redis)://[^\s\x00/:]+:[^\s\x00@]+@', data):
                findings.add('CREDENTIAL_DSN')
            # Require key payload, not serialization-library marker constants.
            if re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\s*\n[A-Za-z0-9+/=]{30,}', data):
                findings.add('PRIVATE_KEY_PAYLOAD')
            if re.search(rb'GOCSPX-[A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9]{30,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', data):
                findings.add('TOKEN_PATTERN')
        b.require(binaries == 1, 'APPLICATION_BINARY_COUNT')
        cfg = config['config']
        b.require({x.split('=', 1)[0] for x in cfg.get('Env', [])} <= {'PATH'}, 'IMAGE_ENV_AUTHORITY')
        b.require(cfg.get('Cmd') == ['./skia-api'] and not cfg.get('Entrypoint')
                  and cfg.get('WorkingDir') == '/app' and not cfg.get('Volumes'), 'IMAGE_CONFIG')
    b.require(not findings, 'IMAGE_AUDIT_REJECTED_'+','.join(sorted(findings)))
    return dict(secret_audit='PASS_BOUNDED_STATIC_SCAN', runtime_data_audit='PASS',
                historical_credential_findings=0, credential_dsn_findings=0,
                archive_sha256=b.sha(Path(archive).read_bytes()))


def build(repo, context, evidence):
    policy = b.verify_context(context)
    b.require(not os.environ.get('DOCKER_HOST') and not os.environ.get('BUILDX_BUILDER'),
              'REMOTE_OR_CUSTOM_BUILDER_FORBIDDEN')
    docker_context = json.loads(run(['docker', 'context', 'inspect']))[0]
    b.require(docker_context['Endpoints']['docker']['Host'].startswith('unix://'), 'LOCAL_ENGINE_REQUIRED')
    evidence = Path(evidence)
    b.require(not evidence.exists(), 'EVIDENCE_EXISTS')
    tag = 'skia-post035-disposable-baseline:'+policy['context_hash'][:16]
    existing = subprocess.run(['docker', 'image', 'inspect', tag], capture_output=True)
    b.require(existing.returncode != 0, 'DISPOSABLE_TAG_ALREADY_EXISTS')
    evidence.mkdir(mode=0o700)
    # Exact historical Dockerfile, no build args, no secrets, no alternate target.
    run(['docker', 'build', '--platform', 'linux/amd64', '--tag', tag, str(context)])
    b.verify_context(context)
    inspected = json.loads(run(['docker', 'image', 'inspect', tag]))[0]
    archive = evidence/'image.tar'
    run(['docker', 'image', 'save', '--output', str(archive), inspected['Id']])
    archive.chmod(0o600)
    result = audit(archive, repo)
    result.update(historical_source_sha=b.SOURCE, historical_tree=policy['tree'],
                  transformation_sha256=policy['transform_sha256'],
                  sanitized_source_hash=policy['sanitized_hash'], build_policy_sha256=b.POLICY_HASH,
                  build_context_hash=policy['context_hash'], dockerfile_sha256=policy['dockerfile_sha256'],
                  image_id=inspected['Id'], tag=tag, purpose=b.PURPOSE,
                  build_timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  production_authorized=False)
    with (evidence/'provenance.json').open('xb') as f:
        f.write(b.canonical(result))
    print(json.dumps(result, sort_keys=True))


def verified_image(evidence, repo):
    """Re-audit archive and provenance before a disposable harness may start it."""
    evidence = Path(evidence)
    policy = b.load_policy()
    p = json.loads((evidence/'provenance.json').read_bytes())
    expected = dict(historical_source_sha=b.SOURCE, historical_tree=policy['tree'],
                    transformation_sha256=policy['transform_sha256'],
                    sanitized_source_hash=policy['sanitized_hash'], build_policy_sha256=b.POLICY_HASH,
                    build_context_hash=policy['context_hash'], dockerfile_sha256=policy['dockerfile_sha256'],
                    purpose=b.PURPOSE, production_authorized=False)
    b.require(all(p.get(k) == v for k, v in expected.items()), 'PROVENANCE_MISMATCH')
    result = audit(evidence/'image.tar', repo)
    b.require(all(p.get(k) == v for k, v in result.items()), 'AUDIT_EVIDENCE_MISMATCH')
    inspected = json.loads(run(['docker', 'image', 'inspect', p['image_id']]))[0]
    b.require(inspected['Id'] == p['image_id'] and p['tag'] in inspected.get('RepoTags', []), 'IMAGE_IDENTITY')
    with tarfile.open(evidence/'image.tar') as archive:
        # Docker save may contain an OCI manifest instead of config ID as image ID.
        blobs = {m.name.rsplit('/', 1)[-1] for m in archive.getmembers()}
        b.require(p['image_id'].removeprefix('sha256:') in blobs, 'ARCHIVE_IMAGE_IDENTITY')
    return p['image_id']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--context', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, required=True)
    args = parser.parse_args()
    try:
        build(args.repo, args.context, args.evidence)
    except (b.Rejected, OSError, ValueError, KeyError, tarfile.TarError) as error:
        print('POST035_IMAGE_BUILD=BLOCKED; '+(str(error) if isinstance(error, b.Rejected) else 'IO_OR_FORMAT'))
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
