"""Disposable VPS-local rehearsal only; requires explicit --disposable-rehearsal.

Never reads production credentials or connects to production networks/database.
Failed fixtures are preserved. No automatic cleanup or activation implementation.
"""
import argparse
import json
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import prewindow_activation as p

WEB = 'sha256:6cf014e5f31625b60d8e0a810a7f0374fd6236096b31fbcb8144322a6b916e03'


def run(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True)
    if result.returncode:
        raise RuntimeError('DISPOSABLE_COMMAND_FAILED_' + args[0])
    return result.stdout


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--disposable-rehearsal', action='store_true', required=True)
    parser.add_argument('--repo', required=True)
    args = parser.parse_args()
    prefix = 'skia-prewindow-test-' + secrets.token_hex(6)
    password = secrets.token_hex(20)
    stage = Path(tempfile.mkdtemp(prefix=prefix + '-'))
    print('DISPOSABLE_PREFIX=' + prefix, flush=True)
    print('DISPOSABLE_EVIDENCE=' + str(stage), flush=True)
    # Historical canonical post039 fixture; 040 cannot enter this archive.
    source = stage / 'source'; source.mkdir()
    archive = run(['git', '-C', args.repo, 'archive', '7bc42600cb87494dccca50cba26f17352331ca9a'])
    run(['tar', '-xf', '-', '-C', str(source)], archive)
    assert not list((source / 'migrations').glob('040*'))
    run(['docker', 'image', 'inspect', p.IMAGE])
    run(['docker', 'image', 'inspect', WEB])
    run(['docker', 'network', 'create', '--internal', prefix])
    run(['docker', 'volume', 'create', prefix + '-uploads'])
    pg = prefix + '-pg'
    run(['docker', 'run', '-d', '--name', pg, '--network', prefix,
         '-e', 'POSTGRES_USER=skia_bootstrap', '-e', 'POSTGRES_PASSWORD=' + password,
         '-e', 'POSTGRES_DB=skia_prod', 'postgres:16.14-alpine'])
    for _ in range(60):
        probe = subprocess.run(['docker', 'exec', pg, 'pg_isready', '-U', 'skia_bootstrap', '-d', 'skia_prod'], capture_output=True)
        if probe.returncode == 0 and b'init process complete' in run(['docker','logs',pg]):
            break
        time.sleep(1)
    else:
        raise RuntimeError('DISPOSABLE_DATABASE_NOT_READY')
    run(['docker', 'cp', str(source) + '/.', pg + ':/fixture'])
    sql = ['docker', 'exec', pg, 'psql', '-X', '-U', 'skia_bootstrap', '-d', 'skia_prod', '-v', 'ON_ERROR_STOP=1']
    provision = sql + ['-v', 'migrator_password=' + password, '-v', 'runtime_password=' + password,
                       '-v', 'onboarding_password=' + password, '-f', '/fixture/ops/phase011/provision_database_roles.sql']
    run(provision)
    run(['docker', 'exec', '-e', 'PHASE010_DATABASE_URL=postgresql://skia_migrator:' + password + '@localhost/skia_prod',
         pg, 'bash', '/fixture/ops/phase010/run_clean_bootstrap.sh'])
    run(provision)
    run(sql + ['-v','phase011_environment=production','-v','expected_database=skia_prod',
               '-v','execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED',
               '-f','/fixture/ops/phase011/activate_clean_production_rls.sql'])
    counts = run(sql + ['-Atc', "SELECT count(*) FROM production_bootstrap_migrations; SELECT count(*) FROM production_bootstrap_migrations WHERE path LIKE 'migrations/040%'; SELECT count(*) FROM system_naming_presets;"])
    assert counts.strip() == b'31\n0\n0'
    print('DISPOSABLE_POST039=LEDGER31_CATALOG0_NO040', flush=True)
    # Synthetic tenant/session enables non-mutating authenticated reads.
    fixture = """
    INSERT INTO tenants(id,name) VALUES('f2000000-0000-4000-8000-000000000001','Disposable');
    INSERT INTO users(id,email,name,password_hash) VALUES('f2000000-0000-4000-8000-000000000002','fixture@example.invalid','Fixture','synthetic');
    INSERT INTO branches(id,tenant_id,code,name) VALUES('f2100000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','T','Test');
    INSERT INTO user_tenants(user_id,tenant_id) VALUES('f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001');
    INSERT INTO user_branches(user_id,branch_id) VALUES('f2000000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001');
    INSERT INTO user_roles(user_id,tenant_id,role_id) SELECT 'f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001',id FROM roles WHERE name='admin';
    INSERT INTO sessions(user_id,tenant_id,branch_id,token,expires_at) VALUES('f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','synthetic-prewindow-session',extract(epoch from now())::bigint+7200);
    """
    run(sql + ['-c', fixture])
    plan = p.disposable_plan(p.expected(), prefix, password)
    name = plan.pop('name')
    created = run(['curl','--fail','--silent','--show-error','--unix-socket','/var/run/docker.sock',
                   '-H','Content-Type: application/json','-X','POST',
                   'http://localhost/containers/create?name=' + name,'--data-binary','@-'], json.dumps(plan).encode())
    assert json.loads(created)['Id']
    run(['docker','start',name])
    for _ in range(60):
        state = json.loads(run(['docker','inspect',name]))[0]
        if state['State'].get('Health',{}).get('Status') == 'healthy': break
        time.sleep(1)
    else: raise RuntimeError('CANDIDATE_NOT_HEALTHY')
    assert not state['HostConfig']['PortBindings']
    assert list(state['NetworkSettings']['Networks']) == [prefix]
    assert state['Mounts'][0]['Name'] == prefix + '-uploads'
    for path in ['/api/auth/me','/api/dcim/sites','/api/infra/mdf-idf','/api/infra/racks',
                 '/api/dcim/assets','/api/dcim/placements','/api/dcim/catalogs/naming-rules']:
        guard = subprocess.run(['docker','exec',name,'wget','-S','-O','/dev/null','http://localhost:8080'+path], capture_output=True)
        assert b'401 Unauthorized' in guard.stderr
        run(['docker','exec',name,'wget','-q','-O','/dev/null','--header=Cookie: session_token=synthetic-prewindow-session','http://localhost:8080'+path])
        print('AUTHENTICATED_READ_PASS=' + path, flush=True)
    # WEB in the same isolated network: no published ports and no external DB.
    web = prefix + '-web'
    run(['docker','run','-d','--name',web,'--network',prefix,WEB])
    for _ in range(30):
        probe = subprocess.run(['docker','exec',web,'wget','-q','--spider','http://localhost:3000/login'],capture_output=True)
        if probe.returncode == 0: break
        time.sleep(1)
    assert probe.returncode == 0
    for path in ['/login','/infraestructura/racks','/infraestructura/catalogs/nomenclaturas']:
        run(['docker','exec',web,'wget','-q','-O','/dev/null','http://localhost:3000'+path])
    run(['docker','exec',web,'wget','-q','-O','/dev/null','http://'+name+':8080/api/health'])
    # Inspect build-time routing and construct an OAuth redirect without ever
    # following it to Google. Only synthetic fixture credentials are configured.
    verification = r"""
const fs=require('fs'),http=require('http');
let files=[]; function walk(p){for(const n of fs.readdirSync(p)){
 const x=p+'/'+n;fs.statSync(x).isDirectory()?walk(x):files.push(x)}}
walk('/app/.next/static');let old=0,good=0;
for(const p of files){const s=fs.readFileSync(p,'utf8');
 if(/https?:\/\/skia\.mx(?:[\/"']|$)/.test(s))old++;
 if(s.includes('https://skia.iamet.mx'))good++;}
if(old || !good)process.exit(1);
console.log('COMPILED_HOST_ALIGNMENT=PASS');
http.get('http://backend:8080/api/auth/google',r=>{
 const u=new URL(r.headers.location);
 if(r.statusCode!==302 || u.searchParams.get('redirect_uri')!==
 'https://skia.iamet.mx/api/auth/google/callback' ||
 u.searchParams.get('client_id')!=='synthetic-client.apps.googleusercontent.com' ||
 (r.headers['set-cookie']||[]).some(s=>/domain=/i.test(s)))process.exit(1);
 console.log('SYNTHETIC_AUTH_REDIRECT_HOST_ONLY=PASS');r.resume();
}).on('error',()=>process.exit(1));
"""
    print(run(['docker','exec','-i',web,'node'], verification.encode()).decode(), end='')
    print('DISPOSABLE_API_ACTIVATION=PASS', flush=True)
    print('DISPOSABLE_WEB_API_NETWORK_AND_SURFACES=PASS', flush=True)
    print('PUBLIC_BROWSER_ROUTING=NOT_TESTED_ISOLATED_NETWORK', flush=True)
    print('FIXTURES_PRESERVED_NO_PRODUCTION_CONNECTION=YES', flush=True)


if __name__ == '__main__':
    main()
