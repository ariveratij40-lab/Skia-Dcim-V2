"""Actual adapter + service against production-shaped disposable Nginx graph.

No production access. Reuses the explicitly authorized network; preserves all
evidence and removes only the two container IDs created by this invocation.
Runtime/reopen prerequisites are test inputs, not production certification.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
from unittest.mock import patch

import admission_control as a
import execute_prewindow_activation as e
import prepared_nginx_authority as p
from production_admission_adapter import Adapter
from nginx_admission_service import Service

NGINX='sha256:1ed1b0e1d7652937d6cbdaf4018c7b6fc009a7dd6c3047351e2eddda745de43f'
FETCH=r"""let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{
const x=JSON.parse(s);let q=require(x.scheme==='https'?'https':'http').get({
hostname:x.target,port:x.scheme==='https'?443:80,path:x.path,headers:{Host:x.host},
rejectUnauthorized:false,timeout:5000},r=>{r.resume();r.on('end',()=>process.stdout.write(JSON.stringify({
status:r.statusCode,headers:{Location:r.headers.location,'Retry-After':r.headers['retry-after'],
'Cache-Control':r.headers['cache-control']}})));});q.on('error',()=>process.exitCode=1);
q.on('timeout',()=>q.destroy());});"""
DUMMY=r"""const http=require('http');for(const port of [8080,3000])http.createServer((q,r)=>{
if(q.url==='/api/auth/google/callback'){r.writeHead(302,{Location:'https://skia.iamet.mx/login?error=state_mismatch'});}
else if(q.url==='/api/dcim/assets')r.writeHead(401);
else if(['/','/login','/api/health'].includes(q.url))r.writeHead(200);
else r.writeHead(404);r.end('disposable');}).listen(port,'0.0.0.0');"""


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--authorized-fixture',required=True)
    args=parser.parse_args()
    t=e.topology(args.authorized_fixture);d=e.Docker()
    network=d.inspect('network',t['network']);a.require(network['Internal'],'INTERNAL_NETWORK')
    root=Path(tempfile.mkdtemp(prefix='skia-prepared-nginx-')).resolve()
    print('PREPARED_EVIDENCE='+str(root),flush=True)
    sites=root/'sites-enabled';sites.mkdir(mode=0o700)
    target=sites/'20-skia-staging.conf'
    base=(Path(__file__).parent/'fixtures/skia_nginx_observed.conf.fixture').read_bytes()
    p.exclusive(target,base)
    unrelated=b'server { listen 8088; server_name unrelated.test; return 200 "unrelated"; }\n'
    p.exclusive(sites/'99-unrelated.conf',unrelated)
    main_config=b'worker_processes 1; worker_shutdown_timeout 2s; events {} http { include /etc/nginx/sites-enabled/*.conf; }\n'
    p.exclusive(root/'nginx.conf',main_config)
    cert=root/'tls';cert.mkdir(mode=0o700)
    result=subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1',
        '-subj','/CN=skia.iamet.mx','-keyout',str(cert/'privkey.pem'),'-out',str(cert/'fullchain.pem')],capture_output=True)
    a.require(result.returncode==0,'DISPOSABLE_TLS');(cert/'privkey.pem').chmod(0o600)
    staging=sites/'.skia-admission';staging.mkdir(mode=0o700)
    evidence=root/'admission';evidence.mkdir(mode=0o700)
    for path in (staging/'window',evidence/'window'):path.mkdir(mode=0o700)
    suffix=root.name.rsplit('-',1)[-1];nginx=t['network']+'-prepared-'+suffix
    upstream=t['network']+'-prepared-upstream-'+suffix
    created=[]
    try:
        dummy=d.create(upstream,{'Image':e.WEB,'Entrypoint':['node'],'Cmd':['-e',DUMMY],
            'HostConfig':{'NetworkMode':t['network']},'NetworkingConfig':{'EndpointsConfig':{
                t['network']:{'Aliases':['skia_api_prod','skia_web_prod']}}}})
        created.append(dummy);d.run(['start',dummy])
        cid=d.create(nginx,{'Image':NGINX,'Entrypoint':['nginx'],'Cmd':['-g','daemon off;'],
            'HostConfig':{'NetworkMode':t['network'],'Binds':[str(root/'nginx.conf')+':/etc/nginx/nginx.conf:ro',
                str(sites)+':/etc/nginx/sites-enabled:ro',str(cert)+':/etc/letsencrypt/live/mvp.skia.iamet.mx:ro']},
            'NetworkingConfig':{'EndpointsConfig':{t['network']:{'Aliases':[nginx]}}}})
        created.append(cid);d.run(['start',cid])
        def transport(scheme,host,path):
            raw=d.run(['exec','-i',t['web'],'node','-e',FETCH],
                       a.canonical(dict(scheme=scheme,host=host,path=path,target=nginx)))
            r=json.loads(raw);return r['status'],r['headers']
        gate_calls=[]
        service=Service(d,nginx,reopen=lambda w,h:gate_calls.append((w,h)),transport=transport)
        adapter=Adapter(target,staging,evidence,root/'lock',service,os.getuid())
        for _ in range(30):
            try:adapter.verify('OPEN','window');break
            except Exception:time.sleep(.2)
        else:raise a.Rejected('OPEN_BASELINE')
        def transition(operation):
            bindings={}
            if operation=='OPEN':bindings=dict(closed_evidence_sha256=a.sha((evidence/'window/CLOSED.evidence').read_bytes()),reopen_bundle_sha256='b'*64)
            manifest=p.prepare(staging/'window',base,'window',operation,service.graph(),owner=os.getuid(),**bindings)
            now=int(time.time());auth=root/(operation+'.authorization')
            p.exclusive(auth,a.canonical(dict(authorized=True,window='window',operation=operation,
                issued_at=now,expires_at=now+900,identity=service.identity(),manifest_sha256=a.sha(a.canonical(manifest)))))
            return adapter.transition(operation,'window',auth)
        transition('CLOSED');adapter.verify('CLOSED','window')
        d.run(['stop',dummy]);adapter.verify('CLOSED','window')
        print('CLOSED_WITH_ABSENT_UPSTREAM_DNS=PASS',flush=True)
        d.run(['start',dummy])
        print('PREPARED_CLOSED_INSTALL_TEST_RELOAD_VERIFY=PASS',flush=True)
        transition('OPEN');adapter.verify('OPEN','window')
        a.require(target.read_bytes()==base,'OPEN_BYTE_IDENTITY')
        a.require((sites/'99-unrelated.conf').read_bytes()==unrelated,'UNRELATED_VHOST_MUTATION')
        a.require(gate_calls==[('window','b'*64)],'REOPEN_GATE_NOT_INVOKED')
        print('PREPARED_OPEN_BYTE_IDENTITY=PASS; UNRELATED_VHOST_PRESERVED=YES',flush=True)
        print('ACTUAL_ADAPTER_REHEARSAL=PASS; REOPEN_PREREQUISITES=TEST_DOUBLE_NOT_CERTIFIED',flush=True)
        # Actual adapter, filesystem, Nginx and HTTP observations. Only the
        # selected failure boundary is injected; no separate transition engine.
        cases=('base_drift','artifact_drift','atomic_install','syntax','reload',
               'closed_probe','open_prerequisite','open_syntax','open_reload','open_probe')
        for case in cases:
            stage_case=sites/('.case-'+case);stage_case.mkdir(mode=0o700)
            evidence_case=root/('evidence-'+case);evidence_case.mkdir(mode=0o700)
            for path in (stage_case/'window',evidence_case/'window'):path.mkdir(mode=0o700)
            observer=Service(d,nginx,reopen=lambda w,h:None,transport=transport)
            candidate=Adapter(target,stage_case,evidence_case,root/('lock-'+case),observer,os.getuid())
            def authorize(operation):
                bindings={}
                if operation=='OPEN':bindings=dict(closed_evidence_sha256=a.sha((evidence_case/'window/CLOSED.evidence').read_bytes()),reopen_bundle_sha256='b'*64)
                m=p.prepare(stage_case/'window',base,'window',operation,observer.graph(),owner=os.getuid(),**bindings)
                now=int(time.time());path=evidence_case/(operation+'.authorization')
                p.exclusive(path,a.canonical(dict(authorized=True,window='window',operation=operation,
                    issued_at=now,expires_at=now+900,identity=observer.identity(),manifest_sha256=a.sha(a.canonical(m)))))
                return path
            operation='OPEN' if case.startswith('open_') else 'CLOSED'
            if operation=='OPEN':candidate.transition('CLOSED','window',authorize('CLOSED'))
            auth=authorize(operation);armed=[False];fired=[False]
            syntax=observer.syntax;reload=observer.reload;probe=observer.probe;atomic=a.atomic
            def fail():fired[0]=True;raise a.Rejected('INJECTED_'+case.upper())
            def boundary(point):
                if point=='before_install':
                    if case=='base_drift':target.write_bytes(base+b'\n# fixture drift\n')
                    if case=='artifact_drift':(stage_case/'window/CLOSED.artifact').write_bytes(b'drift')
                if point=='after_install':armed[0]=True
            def checked_syntax():
                if armed[0] and not fired[0] and case in ('syntax','open_syntax'):fail()
                return syntax()
            def checked_reload():
                if not fired[0] and case=='reload':fail()
                result=reload()
                if not fired[0] and case=='open_reload':fail()
                return result
            def checked_probe(state):
                if armed[0] and not fired[0] and ((case=='closed_probe' and state=='CLOSED') or (case=='open_probe' and state=='OPEN')):fail()
                return probe(state)
            def checked_atomic(path,raw):
                if case=='atomic_install' and not fired[0]:fail()
                return atomic(path,raw)
            observer.boundary=boundary;observer.syntax=checked_syntax
            observer.reload=checked_reload;observer.probe=checked_probe
            if case=='open_prerequisite':observer.reopen=lambda w,h:fail()
            with patch.object(a,'atomic',side_effect=checked_atomic):
                try:candidate.transition(operation,'window',auth)
                except a.Rejected:pass
                else:raise a.Rejected('INJECTION_NOT_REJECTED')
            expected='CLOSED' if operation=='OPEN' or case=='closed_probe' else 'OPEN'
            # Restore observation methods, not serving state, to measure result.
            observer.syntax=syntax;observer.reload=reload;observer.probe=probe
            probe(expected)
            if case=='base_drift':a.require(target.read_bytes()==base+b'\n# fixture drift\n','DRIFT_OVERWRITTEN')
            a.require((sites/'99-unrelated.conf').read_bytes()==unrelated,'UNRELATED_MUTATION')
            print('ACTUAL_ADAPTER_FAILURE_'+case.upper()+'=PASS; EFFECTIVE='+expected,flush=True)
            # Fixture-only reset between independent cases, not production retry.
            atomic(target,base);syntax();reload();observer.drained();probe('OPEN')
        print('ACTUAL_ADAPTER_FAILURE_MATRIX=PASS_10_OF_10',flush=True)
    finally:
        for cid in reversed(created):d.run(['stop',cid]);d.run(['rm',cid])
        a.require(d.inspect('network',t['network'])['Id']==network['Id'],'NETWORK_CHANGED')


if __name__=='__main__':
    try:main()
    except Exception as error:
        code=str(error) if isinstance(error,(a.Rejected,e.Rejected)) else 'INTERNAL_FAILURE'
        print('PREPARED_REHEARSAL=STOPPED; CODE='+code);raise SystemExit(1)
