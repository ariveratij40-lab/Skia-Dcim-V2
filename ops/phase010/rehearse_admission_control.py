"""Real local Nginx transition rehearsal on the authorized existing network.

No production adapter; no host publication; no image build; no new network.
Reopen prerequisites here are a disposable test double, NOT production evidence.
Only the two containers created by this invocation can be retired, without -v.
"""
import argparse
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile
import time

import admission_control as a
import execute_prewindow_activation as e
import post039_activation_evidence as post039

NGINX = 'sha256:1ed1b0e1d7652937d6cbdaf4018c7b6fc009a7dd6c3047351e2eddda745de43f'
PROBE = r"""
let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',async()=>{
try {const x=JSON.parse(s),out=[];
for(const host of ['skia.iamet.mx','mvp.skia.iamet.mx'])
for(const tls of [false,true])for(const path of ['/', '/login','/api/health',
'/api/auth/login','/api/auth/google/callback','/api/dcim/assets','/uploads/test',
'/_next/static/test','/.well-known/acme-challenge/test']) {
const r=await new Promise((resolve,reject)=>{
const q=require(tls?'https':'http').get({hostname:x.host,port:tls?443:80,path,
headers:{Host:host},rejectUnauthorized:false,timeout:5000},r=>{
r.resume();r.on('end',()=>resolve({status:r.statusCode,retry:r.headers['retry-after'],
cache:r.headers['cache-control'],location:r.headers.location}));});
q.on('error',reject);q.on('timeout',()=>q.destroy(Error('timeout')));});
if(x.state==='CLOSED') {if(r.status!==503||r.retry!=='300'||r.cache!=='no-store')throw 0;}
else if(!tls||host==='mvp.skia.iamet.mx') {if(r.status!==301||!r.location.startsWith('https://skia.iamet.mx/'))throw 0;}
else if(r.status!==200)throw 0;
out.push({host,tls,path,status:r.status});}
process.stdout.write(JSON.stringify(out));}catch(_){process.exitCode=1;}});
"""


def write(path, data, mode=0o600):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode)
    with os.fdopen(fd,'wb') as f:f.write(data)


class NginxFixtureObserver:
    def __init__(self,d,nginx,probe,config,root):
        self.d,self.nginx,self.client=d,nginx,probe
        self.config,self.root=config,root
        self.old_workers=set();self.measurements=[];self.gates=True
        self.failure=None;self.reloads=0
    def identity(self):
        c=self.d.inspect('container',self.nginx)
        return {'daemon':self.d.daemon(),'container':c['Id'],'image':c['Image']}
    def base_hash(self):return a.sha(self.config.read_bytes())
    def boundary(self,name):
        if self.failure==name:raise a.Rejected('FIXTURE_INJECTION')
    def workers(self):
        raw=self.d.run(['top',self.nginx,'-eo','pid,args']).decode()
        return {line.split()[0] for line in raw.splitlines() if 'nginx: worker process' in line}
    def syntax(self):
        self.boundary('syntax')
        self.d.run(['exec',self.nginx,'nginx','-t','-c','/fixture/nginx.conf'])
    def reload(self):
        self.old_workers=self.workers()
        a.require(bool(self.old_workers),'NO_WORKERS')
        self.boundary('reload')
        self.d.run(['exec',self.nginx,'nginx','-s','reload','-c','/fixture/nginx.conf']);self.reloads+=1
    def drained(self):
        for _ in range(50):
            current=self.workers()
            if current and not current.intersection(self.old_workers):return
            time.sleep(.1)
        raise a.Rejected('WORKERS_NOT_DRAINED')
    def probe(self,state):
        self.boundary('probe_'+state)
        raw=self.d.run(['exec','-i',self.client,'node','-e',PROBE],
                       a.canonical({'host':self.nginx,'state':state}))
        rows=json.loads(raw);a.require(len(rows)==36,'PROBE_COUNT')
        self.measurements.append({'state':state,'rows':rows})
        return a.sha(a.canonical(rows))
    def reopen_gate(self,window):
        # Explicitly a test double. Never usable as a production adapter.
        a.require(self.gates,'DISPOSABLE_REOPEN_PREREQUISITES')


def main():
    p=argparse.ArgumentParser();p.add_argument('--authorized-fixture',required=True)
    args=p.parse_args();t=e.topology(args.authorized_fixture)
    a.require(args.authorized_fixture=='skia-activation-test-ddcddfca2c8d','AUTHORIZED_FIXTURE_ONLY')
    d=e.Docker();net=d.inspect('network',t['network'])
    a.require(net['Internal'] is True,'FIXTURE_NETWORK')
    a.require(d.inspect('image',NGINX)['Id']==NGINX,'IMAGE_PIN')
    stage=Path(tempfile.mkdtemp(prefix='skia-admission-rehearsal-')).resolve()
    print('ADMISSION_EVIDENCE='+str(stage),flush=True)
    suffix=stage.name.rsplit('-',1)[-1]
    upstream=t['network']+'-admission-upstream-'+suffix
    nginx=t['network']+'-admission-nginx-'+suffix
    # Self-signed disposable fixture certificate, never production TLS material.
    result=subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes',
        '-keyout',str(stage/'key.pem'),'-out',str(stage/'cert.pem'),'-days','1',
        '-subj','/CN=skia.iamet.mx'],capture_output=True)
    a.require(result.returncode==0,'FIXTURE_CERTIFICATE')
    (stage/'key.pem').chmod(0o600)
    write(stage/'state.inc',a.OPEN)
    write(stage/'upstream.conf',b'events {}\nhttp { access_log /dev/stdout; server { listen 8080; return 200 "fixture upstream\\n"; } }\n')
    include='include /fixture/state.inc;'
    tls='ssl_certificate /fixture/cert.pem; ssl_certificate_key /fixture/key.pem;'
    config=('events {}\nhttp { access_log off; worker_shutdown_timeout 2s;\n'
        'server { listen 80; server_name skia.iamet.mx; '+include+' return 301 https://skia.iamet.mx$request_uri; }\n'
        'server { listen 80; server_name mvp.skia.iamet.mx; '+include+' return 301 https://skia.iamet.mx$request_uri; }\n'
        'server { listen 443 ssl; server_name mvp.skia.iamet.mx; '+tls+include+' return 301 https://skia.iamet.mx$request_uri; }\n'
        'server { listen 443 ssl; server_name skia.iamet.mx; '+tls+include+
        ' location / { proxy_pass http://'+upstream+':8080; } }\n}\n')
    # worker_shutdown_timeout belongs to main context, not http.
    config=config.replace('http { access_log off; worker_shutdown_timeout 2s;',
                          'worker_shutdown_timeout 2s; http { access_log off;')
    write(stage/'nginx.conf',config.encode())
    created=[]
    try:
        for name,conf in [(upstream,'upstream.conf'),(nginx,'nginx.conf')]:
            body={'Image':NGINX,'Entrypoint':['nginx'],'Cmd':['-g','daemon off;','-c','/fixture/'+conf],
                  'HostConfig':{'Binds':[str(stage)+':/fixture:ro'],'NetworkMode':t['network']},
                  'NetworkingConfig':{'EndpointsConfig':{t['network']:{'Aliases':[name]}}}}
            cid=d.create(name,body);created.append(cid);d.run(['start',cid])
        observer=NginxFixtureObserver(d,nginx,t['web'],stage/'nginx.conf',stage)
        for _ in range(30):
            try:observer.probe('OPEN');break
            except Exception:time.sleep(.2)
        else:raise a.Rejected('INITIAL_OPEN_PROBE')
        engine=a.Controller(stage,observer)
        def auth(operation):
            now=int(time.time());path=stage/(operation+'.authorization')
            write(path,a.canonical(dict(authorized=True,operation=operation,window='fixture',
                issued_at=now,expires_at=now+900,identity=observer.identity(),
                base_sha256=observer.base_hash(),current_sha256=a.sha((stage/'state.inc').read_bytes()),
                artifact_sha256=a.sha(a.ARTIFACTS[operation]))))
            return path
        closed=engine.transition('CLOSED',auth('CLOSED'))
        before=d.run(['logs',upstream])
        observer.probe('CLOSED')
        a.require(before==d.run(['logs',upstream]),'CLOSED_UPSTREAM_TRAFFIC')
        print('ADMISSION_CLOSED_MATRIX=PASS_36; CLOSED_UPSTREAM_DELTA=0',flush=True)
        # Read-only evidence assembly against real local PostgreSQL. This
        # fixture baseline tests preservation comparison, not a new upgrade.
        db=post039.b.DB(t['network']+'-pg','skia_prod','skia_bootstrap')
        ident=post039.u.identity(db)
        u0=dict(identity=ident,window='fixture',daemon_id=d.daemon(),baseline=post039.u.baseline(db))
        isolation=dict(identity=ident,window='fixture',observed_at=int(time.time()),
            requested=True,verified=True,old_api_writers_active=False,in_flight_drained=True,
            external_isolation_reference='LOCAL_DISPOSABLE_API_STOP')
        d.run(['stop',t['api']])
        try:
            result=post039.assemble(db,d,'fixture',u0,isolation,closed,observer,'disposable')
            write(stage/'post039.json',a.canonical(result))
            print('POST039_REAL_DATABASE_ASSEMBLY=PASS; U0_FIXTURE_COMPARISON=PASS',flush=True)
        finally:
            d.run(['start',t['api']])
            for _ in range(90):
                if d.inspect('container',t['api'])['State'].get('Health',{}).get('Status')=='healthy':break
                time.sleep(1)
            else:raise a.Rejected('FIXTURE_API_HEALTH')
        engine.transition('OPEN',auth('OPEN'))
        print('ADMISSION_OPEN_MATRIX=PASS_36',flush=True)
        write(stage/'measurements.json',a.canonical(observer.measurements))
        write(stage/'containers.json',a.canonical([{'id':cid,'image':NGINX} for cid in created]))
        failures=[('close-before','CLOSED','before_install'),
                  ('close-after','CLOSED','after_install'),
                  ('close-syntax','CLOSED','syntax'),
                  ('close-reload','CLOSED','reload'),
                  ('close-probe','CLOSED','probe_CLOSED'),
                  ('open-before','OPEN','before_install'),
                  ('open-syntax','OPEN','syntax'),
                  ('open-reload','OPEN','reload'),
                  ('open-probe','OPEN','probe_OPEN')]
        for name,desired,failure in failures:
            # New case state/journal, same disposable containers/network. Keep
            # every failed journal; never erase evidence to enable a retry.
            root=stage/name;root.mkdir(mode=0o700)
            prior='OPEN' if desired=='CLOSED' else 'CLOSED'
            write(root/'state.inc',a.ARTIFACTS[prior])
            case_config=config.replace('/fixture/state.inc','/fixture/'+name+'/state.inc').encode()
            write(root/'base.conf',case_config)
            a.atomic(stage/'nginx.conf',case_config)
            observer.failure=None;observer.syntax();observer.reload();observer.drained();observer.probe(prior)
            local=a.Controller(root,observer)
            now=int(time.time());authorization=root/'authorization'
            write(authorization,a.canonical(dict(authorized=True,operation=desired,window=name,
                issued_at=now,expires_at=now+900,identity=observer.identity(),
                base_sha256=observer.base_hash(),current_sha256=a.sha(a.ARTIFACTS[prior]),
                artifact_sha256=a.sha(a.ARTIFACTS[desired]))))
            before_reload=observer.reloads;observer.failure=failure
            try:local.transition(desired,authorization)
            except a.Rejected:pass
            else:raise a.Rejected('FAILURE_NOT_DETECTED')
            observer.failure=None
            if failure in ('before_install','after_install','syntax'):
                a.require(observer.reloads==before_reload,'SYNTAX_FAILURE_RELOADED')
            # A failed CLOSE never claims closure. A failed OPEN must still
            # serve CLOSED, including after successful reload then probe error.
            actual=prior if failure!='probe_CLOSED' else 'CLOSED'
            observer.probe(actual)
            a.require(not list(root.glob('*.evidence')),'FAILED_TRANSITION_EVIDENCE')
            write(root/'result.json',a.canonical({'injection':failure,'desired':desired,
                'serving_state_verified':actual,'failed_transition':True}))
            print('ADMISSION_FAILURE_'+name.upper().replace('-','_')+'=PASS',flush=True)
        print('ADMISSION_FAILURE_INJECTION=PASS_9_OF_9_DISPOSABLE',flush=True)
        print('ACTUAL_NGINX_TRANSITIONS=PASS; PRODUCTION_REOPEN_GATE_VALIDATED=NO',flush=True)
    finally:
        # These IDs were created here; no wildcard or other fixture cleanup.
        for cid in reversed(created):
            d.run(['stop',cid]);d.run(['rm',cid])
        a.require(d.inspect('network',t['network'])['Id']==net['Id'],'NETWORK_RECREATED')
        print('NETWORKS_REMOVED=0; VOLUMES_REMOVED=0; IMAGES_REMOVED=0',flush=True)


if __name__=='__main__':
    try:main()
    except Exception as error:
        code=str(error) if isinstance(error,(a.Rejected,e.Rejected,ValueError)) else ''
        if not re.fullmatch('[A-Z0-9_]+',code):code='INTERNAL_FAILURE'
        print('ADMISSION_REHEARSAL=STOPPED; CODE='+code);raise SystemExit(1)
