"""Actual executor orchestration on a freshly created disposable post035 only."""
import json
import os
from pathlib import Path
import re
import tempfile
from unittest import mock

import b3b_release as b
import execute_p0_production_repair as p
import p0_security_repair as r
import test_p0_remediation as fixture
import test_p0_security_matrix as security
from test_p0_production_executor import SyntheticAuthority, authorization
import upgrade_036_039 as u


class TestAuthority(SyntheticAuthority):
    def __init__(self, container, store):
        b.require(re.fullmatch(r'skia-p0-[a-f0-9]{12}-a', container), 'TEST_TARGET_ONLY')
        self.db = b.DB(container, 'skia_prod', 'skia_bootstrap')
        self.store = store
        self.expected = self.observe()

    def observe(self, db=None):
        c = json.loads(b.run(['docker', 'inspect', self.db.container]))[0]
        b.require(c['Name'] == '/'+self.db.container, 'TEST_CONTAINER_NAME')
        context = json.loads(b.run(['docker', 'context', 'inspect']))[0]
        b.require(context['Endpoints']['docker']['Host'].startswith('unix://'), 'LOCAL_TEST_ONLY')
        return [c['Id'], c['Image'], p.database_identity(db or self.db)]

    def check_identity(self, db=None):
        b.require(self.observe(db) == self.expected, 'TEST_IDENTITY_CHANGED')


def main():
    # Existing fixture tests remain unchanged, including all three rollback boundaries.
    created = []
    original_create = fixture.e.Docker.create
    def create(docker, name, body):
        result = original_create(docker, name, body)
        created.append(name)
        return result
    with mock.patch.object(fixture.e.Docker, 'create', create):
        fixture.main()
    assert len(created) == 1
    container = created[0]
    security.main(container)
    db = b.DB(container, 'skia_prod', 'skia_bootstrap')
    canonical = u.recovery_snapshot(db)
    with u.Session(db) as session:
        session.execute('BEGIN; '+''.join('ALTER FUNCTION '+s+' OWNER TO skia_bootstrap;'
                                         for s in r.ROUTINES)+' COMMIT;')
    drift = u.recovery_snapshot(db)
    assert drift['structure']['hash'] == r.DRIFT
    store = Path(tempfile.mkdtemp(prefix='skia-p0-test-authority-')).resolve()
    store.chmod(0o700)
    authority = TestAuthority(container, store)
    def new_auth():
        value = authorization()
        path = store/(value['id']+'.json')
        p.exclusive_json(path, value)
        return path
    path = new_auth()
    with mock.patch.object(authority.db, 'fingerprint', return_value='0'*64):
        try: p.execute(path, authority)
        except ValueError as error: assert str(error) == 'RAW_SOURCE'
        else: raise AssertionError('LIVE_RAW_ACCEPTED')
    assert u.recovery_snapshot(db) == drift
    try: p.execute(path, authority)
    except FileExistsError: pass
    else: raise AssertionError('PRE_TRANSACTION_CLAIM_REUSED')
    print('LIVE_RAW_AND_BEFORE_TRANSACTION_INTERRUPTION=PASS', flush=True)
    # Exercise actual orchestration, shared source gates, SQL transaction and rollback.
    faults = {
        'LEDGER': "DELETE FROM production_bootstrap_migrations WHERE path LIKE 'migrations/035%';",
        '036_PRESENT': "INSERT INTO production_bootstrap_migrations(path,sha256) VALUES ('migrations/036_test.sql',repeat('0',64));",
        'OWNER': 'ALTER FUNCTION public.enforce_canonical_backbone() OWNER TO skia_runtime;',
        'ACL': 'GRANT EXECUTE ON FUNCTION public.enforce_canonical_backbone() TO PUBLIC;',
        'MISSING_ROUTINE': 'DROP FUNCTION public.enforce_canonical_backbone() CASCADE;',
    }
    source = r.verify_source
    for name, sql in faults.items():
        def injected(tx, statement=sql):
            if isinstance(tx, r.TransactionDB): tx.session.execute(statement)
            return source(tx)
        with mock.patch.object(r, 'verify_source', injected):
            try: p.execute(new_auth(), authority)
            except ValueError: pass
            else: raise AssertionError('FAULT_ACCEPTED')
        assert u.recovery_snapshot(db) == drift
        print('PRODUCTION_PATH_NEGATIVE_'+name+'=PASS', flush=True)
    execute = u.Session.execute
    seen = [0]
    def sql_failure(session, sql):
        result = execute(session, sql)
        if sql.startswith('ALTER FUNCTION '):
            seen[0] += 1
            if seen[0] == 4: execute(session, 'SELECT 1/0;')
        return result
    with mock.patch.object(u.Session, 'execute', sql_failure):
        try: p.execute(new_auth(), authority)
        except Exception: pass
        else: raise AssertionError('SQL_FAILURE_NOT_REACHED')
    assert seen[0] == 4 and u.recovery_snapshot(db) == drift
    print('ACTUAL_SQL_FAILURE=ROLLBACK_PASS', flush=True)
    for boundary in (1, 4, 8):
        seen = [0]
        def interrupted(session, sql):
            result = execute(session, sql)
            if sql.startswith('ALTER FUNCTION '):
                seen[0] += 1
                if seen[0] == boundary: raise KeyboardInterrupt()
            return result
        with mock.patch.object(u.Session, 'execute', interrupted):
            try: p.execute(new_auth(), authority)
            except KeyboardInterrupt: pass
            else: raise AssertionError('INTERRUPTION_ACCEPTED')
        assert u.recovery_snapshot(db) == drift
        print('PRODUCTION_PATH_INTERRUPTION_'+str(boundary)+'=ROLLBACK_PASS', flush=True)
    path = new_auth()
    # Commit succeeds but evidence delivery fails. Durable nonce prevents blind retry.
    output = p.exclusive_json
    def fail_evidence(target, value):
        if str(target).endswith('.success'): raise OSError('INJECTED_EVIDENCE_FAILURE')
        return output(target, value)
    with mock.patch.object(p, 'exclusive_json', fail_evidence):
        try: p.execute(path, authority)
        except OSError: pass
        else: raise AssertionError('EVIDENCE_FAULT_NOT_REACHED')
    assert u.recovery_snapshot(db) == canonical
    try: p.execute(path, authority)
    except FileExistsError: pass
    else: raise AssertionError('REUSED_AUTHORIZATION')
    try: p.execute(new_auth(), authority)
    except ValueError as error: assert str(error) == 'EXACT_DRIFT_REQUIRED'
    else: raise AssertionError('CANONICAL_REENTRY')
    print('AFTER_COMMIT_UNCERTAINTY_AND_REENTRY=PASS', flush=True)
    # Separate synthetic rehearsal authorization, only after deliberate fixture reset.
    with u.Session(db) as session:
        session.execute('BEGIN; '+''.join('ALTER FUNCTION '+s+' OWNER TO skia_bootstrap;'
                                         for s in r.ROUTINES)+' COMMIT;')
    path = new_auth()
    p.execute(path, authority)
    assert path.with_suffix('.success').exists()
    assert u.recovery_snapshot(db) == canonical
    security.main(container)
    print('PRODUCTION_MODE_DISPOSABLE_REHEARSAL=PASS', flush=True)
    print('FIXTURE_RETAINED='+container, flush=True)
    print('SYNTHETIC_EVIDENCE_DIRECTORY='+str(store), flush=True)


if __name__ == '__main__':
    try: main()
    except BaseException as error:
        print('REHEARSAL=STOPPED; ERROR_TYPE='+type(error).__name__, flush=True)
        raise SystemExit(1)
