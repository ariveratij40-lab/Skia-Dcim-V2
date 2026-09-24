"""Disposable-only P0 fixtures, never production credentials or targets."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time

import b3b_release as b
import execute_prewindow_activation as e
import p0_security_repair as r
import upgrade_036_039 as u

REPO = os.environ.get('SKIA_P0_GIT_REPO', str(Path(__file__).resolve().parents[2]))


def main():
    os.umask(0o077)
    stage = Path(tempfile.mkdtemp(prefix='skia-p0-fixture-')).resolve()
    prefix = 'skia-p0-' + secrets.token_hex(6)
    d = e.Docker()
    password = secrets.token_hex(24)
    source = stage/'post035'; source.mkdir()
    archive = b.git(REPO, 'archive', '658cfa35becaf75f851a27d44180fef20ea0f2ce')
    b.run(['tar', '-xf', '-', '-C', str(source)], archive)
    pg = prefix+'-a'
    print('FIXTURE_A='+pg+'; EVIDENCE='+str(stage), flush=True)
    cid = d.create(pg, {'Image':'postgres:16.14-alpine',
        'Env':['POSTGRES_USER=skia_bootstrap','POSTGRES_DB=skia_prod','POSTGRES_PASSWORD='+password],
        'HostConfig':{'NetworkMode':'bridge','PortBindings':{}}})
    d.run(['start',cid])
    for _ in range(60):
        try:
            if b'init process complete' in d.run(['logs',pg]):
                d.run(['exec',pg,'pg_isready','-U','skia_bootstrap','-d','skia_prod']);break
        except e.Rejected:pass
        time.sleep(1)
    else:raise ValueError('PG_START_FAILED')
    d.run(['cp',str(source)+'/.',pg+':/fixture'])
    sql=['exec','-i',pg,'psql','-X','-qAt','-U','skia_bootstrap','-d','skia_prod','-v','ON_ERROR_STOP=1']
    def execute(s):return d.run(sql,s.encode())
    provision=''.join('\\set '+k+" '"+password+"'\n" for k in
        ('migrator_password','runtime_password','onboarding_password'))+'\\i /fixture/ops/phase011/provision_database_roles.sql\n'
    execute(provision)
    d.run(['exec','-i',pg,'sh'],('export PGPASSWORD='+password+'\nexport PHASE010_DATABASE_URL=postgresql://skia_migrator@localhost/skia_prod\nexec bash /fixture/ops/phase010/run_clean_bootstrap.sh\n').encode())
    execute(provision)
    execute('\\set phase011_environment production\n\\set expected_database skia_prod\n\\set execution_approval PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED\n\\i /fixture/ops/phase011/activate_clean_production_rls.sql\n')
    db=b.DB(pg,'skia_prod','skia_bootstrap')
    b.require(db.fingerprint()==r.RAW,'A_RAW')
    b.require(b.structure(db)['hash']==r.CANONICAL,'A_CANONICAL')
    execute("INSERT INTO tenants(id,name) VALUES('f2000000-0000-4000-8000-000000000001','P0 fixture');")
    baseline=u.baseline(db,project=False)
    canonical=b.structure(db)
    for signature in r.ROUTINES:execute('ALTER FUNCTION '+signature+' OWNER TO skia_bootstrap;')
    drift=b.structure(db)
    print('DISPOSABLE_LIVE_DRIFT_HASH='+drift['hash'],flush=True)
    b.require(drift['hash']==r.DRIFT,'EXACT_DRIFT_REPRODUCTION_STOP')
    # Must not proceed to B unless exact drift was reproduced.
    for i in (1,4,8):
        try:r.repair(db,inject_failure_after=i)
        except ValueError as error:b.require(str(error)=='INJECTED_ROLLBACK','WRONG_FAILURE')
        else:raise ValueError('INJECTION_NOT_REJECTED')
        b.require(b.structure(db)==drift and u.baseline(db,project=False)==baseline,'ROLLBACK_DELTA')
    print('ATOMIC_ROLLBACK=PASS_3_BOUNDARIES',flush=True)
    r.repair(db)
    b.require(b.structure(db)==canonical and u.baseline(db,project=False)==baseline,'REPAIR_DELTA')
    print('STRUCTURAL_REPAIR_REHEARSAL=PASS; RAW='+db.fingerprint(),flush=True)
    print('FIXTURE_A_RETAINED='+pg,flush=True)


if __name__=='__main__':
    try:main()
    except Exception as error:
        # Only fixed codes; no database error/DSN or arbitrary subprocess output.
        print('REHEARSAL=STOPPED; ERROR_TYPE='+type(error).__name__,flush=True)
        raise SystemExit(1)
