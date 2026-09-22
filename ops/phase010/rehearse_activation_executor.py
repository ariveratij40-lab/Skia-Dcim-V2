"""Local-only disposable exercise of the actual executor CLI; no production IO.

Keeps fixtures/evidence for review. Passwords and session sentinel use stdin only.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time

import execute_prewindow_activation as e


def run(args, data=None):
    r = subprocess.run(args, input=data, capture_output=True)
    if r.returncode:
        # Executor emits only fixed diagnostic codes; no subprocess stderr.
        for line in r.stdout.splitlines():
            if line.startswith(b'CODE=') and all(c in b'ABCDEFGHIJKLMNOPQRSTUVWXYZ_=' for c in line):
                print(line.decode(), flush=True)
        raise e.Rejected('REHEARSAL_COMMAND_FAILED')
    return r.stdout


def write(path, data):
    with open(path, 'xb') as f:
        os.chmod(path, 0o600)
        f.write(data)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--disposable-rehearsal', action='store_true', required=True)
    parser.add_argument('--repo', required=True)
    args = parser.parse_args()
    prefix = 'skia-activation-test-' + secrets.token_hex(6)
    stage = Path(tempfile.mkdtemp(prefix=prefix + '-')).resolve()
    print('FIXTURE=' + prefix, flush=True)
    print('EVIDENCE=' + str(stage), flush=True)
    d = e.Docker(); t = e.topology(prefix)
    for image in (e.contract.IMAGE, e.WEB):
        d.inspect('image', image)
    source = stage / 'source'; source.mkdir()
    archive = run(['git', '-C', args.repo, 'archive', '7bc42600cb87494dccca50cba26f17352331ca9a'])
    run(['tar', '-xf', '-', '-C', str(source)], archive)
    e.require(not list((source / 'migrations').glob('040*')), 'UNAUTHORIZED_FIXTURE_MIGRATION')
    d.run(['network', 'create', '--internal', prefix])
    d.run(['volume', 'create', t['volume']])
    password = secrets.token_hex(20)
    pg = prefix + '-pg'
    pgbody = {'Image': 'postgres:16.14-alpine',
              'Env': ['POSTGRES_USER=skia_bootstrap', 'POSTGRES_DB=skia_prod', 'POSTGRES_PASSWORD=' + password],
              'HostConfig': {'NetworkMode': prefix, 'PortBindings': {}},
              'NetworkingConfig': {'EndpointsConfig': {prefix: {'Aliases': [pg]}}}}
    pgid = d.create(pg, pgbody); d.run(['start', pgid])
    for _ in range(90):
        try:
            d.run(['exec', pg, 'pg_isready', '-U', 'skia_bootstrap', '-d', 'skia_prod'])
            if b'init process complete' in d.run(['logs', pg]):
                break
        except e.Rejected:
            pass
        time.sleep(1)
    else:
        raise e.Rejected('FIXTURE_PG_NOT_READY')
    d.run(['cp', str(source) + '/.', pg + ':/fixture'])
    sql = ['exec', '-i', pg, 'psql', '-X', '-U', 'skia_bootstrap', '-d', 'skia_prod', '-v', 'ON_ERROR_STOP=1', '-At']
    provision = ''.join('\\set ' + k + " '" + password + "'\n" for k in
                        ('migrator_password', 'runtime_password', 'onboarding_password'))
    provision += '\\i /fixture/ops/phase011/provision_database_roles.sql\n'
    d.run(sql, provision.encode())
    bootstrap = ('export PGPASSWORD=' + password + '\n'
                 'export PHASE010_DATABASE_URL=postgresql://skia_migrator@localhost/skia_prod\n'
                 'exec bash /fixture/ops/phase010/run_clean_bootstrap.sh\n')
    d.run(['exec', '-i', pg, 'sh'], bootstrap.encode())
    d.run(sql, provision.encode())
    d.run(sql, b"\\set phase011_environment production\n\\set expected_database skia_prod\n"
          b"\\set execution_approval PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED\n"
          b"\\i /fixture/ops/phase011/activate_clean_production_rls.sql\n")
    for validator in ('validate_runtime_auth_role.sql', 'validate_onboarding_role.sql'):
        d.run(sql, ('\\i /fixture/ops/phase011/' + validator + '\n').encode())
    raw_dump = d.run(['exec', pg, 'pg_dump', '-U', 'skia_bootstrap', '-d', 'skia_prod',
                      '--schema-only', '--no-owner', '--no-privileges'])
    raw_dump = b''.join(line for line in raw_dump.splitlines(keepends=True)
                        if not line.startswith((b'\\restrict', b'\\unrestrict')))
    e.require(e.digest(raw_dump) == e.POST039, 'FIXTURE_FINGERPRINT')
    fixture = """
INSERT INTO tenants(id,name) VALUES('f2000000-0000-4000-8000-000000000001','Disposable');
INSERT INTO users(id,email,name,password_hash) VALUES('f2000000-0000-4000-8000-000000000002','fixture@example.invalid','Fixture','synthetic');
INSERT INTO branches(id,tenant_id,code,name) VALUES('f2100000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','T','Test');
INSERT INTO user_tenants(user_id,tenant_id) VALUES('f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001');
INSERT INTO user_branches(user_id,branch_id) VALUES('f2000000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001');
INSERT INTO user_roles(user_id,tenant_id,role_id) SELECT 'f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001',id FROM roles WHERE name='admin';
INSERT INTO sessions(user_id,tenant_id,branch_id,token,expires_at) VALUES('f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','synthetic-executor-session',extract(epoch from now())::bigint+7200);
"""
    d.run(sql, fixture.encode())
    def data_hash():
        dump = d.run(['exec', pg, 'pg_dump', '-U', 'skia_bootstrap', '-d', 'skia_prod',
                      '--data-only', '--no-owner', '--no-privileges'])
        return e.digest(b''.join(line for line in dump.splitlines(keepends=True)
                                if not line.startswith((b'\\restrict', b'\\unrestrict'))))
    before_data = data_hash()
    # A stopped historical local API image (never started against post039).
    # The old WEB can perform Node read probes before its own replacement.
    for c in ('api', 'web'):
        b = e.body(t, c, {})
        if c == 'api':
            b['Image'] = 'sha256:35e62b53527a2562b8db49902b2baba08d366564098a2f3b1b8b05f17ea7d5d9'
            d.inspect('image', b['Image'])
        else:
            b['Image'] = 'sha256:3fae38986f33404f205d13e49839c4d5d0e84ca18d4125ab3c6a21be43fdad14'
            d.inspect('image', b['Image'])
            b['Env'] = ['NEXT_PUBLIC_API_URL=https://skia.mx']
        cid = d.create(t[c], b)
        if c == 'web':
            d.run(['start', cid])
            for _ in range(60):
                if d.inspect('container', cid)['State'].get('Health', {}).get('Status') == 'healthy':
                    break
                time.sleep(1)
            else:
                raise e.Rejected('FIXTURE_WEB_NOT_HEALTHY')
    env = {'GOOGLE_CLIENT_ID': 'synthetic-client.apps.googleusercontent.com',
           'GOOGLE_CLIENT_SECRET': 'synthetic-executor-secret'}
    for name, role in zip(e.contract.expected()['required_secret_names'],
                          ('skia_runtime', 'skia_migrator', 'skia_onboarding')):
        env[name] = 'postgresql://' + role + ':' + password + '@' + pg + '/skia_prod?sslmode=disable'
    secret_file = stage / 'fixture.env'; session_file = stage / 'session'
    write(secret_file, '\n'.join(k + '=' + v for k, v in env.items()).encode())
    write(session_file, b'synthetic-executor-session')
    # Fixture-only upload sentinel. No business data or image alteration.
    helper = d.create(prefix + '-upload-fixture', {
        'Image': e.WEB, 'Entrypoint': ['node'],
        'Cmd': ['-e', "require('fs').writeFileSync('/fixture/sentinel','uploads-preserved')"],
        'HostConfig': {'NetworkMode': 'none', 'Mounts': [{'Type': 'volume',
                     'Source': t['volume'], 'Target': '/fixture', 'ReadOnly': False}]}})
    d.run(['start', helper]); e.require(d.run(['wait', helper]).strip() == b'0', 'UPLOAD_FIXTURE')
    ledger_raw = d.run(sql, b"SELECT json_agg(json_build_object('path',path,'sha256',sha256) ORDER BY applied_at, path) FROM production_bootstrap_migrations;\n")
    ledger = json.loads(ledger_raw)
    expected = json.loads((e.HERE / 'upgrade_036_039.json').read_bytes())['migrations']
    e.require({x['path']: x['sha256'] for x in ledger} == {x['path']: x['sha256'] for x in expected}, 'FIXTURE_LEDGER')
    e.require(d.run(sql, b'SELECT count(*) FROM system_naming_presets;\n').strip() == b'0', 'FIXTURE_CATALOG')
    now = int(time.time())
    evidence = {'window': 'rehearsal', 'daemon_id': d.daemon(), 'database': 'skia_prod',
                'database_identity': pgid, 'observed_at': now, 'ledger': expected,
                'catalog_count': 0, 'migration_040_count': 0, 'fingerprint': e.POST039,
                'security_pass': True, 'tenant_preservation_pass': True,
                'writers_isolated': True, 'admission_closed': True}
    eraw = json.dumps(evidence).encode()
    vol = d.inspect('volume', t['volume'])
    auth = {'activation_authorized': True, 'environment': 'disposable', 'database': 'skia_prod',
            'package_sha256': e.package_digest(), 'api_image': e.contract.IMAGE, 'web_image': e.WEB,
            'topology': t, 'issued_at': now, 'expires_at': now + 900, 'window': 'rehearsal',
            'operator': 'fixture', 'db_evidence_sha256': e.digest(eraw), 'daemon_id': d.daemon(),
            'network_id': d.inspect('network', prefix)['Id'],
            'volume_identity': {k: vol.get(k) for k in ('Name', 'Driver', 'CreatedAt', 'Options', 'Labels')},
            'current_containers': {c: d.inspect('container', t[c])['Id'] for c in ('api', 'web')}}
    write(stage / 'authorization.json', json.dumps(auth).encode())
    write(stage / 'database.json', eraw)
    argv = [sys.executable, '-B', str(e.HERE / 'execute_prewindow_activation.py'),
            '--disposable-prefix', prefix, '--authorization', str(stage / 'authorization.json'),
            '--database-evidence', str(stage / 'database.json'), '--session-file', str(session_file),
            '--disposable-secret-file', str(secret_file), '--journal', str(stage / 'activation-rehearsal.jsonl')]
    print(run([*argv, '--verify']).decode().strip(), flush=True)
    print(run([*argv, '--execute']).decode().strip(), flush=True)
    e.require(d.run(['exec', t['api'], 'cat', '/app/uploads/sentinel']) == b'uploads-preserved', 'UPLOADS_LOST')
    print('UPLOADS_PRESERVED=PASS', flush=True)
    e.require(data_hash() == before_data, 'DATABASE_DATA_DELTA')
    for validator in ('validate_runtime_auth_role.sql', 'validate_onboarding_role.sql'):
        d.run(sql, ('\\i /fixture/ops/phase011/' + validator + '\n').encode())
    print('DATABASE_DATA_PRESERVED=PASS; SECURITY_VALIDATORS=PASS', flush=True)
    print('ACTUAL_EXECUTOR_REHEARSAL=PASS; FIXTURES_PRESERVED=YES', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('REHEARSAL=FAILED; FIXTURES_PRESERVED=YES')
        raise SystemExit(1)
