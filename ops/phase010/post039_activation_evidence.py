"""Read-only post039 evidence assembly; never runs migrations or isolates writers.

The caller supplies a live admission observer, not an operator boolean. CLI is
PLAN until the production admission adapter is governed and implemented.
"""
import time

import admission_control as a
import b3b_release as b
import upgrade_036_039 as u


def assemble(db, docker, window, u0, isolation, closed, admission, environment):
    a.require(environment in ('production','disposable'),'ENVIRONMENT')
    a.require(db.database=='skia_prod' and db.user=='skia_bootstrap','DATABASE_AUTHORITY')
    if environment=='production':
        a.require(db.container=='skia_postgres_prod','PRODUCTION_DATABASE_TARGET')
    else:
        a.require(db.container.startswith('skia-activation-test-'),'DISPOSABLE_TARGET')
    now=int(time.time());c=u.contract();daemon=docker.daemon()
    a.require(closed.get('window')==window and closed.get('state')=='CLOSED','ADMISSION_WINDOW')
    a.require(0<=now-closed.get('observed_at',0)<=300,'STALE_ADMISSION')
    a.require(closed.get('identity')==admission.identity(),'ADMISSION_IDENTITY')
    a.require(closed.get('base_sha256')==admission.base_hash(),'ADMISSION_BASE')
    a.require(closed.get('artifact_sha256')==a.sha(a.CLOSED),'ADMISSION_ARTIFACT')
    measurement=admission.probe('CLOSED')
    a.require(measurement==closed.get('measurement_sha256'),'ADMISSION_MEASUREMENT')
    observed=u.observe(db,c)
    a.require(observed['ledger_count']==31 and observed['raw']==b.SCHEMA,'POST039_REQUIRED')
    a.require(u0.get('identity')==observed['identity'] and u0.get('window')==window,'U0_IDENTITY')
    a.require(u0.get('daemon_id')==daemon and isolation.get('window')==window,'WINDOW_BINDING')
    a.require(u0.get('baseline')==observed['baseline'],'TENANT_PRESERVATION')
    # Read the canonical validator's catalog assertions in a DB-enforced
    # read-only transaction. Never trust a supplied security_pass flag.
    validators={}
    for name in ('validate_runtime_auth_role.sql','validate_onboarding_role.sql'):
        raw=(u.ROOT/'ops/phase011'/name).read_bytes()
        sql=raw.decode();a.require(sql.count('DO $$')==1 and sql.count('END $$;')==1,'VALIDATOR_SHAPE')
        body='DO $$'+sql.split('DO $$',1)[1].split('END $$;',1)[0]+'END $$;'
        a.require(db.query(body+" SELECT to_jsonb('SECURITY_PASS'::text)")==['SECURITY_PASS'],'SECURITY_VALIDATOR')
        validators[name]=b.digest(raw)
    with u.Session(db) as session:
        u.quiescence(session,observed,isolation)
    # Reject changes during assembly instead of stamping stale observations.
    after=u.observe(db,c)
    a.require(after==observed,'DATABASE_CHANGED_DURING_ASSEMBLY')
    a.require(admission.probe('CLOSED')==measurement,'ADMISSION_CHANGED')
    a.require(docker.daemon()==daemon,'DAEMON_CHANGED')
    with u.Session(db) as session:
        u.quiescence(session,after,isolation)
    a.require(time.time()-now<=300,'ASSEMBLY_EXPIRED')
    return dict(environment=environment,database='skia_prod',database_identity=observed['identity'],
                window=window,daemon_id=daemon,observed_at=int(time.time()),ledger=c['migrations'],
                ledger_count=31,migration_counts={'036':1,'037':1,'038':1,'039':1,'040':0},
                migration_040_count=0,catalog_count=0,fingerprint=observed['raw'],
                security_pass=True,security_validators=validators,
                tenant_preservation_pass=True,u0_sha256=a.sha(a.canonical(u0)),
                writers_isolated=True,isolation_sha256=a.sha(a.canonical(isolation)),
                admission_closed=True,admission_evidence_sha256=a.sha(a.canonical(closed)),
                admission_measurement_sha256=measurement)


if __name__=='__main__':
    print('MODE=PLAN; DATABASE_MUTATION=NO; LIVE_ADMISSION_ADAPTER_REQUIRED=YES')
