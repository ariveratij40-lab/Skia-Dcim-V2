"""HF3 integration: run only against the explicitly created disposable fixture."""
import json
import os
from pathlib import Path
import tempfile
import shutil
import subprocess
import time
import b3b_release as b
import b3b_recovery as r


def main():
    b.require(os.environ.get('B3B_DISPOSABLE') == 'YES', 'DISPOSABLE_REQUIRED')
    db = b.DB(os.environ['B3B_CONTAINER'], 'skia_prod', 'skia_bootstrap')
    app = Path(os.environ['B3B_APPLICATION'])
    repo = Path(os.environ['B3B_GIT_REPO'])
    tooling = Path(__file__).resolve().parents[2]
    tooling_sha = os.environ['B3B_TOOLING_SHA']
    provenance = b.r1(repo, app, tooling, tooling_sha)
    b.require(provenance['R1'] == 'PASS', 'REAL_TOOLING_PROVENANCE_REQUIRED')
    print('B3B_TOOLING_SHA='+tooling_sha+' R1A=PASS R1B=PASS R1=PASS', flush=True)
    print('TOOLING_ARTIFACT_SHA256='+json.dumps(provenance['tooling']['files'],sort_keys=True),flush=True)
    package_before = b.package(repo, b.APP, app)
    pre = b.snapshot(db, app)
    b.require(pre['schema'] == b.SCHEMA, 'SOURCE_RAW_HASH')
    b.require(b.stable(pre, b.snapshot(db, app)), 'SOURCE_NOT_STABLE')
    r.execute(db, "UPDATE tenants SET name='HF3 changed fixture' WHERE id='b3b00000-0000-4000-8000-000000000001';")
    b.require(not b.stable(pre, b.snapshot(db, app)), 'SAME_COUNT_WRITE_NOT_DETECTED')
    r.execute(db, "UPDATE tenants SET name='HF3 recovery fixture' WHERE id='b3b00000-0000-4000-8000-000000000001';")
    b.require(b.stable(pre, b.snapshot(db, app)), 'FIXTURE_NOT_RESTORED')
    print('SOURCE_STRUCTURAL_SCHEMA_HASH=' + pre['structural']['hash'], flush=True)
    with tempfile.TemporaryDirectory(prefix='skia-hf3-checkpoint-') as td:
        cp = b.checkpoint(db, pre, Path(td) / 'pre040.dump')
        cp['recovery_contract'] = {
            'tooling_source_sha': tooling_sha,
            'application_sha': b.APP,
            'artifacts': provenance['tooling']['files'],
            'role_matrix_hash': b.digest(b.canonical(r.ROLES)),
            'function_matrix_hash': b.digest(b.canonical(r.FUNCTIONS))}
        for target in ('hf3_restore_one', 'hf3_restore_two'):
            restored_db, meta = r.restore(db, cp, target)
            restored = b.snapshot(restored_db, app)
            if pre['structural'] != restored['structural']:
                s = {b.canonical(v) for v in pre['structural']['payload']}
                t = {b.canonical(v) for v in restored['structural']['payload']}
                print('STRUCTURAL_DIFF=' + repr((s-t, t-s)), flush=True)
            if pre['security'] != restored['security']:
                print('SECURITY_SOURCE=' + json.dumps(pre['security'], sort_keys=True), flush=True)
                print('SECURITY_RESTORED=' + json.dumps(restored['security'], sort_keys=True), flush=True)
            verified = b.verify_restore(cp, restored)
            cp = verified
            print('TARGET_DATABASE_CONTRACT=' + json.dumps(meta), flush=True)
            print(target + '=PASS HASH=' + restored['structural']['hash'], flush=True)
            print('RAW_DIFFERENCE=' + verified['raw_difference'], flush=True)
            r.acl(restored_db, target)
            b.require(b.structure(restored_db) == restored['structural'], 'SECOND_ACL_DELTA')
            for bad in ('', 'wrong_database', 'bad-name', "x'; DROP DATABASE skia_prod;--"):
                try:
                    r.acl(restored_db, bad)
                except ValueError:
                    pass
                else:
                    raise AssertionError('target accepted: ' + bad)
                b.require(b.structure(restored_db) == restored['structural'], 'TARGET_FAILURE_DELTA')
        # Each negative changes only its own transaction, then rolls back.
        mutations = {
            'COLUMN_DEFAULT': "ALTER TABLE tenants ALTER COLUMN name SET DEFAULT 'drift'",
            'CONSTRAINT': "ALTER TABLE tenants ADD CONSTRAINT hf3_negative CHECK (length(name)>0)",
            'INDEX': 'CREATE INDEX hf3_negative ON tenants(name)',
            'FUNCTION_SECURITY': 'ALTER FUNCTION public.uuid_generate_v4() SECURITY DEFINER',
            'RLS_POLICY': 'ALTER TABLE assets NO FORCE ROW LEVEL SECURITY',
            'GRANT': 'REVOKE DELETE ON assets FROM skia_runtime',
            'RUNTIME_CONNECT': 'REVOKE CONNECT ON DATABASE hf3_restore_two FROM skia_runtime',
            'ONBOARDING_CONNECT': 'REVOKE CONNECT ON DATABASE hf3_restore_two FROM skia_onboarding',
            'UUID_FUNCTION_OWNER': 'ALTER FUNCTION public.uuid_generate_v4() OWNER TO skia_migrator',
            'EXTENSION_MEMBERSHIP': 'ALTER EXTENSION "uuid-ossp" DROP FUNCTION public.uuid_generate_v4()',
            'ROLE_ATTRIBUTE': 'ALTER ROLE skia_runtime CREATEDB',
            'ROLE_MEMBERSHIP': 'GRANT skia_onboarding TO skia_runtime',
        }
        for label, mutation in mutations.items():
            class Mutated:
                def query(self, sql):
                    raw = r.execute(restored_db, 'BEGIN; ' + mutation + '; ' + sql + '\nROLLBACK;')
                    return [json.loads(line) for line in raw.splitlines() if line]
            changed = b.structure(Mutated())
            b.require(changed != restored['structural'], 'NEGATIVE_NOT_DETECTED:' + label)
            b.require(b.structure(restored_db) == restored['structural'], 'NEGATIVE_ROLLBACK:' + label)
            print('NEGATIVE_' + label + '=PASS', flush=True)
        # Wrong extension owner is constructed, never patched in pg_catalog.
        r.execute(db, 'CREATE DATABASE hf3_wrong_owner OWNER skia_migrator TEMPLATE template0;')
        wrong = b.DB(db.container, 'hf3_wrong_owner', db.user)
        r.execute(wrong, 'CREATE EXTENSION "uuid-ossp" WITH SCHEMA public;')
        try:
            r.extensions(wrong)
        except ValueError:
            print('NEGATIVE_EXTENSION_OWNER=PASS', flush=True)
        else:
            raise AssertionError('wrong extension owner accepted')
        print('DATABASE_TARGET_FAIL_CLOSED=PASS SECOND_SECURITY_PROVISIONING=NO_DELTA', flush=True)
        print('HF3_TWO_RESTORES_AND_NEGATIVE_MATRIX=PASS', flush=True)
        b.require(verified['restore_verified'], 'TWO_RESTORES_REQUIRED')
        release = provenance
        components = {'observed_at': b.stamp(), 'application_release_sha': b.APP,
                      'api': {'compatible': True, 'health': 'healthy'},
                      'web': {'health': 'healthy'}, 'kind': 'SIMULATED_GUARD_INPUT'}
        if os.environ.get('B3B_RUNTIME_SMOKE') == 'YES':
            components = b.components(repo, db.container+'-api', db.container+'-web', b.APP, b.APP)
        live = b.snapshot(db, app)
        decision = b.guard(live, {'status': 'STABLE_OBSERVED', 'last': live},
                           verified, components, release)
        b.require(decision['pending'] == [b.MIGRATION], 'ONLY_040_PENDING')
        print('R5_GUARD_CONTRACT=PASS COMPONENT_SOURCE='+components.get('kind','LOCAL_CANONICAL_IMAGES'), flush=True)
        root = Path(td)/'runner'
        (root/'runtime').mkdir(parents=True)
        (root/'secrets').mkdir()
        (root/'source').symlink_to(app, target_is_directory=True)
        shutil.copyfile(app/'ops/phase011/provision_database_roles.sql',
                        root/'runtime/provision_database_roles.sql')
        secret = root/'secrets/production.env'
        password = os.environ['B3B_PASSWORD']
        b.require(len(password) == 40 and all(c in '0123456789abcdef' for c in password), 'FIXTURE_PASSWORD')
        with secret.open('x') as handle:
            os.chmod(secret, 0o600)
            for key in ('POSTGRES_BOOTSTRAP_PASSWORD','SKIA_MIGRATOR_DB_PASSWORD',
                        'SKIA_RUNTIME_DB_PASSWORD','SKIA_ONBOARDING_DB_PASSWORD'):
                handle.write(key+'='+password+'\n')
        env = dict(os.environ, SKIA_PROD_ROOT=str(root), SKIA_POSTGRES_CONTAINER=db.container,
                   SKIA_DATABASE_CONTRACT='upgrade')
        result = subprocess.run(['bash',str(app/b.RUNNER)],env=env,capture_output=True)
        b.require(result.returncode == 0, 'CANONICAL_RUNNER_FAILED')
        after = b.snapshot(db, app)
        b.require(b.post040(db, pre, after, json.loads((app/b.CATALOG).read_bytes()))['R6']=='PASS', 'R6')
        b.require(package_before == b.package(repo,b.APP,app), 'PACKAGE_A_MUTATED')
        print('CANONICAL_RUNNER_040=PASS R6=PASS APPLICATION_PACKAGE_MUTATED=NO', flush=True)
        if os.environ.get('B3B_RUNTIME_SMOKE') == 'YES':
            b.components(repo, db.container+'-api', db.container+'-web', b.APP, b.APP)
            for port,path,expected in ((8080,'/api/health',200),(3000,'/login',200),(8080,'/api/auth/me',401)):
                script = ('import urllib.request,urllib.error\ntry:\n'
                          ' print(urllib.request.urlopen("http://127.0.0.1:'+str(port)+path+'",timeout=10).status)\n'
                          'except urllib.error.HTTPError as e: print(e.code)')
                code = b.run(['docker','exec',db.container+'-api','python3','-c',script]).decode().strip()
                b.require(code == str(expected),'R7_HTTP:'+path+':'+code)
                print('R7_'+path+'='+code,flush=True)
            print('R1_R7_LOCAL_REHEARSAL=PASS_REAL_COMMIT_PROVENANCE SHA='+tooling_sha,flush=True)
        else:
            print('R1B=REAL_COMMIT R3_R7=NOT_EXECUTED_NO_APPLICATION_RUNTIME_IN_THIS_FIXTURE', flush=True)


if __name__ == '__main__':
    main()
