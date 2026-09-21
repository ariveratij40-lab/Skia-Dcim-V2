#!/usr/bin/env python3
"""Derive the governed, source-bound API context; never build or deploy."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys

SOURCE_SHA = '3ee4da51fcd7c5f026fda389158b5e13df6e0c64'
POLICY_HASH = 'd65ea50d5c04fccdfe78317ecf8cd274bd282cf45e8243d1a0bafe80b351fed7'
CONTEXT_HASH = 'a48c12ee67f604de833df5d5eb8f94d938f9b7d3a7e4e557c64075487cbc58c9'
DOCKERFILE_HASH = 'fd288cc55fe8320604020527ad9717a7c2d9a7b10a2fb717ae9b0249cd84c23f'
DEFAULT_POLICY = Path(__file__).with_name('api_build_context_policy.json')


class GateError(Exception):
    """Only constant, non-secret diagnostic codes may cross the CLI boundary."""


def require(condition, code):
    if not condition:
        raise GateError(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode('utf-8')


def git(repo, *args):
    result = subprocess.run(['git', '-C', str(repo), *args], capture_output=True)
    require(result.returncode == 0, 'GIT_AUTHORITY_UNAVAILABLE')
    return result.stdout


def safe_path(value):
    require(isinstance(value, str) and bool(value), 'INVALID_PATH')
    path = PurePosixPath(value)
    require(value != '.' and not path.is_absolute() and '..' not in path.parts
            and str(path) == value and '\\' not in value, 'UNSAFE_PATH')
    return value


def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'DUPLICATE_JSON_KEY')
        result[key] = value
    return result


def load_policy(path):
    raw = Path(path).read_bytes()
    policy = json.loads(raw, object_pairs_hook=no_duplicate_keys)
    require(set(policy) == {'source_sha', 'included', 'excluded'}, 'POLICY_SCHEMA')
    require(policy['source_sha'] == SOURCE_SHA, 'WRONG_POLICY_SOURCE')
    sources, targets = set(), set()
    for group, keys in [('included', {'source', 'target', 'mode', 'sha256', 'classification'}),
                        ('excluded', {'path', 'classification'})]:
        require(isinstance(policy[group], list), 'POLICY_SCHEMA')
        for entry in policy[group]:
            require(isinstance(entry, dict) and set(entry) == keys, 'POLICY_SCHEMA')
            source = safe_path(entry['source' if group == 'included' else 'path'])
            require(source not in sources, 'DUPLICATE_SOURCE_PATH')
            sources.add(source)
            if group == 'included':
                target = safe_path(entry['target'])
                require('/' not in target and target not in targets, 'DUPLICATE_OR_NESTED_TARGET')
                targets.add(target)
                require(entry['mode'] in ('100644', '100755'), 'UNSUPPORTED_MODE')
    require(raw == encoded(policy), 'NONCANONICAL_POLICY_SERIALIZATION')
    require(digest(raw) == POLICY_HASH, 'POLICY_HASH_MISMATCH')
    return policy


def required(path):
    return path in ('backend/Dockerfile', 'backend/go.mod', 'backend/go.sum') or (
        path.startswith('backend/') and path.count('/') == 1
        and path.endswith('.go') and not path.endswith('_test.go'))


def exclusion(path):
    if path in ('backend/skia-backend', 'backend/skia_backend'):
        return 'CREDENTIAL_BEARING_GENERATED_BINARY_NOT_REQUIRED'
    if path.startswith('backups/') or '.backup' in path or path.endswith('.bak'):
        return 'HISTORICAL_BACKUP_NOT_REQUIRED'
    if path.endswith('_test.go') or 'test' in path.lower():
        return 'TEST_ONLY_NOT_EXECUTED_BY_PRODUCTION_DOCKERFILE'
    if path.startswith('migrations/') or '/migrations/' in path:
        return 'MIGRATION_SQL_SEPARATE_DATABASE_RUNNER_NOT_EMBEDDED_IN_API'
    return 'OUTSIDE_API_PACKAGE_NO_EMBED_OR_BUILD_REFERENCE'


def secret_hygiene(data):
    # Detection is deliberately bounded; immutable source/content pins are the
    # authority. No matched text, file contents or exception payload is emitted.
    patterns = (
        rb'postgres(?:ql)?://[^\s:/"\']+:[^\s@"\']+@',
        rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
        rb'AKIA[0-9A-Z]{16}',
        rb'(?i)(?:password|api_key|client_secret|jwt_secret)\s*[:=]\s*["\'][^"\'\s]{8,}["\']',
    )
    require(not any(re.search(p, data) for p in patterns), 'SECRET_HYGIENE_REJECTED')


def derive(repo, source, output, source_sha=SOURCE_SHA, policy_path=DEFAULT_POLICY):
    require(source_sha == SOURCE_SHA, 'WRONG_RUNTIME_SOURCE')
    policy = load_policy(policy_path)
    require(git(repo, 'rev-parse', source_sha + '^{commit}').decode().strip() == SOURCE_SHA,
            'WRONG_GIT_COMMIT')
    source, output = Path(source), Path(output)
    require(source.is_dir() and not source.is_symlink(), 'INVALID_SOURCE_DIRECTORY')
    require(not output.exists() and not output.is_symlink(), 'OUTPUT_ALREADY_EXISTS')
    require(not output.resolve().is_relative_to(source.resolve()), 'OUTPUT_INSIDE_SOURCE')
    tree = []
    for record in git(repo, 'ls-tree', '-rz', source_sha).split(b'\0'):
        if not record:
            continue
        meta, raw_path = record.split(b'\t', 1)
        mode, kind, oid = meta.decode().split()
        path = safe_path(raw_path.decode('utf-8'))
        require(kind == 'blob' and mode in ('100644', '100755'), 'UNSUPPORTED_GIT_ENTRY')
        tree.append((path, mode, oid))
    expected_paths = {p for p, _, _ in tree}
    expected_dirs = {str(parent) for p in expected_paths for parent in PurePosixPath(p).parents
                     if str(parent) != '.'}
    actual_paths = set()
    for parent, dirs, files in os.walk(source, followlinks=False):
        for name in dirs + files:
            p = Path(parent) / name
            require(not p.is_symlink(), 'SOURCE_SYMLINK_REJECTED')
            require(p.is_dir() or p.is_file(), 'SPECIAL_FILE_REJECTED')
            if p.is_dir():
                require(p.relative_to(source).as_posix() in expected_dirs, 'UNEXPECTED_DIRECTORY')
        actual_paths.update((Path(parent) / name).relative_to(source).as_posix() for name in files)
    require(actual_paths == expected_paths, 'SOURCE_INVENTORY_MISMATCH')
    included, excluded, payload = [], [], {}
    for path, mode, oid in tree:
        p = source / path
        data = p.read_bytes()
        blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        require(blob == oid, 'SOURCE_CONTENT_MISMATCH')
        # Git records executable/non-executable, not group-write archive umask.
        actual_mode = stat.S_IMODE(p.stat().st_mode)
        require(not actual_mode & 0o7000 and bool(actual_mode & 0o111) == (mode == '100755'),
                'SOURCE_MODE_MISMATCH')
        if required(path):
            secret_hygiene(data)
            target = path.removeprefix('backend/')
            included.append(dict(source=path, target=target, mode=mode, sha256=digest(data),
                                 classification='SOURCE_REQUIRED' if path.endswith('.go') else 'BUILD_REQUIRED'))
            payload[target] = (data, int(mode, 8) & 0o777)
        else:
            excluded.append(dict(path=path, classification=exclusion(path)))
    require(dict(source_sha=source_sha, included=included, excluded=excluded) == policy,
            'RULESET_SEMANTIC_MISMATCH')
    require(len(included) == 58 and digest(encoded(included)) == CONTEXT_HASH, 'CONTEXT_HASH_MISMATCH')
    require(digest(payload['Dockerfile'][0]) == DOCKERFILE_HASH, 'DOCKERFILE_MISMATCH')
    # All validation precedes output creation; never overlay existing content.
    output.mkdir(parents=False)
    for target, (data, mode) in payload.items():
        p = output / target
        with p.open('xb') as f:
            f.write(data)
        p.chmod(mode)
        os.utime(p, (0, 0))
    return dict(source_sha=source_sha,
                source_tree=git(repo, 'rev-parse', source_sha + '^{tree}').decode().strip(),
                context_hash=CONTEXT_HASH, policy_hash=POLICY_HASH,
                dockerfile_sha256=DOCKERFILE_HASH, included_count=len(included),
                excluded_count=len(excluded), unknown_build_inputs=0, secret_findings=0)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True, type=Path)
    parser.add_argument('--source-dir', required=True, type=Path,
                        help='Clean extracted Git archive, not a checkout containing .git')
    parser.add_argument('--source-sha', required=True)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--policy', type=Path, default=DEFAULT_POLICY)
    args = parser.parse_args(argv)
    try:
        result = derive(args.repo, args.source_dir, args.output, args.source_sha, args.policy)
    except GateError as exc:
        print('BUILD_CONTEXT_REJECTED=' + str(exc), file=sys.stderr)
        return 1
    except (OSError, ValueError, TypeError, KeyError):
        print('BUILD_CONTEXT_REJECTED=INVALID_INPUT_OR_IO', file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == '__main__':
    sys.exit(main())
