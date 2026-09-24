#!/usr/bin/env python3
"""P0-only execution. Default is offline plan; production needs external authority."""
import argparse
import json
import os
from pathlib import Path
import re
import stat
import time

import b3b_release as b
import p0_security_repair as r
import upgrade_036_039 as u

BASE = '67996bbf3e40077c0adc8d72bd817a4d1fd8cfd3'
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
STORE = Path('/var/lib/skia/p0-security-repair')
MAX_LIFETIME = 900
CLOSURE = ('execute_p0_production_repair.py', 'p0_security_repair.py',
           'p0_production_identity.json', 'b3b_release.py', 'b3b_structure.sql',
           'upgrade_036_039.py', 'upgrade_036_039.json', 'b3b_recovery.py')
SPEC = 'docs/phases/active/PHASE_1_2F_P0_REMEDIATION.md'


def strict_json(raw):
    def pairs(items):
        out = {}
        for key, value in items:
            b.require(key not in out, 'DUPLICATE_FIELD')
            out[key] = value
        return out
    return json.loads(raw, object_pairs_hook=pairs)


def protected(path, uid=0, directory=False):
    path = Path(path).absolute()
    for item in (path, *path.parents):
        info = item.lstat()
        b.require(not stat.S_ISLNK(info.st_mode), 'SYMLINK')
        if uid == 0:
            b.require(info.st_uid == 0 and not info.st_mode & 0o022, 'ROOT_PATH')
    info = path.lstat()
    b.require(info.st_uid == uid, 'OWNER')
    b.require(stat.S_IMODE(info.st_mode) == (0o700 if directory else 0o600), 'MODE')
    b.require(stat.S_ISDIR(info.st_mode) if directory else
              stat.S_ISREG(info.st_mode) and info.st_nlink == 1, 'TYPE')
    if directory:
        return
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        actual = os.fstat(fd)
        b.require((actual.st_dev, actual.st_ino, actual.st_uid, actual.st_mode,
                   actual.st_nlink) == (info.st_dev, info.st_ino, info.st_uid,
                                       info.st_mode, info.st_nlink), 'FILE_RACE')
        b.require(actual.st_size <= 16384, 'SIZE')
        return os.read(fd, 16385)
    finally:
        os.close(fd)


def tooling_hash():
    return b.digest(b.canonical({name: b.file_hash(HERE/name) for name in CLOSURE}))


def manifest_hash():
    # One routine list; full security/body metadata is the already reviewed spec.
    return b.digest(b.canonical({'routines': r.ROUTINES,
                                'spec_sha256': b.file_hash(ROOT/SPEC)}))


def database_identity(db):
    return db.query("SELECT jsonb_build_object('database',current_database(),"
                    "'owner',pg_get_userbyid(datdba),'oid',oid::text,"
                    "'cluster',(SELECT system_identifier::text FROM pg_control_system()),"
                    "'version',current_setting('server_version')) FROM pg_database "
                    "WHERE datname=current_database()")[0]


class ProductionAuthority:
    uid = 0
    store = STORE

    def __init__(self):
        b.require(os.geteuid() == 0, 'ROOT_REQUIRED')
        self.contract = strict_json((HERE/'p0_production_identity.json').read_bytes())
        self.db = b.DB('skia_postgres_prod', 'skia_prod', 'skia_bootstrap')

    def provenance(self, sha):
        b.require(re.fullmatch('[a-f0-9]{40}', sha or ''), 'CANONICAL_SHA')
        b.require(b.git(ROOT, 'rev-parse', 'HEAD').decode().strip() == sha, 'CANONICAL_SHA')
        b.git(ROOT, 'merge-base', '--is-ancestor', BASE, sha)
        # Executable closure must be root-controlled AND byte-identical to SHA.
        for relative in ['ops/phase010/'+p for p in CLOSURE] + [SPEC]:
            path = ROOT/relative
            for item in (path, *path.parents):
                info = item.lstat()
                b.require(not stat.S_ISLNK(info.st_mode) and info.st_uid == 0
                          and not info.st_mode & 0o022, 'TOOLING_PATH_AUTHORITY')
            b.require(path.read_bytes() == b.git(ROOT, 'show', sha+':'+relative),
                      'TOOLING_PROVENANCE')

    def operator(self, name):
        b.require(name == 'alvaro' and os.environ.get('SUDO_USER') == name,
                  'OPERATOR_IDENTITY')

    def check_identity(self, db=None):
        # Pin daemon/host/container/image/network, not merely a database name.
        b.require(not any(os.environ.get(k) for k in
                         ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY',
                          'DOCKER_CERT_PATH')), 'REMOTE_DOCKER_OVERRIDE')
        context = strict_json(b.run(['docker', 'context', 'inspect']))[0]
        b.require(context['Endpoints']['docker']['Host'] == 'unix:///var/run/docker.sock',
                  'LOCAL_PRODUCTION_SOCKET')
        c = strict_json(b.run(['docker', 'inspect', 'skia_postgres_prod']))[0]
        observed = {'environment': 'production', 'container': c['Name'].lstrip('/'),
                    'container_id': c['Id'], 'image': c['Image'],
                    'networks': {n: x['NetworkID'] for n, x in
                                 c['NetworkSettings']['Networks'].items()},
                    'daemon': b.run(['docker', 'info', '--format', '{{.ID}}']).decode().strip(),
                    'machine_id': Path('/etc/machine-id').read_text().strip(),
                    'database_identity': database_identity(db or self.db)}
        b.require(observed == self.contract, 'TARGET_IDENTITY')
        b.require(c['State']['Running'] and c['State'].get('Health', {}).get('Status')
                  == 'healthy', 'POSTGRES_HEALTH')


def validate_authorization(a, authority, now=None):
    now = time.time() if now is None else now
    expected = {'purpose': 'P0_SECURITY_REPAIR', 'environment': 'production',
                'database': 'skia_prod', 'tooling_sha256': tooling_hash(),
                'manifest_sha256': manifest_hash(), 'source_structure': r.DRIFT,
                'target_structure': r.CANONICAL, 'raw_fingerprint': r.RAW,
                'affected_routine_count': 8, 'source_ledger': 27, 'catalog_count': 0}
    b.require(set(a) == set(expected) | {'canonical_sha', 'operator', 'issued_at',
                                       'expires_at', 'id'}, 'AUTH_FIELDS')
    b.require(all(type(a[k]) is type(v) and a[k] == v for k, v in expected.items()),
              'AUTH_CONTRACT')
    b.require(isinstance(a['operator'], str) and
              re.fullmatch('[a-z_][a-z0-9_-]{0,63}', a['operator']), 'OPERATOR')
    authority.operator(a['operator'])
    b.require(isinstance(a['id'], str) and re.fullmatch('[a-f0-9]{32}', a['id']), 'NONCE')
    b.require(type(a['issued_at']) is int and type(a['expires_at']) is int and
              0 < a['expires_at']-a['issued_at'] <= MAX_LIFETIME and
              a['issued_at'] <= now < a['expires_at'], 'AUTH_EXPIRED')
    authority.provenance(a['canonical_sha'])


def exclusive_json(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(b.canonical(value))
            f.flush()
            os.fsync(f.fileno())
    finally:
        # fd is owned by fdopen, including failures. Never remove uncertain evidence.
        pass
    parent = os.open(Path(path).parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(parent)
    finally:
        os.close(parent)


def execute(path, authority):
    protected(authority.store, authority.uid, directory=True)
    path = Path(path).absolute()
    b.require(path.parent == authority.store, 'AUTH_LOCATION')
    a = strict_json(protected(path, authority.uid))
    validate_authorization(a, authority)
    b.require(path.name == a['id']+'.json', 'AUTH_NAME')
    authority.check_identity()
    # Durable spent-before-mutation semantics. All failures require new review.
    exclusive_json(authority.store/(a['id']+'.claimed'),
                   {'id': a['id'], 'state': 'CLAIMED_OUTCOME_REQUIRES_CLASSIFICATION'})
    db = authority.db
    b.require(db.fingerprint() == r.RAW, 'RAW_SOURCE')
    ledger = r.verify_source(db)
    before = u.baseline(db, project=False)
    exclusive_json(authority.store/(a['id']+'.before'),
                   {'ledger': ledger, 'structure': r.DRIFT, 'raw': r.RAW,
                    'manifest': manifest_hash(), 'baseline': before})

    def guard(tx):
        validate_authorization(a, authority)
        authority.check_identity(tx)

    r._repair(db, before_mutation=guard, precommit=guard, expected_baseline=before)
    authority.check_identity()
    b.require(b.structure(db)['hash'] == r.CANONICAL, 'POST_STRUCTURE')
    b.require(db.fingerprint() == r.RAW, 'POST_RAW')
    b.require(u.baseline(db, project=False) == before, 'POST_BUSINESS_DELTA')
    b.require(db.query('SELECT jsonb_agg(jsonb_build_array(path,sha256) ORDER BY path) '
                       'FROM public.production_bootstrap_migrations;') == [ledger], 'POST_LEDGER')
    b.require(db.query('SELECT count(*) FROM public.system_naming_presets;') == [0],
              'POST_CATALOG')
    exclusive_json(authority.store/(a['id']+'.success'),
                   {'state': 'COMMITTED_VERIFIED', 'structure': r.CANONICAL,
                    'raw': r.RAW, 'ledger': 27, 'catalog': 0,
                    'business_baseline_match': True})


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--execute-production', action='store_true')
    p.add_argument('--authorization', type=Path)
    args = p.parse_args()
    if not args.execute_production:
        b.require(args.authorization is None, 'EXECUTION_MODE_REQUIRED')
        print('MODE=PLAN; PRODUCTION_EXECUTION_AUTHORIZED=NO')
        return
    b.require(args.authorization is not None, 'AUTHORIZATION_REQUIRED')
    execute(args.authorization, ProductionAuthority())
    print('P0_REPAIR=COMMITTED_VERIFIED')


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        print('P0_REPAIR=STOPPED; READ_ONLY_CLASSIFICATION_REQUIRED; NO_AUTOMATIC_RETRY')
        raise SystemExit(1)
