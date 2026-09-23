"""Independent protected reopen evidence; no admission or runtime mutation."""
import argparse
import os
from pathlib import Path
import re
import time

import admission_control as a
import prepared_nginx_authority as p
import execute_prewindow_activation as e
import upgrade_036_039 as u

SOURCE=e.contract.expected()['runtime_source_sha']


def descriptor(raw):
    fields={}
    for line in raw.decode().splitlines():
        if not line or line.startswith('#'):continue
        key,sep,value=line.partition('=')
        a.require(sep and key not in fields,'DESCRIPTOR_SYNTAX');fields[key]=value
    a.require(fields=={'API_SOURCE_SHA':SOURCE,'WEB_SOURCE_SHA':SOURCE},'DESCRIPTOR_NOT_ALIGNED')
    return a.sha(raw)


def runtime(docker,topology,window,session,metadata):
    now=int(time.time())
    e.validate_session_authority(session,metadata,{'expires_at':now+1},
                                 topology['environment']=='production',now)
    identities={}
    for component in ('api','web'):
        current=docker.inspect('container',topology[component]);e.identity(current,topology,component)
        a.require(current['State']['Running'] and current['State'].get('Health',{}).get('Status')=='healthy'
                  and current['RestartCount']==0,'RUNTIME_NOT_HEALTHY')
        identities[component]={'id':current['Id'],'image':current['Image']}
    checker=e.Executor(docker,topology,{'session_authority':metadata},b'',{},session,Path('/unused'))
    checker.probe(web=False);checker.probe(web=True)
    return dict(window=window,observed_at=int(time.time()),daemon_id=docker.daemon(),
                api=identities['api'],web=identities['web'],
                authenticated_read_contract_sha256=a.sha(e.PROBE.encode()),
                session_metadata_sha256=a.sha(a.canonical(metadata)))


class Gate:
    def __init__(self,directory,descriptor_path,db,docker,topology,owner=0,descriptor_owner=1001):
        self.directory=Path(directory);self.descriptor_path=Path(descriptor_path)
        self.db=db;self.docker=docker;self.topology=topology
        self.owner=owner;self.descriptor_owner=descriptor_owner
    def read(self,name):return a.private(self.directory/name,self.owner)
    def __call__(self,window,expected_bundle_hash):
        p.directory(self.directory,self.owner);now=int(time.time())
        a.require(self.directory.name==window,'REOPEN_WINDOW_PATH')
        bundle_raw=self.read('reopen.json');a.require(a.sha(bundle_raw)==expected_bundle_hash,'REOPEN_BUNDLE_HASH')
        bundle=p.strict(bundle_raw)
        a.require(set(bundle)=={'window','observed_at','daemon_id','post039_sha256',
            'runtime_sha256','descriptor_sha256','closed_sha256'},'REOPEN_FIELDS')
        a.require(bundle['window']==window and bundle['daemon_id']==self.docker.daemon(),'REOPEN_IDENTITY')
        a.require(type(bundle['observed_at']) is int and 0<=now-bundle['observed_at']<=300,'REOPEN_STALE')
        raw_db=self.read('post039.json');raw_runtime=self.read('runtime.json')
        raw_closed=self.read('CLOSED.evidence')
        raw_descriptor=a.private(self.descriptor_path,self.descriptor_owner)
        for raw,key in ((raw_db,'post039_sha256'),(raw_runtime,'runtime_sha256'),
                        (raw_closed,'closed_sha256'),(raw_descriptor,'descriptor_sha256')):
            a.require(a.sha(raw)==bundle[key],'REOPEN_ARTIFACT_HASH')
        descriptor(raw_descriptor)
        evidence=p.strict(raw_db);closed=p.strict(raw_closed);record=p.strict(raw_runtime)
        for obj in (evidence,closed,record):
            a.require(obj.get('window')==window and type(obj.get('observed_at')) is int
                      and 0<=now-obj['observed_at']<=300,'REOPEN_ARTIFACT_WINDOW_OR_AGE')
        contract=u.contract()
        a.require(evidence.get('environment')==self.topology['environment']
            and evidence.get('database')=='skia_prod' and evidence.get('daemon_id')==bundle['daemon_id'],
            'POST039_ENVIRONMENT')
        a.require(evidence.get('ledger')==contract['migrations'] and evidence.get('ledger_count')==31
            and evidence.get('migration_counts')=={'036':1,'037':1,'038':1,'039':1,'040':0}
            and evidence.get('migration_040_count')==0 and evidence.get('catalog_count')==0
            and evidence.get('fingerprint')==e.POST039,'POST039_CONTRACT')
        a.require(all(evidence.get(k) is True for k in ('security_pass','tenant_preservation_pass',
                      'writers_isolated','admission_closed')),'POST039_NOT_APPROVED')
        a.require(closed.get('state')=='CLOSED' and evidence.get('admission_evidence_sha256')==a.sha(raw_closed),
                  'CLOSED_BINDING')
        # Independent live DB observation: root-created metadata is not enough.
        observation=u.observe(self.db,contract)
        a.require(observation['ledger_count']==31 and observation['raw']==e.POST039
                  and observation['identity']==evidence['database_identity'],'REOPEN_DATABASE_DRIFT')
        raw_u0=self.read('u0.json');u0=p.strict(raw_u0)
        a.require(a.sha(raw_u0)==evidence.get('u0_sha256')
                  and u0.get('window')==window and u0.get('daemon_id')==bundle['daemon_id']
                  and observation['baseline']==u0.get('baseline'),'REOPEN_TENANT_DRIFT')
        session=self.read('session').decode();metadata=p.strict(self.read('session-metadata.json'))
        observed=runtime(self.docker,self.topology,window,session,metadata)
        a.require(set(record)==set(observed),'RUNTIME_FIELDS')
        for key in observed:
            if key!='observed_at':a.require(record[key]==observed[key],'RUNTIME_CHANGED')
        a.require(0<=int(time.time())-bundle['observed_at']<=300,'REOPEN_EXPIRED_DURING_VALIDATION')
        # Return no credentials or token-derived fingerprints.
        return dict(window=window,verified_at=int(time.time()),bundle_sha256=expected_bundle_hash)


def assemble_bundle(directory,descriptor_path,*,owner=0,descriptor_owner=1001):
    """Bind already independently generated artifacts; never generates PASS."""
    root=Path(directory);p.directory(root,owner);window=root.name;now=int(time.time())
    artifacts={name:a.private(root/name,owner) for name in ('post039.json','runtime.json','CLOSED.evidence')}
    identities=[p.strict(raw) for raw in artifacts.values()]
    a.require(all(x.get('window')==window and type(x.get('observed_at')) is int
        and 0<=now-x['observed_at']<=300 for x in identities),'BUNDLE_INPUT_STALE')
    raw_descriptor=a.private(descriptor_path,descriptor_owner);descriptor(raw_descriptor)
    return dict(window=window,observed_at=now,daemon_id=identities[0]['daemon_id'],
        post039_sha256=a.sha(artifacts['post039.json']),runtime_sha256=a.sha(artifacts['runtime.json']),
        closed_sha256=a.sha(artifacts['CLOSED.evidence']),descriptor_sha256=a.sha(raw_descriptor))


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--assemble',action='store_true')
    parser.add_argument('--window');args=parser.parse_args()
    if not args.assemble:print('MODE=PLAN; MUTATION=NO');return
    a.require(os.getuid()==0,'ROOT_REQUIRED')
    a.require(re.fullmatch('[A-Za-z0-9_-]{1,64}',args.window or ''),'WINDOW')
    from production_post039_evidence import publish
    import b3b_release as b
    root=Path(p.EVIDENCE)/args.window;p.directory(root,0)
    docker=e.Docker();topology=e.topology()
    session=a.private(root/'session',0).decode()
    metadata=p.strict(a.private(root/'session-metadata.json',0))
    publish(root/'runtime.json',runtime(docker,topology,args.window,session,metadata))
    descriptor_path='/opt/apps/skia/prod/runtime/RELEASE.env'
    bundle=assemble_bundle(root,descriptor_path)
    publish(root/'reopen.json',bundle)
    # Publication is binding, not approval: independently validate before PASS.
    Gate(root,descriptor_path,b.DB('skia_postgres_prod','skia_prod','skia_bootstrap'),
         docker,topology)(args.window,a.sha(a.canonical(bundle)))
    print('REOPEN_PREREQUISITES=PASS; ADMISSION_CHANGED=NO')


if __name__=='__main__':
    try:main()
    except Exception:
        print('REOPEN_PREREQUISITES=REJECTED; DO_NOT_OPEN');raise SystemExit(1)
