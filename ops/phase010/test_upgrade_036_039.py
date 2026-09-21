"""Disposable only. Never connects to a remote endpoint or deployed DB."""
import copy
import json
import os
from pathlib import Path
import subprocess
import time
import threading
from unittest.mock import patch
import upgrade_036_039 as u
import b3b_release as b
import b3b_recovery as r


def rejected(call, label):
    try:
        call()
    except (ValueError, BrokenPipeError):
        print(label + '=PASS_REJECTED', flush=True)
    else:
        raise AssertionError(label + '_NOT_REJECTED')


def main():
    container = os.environ['UPGRADE_CONTAINER']
    b.require(container.startswith('skia-upgrade-matrix-'), 'DISPOSABLE_TARGET')
    stage = Path(os.environ['UPGRADE_STAGE'])
    db = b.DB(container, 'skia_prod', 'skia_bootstrap')
    c = u.contract()
    source = u.observe(db, c)
    assert source['ledger_count'] == 27
    # Representative historical data; no production values copied.
    r.execute(db, """
    INSERT INTO tenants(id,name) VALUES('f2000000-0000-4000-8000-000000000001','Upgrade fixture');
    INSERT INTO users(id,email,name,password_hash) VALUES('f2000000-0000-4000-8000-000000000002','upgrade@example.invalid','Fixture','not-a-real-password-hash');
    INSERT INTO branches(id,tenant_id,code,name) VALUES('f2100000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','UP','Upgrade');
    INSERT INTO user_tenants(user_id,tenant_id) VALUES('f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001');
    INSERT INTO user_branches(user_id,branch_id) VALUES('f2000000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001');
    INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES('f2400000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','SITE','Site','active');
    INSERT INTO floors(id,tenant_id,building_id,code,name,status,hierarchy_governed) VALUES('f2500000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f2400000-0000-4000-8000-000000000001','F1','Floor','active',true);
    INSERT INTO zones(id,tenant_id,branch_id,building_id,floor_id,code,name,status,hierarchy_governed) VALUES('f2600000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','f2400000-0000-4000-8000-000000000001','f2500000-0000-4000-8000-000000000001','Z1','Zone','active',true);
    INSERT INTO internal_areas(tenant_id,branch_id,site_id,floor_id,zone_id,code,name,status,hierarchy_governed) VALUES('f2000000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','f2400000-0000-4000-8000-000000000001','f2500000-0000-4000-8000-000000000001','f2600000-0000-4000-8000-000000000001','AREA','Area','active',true);
    INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,include_branch,seq_digits,last_seq,active) VALUES('f2200000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','SERVER','SRV',true,4,0,true);
    UPDATE naming_rules SET last_seq=7 WHERE id='f2200000-0000-4000-8000-000000000001';
    INSERT INTO nomenclature_branch_counters(nomenclature_id,tenant_id,branch_id,last_seq) VALUES('f2200000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001',7);
    INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name,nomenclature_id,nomenclature_sequence) SELECT 'f2300000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001',id,'SRV-UP-0007','Historical server','f2200000-0000-4000-8000-000000000001',7 FROM asset_types WHERE code='SERVER';
    INSERT INTO audit_logs(user_id,tenant_id,action,entity_type,entity_id,changes) VALUES('f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','fixture_created','fixture','historical','{}');
    INSERT INTO user_roles(user_id,tenant_id,role_id) SELECT 'f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001',id FROM roles WHERE name='admin';
    INSERT INTO sessions(user_id,tenant_id,branch_id,token,expires_at) VALUES('f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','disposable-upgrade-test-session',extract(epoch from now())::bigint+7200);
    """)
    preservation = u.baseline(db)
    before = u.recovery_snapshot(db)
    dump = db.command('pg_dump', '-U', 'skia_bootstrap', '-d', db.database, '-Fc')
    cp = {'path': str(stage/'pre036.dump'), 'sha256': b.digest(dump),
          'identity': u.identity(db), 'source_ledger_count': 27,
          'source_raw': before['raw'], 'baseline': preservation, 'restore_targets': []}
    Path(cp['path']).write_bytes(dump)
    for target in ('restore_one', 'restore_two'):
        restored, meta = r.restore(db, cp, target)
        after = u.recovery_snapshot(restored)
        after.update(restore_exit=meta['pg_restore_exit_code'], restore_stderr=meta['pg_restore_stderr'])
        verdict = u.verify_restore(before, after)
        assert verdict['recovery_verified']
        cp['restore_targets'].append(target)
        print('RESTORE='+json.dumps(verdict)+' RAW='+after['raw'], flush=True)
    cp['recovery_verified'] = True
    (stage/'checkpoint.json').write_text(json.dumps(cp, indent=2))
    # Strict conjunction: raw equality alone never overrides schema/security.
    for label, field in [('STRUCTURAL','structure'), ('SECURITY','structure'), ('UNCLASSIFIED','normalized_raw')]:
        bad = copy.deepcopy(after)
        bad[field] = 'drift'
        rejected(lambda: u.verify_restore(before, bad), 'RESTORE_NEGATIVE_'+label)
    bad = copy.deepcopy(after); bad['raw'] = before['raw']; bad['structure'] = 'drift'
    rejected(lambda: u.verify_restore(before, bad), 'RESTORE_RAW_EQUAL_STRUCTURE_DRIFT')
    # Actual catalog drift, in transactions rolled back, not only mocked objects.
    for label, sql in [('COLUMN',"ALTER TABLE tenants ADD COLUMN forbidden text"),
                       ('SECURITY',"ALTER TABLE assets NO FORCE ROW LEVEL SECURITY")]:
        class Changed:
            def query(self, query):
                raw = r.execute(db, 'BEGIN; '+sql+'; '+query+'; ROLLBACK;')
                return [json.loads(x) for x in raw.splitlines() if x]
        assert b.structure(Changed()) != before['structure']
        assert b.structure(db) == before['structure']
        print('ACTUAL_RESTORE_NEGATIVE_'+label+'=PASS', flush=True)

    def evidence(target):
        return {'identity': u.identity(target), 'observed_at': time.time(), 'requested': True,
                'verified': True, 'old_api_writers_active': False, 'in_flight_drained': True,
                'external_isolation_reference': 'DISPOSABLE_NO_APPLICATION_STARTED'}

    def clone(name):
        r.name(name)
        r.execute(db, 'CREATE DATABASE '+name+' TEMPLATE skia_prod OWNER skia_migrator;')
        target = b.DB(container, name, 'skia_bootstrap')
        r.acl(target, name)
        return target

    # Independently cloned canonical live prefixes retain raw serialization.
    for stop in range(27, 32):
        target = clone('prefix_'+str(stop))
        with u.Session(target) as session:
            for i in range(27, stop):
                u.apply_one(session, c['migrations'][i])
        observed = u.observe(target, c)
        assert observed['ledger_count'] == stop and observed['baseline'] == preservation
        if stop >= 28:
            assert target.query("SELECT to_jsonb(source_type='LEGACY_UNATTRIBUTED' AND sequence_scope='BRANCH' AND NOT customized_after_acceptance) FROM naming_rules") == [True]
        if stop >= 29:
            assert target.query("SELECT to_jsonb(nomenclature_sequence_scope='BRANCH' AND nomenclature_sequence_scope_location_id IS NULL) FROM assets") == [True]
        print('PREFIX_'+str(stop)+'='+observed['raw'], flush=True)
        target_cp = dict(cp, identity=u.identity(target))
        result = u.upgrade(target, evidence(target), preservation, target_cp)
        assert result['ledger_count'] == 31
        assert u.upgrade(target, evidence(target), preservation, target_cp)['ledger_count'] == 31
        print('RESUME_'+str(stop)+'=PASS', flush=True)
    # Force SQL failure after each migration's SQL and ledger, before COMMIT.
    for i in range(27,31):
        target = clone('failure_'+str(i))
        with u.Session(target) as session:
            for j in range(27,i): u.apply_one(session,c['migrations'][j])
        original = u.observe(target,c)
        with u.Session(target) as session:
            sql=(u.ROOT/c['migrations'][i]['path']).read_text()
            rejected(lambda: session.execute('BEGIN; SET LOCAL ROLE skia_migrator; '+sql+
                "; INSERT INTO production_bootstrap_migrations(path,sha256) VALUES ('"+
                c['migrations'][i]['path']+"','"+c['migrations'][i]['sha256']+"'); SELECT 1/0; COMMIT;"),
                'DURING_'+str(i+9))
        assert u.observe(target,c)==original
    # Fail-closed prechecks leave business and ledger state untouched.
    q=evidence(db); q['verified']=False
    rejected(lambda:u.upgrade(db,q,preservation,cp),'QUIESCENCE_NEGATIVE')
    # Two actual bounded runners; the winner holds its own connection/lock.
    target=clone('two_runners')
    target_cp=dict(cp,identity=u.identity(target))
    ready=threading.Event(); release=threading.Event(); outcomes=[]
    original_apply=u.apply_one
    def paused_apply(session,entry):
        if not ready.is_set():
            ready.set()
            assert release.wait(30)
        original_apply(session,entry)
    def winner():
        try: outcomes.append(u.upgrade(target,evidence(target),preservation,target_cp))
        except BaseException as error: outcomes.append(error)
    with patch.object(u,'apply_one',paused_apply):
        thread=threading.Thread(target=winner); thread.start()
        assert ready.wait(60)
        try: rejected(lambda:u.upgrade(target,evidence(target),preservation,target_cp),'SECOND_BOUNDED_RUNNER')
        finally: release.set(); thread.join(180)
    assert len(outcomes)==1 and isinstance(outcomes[0],dict) and outcomes[0]['ledger_count']==31
    print('CONCURRENT_BOUNDED_RUNNERS_EXACTLY_ONE_OWNER=PASS',flush=True)
    with u.Session(db) as held:
        assert held.execute('SELECT pg_try_advisory_lock('+str(u.LOCK)+');')=='t'
        rejected(lambda:u.upgrade(db,evidence(db),preservation,cp),'CONCURRENT_RUNNER')
    with u.Session(db) as old_writer:
        old_writer.execute('BEGIN;')
        rejected(lambda:u.upgrade(db,evidence(db),preservation,cp),'OLD_API_SESSION_NOT_DRAINED')
    for label, sql in [
        ('WRONG_LEDGER',"DELETE FROM production_bootstrap_migrations WHERE path LIKE 'migrations/035_%'"),
        ('WRONG_HASH',"ALTER TABLE tenants ADD COLUMN unexpected text"),
        ('CHECKSUM',"UPDATE production_bootstrap_migrations SET sha256=repeat('0',64) WHERE path LIKE 'migrations/035_%'"),
        ('040_APPLIED',"INSERT INTO production_bootstrap_migrations(path,sha256) VALUES('migrations/040_fake.sql',repeat('0',64))"),
        ('UNKNOWN_PREFIX',"UPDATE production_bootstrap_migrations SET path='unknown' WHERE path LIKE 'migrations/035_%'"),
        ('NONEMPTY_CATALOG',"INSERT INTO system_naming_presets(asset_type_code,preset_version,prefix) VALUES('SERVER',99,'BAD')")]:
        target=clone('negative_'+label.lower())
        r.execute(target,sql)
        old=u.recovery_snapshot(target)
        rejected(lambda:u.upgrade(target,evidence(target),preservation,dict(cp,identity=u.identity(target))),label)
        assert u.recovery_snapshot(target)==old
    # SQL primary key is the duplicate-ledger guard.
    rejected(lambda:r.execute(db,"INSERT INTO production_bootstrap_migrations SELECT * FROM production_bootstrap_migrations LIMIT 1"),'DUPLICATE_LEDGER')
    # After039 validation failure must retain31, not pretend rollback to27.
    target=b.DB(container,'prefix_31','skia_bootstrap')
    wrong=list(preservation)+[{}]
    rejected(lambda:u.upgrade(target,evidence(target),wrong,dict(cp,identity=u.identity(target))),'POST039_VALIDATION_FAILURE')
    assert u.observe(target,c)['ledger_count']==31
    assert u.observe(db,c)['ledger_count']==27
    for label, mutate in [('MANIFEST_EXTRA',lambda x:x['migrations'].append({'path':b.MIGRATION,'sha256':b.MIG_HASH})),
                          ('MANIFEST_MISSING',lambda x:x['migrations'].pop()),
                          ('MANIFEST_CHECKSUM',lambda x:x['migrations'][-1].update(sha256='0'*64))]:
        wrong=copy.deepcopy(c); mutate(wrong)
        file=stage/(label+'.json'); file.write_text(json.dumps(wrong))
        with patch.object(u,'CONTRACT',file): rejected(u.contract,label)
        assert u.observe(db,c)['ledger_count']==27
    print('UPGRADE_FAILURE_RESUME_RECOVERY_MATRIX=PASS',flush=True)
    # Keep evidence of every required canonical intermediate hash.
    (stage/'prefixes.json').write_text(json.dumps(c['prefixes'],indent=2))
    q=evidence(db)
    checkpoint=u.checkpoint_create(db,q,stage/'governed-checkpoint.dump',['governed_restore_one','governed_restore_two'])
    assert checkpoint['recovery_verified']
    (stage/'governed-checkpoint.json').write_text(json.dumps(checkpoint,indent=2))
    print('GOVERNED_CHECKPOINT_ACTION=PASS',flush=True)
    # Exact previously built local Application A image, no production builds.
    image='skia-hf3-api:0c01d79'
    inspect=json.loads(b.run(['docker','image','inspect',image]))[0]
    assert inspect['Config']['Labels']['org.opencontainers.image.revision']==b.APP
    password=os.environ['UPGRADE_PASSWORD']
    api=container+'-api'
    b.run(['docker','run','-d','--name',api,'--network','container:'+container,
           '-e','DATABASE_URL=postgresql://skia_runtime:'+password+'@localhost/prefix_31?sslmode=disable',
           '-e','MIGRATOR_DATABASE_URL=postgresql://skia_migrator:'+password+'@localhost/prefix_31?sslmode=disable',
           '-e','ONBOARDING_DATABASE_URL=postgresql://skia_onboarding:'+password+'@localhost/prefix_31?sslmode=disable',
           '-e','SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true',image])
    for _ in range(60):
        probe=subprocess.run(['docker','exec',api,'wget','-q','--spider','http://localhost:8080/api/health'],capture_output=True)
        if probe.returncode==0: break
        time.sleep(1)
    assert probe.returncode==0
    for path in ('/api/auth/me','/api/dcim/sites','/api/infra/mdf-idf','/api/infra/racks','/api/dcim/assets'):
        response=subprocess.run(['docker','exec',api,'wget','-S','-O','/dev/null','http://localhost:8080'+path],capture_output=True)
        assert b'401 Unauthorized' in response.stderr
        print('APPLICATION_A_'+path+'=AUTH_GUARD_PASS',flush=True)
    for path in ('/api/auth/me','/api/dcim/sites',
                 '/api/dcim/zones?site_id=f2400000-0000-4000-8000-000000000001&floor_id=f2500000-0000-4000-8000-000000000001','/api/infra/mdf-idf',
                 '/api/infra/racks','/api/dcim/assets','/api/dcim/placements','/api/dcim/catalogs/naming-rules'):
        response=subprocess.run(['docker','exec',api,'wget','-S','-O','/dev/null',
                                 '--header=Cookie: session_token=disposable-upgrade-test-session',
                                 'http://localhost:8080'+path],capture_output=True)
        assert response.returncode==0 and b'200 OK' in response.stderr, (path,response.stderr)
        print('APPLICATION_A_'+path+'=AUTHENTICATED_READ_PASS',flush=True)
    logs=b.run(['docker','logs',api]).decode()
    assert 'does not exist' not in logs and 'SQLSTATE' not in logs
    app_evidence={'application_sha':b.APP,'status':'PASS','authenticated_reads':'PASS',
                  'health':'PASS','image_id':inspect['Id'],'observed_at':time.time(),
                  'database_identity':u.identity(b.DB(container,'prefix_31','skia_bootstrap'))}
    (stage/'application.json').write_text(json.dumps(app_evidence))
    (stage/'preservation.json').write_text(json.dumps(preservation))
    output=b.run(['python3','-B',str(u.ROOT/'ops/phase010/upgrade_036_039.py'),'validate',
                  '--container',container,'--database','prefix_31','--baseline',str(stage/'preservation.json'),
                  '--application-evidence',str(stage/'application.json')])
    assert json.loads(output)['POST039_READY_FOR_B3B_R2']=='YES'
    print('APPLICATION_A_POST039_AND_VALIDATOR=PASS',flush=True)


if __name__ == '__main__':
    main()
