"""Sequential actual-executor matrices on ONE explicitly authorized fixture.

Preserves snapshots/journals; removes only that fixture's API/WEB containers.
Never removes PostgreSQL, volumes, images or networks. No production mode.
"""
import argparse
import copy
import json
import re
from pathlib import Path
import tempfile
import time

import execute_prewindow_activation as e
from exercise_activation_failures import InjectedDocker


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--fixture-evidence', required=True)
    p.add_argument('--authorized-fixture', required=True)
    p.add_argument('--reentry-only', action='store_true')
    args=p.parse_args(); source=Path(args.fixture_evidence).resolve()
    a=e.strict_json(e.protected_read(source/'authorization.json',False));t=a['topology']
    e.require(t==e.topology(args.authorized_fixture),'FIXTURE_ONLY')
    d=e.Docker(); pg=t['network']+'-pg'
    e.require(set(d.inspect('container',pg)['NetworkSettings']['Networks'])=={t['network']},'SHARED_PG')
    env=e.parse_secrets(e.protected_read(source/'fixture.env',False),False,pg)
    token=e.protected_read(source/'session',False).decode()
    # Only the fixed synthetic fixture session may be refreshed. No real token.
    e.require(token=='synthetic-executor-session','SYNTHETIC_ONLY')
    sql=b"UPDATE sessions SET expires_at=extract(epoch from now())::bigint+7200 WHERE token='synthetic-executor-session';\n"
    d.run(['exec','-i',pg,'psql','-X','-U','skia_bootstrap','-d','skia_prod','-v','ON_ERROR_STOP=1'],sql)
    stage=Path(tempfile.mkdtemp(prefix='skia-sequential-matrix-')).resolve()
    print('EVIDENCE='+str(stage),flush=True)
    volume=d.inspect('volume',t['volume']);network=d.inspect('network',t['network'])['Id']

    def save(path,obj):
        with open(path,'x') as f:
            import os
            os.chmod(path,0o600);json.dump(obj,f,sort_keys=True)

    def reset(case):
        scoped='^/'+re.escape(t['network'])+r'-(api|web)(-retained-[A-Za-z0-9_-]+)?$'
        ids=d.run(['ps','-aq','--filter','name='+scoped]).decode().split()
        targets=[]
        for cid in ids:
            c=d.inspect('container',cid); name=c['Name'].lstrip('/')
            if name in (t['api'],t['web']) or name.startswith((t['api']+'-retained-',t['web']+'-retained-')):
                e.require(set(c['NetworkSettings']['Networks']) <= {t['network']},'SHARED_CONTAINER')
                targets.append(c)
        save(stage/(case+'-before-reset.json'),[e.capture(c) for c in targets])
        for c in targets:
            if c['State']['Running']:d.run(['stop',c['Id']])
            d.run(['rm',c['Id']])
        for component,image in [('api','sha256:35e62b53527a2562b8db49902b2baba08d366564098a2f3b1b8b05f17ea7d5d9'),
                                ('web','sha256:3fae38986f33404f205d13e49839c4d5d0e84ca18d4125ab3c6a21be43fdad14')]:
            body=e.body(t,component,{});body['Image']=image
            cid=d.create(t[component],body)
            if component=='web':
                d.run(['start',cid])
                for _ in range(90):
                    if d.inspect('container',cid)['State'].get('Health',{}).get('Status')=='healthy':break
                    time.sleep(1)
                else:raise e.Rejected('FIXTURE_WEB_HEALTH')

    def authority():
        auth=copy.deepcopy(a);now=int(time.time())
        evidence=json.loads(e.protected_read(source/'database.json',False));evidence['observed_at']=now
        raw=json.dumps(evidence).encode()
        auth.update(package_sha256=e.package_digest(),issued_at=now,expires_at=now+900,
                    db_evidence_sha256=e.digest(raw),current_containers={c:d.inspect('container',t[c])['Id'] for c in ('api','web')})
        auth['session_authority']['expires_at']=now+3600
        return auth,raw

    cases=[('exact-rerun-1','web-unhealthy'),('exact-rerun-2','web-unhealthy'),('clean-equivalent',None),
           ('before-api','before-api'),('after-api-create','after-api-create'),('api-unhealthy','api-unhealthy'),
           ('before-web','before-web'),('web-unhealthy','web-unhealthy')]
    if args.reentry_only:
        cases=[('after-api-create','after-api-create'),('before-web','before-web'),
               ('web-unhealthy','web-unhealthy'),('final-clean-equivalent',None)]
    for name,failure in cases:
        reset(name);auth,raw=authority();inj=InjectedDocker(t,failure)
        if failure=='before-api':auth['activation_authorized']=False
        journal=stage/(name+'.jsonl')
        try:
            e.Executor(inj,t,auth,raw,env,token,journal).execute()
            e.require(failure is None,'INJECTION_NOT_DETECTED')
        except e.Rejected as error:
            expected={'before-api':'ACTIVATION_NOT_AUTHORIZED','after-api-create':'INJECT_AFTER_API_CREATE',
                      'api-unhealthy':'CANDIDATE_UNHEALTHY','before-web':'INJECT_BEFORE_WEB',
                      'web-unhealthy':'CANDIDATE_UNHEALTHY'}.get(failure)
            observed=str(error)
            if observed=='EXECUTION_STOPPED_REVIEW_JOURNAL':
                records=[json.loads(line) for line in journal.read_text().splitlines()]
                e.require(records[-1]['event']=='STOP_NO_ROLLBACK','FAILURE_JOURNAL')
                observed=records[-1]['data']
            e.require(observed==expected,'UNEXPECTED_FAILURE_CLASS')
        e.require(d.inspect('network',t['network'])['Id']==network,'NETWORK_RECREATED')
        e.require(d.inspect('volume',t['volume'])['CreatedAt']==volume['CreatedAt'],'VOLUME_RECREATED')
        save(stage/(name+'-after.json'),{c:e.capture(d.inspect('container',t[c])) for c in ('api','web')})
        print(name.upper().replace('-','_')+'=PASS',flush=True)
        if args.reentry_only:
            # New authority is deliberately rebound to the observed containers.
            # No prior failed authorization or journal is silently reused.
            fresh,dbraw=authority(); observer=InjectedDocker(t,None)
            retry=stage/(name+'-reentry.jsonl')
            if failure=='after-api-create':
                try:
                    e.Executor(observer,t,fresh,dbraw,env,token,retry).execute()
                    raise e.Rejected('UNHEALTHY_REENTRY_ACCEPTED')
                except e.Rejected as error:
                    e.require(str(error)=='EXISTING_CANDIDATE_UNHEALTHY','REENTRY_FAILURE_CLASS')
                e.require(not observer.actions and not retry.exists(),'DESTRUCTIVE_REENTRY')
                print('REENTRY_D=PASS_REJECTED_WITHOUT_MUTATION',flush=True)
            else:
                # Health injection changes observation only. Wait for actual
                # Docker health before classifying the previous-failure reentry.
                for _ in range(90):
                    if all(d.inspect('container',t[c])['State'].get('Health',{}).get('Status')=='healthy'
                           for c in ('api','web')):break
                    time.sleep(1)
                else:raise e.Rejected('REENTRY_REAL_HEALTH')
                oldids={c:d.inspect('container',t[c])['Id'] for c in ('api','web')}
                e.Executor(observer,t,fresh,dbraw,env,token,retry).execute()
                e.require(d.inspect('container',t['api'])['Id']==oldids['api'],'API_REENTRY_REPLACEMENT')
                if failure!='before-web':
                    e.require(not observer.actions,'HEALTHY_REENTRY_MUTATION')
                label='B' if failure=='before-web' else 'C' if failure=='web-unhealthy' else 'A'
                print('REENTRY_'+label+'=PASS',flush=True)
                # Both completed and incomplete journal paths reject reuse.
                again,dbraw=authority()
                for suffix,contents in [('consumed',retry.read_bytes()),('incomplete',b'{"event":"CAPTURE"}\n')]:
                    path=stage/(name+'-'+suffix+'.jsonl');path.write_bytes(contents);path.chmod(0o600)
                    safe=InjectedDocker(t,None)
                    try:e.Executor(safe,t,again,dbraw,env,token,path).execute()
                    except FileExistsError:pass
                    else:raise e.Rejected('JOURNAL_REUSED')
                    e.require(not safe.actions,'JOURNAL_REENTRY_MUTATION')
                stale=copy.deepcopy(again);stale['expires_at']=0
                safe=InjectedDocker(t,None)
                try:e.Executor(safe,t,stale,dbraw,env,token,stage/(name+'-stale')).execute()
                except e.Rejected:pass
                else:raise e.Rejected('STALE_ACCEPTED')
                e.require(not safe.actions,'STALE_REENTRY_MUTATION')
                print('REENTRY_E_F=PASS_REJECTED_WITHOUT_MUTATION',flush=True)
    if args.reentry_only:
        print('REENTRY_MATRIX=PASS_A_TO_F',flush=True)
    else:
        print('FAILURE_INJECTION_MATRIX=PASS_5_OF_5',flush=True)
    print('HISTORICAL_CAUSE=NON_REPRODUCED_UNKNOWN; FIXTURES_PRESERVED=YES',flush=True)


if __name__=='__main__':
    try:main()
    except Exception as error:
        # Never print subprocess bodies, arguments, credentials or session input.
        code=str(error) if isinstance(error,e.Rejected) else type(error).__name__
        print('MATRIX=STOPPED; CODE='+code);raise SystemExit(1)
