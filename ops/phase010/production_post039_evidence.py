"""Protected post039 interface for full-file admission authority. Read-only DB.

No PASS boolean inputs. Uses independent live DB, Docker and Nginx observations.
All production paths fixed; default PLAN does not connect or write evidence.
"""
import argparse
import os
from pathlib import Path
import re
import time

import admission_control as a
import prepared_nginx_authority as p
import upgrade_036_039 as u
import b3b_release as b
import execute_prewindow_activation as e
from production_admission_adapter import Adapter
from nginx_admission_service import Service


def fresh(value,window,now):
    a.require(value.get('window')==window,'EVIDENCE_WINDOW')
    a.require(type(value.get('observed_at')) is int
              and 0<=now-value['observed_at']<=300,'STALE_EVIDENCE')


def collect(db,docker,adapter,topology,window,u0,isolation,closed):
    now=int(time.time());daemon=docker.daemon()
    a.require(db.database=='skia_prod' and db.user=='skia_bootstrap','DATABASE_AUTHORITY')
    expected='skia_postgres_prod' if topology['environment']=='production' else topology['network']+'-pg'
    a.require(db.container==expected,'DATABASE_TARGET')
    a.require(set(u0)=={'window','daemon_id','identity','baseline','observed_at'},'U0_FIELDS')
    a.require(u0['window']==window and u0['daemon_id']==daemon,'U0_BINDING')
    a.require(type(u0['observed_at']) is int and 0<=now-u0['observed_at']<=3600,'U0_STALE')
    a.require(set(isolation)=={'window','daemon_id','identity','observed_at','stopped_api_id'},'ISOLATION_FIELDS')
    fresh(isolation,window,now);fresh(closed,window,now)
    a.require(set(closed)=={'window','state','observed_at','identity','base_sha256',
        'artifact_sha256','measurement_sha256','graph_sha256'},'CLOSED_FIELDS')
    a.require(isolation['daemon_id']==daemon,'ISOLATION_DAEMON')
    a.require(closed.get('state')=='CLOSED','ADMISSION_OPEN')
    observed_closed=adapter.verify('CLOSED',window)
    for key in ('identity','base_sha256','artifact_sha256','measurement_sha256','graph_sha256'):
        a.require(closed.get(key)==observed_closed[key],'ADMISSION_BINDING')
    api=docker.inspect('container',topology['api'])
    a.require(api['Id']==isolation['stopped_api_id'] and not api['State']['Running'],'WRITER_NOT_ISOLATED')
    def quiet():
        a.require(db.query("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() "
                           "AND backend_type='client backend' AND pid<>pg_backend_pid()")==[0],
                  'OTHER_DATABASE_CLIENTS')
    quiet();contract=u.contract();observation=u.observe(db,contract)
    a.require(observation['ledger_count']==31 and observation['raw']==e.POST039,'POST039_REQUIRED')
    a.require(u0['identity']==isolation['identity']==observation['identity'],'DATABASE_IDENTITY')
    a.require(u0['baseline']==observation['baseline'],'TENANT_PRESERVATION')
    validators={}
    for name in ('validate_runtime_auth_role.sql','validate_onboarding_role.sql'):
        raw=(u.ROOT/'ops/phase011'/name).read_bytes();sql=raw.decode()
        a.require(sql.count('DO $$')==1 and sql.count('END $$;')==1,'VALIDATOR_SHAPE')
        assertions='DO $$'+sql.split('DO $$',1)[1].split('END $$;',1)[0]+'END $$;'
        a.require(db.query(assertions+" SELECT to_jsonb('PASS'::text)")==['PASS'],'SECURITY_VALIDATION')
        validators[name]=a.sha(raw)
    a.require(u.observe(db,contract)==observation,'DATABASE_DRIFT')
    quiet();fresh(isolation,window,int(time.time()))
    a.require(docker.daemon()==daemon,'DAEMON_DRIFT')
    a.require(not docker.inspect('container',topology['api'])['State']['Running'],'WRITER_RESTARTED')
    final_closed=adapter.verify('CLOSED',window)
    fresh(closed,window,int(time.time()))
    a.require({k:v for k,v in final_closed.items() if k!='observed_at'}==
              {k:v for k,v in observed_closed.items() if k!='observed_at'},'ADMISSION_DRIFT')
    return dict(environment=topology['environment'],window=window,database='skia_prod',
        database_identity=observation['identity'],daemon_id=daemon,observed_at=int(time.time()),
        ledger=contract['migrations'],ledger_count=31,migration_counts={'036':1,'037':1,'038':1,'039':1,'040':0},
        catalog_count=0,migration_040_count=0,fingerprint=observation['raw'],
        security_pass=True,tenant_preservation_pass=True,writers_isolated=True,admission_closed=True,
        security_validator_hashes=validators,u0_sha256=a.sha(a.canonical(u0)),
        isolation_sha256=a.sha(a.canonical(isolation)),admission_evidence_sha256=a.sha(a.canonical(closed)))


def publish(path,value):
    path=Path(path);tmp=path.with_name(path.name+'.partial')
    p.exclusive(tmp,a.canonical(value))
    # Hard-link publishes fully written bytes atomically, refusing overwrite.
    os.link(tmp,path,follow_symlinks=False)
    os.unlink(tmp)
    fd=os.open(path.parent,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--assemble',action='store_true')
    parser.add_argument('--window');args=parser.parse_args()
    if not args.assemble:print('MODE=PLAN; DATABASE_MUTATION=NO; EVIDENCE_CREATED=NO');return
    a.require(os.getuid()==0,'ROOT_REQUIRED')
    a.require(re.fullmatch('[A-Za-z0-9_-]{1,64}',args.window or ''),'WINDOW')
    directory=Path(p.EVIDENCE)/args.window;p.directory(directory,0)
    def read(name):return p.strict(a.private(directory/name,0))
    docker=e.Docker();adapter=Adapter(p.TARGET,p.STAGING,p.EVIDENCE,p.LOCK,Service(docker))
    result=collect(b.DB('skia_postgres_prod','skia_prod','skia_bootstrap'),docker,adapter,
                   e.topology(),args.window,read('u0.json'),read('isolation.json'),read('CLOSED.evidence'))
    publish(directory/'post039.json',result)
    print('POST039_EVIDENCE=PASS; SECRET_VALUES=NOT_EMITTED')


if __name__=='__main__':
    try:main()
    except Exception:
        print('POST039_EVIDENCE=REJECTED; NO_PASS_ASSERTION');raise SystemExit(1)
