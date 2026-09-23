"""Single-file production admission adapter. Default PLAN, never SSH.

Production paths are fixed. No discovery, include installation, DB mutation,
application rollback or service restart. OPEN requires an independent gate.
"""
import argparse
import fcntl
import os
from pathlib import Path
import re
import stat
import time

import admission_control as a
import prepared_nginx_authority as p


class Adapter:
    def __init__(self,target,staging,evidence,lock,observer,owner=0):
        self.target=Path(target).absolute();self.staging=Path(staging).absolute()
        self.evidence=Path(evidence).absolute();self.lock=Path(lock).absolute()
        self.observer=observer;self.owner=owner
        self.base=(Path(__file__).parent/'fixtures/skia_nginx_observed.conf.fixture').read_bytes()
        a.require(a.sha(self.base)==p.BASE_HASH,'PACKAGED_BASE_HASH')

    def current(self):
        path=self.target
        for parent in path.parents:
            st=parent.lstat()
            a.require(stat.S_ISDIR(st.st_mode) and not stat.S_ISLNK(st.st_mode),'TARGET_PARENT')
            if str(parent) not in ('/tmp','/private/tmp'):
                a.require(st.st_uid in (0,self.owner) and not st.st_mode&0o022,'TARGET_PARENT_SECURITY')
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
        try:
            st=os.fstat(fd)
            a.require(stat.S_ISREG(st.st_mode) and st.st_size<1048576,'TARGET_FILE')
            raw=os.read(fd,1048576)
            observed_original=(st.st_uid==1001 and st.st_gid==1001
                and stat.S_IMODE(st.st_mode)==0o664 and raw==self.base)
            protected=(st.st_uid==self.owner and stat.S_IMODE(st.st_mode)==0o600)
            a.require(observed_original or protected,'TARGET_OWNER_MODE')
            a.require(raw in (self.base,p.derive(self.base,'CLOSED')),'BASE_DRIFT')
            return raw,st.st_dev
        finally:os.close(fd)

    def verify(self,state,window):
        a.require(state in ('OPEN','CLOSED'),'STATE')
        a.require(re.fullmatch('[A-Za-z0-9_-]{1,64}',window or ''),'WINDOW')
        raw,_=self.current();a.require(raw==p.derive(self.base,state),'CURRENT_STATE')
        self.observer.syntax()
        measurement=self.observer.probe(state)
        a.require(re.fullmatch('[a-f0-9]{64}',measurement or ''),'MEASUREMENT')
        return dict(window=window,state=state,observed_at=int(time.time()),
                    identity=self.observer.identity(),base_sha256=p.BASE_HASH,
                    artifact_sha256=a.sha(raw),measurement_sha256=measurement,
                    graph_sha256=self.observer.graph())

    def transition(self,operation,window,authorization):
        a.require(operation in ('OPEN','CLOSED'),'OPERATION')
        a.require(re.fullmatch('[A-Za-z0-9_-]{1,64}',window or ''),'WINDOW')
        p.directory(self.staging,self.owner);p.directory(self.evidence,self.owner)
        # Lock's parent must already be protected; do not create production dirs.
        for parent in self.lock.parents:
            st=parent.lstat()
            a.require(stat.S_ISDIR(st.st_mode) and not stat.S_ISLNK(st.st_mode),'LOCK_PARENT')
            if str(parent) not in ('/tmp','/private/tmp'):
                a.require(st.st_uid in (0,self.owner) and not st.st_mode&0o022,'LOCK_PARENT_SECURITY')
        fd=os.open(self.lock,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
        try:
            st=os.fstat(fd);a.require(st.st_uid==self.owner and stat.S_IMODE(st.st_mode)==0o600,'LOCK_SECURITY')
            try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError:raise a.Rejected('TRANSITION_BUSY') from None
            return self._locked(operation,window,authorization)
        finally:os.close(fd)

    def _locked(self,operation,window,authorization):
        root=self.staging/window;output=self.evidence/window
        p.directory(root,self.owner);p.directory(output,self.owner)
        for journal in self.evidence.glob('*/*.journal'):
            records=[p.strict(line) for line in a.private(journal,self.owner).splitlines()]
            a.require(records and records[-1]['event']=='COMPLETE','INCOMPLETE_TRANSITION')
        auth=p.strict(a.private(authorization,self.owner))
        a.require(set(auth)=={'authorized','operation','window','issued_at','expires_at',
                             'identity','manifest_sha256'},'AUTH_FIELDS')
        now=int(time.time())
        a.require(auth['authorized'] is True and auth['operation']==operation
                  and auth['window']==window,'AUTHORIZATION')
        a.require(type(auth['issued_at']) is int and type(auth['expires_at']) is int
                  and auth['issued_at']<=now<auth['expires_at']<=auth['issued_at']+900,'AUTH_EXPIRED')
        a.require(auth['identity']==self.observer.identity(),'AUTH_IDENTITY')
        manifest_raw=a.private(root/(operation+'.manifest'),self.owner)
        a.require(a.sha(manifest_raw)==auth['manifest_sha256'],'AUTH_MANIFEST')
        current,device=self.current();graph=self.observer.graph()
        raw,manifest=p.verify(root,self.base,window,operation,current,graph,device,
                              lock_held=True,owner=self.owner)
        prior='OPEN' if operation=='CLOSED' else 'CLOSED'
        self.verify(prior,window)
        if operation=='OPEN':
            closed_raw=a.private(output/'CLOSED.evidence',self.owner)
            closed=p.strict(closed_raw)
            a.require(a.sha(closed_raw)==manifest['closed_evidence_sha256']
                and closed['window']==window and closed['state']=='CLOSED'
                and closed['identity']==auth['identity'],'CLOSED_EVIDENCE_BINDING')
            # Must read/verify independent DB, runtime, descriptor observations;
            # this callback may not simply trust booleans in the authorization.
            self.observer.reopen_gate(window,manifest['reopen_bundle_sha256'])
        journal=output/(operation+'.journal')
        j=os.open(journal,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
        def event(name):
            os.write(j,a.canonical(dict(event=name,window=window,operation=operation))+b'\n');os.fsync(j)
        installed=False;install_attempted=False;reload_attempted=False
        try:
            event('BEGIN')
            self.observer.boundary('before_install')
            again,device=self.current()
            checked,_=p.verify(root,self.base,window,operation,again,self.observer.graph(),device,
                               lock_held=True,owner=self.owner)
            a.require(checked==raw and time.time()<auth['expires_at'],'PREINSTALL_DRIFT_OR_EXPIRY')
            a.require(a.private(root/(operation+'.manifest'),self.owner)==manifest_raw,'MANIFEST_DRIFT')
            install_attempted=True
            a.atomic(self.target,raw);installed=True;event('INSTALLED_NOT_RELOADED')
            self.observer.boundary('after_install');self.observer.syntax()
            a.require(self.observer.graph()==graph,'GRAPH_DRIFT')
            reload_attempted=True;self.observer.reload();self.observer.drained()
            result=self.verify(operation,window)
            a.require(result['graph_sha256']==graph,'GRAPH_DRIFT')
            p.exclusive(output/(operation+'.evidence'),a.canonical(result));event('COMPLETE')
            return result
        except Exception:
            event('FAILED_NO_APPLICATION_OR_DATABASE_ROLLBACK')
            # replace may succeed before directory fsync raises. Classify the
            # actual bytes; never assume an atomic helper exception means no write.
            if install_attempted and not installed:
                actual,_=self.current()
                installed=actual==raw
            if installed:
                actual,_=self.current()
                a.require(actual==raw,'POSTINSTALL_DRIFT_STOP_NO_OVERWRITE')
                fallback=p.derive(self.base,'CLOSED') if reload_attempted else current
                a.atomic(self.target,fallback);event('DISK_CLASSIFIED_CLOSED' if fallback!=self.base else 'DISK_CLASSIFIED_ORIGINAL')
                if operation=='OPEN' and reload_attempted:
                    try:
                        self.observer.syntax();self.observer.reload();self.observer.drained()
                        self.verify('CLOSED',window);event('CLOSED_RECOVERED')
                    except Exception:event('EFFECTIVE_STATE_UNKNOWN_STOP')
            raise
        finally:os.close(j)


def main():
    parser=argparse.ArgumentParser();mode=parser.add_mutually_exclusive_group()
    mode.add_argument('--prepare',choices=('CLOSED','OPEN'))
    mode.add_argument('--transition',choices=('CLOSED','OPEN'))
    mode.add_argument('--verify',choices=('CLOSED','OPEN'))
    parser.add_argument('--window');args=parser.parse_args()
    if not any((args.prepare,args.transition,args.verify)):
        print('MODE=PLAN; TARGET='+p.TARGET+'; BASE_SHA256='+p.BASE_HASH)
        print('MUTATION=NO; FUTURE_SEPARATE_EXECUTION_AUTHORIZATION_REQUIRED=YES');return
    a.require(os.getuid()==0,'ROOT_REQUIRED')
    a.require(re.fullmatch('[A-Za-z0-9_-]{1,64}',args.window or ''),'WINDOW')
    # Fixed paths only; protected directories require separate window staging.
    import execute_prewindow_activation as e
    import b3b_release as b
    from nginx_admission_service import Service
    from production_reopen_gate import Gate
    output=Path(p.EVIDENCE)/args.window;p.directory(output,0)
    docker=e.Docker()
    gate=Gate(output,'/opt/apps/skia/prod/runtime/RELEASE.env',
              b.DB('skia_postgres_prod','skia_prod','skia_bootstrap'),docker,e.topology())
    service=Service(docker,reopen=gate)
    adapter=Adapter(p.TARGET,p.STAGING,p.EVIDENCE,p.LOCK,service)
    if args.prepare:
        adapter.verify('OPEN' if args.prepare=='CLOSED' else 'CLOSED',args.window)
        bindings={}
        if args.prepare=='OPEN':
            bundle=a.private(output/'reopen.json',0);gate(args.window,a.sha(bundle))
            bindings=dict(closed_evidence_sha256=a.sha(a.private(output/'CLOSED.evidence',0)),
                          reopen_bundle_sha256=a.sha(bundle))
        p.prepare(Path(p.STAGING)/args.window,adapter.base,args.window,args.prepare,service.graph(),**bindings)
        print('PREPARED='+args.prepare+'; INSTALLED=NO; RELOADED=NO')
    elif args.verify:
        adapter.verify(args.verify,args.window);print('VERIFIED='+args.verify+'; MUTATION=NO')
    else:
        adapter.transition(args.transition,args.window,output/(args.transition+'.authorization'))
        print('VERIFIED_TRANSITION='+args.transition)


if __name__=='__main__':
    try:main()
    except Exception:
        print('ADMISSION=STOPPED; VERIFY_STATE_BEFORE_FURTHER_ACTION');raise SystemExit(1)
