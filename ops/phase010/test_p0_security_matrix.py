"""Transactional adversarial fixture A tests. Every injected mutation rolls back."""
import json
import re
import subprocess
import sys
import b3b_release as b
import p0_security_repair as r
import upgrade_036_039 as u


def main(container):
    b.require(re.fullmatch(r'skia-p0-[a-f0-9]{12}-a', container), 'DISPOSABLE_A_ONLY')
    db=b.DB(container,'skia_prod','skia_bootstrap')
    before=u.recovery_snapshot(db)
    assert before['structure']['hash']==r.CANONICAL
    faults={
        'wrong_ledger': "DELETE FROM public.production_bootstrap_migrations WHERE path LIKE 'migrations/035%';",
        '036_present': "INSERT INTO public.production_bootstrap_migrations(path,sha256) VALUES ('migrations/036_negative_fixture.sql',repeat('0',64));",
        'wrong_structure': 'ALTER TABLE public.tenants ADD COLUMN p0_negative boolean;',
        'missing_routine': 'DROP FUNCTION public.enforce_canonical_backbone() CASCADE;',
        'wrong_owner': 'ALTER FUNCTION public.assert_canonical_asset_housing(uuid) OWNER TO skia_runtime;',
        'unexpected_acl': 'GRANT EXECUTE ON FUNCTION public.enforce_canonical_backbone() TO PUBLIC;',
        'signature_ambiguity': 'CREATE FUNCTION public.enforce_canonical_backbone(integer) RETURNS integer LANGUAGE sql AS $$SELECT $1$$;',
        'partial_mismatch': 'ALTER FUNCTION public.enforce_canonical_backbone() OWNER TO skia_migrator;',
        'wrong_target_authority': 'ALTER ROLE skia_migrator BYPASSRLS;',
        'body_change': "CREATE OR REPLACE FUNCTION public.assert_canonical_asset_housing(p_asset_id uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN; END$$;",
    }
    for name,sql in faults.items():
        with u.Session(db) as session:
            session.execute('BEGIN;')
            tx=r.TransactionDB(session)
            for signature in r.ROUTINES:session.execute('ALTER FUNCTION '+signature+' OWNER TO skia_bootstrap;')
            assert b.structure(tx)['hash']==r.DRIFT
            session.execute(sql)
            injected=b.structure(tx)
            injected_data=u.baseline(tx,project=False)
            try:r.verify_source(tx)
            except ValueError:pass
            else:raise AssertionError('NEGATIVE_ACCEPTED')
            assert b.structure(tx)==injected and u.baseline(tx,project=False)==injected_data
            session.execute('ROLLBACK;')
        assert u.recovery_snapshot(db)==before
        print('A_NEGATIVE_'+name.upper()+'=PASS',flush=True)
    try:r.repair(db)
    except ValueError as error:assert str(error)=='EXACT_DRIFT_REQUIRED'
    else:raise AssertionError('REENTRY_ACCEPTED')
    class WrongRaw:
        container=db.container;database=db.database;user=db.user
        def fingerprint(self):return '0'*64
    try:r.repair(WrongRaw())
    except ValueError as error:assert str(error)=='RAW_SOURCE'
    else:raise AssertionError('RAW_ACCEPTED')
    # Direct trigger-function invocation must pass the ACL gate only for owner/admin,
    # then reject direct SQL invocation as unsupported (0A000).
    for role in ('skia_runtime','skia_onboarding','skia_migrator','skia_bootstrap'):
        for signature in r.ROUTINES:
            is_assert=signature==r.ROUTINES[0]
            call='public.assert_canonical_asset_housing(NULL::uuid)' if is_assert else signature
            sql="\\set VERBOSITY sqlstate\nBEGIN; SET LOCAL ROLE "+role+'; SELECT '+call+'; ROLLBACK;'
            result=subprocess.run(['docker','exec','-i',container,'psql','-X','-qAt','-U','skia_bootstrap','-d','skia_prod','-v','ON_ERROR_STOP=1'],input=sql.encode(),capture_output=True)
            allowed=role in ('skia_migrator','skia_bootstrap') or (role=='skia_runtime' and is_assert)
            if not allowed:assert result.returncode and b'42501' in result.stderr
            elif is_assert:assert result.returncode==0
            else:assert result.returncode and b'0A000' in result.stderr
    assert u.recovery_snapshot(db)==before
    with u.Session(db) as session:
        result=session.execute("BEGIN; SET SESSION AUTHORIZATION skia_onboarding; "
            "INSERT INTO public.tenants(id,name) VALUES ('f2000000-0000-4000-8000-000000000099','P0 rollback security fixture'); "
            "RESET SESSION AUTHORIZATION; SELECT count(*) FROM public.naming_rules "
            "WHERE tenant_id='f2000000-0000-4000-8000-000000000099' "
            "AND asset_type_code IN ('MDF','IDF') AND context_mode='CANONICAL_ZONE'; ROLLBACK;")
        assert result=='2'
    assert u.recovery_snapshot(db)==before
    print('A_ONBOARDING_TRIGGER=PASS_ROLLED_BACK',flush=True)
    print('A_EXECUTE_MATRIX=PASS_32_CASES; A_REENTRY_RAW_NEGATIVES=PASS',flush=True)


if __name__=='__main__':main(sys.argv[1])
