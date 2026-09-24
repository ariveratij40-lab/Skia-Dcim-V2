"""Separate post035-to-post039 fixture; never starts the candidate on fixture A."""
import json
import argparse
import os
from pathlib import Path
import secrets
import tempfile
import time
from urllib.parse import urlsplit, unquote

import b3b_release as b
import execute_prewindow_activation as e
import p0_config_model as model
import p0_security_repair as repair
import upgrade_036_039 as u
from test_p0_remediation import REPO


def activation_guard(db, d, t, contract):
    """Reviewed executor authorization gate, evaluated before candidate creation."""
    observed = u.observe(db, contract)
    b.require(observed['ledger_count'] == 31, 'POST039_ONLY')
    now = int(time.time())
    evidence = {'window':'p0fixture', 'daemon_id':d.daemon(), 'database':'skia_prod',
                'database_identity':observed['identity'], 'observed_at':now,
                'ledger':contract['migrations'], 'catalog_count':0,
                'migration_040_count':0, 'fingerprint':observed['raw'],
                'security_pass':True, 'tenant_preservation_pass':True,
                'writers_isolated':True, 'admission_closed':True}
    # These fixture flags apply only to the private local network, never production.
    b.require(t['environment']=='disposable', 'DISPOSABLE_ONLY')
    raw=json.dumps(evidence).encode()
    auth={'activation_authorized':True,'environment':'disposable','database':'skia_prod',
          'package_sha256':e.package_digest(),'api_image':e.contract.IMAGE,'web_image':e.WEB,
          'topology':t,'issued_at':now,'expires_at':now+900,'window':'p0fixture',
          'operator':'fixture','db_evidence_sha256':e.digest(raw),'daemon_id':d.daemon()}
    e.validate_authority(auth,raw,t,now)
    for field,bad in [('fingerprint',repair.RAW),('ledger',contract['migrations'][:27]),('security_pass',False)]:
        negative=json.dumps({**evidence,field:bad}).encode()
        try:e.validate_authority({**auth,'db_evidence_sha256':e.digest(negative)},negative,t,now)
        except e.Rejected:pass
        else:raise AssertionError('TRANSITION_NEGATIVE_ACCEPTED')
    try:e.validate_authority({**auth,'activation_authorized':False},raw,t,now)
    except e.Rejected:pass
    else:raise AssertionError('UNAUTHORIZED_START')


def main(subnet):
    os.umask(0o077)
    stage = Path(tempfile.mkdtemp(prefix='skia-p0-b-'))
    prefix = 'skia-activation-test-' + secrets.token_hex(6)
    pg = 'skia-p0-' + secrets.token_hex(6) + '-b'
    print('FIXTURE_B=' + pg, flush=True)
    d = e.Docker(); t = e.topology(prefix)
    d.run(['network', 'create', '--internal', '--subnet', subnet, prefix])
    d.run(['volume', 'create', t['volume']])
    password = secrets.token_hex(24)
    cid = d.create(pg, {'Image': 'postgres:16.14-alpine',
        'Env': ['POSTGRES_USER=skia_bootstrap', 'POSTGRES_DB=skia_prod', 'POSTGRES_PASSWORD='+password],
        'HostConfig': {'NetworkMode': prefix, 'PortBindings': {}},
        'NetworkingConfig': {'EndpointsConfig': {prefix: {'Aliases': ['postgres', 'skia_postgres_prod']}}}})
    d.run(['start', cid])
    for _ in range(60):
        if b'init process complete' in d.run(['logs', pg]): break
        time.sleep(1)
    else: raise ValueError('PG_START')
    source = stage/'source'; source.mkdir()
    b.run(['tar', '-xf', '-', '-C', str(source)], b.git(REPO, 'archive', '658cfa35becaf75f851a27d44180fef20ea0f2ce'))
    d.run(['cp', str(source)+'/.', pg+':/fixture'])
    sql = ['exec', '-i', pg, 'psql', '-X', '-qAt', '-U', 'skia_bootstrap', '-d', 'skia_prod', '-v', 'ON_ERROR_STOP=1']
    provision = ''.join('\\set '+k+" '"+password+"'\n" for k in ('migrator_password','runtime_password','onboarding_password'))+'\\i /fixture/ops/phase011/provision_database_roles.sql\n'
    d.run(sql, provision.encode())
    d.run(['exec','-i',pg,'sh'], ('export PGPASSWORD='+password+'\nexport PHASE010_DATABASE_URL=postgresql://skia_migrator@localhost/skia_prod\nexec bash /fixture/ops/phase010/run_clean_bootstrap.sh\n').encode())
    d.run(sql, provision.encode())
    d.run(sql, b'\\set phase011_environment production\n\\set expected_database skia_prod\n\\set execution_approval PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED\n\\i /fixture/ops/phase011/activate_clean_production_rls.sql\n')
    db = b.DB(pg,'skia_prod','skia_bootstrap')
    b.require(db.fingerprint()==repair.RAW and b.structure(db)['hash']==repair.CANONICAL,'B_POST035')
    print('B_START_CANONICAL_POST035=PASS',flush=True)
    # Read immutable migration authority from the existing repository; no checkout.
    u.ROOT = Path(REPO)
    contract = u.contract()
    with u.Session(db) as session:
        for entry in contract['migrations'][27:31]:
            u.apply_one(session,entry)
            observed=u.observe(db,contract)
            print('B_LEDGER_COUNT='+str(observed['ledger_count']),flush=True)
    b.require(db.fingerprint()==e.POST039,'B_POST039_RAW')
    print('B_POST039_FINGERPRINT='+db.fingerprint(),flush=True)
    # Post039 canonical provisioning/validators, not a bootstrap runner.
    for file in ('provision_database_roles.sql','validate_runtime_auth_role.sql','validate_onboarding_role.sql'):
        d.run(['cp',str(u.ROOT/'ops/phase011'/file),pg+':/fixture/ops/phase011/'+file])
    d.run(sql,provision.encode())
    for file in ('validate_runtime_auth_role.sql','validate_onboarding_role.sql'):
        d.run(sql,('\\i /fixture/ops/phase011/'+file+'\n').encode())
    session_token=secrets.token_hex(32)
    fixture="""
INSERT INTO tenants(id,name) VALUES('f2000000-0000-4000-8000-000000000001','Disposable');
INSERT INTO users(id,email,name,password_hash) VALUES('f2000000-0000-4000-8000-000000000002','fixture@example.invalid','Fixture','synthetic');
INSERT INTO branches(id,tenant_id,code,name) VALUES('f2100000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','T','Test');
INSERT INTO user_tenants(user_id,tenant_id) VALUES('f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001');
INSERT INTO user_branches(user_id,branch_id) VALUES('f2000000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001');
INSERT INTO user_roles(user_id,tenant_id,role_id) SELECT 'f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001',id FROM roles WHERE name='admin';
"""
    fixture += "INSERT INTO sessions(user_id,tenant_id,branch_id,token,expires_at) VALUES('f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','"+session_token+"',extract(epoch from now())::bigint+7200);"
    d.run(sql,fixture.encode())
    inspected=d.inspect('container',pg)
    aliases=inspected['NetworkSettings']['Networks'][prefix]['Aliases']
    env=model.generate({component:password for _,component in model.MAPPING.values()},host='skia_postgres_prod',aliases=aliases,environment='disposable')
    env.update(GOOGLE_CLIENT_ID='synthetic-client.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET=secrets.token_hex(24))
    before=u.baseline(db,project=False)
    activation_guard(db,d,t,contract)
    for component in ('api','web'):
        body=e.body(t,component,env if component=='api' else {})
        new=d.create(t[component],body);d.run(['start',new])
        for _ in range(90):
            if d.inspect('container',new)['State'].get('Health',{}).get('Status')=='healthy':break
            time.sleep(1)
        else:raise ValueError('CANDIDATE_NOT_HEALTHY')
        e.identity(d.inspect('container',new),t,component)
        print('B_'+component.upper()+'_HEALTH=PASS',flush=True)
    identity={'user_id':'f2000000-0000-4000-8000-000000000002','tenant_id':'f2000000-0000-4000-8000-000000000001','branch_id':'f2100000-0000-4000-8000-000000000001'}
    d.run(['exec','-i',t['web'],'node','-e',e.PROBE],json.dumps({'host':'backend','session':session_token,'reads':e.READS,'web':True,'identity':identity}).encode())
    b.require(u.baseline(db,project=False)==before,'READ_DATA_DELTA')
    for signature in ('read_active_system_naming_presets(NULL::text[])',
                      'read_active_system_naming_presets_v2(NULL::text[])',
                      "read_system_naming_preset_v2('MDF',1)"):
        db.query('SET LOCAL ROLE skia_runtime; SELECT count(*) FROM public.'+signature)
    b.require(db.query("SELECT to_jsonb(rolbypassrls) FROM pg_roles WHERE rolname='skia_runtime'")==[False], 'RUNTIME_BYPASS')
    b.require(db.query("SELECT to_jsonb(has_table_privilege('skia_runtime','public.system_naming_presets','SELECT'))")==[False], 'DIRECT_PRESET')
    for privilege in ('SELECT','INSERT','UPDATE','DELETE'):
        b.require(db.query("SELECT to_jsonb(has_table_privilege('skia_runtime','public.audit_logs','"+privilege+"'))")==[False], 'DIRECT_AUDIT')
    roles=db.query("SELECT jsonb_agg(DISTINCT usename ORDER BY usename) FROM pg_stat_activity WHERE usename IN ('skia_runtime','skia_migrator','skia_onboarding')")[0]
    b.require(roles==['skia_migrator','skia_onboarding','skia_runtime'], 'THREE_IDENTITIES')
    candidate=d.inspect('container',t['api'])
    b.require(candidate['Image']==e.contract.IMAGE, 'EXACT_API_IMAGE')
    runtime_env=dict(item.split('=',1) for item in candidate['Config']['Env'])
    model.validate(runtime_env)
    b.require(runtime_env['SKIA_REQUIRE_RESTRICTED_RUNTIME_DB']=='true','RESTRICTED_MODE')
    logs=d.run(['logs',t['api']])
    for key in model.MAPPING:
        b.require(runtime_env[key].encode() not in logs and
                  unquote(urlsplit(runtime_env[key]).password).encode() not in logs,'SECRET_LOG_LEAK')
    d.run(['exec',t['web'],'node','-e',
        "const d=require('dns').promises;(async()=>{let a=await d.lookup('postgres'),b=await d.lookup('skia_postgres_prod');if(a.address!==b.address)process.exit(1);try{await d.lookup('p0-unresolved.invalid');process.exit(1)}catch(e){if(!['ENOTFOUND','EAI_AGAIN'].includes(e.code))process.exit(1)}})().catch(()=>process.exit(1));"])
    b.require(db.query("SELECT count(*) FROM production_bootstrap_migrations WHERE path LIKE 'migrations/040%'")==[0], '040_EXCLUDED')
    print('B_RUNTIME_SECURITY=PASS; THREE_IDENTITIES=PASS; V1_V2_EXACT_READERS=PASS; SECRET_HYGIENE=PASS; DNS_MATRIX=PASS',flush=True)
    print('B_AUTHENTICATED_READS=PASS; B_READ_PRESERVATION=PASS; DB_CONFIG_REHEARSAL=PASS',flush=True)
    print('B_API='+t['api']+'; B_WEB='+t['web'],flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--reviewed-subnet',required=True,
                        help='Explicit subnet reviewed against host/VPN/Docker routes and probed first')
    args=parser.parse_args()
    try:main(args.reviewed_subnet)
    except Exception as error:
        print('FIXTURE_B=STOPPED; ERROR_TYPE='+type(error).__name__,flush=True)
        raise SystemExit(1)
