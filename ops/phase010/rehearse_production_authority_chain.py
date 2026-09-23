"""Fresh, local-only canonical post039 -> real adapter/executor -> OPEN.

No production targets, public ports, pull/build, 040, or reused DB. Retains
fixture and protected evidence for review. Synthetic credentials use stdin.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time

import admission_control as a
import prepared_nginx_authority as p
import execute_prewindow_activation as e
import rehearse_activation_executor as fixture
import rehearse_prepared_nginx as n
import production_post039_evidence as post
import production_reopen_gate as reopen
import upgrade_036_039 as u
import b3b_release as b
from production_admission_adapter import Adapter
from nginx_admission_service import Service


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--fresh-disposable',action='store_true',required=True)
    parser.parse_args()
    prefix='skia-activation-test-'+secrets.token_hex(6)
    root=Path(tempfile.mkdtemp(prefix=prefix+'-')).resolve();uid=os.getuid()
    print('FRESH_FIXTURE='+prefix+'; EVIDENCE='+str(root),flush=True)
    d=e.Docker();t=e.topology(prefix)
    # Additional fixture aliases model production upstream names, exclusively
    # on this new internal network. Executor identity still verifies them exactly.
    t['api_aliases'].append('skia_api_prod');t['web_aliases'].append('skia_web_prod')
    for image in (e.contract.IMAGE,e.WEB,n.NGINX,'postgres:16.14-alpine'):
        d.inspect('image',image)
    source=root/'source';source.mkdir()
    archive=fixture.run(['git','-C',str(u.ROOT),'archive','7bc42600cb87494dccca50cba26f17352331ca9a'])
    fixture.run(['tar','-xf','-','-C',str(source)],archive)
    a.require(not list((source/'migrations').glob('040*')),'040_FORBIDDEN')
    d.run(['network','create','--internal',prefix]);d.run(['volume','create',t['volume']])
    password=secrets.token_hex(20);pg=prefix+'-pg'
    pgid=d.create(pg,{'Image':'postgres:16.14-alpine',
        'Env':['POSTGRES_USER=skia_bootstrap','POSTGRES_DB=skia_prod','POSTGRES_PASSWORD='+password],
        'HostConfig':{'NetworkMode':prefix},'NetworkingConfig':{'EndpointsConfig':{prefix:{'Aliases':[pg]}}}})
    d.run(['start',pgid])
    for _ in range(90):
        try:
            d.run(['exec',pg,'pg_isready','-U','skia_bootstrap','-d','skia_prod'])
            if b'init process complete' in d.run(['logs',pg]):break
        except e.Rejected:pass
        time.sleep(1)
    else:raise a.Rejected('FRESH_DATABASE_NOT_READY')
    d.run(['cp',str(source)+'/.',pg+':/fixture'])
    sql=['exec','-i',pg,'psql','-X','-U','skia_bootstrap','-d','skia_prod','-v','ON_ERROR_STOP=1','-At']
    provision=''.join('\\set '+key+" '"+password+"'\n" for key in
        ('migrator_password','runtime_password','onboarding_password'))+'\\i /fixture/ops/phase011/provision_database_roles.sql\n'
    d.run(sql,provision.encode())
    bootstrap=('export PGPASSWORD='+password+'\nexport PHASE010_DATABASE_URL=postgresql://skia_migrator@localhost/skia_prod\n'
               'exec bash /fixture/ops/phase010/run_clean_bootstrap.sh\n').encode()
    d.run(['exec','-i',pg,'sh'],bootstrap);d.run(['exec','-i',pg,'sh'],bootstrap)
    d.run(sql,provision.encode())
    d.run(sql,b'\\set phase011_environment production\n\\set expected_database skia_prod\n'
        b'\\set execution_approval PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED\n'
        b'\\i /fixture/ops/phase011/activate_clean_production_rls.sql\n')
    db=b.DB(pg,'skia_prod','skia_bootstrap');observation=u.observe(db,u.contract())
    a.require(observation['ledger_count']==31 and observation['raw']==e.POST039,'FRESH_POST039')
    print('FRESH_BOOTSTRAP=PASS; SECOND_BOOTSTRAP=PASS; LEDGER=31; CATALOG=0; MIGRATION_040=0',flush=True)
    d.run(sql,b"""
INSERT INTO tenants(id,name) VALUES('f2000000-0000-4000-8000-000000000001','Disposable');
INSERT INTO users(id,email,name,password_hash) VALUES('f2000000-0000-4000-8000-000000000002','fixture@example.invalid','Fixture','synthetic');
INSERT INTO branches(id,tenant_id,code,name) VALUES('f2100000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','T','Test');
INSERT INTO user_tenants(user_id,tenant_id) VALUES('f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001');
INSERT INTO user_branches(user_id,branch_id) VALUES('f2000000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001');
INSERT INTO user_roles(user_id,tenant_id,role_id) SELECT 'f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001',id FROM roles WHERE name='admin';
INSERT INTO sessions(user_id,tenant_id,branch_id,token,expires_at) VALUES('f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','synthetic-executor-session',extract(epoch from now())::bigint+7200);
""")
    env={'GOOGLE_CLIENT_ID':'synthetic-client.apps.googleusercontent.com','GOOGLE_CLIENT_SECRET':'synthetic-fixture-secret'}
    for name,role in zip(e.contract.expected()['required_secret_names'],('skia_runtime','skia_migrator','skia_onboarding')):
        env[name]='postgresql://'+role+':'+password+'@'+pg+'/skia_prod?sslmode=disable'
    p.exclusive(root/'fixture.env','\n'.join(k+'='+v for k,v in env.items()).encode())
    for component in ('api','web'):
        body=e.body(t,component,env)
        if component=='web':body['Image']='sha256:3fae38986f33404f205d13e49839c4d5d0e84ca18d4125ab3c6a21be43fdad14'
        cid=d.create(t[component],body);d.run(['start',cid])
        for _ in range(90):
            if d.inspect('container',cid)['State'].get('Health',{}).get('Status')=='healthy':break
            time.sleep(1)
        else:raise a.Rejected('BASELINE_HEALTH')
    sites=root/'sites-enabled';sites.mkdir(mode=0o700)
    base=(e.HERE/'fixtures/skia_nginx_observed.conf.fixture').read_bytes()
    target=sites/'20-skia-staging.conf';p.exclusive(target,base)
    unrelated=b'server { listen 8088; server_name unrelated.test; return 200 "unrelated"; }\n'
    p.exclusive(sites/'99-unrelated.conf',unrelated)
    p.exclusive(root/'nginx.conf',b'worker_processes 1; worker_shutdown_timeout 2s; events {} http { include /etc/nginx/sites-enabled/*.conf; }\n')
    cert=root/'tls';cert.mkdir(mode=0o700)
    result=subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=skia.iamet.mx',
        '-keyout',str(cert/'privkey.pem'),'-out',str(cert/'fullchain.pem')],capture_output=True)
    a.require(result.returncode==0,'FIXTURE_TLS');(cert/'privkey.pem').chmod(0o600)
    staging=sites/'.skia-admission';staging.mkdir(mode=0o700)
    evidence=root/'admission';evidence.mkdir(mode=0o700);window='fresh-final'
    for path in (staging/window,evidence/window):path.mkdir(mode=0o700)
    output=evidence/window;nginx=prefix+'-nginx'
    cid=d.create(nginx,{'Image':n.NGINX,'Entrypoint':['nginx'],'Cmd':['-g','daemon off;'],
        'HostConfig':{'NetworkMode':prefix,'Binds':[str(root/'nginx.conf')+':/etc/nginx/nginx.conf:ro',
            str(sites)+':/etc/nginx/sites-enabled:ro',str(cert)+':/etc/letsencrypt/live/mvp.skia.iamet.mx:ro']}})
    d.run(['start',cid])
    def transport(scheme,host,path):
        response=json.loads(d.run(['exec','-i',t['web'],'node','-e',n.FETCH],
            a.canonical(dict(scheme=scheme,host=host,path=path,target=nginx))))
        return response['status'],response['headers']
    gate=reopen.Gate(output,root/'RELEASE.env',db,d,t,uid,uid)
    service=Service(d,nginx,reopen=gate,transport=transport)
    adapter=Adapter(target,staging,evidence,root/'lock',service,uid)
    adapter.verify('OPEN',window);print('FINAL_E2E_OPEN_BASELINE=PASS',flush=True)
    def transition(operation):
        bindings={}
        if operation=='OPEN':bindings=dict(closed_evidence_sha256=a.sha((output/'CLOSED.evidence').read_bytes()),
            reopen_bundle_sha256=a.sha((output/'reopen.json').read_bytes()))
        manifest=p.prepare(staging/window,base,window,operation,service.graph(),owner=uid,**bindings)
        now=int(time.time());auth=output/(operation+'.authorization')
        p.exclusive(auth,a.canonical(dict(authorized=True,operation=operation,window=window,
            issued_at=now,expires_at=now+900,identity=service.identity(),manifest_sha256=a.sha(a.canonical(manifest)))))
        return adapter.transition(operation,window,auth)
    closed=transition('CLOSED');print('FINAL_E2E_ADMISSION_CLOSE=PASS',flush=True)
    # Retire only this harness's baseline API after admission closes; install a
    # stopped old image to exercise actual API replacement, never start it.
    baseline_api=d.inspect('container',t['api'])['Id'];d.run(['stop',baseline_api]);d.run(['rm',baseline_api])
    old=e.body(t,'api',{});old['Image']='sha256:35e62b53527a2562b8db49902b2baba08d366564098a2f3b1b8b05f17ea7d5d9'
    d.create(t['api'],old)
    now=int(time.time());observed=u.observe(db,u.contract())
    u0=dict(window=window,observed_at=now,daemon_id=d.daemon(),identity=observed['identity'],baseline=observed['baseline'])
    isolation=dict(window=window,observed_at=now,daemon_id=d.daemon(),identity=observed['identity'],
                   stopped_api_id=d.inspect('container',t['api'])['Id'])
    post.publish(output/'u0.json',u0);post.publish(output/'isolation.json',isolation)
    result=post.collect(db,d,adapter,t,window,u0,isolation,closed);post.publish(output/'post039.json',result)
    eraw=(output/'post039.json').read_bytes();print('FINAL_E2E_POST039_EVIDENCE=PASS',flush=True)
    now=int(time.time());vol=d.inspect('volume',t['volume'])
    metadata=dict(user_id='f2000000-0000-4000-8000-000000000002',tenant_id='f2000000-0000-4000-8000-000000000001',
                  branch_id='f2100000-0000-4000-8000-000000000001',source='DISPOSABLE_FIXTURE',expires_at=now+3600)
    auth=dict(activation_authorized=True,environment='disposable',database='skia_prod',package_sha256=e.package_digest(),
        api_image=e.contract.IMAGE,web_image=e.WEB,topology=t,issued_at=now,expires_at=now+900,window=window,
        operator='fixture',db_evidence_sha256=a.sha(eraw),daemon_id=d.daemon(),session_authority=metadata,
        network_id=d.inspect('network',prefix)['Id'],volume_identity={k:vol.get(k) for k in ('Name','Driver','CreatedAt','Options','Labels')},
        current_containers={c:d.inspect('container',t[c])['Id'] for c in ('api','web')})
    post.publish(output/'activation.authorization',auth);post.publish(output/'session-metadata.json',metadata)
    p.exclusive(output/'session',b'synthetic-executor-session')
    executor=e.Executor(d,t,auth,eraw,env,'synthetic-executor-session',output/'activation.journal')
    executor.preflight();print('FINAL_E2E_ACTIVATION_AUTHORIZATION=PASS',flush=True)
    executor.execute();print('FINAL_E2E_API_WEB_ACTIVATION=PASS',flush=True)
    post.publish(output/'runtime.json',reopen.runtime(d,t,window,'synthetic-executor-session',metadata))
    p.exclusive(root/'RELEASE.env',('API_SOURCE_SHA='+reopen.SOURCE+'\nWEB_SOURCE_SHA='+reopen.SOURCE+'\n').encode())
    post.publish(output/'reopen.json',reopen.assemble_bundle(output,root/'RELEASE.env',owner=uid,descriptor_owner=uid))
    transition('OPEN');adapter.verify('OPEN',window)
    a.require(target.read_bytes()==base and (sites/'99-unrelated.conf').read_bytes()==unrelated,'NGINX_PRESERVATION')
    a.require(u.observe(db,u.contract())['baseline']==u0['baseline'],'FINAL_DATA_DELTA')
    print('FINAL_E2E_INTEGRATED_RUNTIME=PASS; FINAL_E2E_RELEASE_DESCRIPTOR_BINDING=PASS',flush=True)
    print('FINAL_E2E_ADMISSION_REOPEN=PASS; FINAL_FIXTURE_FRESH=YES; FINAL_E2E=PASS',flush=True)


if __name__=='__main__':
    try:main()
    except Exception as error:
        code=str(error) if isinstance(error,(a.Rejected,e.Rejected)) else 'INTERNAL_FAILURE'
        print('FINAL_E2E=STOPPED; CODE='+code+'; FIXTURE_PRESERVED=YES');raise SystemExit(1)
