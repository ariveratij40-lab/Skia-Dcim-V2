"""Exact post035 repair; disposable CLI or separately guarded production entry."""
import argparse
import json
import re
import b3b_release as b
import upgrade_036_039 as u

RAW = '8712fcae88f98f7c75605772ab88cbeb52d06e022c07a8782b045e33caec0c10'
DRIFT = '19d3ecd3062980f27efbb8b0101d1342a8b1824b8fc58a3a3d58412ed4866854'
CANONICAL = '7d6bfb8e958bc13700c2bbcd11fce71bcaa1489cc1e01accaddba3b87f5805be'
ROUTINES = (
    'public.assert_canonical_asset_housing(uuid)',
    'public.enforce_canonical_backbone()',
    'public.enforce_canonical_hierarchy_final_state()',
    'public.enforce_canonical_hierarchy_lifecycle()',
    'public.enforce_canonical_housing_final_state()',
    'public.enforce_mdf_idf_physical_identity_final_state()',
    'public.enforce_mdf_idf_physical_identity_lifecycle()',
    'public.provision_canonical_zone_naming_rules()',
)


class TransactionDB:
    def __init__(self, session):
        self.session = session

    def query(self, sql):
        return [json.loads(x) for x in self.session.execute(sql.rstrip(';') + ';').splitlines() if x]


def verify_source(tx):
    roles = tx.query("SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('skia_migrator','skia_onboarding','skia_runtime');")[0]
    b.require(roles == [[name, False, False, False, False] for name in
                        ('skia_migrator', 'skia_onboarding', 'skia_runtime')], 'ROLE_AUTHORITY')
    ledger = tx.query('SELECT jsonb_agg(jsonb_build_array(path,sha256) ORDER BY path) '
                      'FROM public.production_bootstrap_migrations;')[0]
    expected = json.loads(u.CONTRACT.read_text())['migrations'][:27]
    b.require(ledger == sorted([[x['path'], x['sha256']] for x in expected]), 'LEDGER')
    b.require(tx.query('SELECT count(*) FROM public.system_naming_presets;') == [0], 'CATALOG')
    b.require(b.structure(tx)['hash'] == DRIFT, 'EXACT_DRIFT_REQUIRED')
    return ledger


def repair(db, *, inject_failure_after=None):
    b.require(re.fullmatch(r'skia-p0-[a-f0-9]{12}-[ab]', db.container)
              and db.database == 'skia_prod' and db.user == 'skia_bootstrap',
              'DISPOSABLE_TARGET_ONLY')
    _repair(db, inject_failure_after=inject_failure_after)


def _repair(db, *, inject_failure_after=None, before_mutation=None,
            precommit=None, expected_baseline=None):
    # Private shared transaction. Public entry points enforce target authority.
    b.require(db.fingerprint() == RAW, 'RAW_SOURCE')
    with u.Session(db) as session:
        session.execute('BEGIN; SET LOCAL lock_timeout=\'5s\';')
        try:
            b.require(session.execute('SELECT pg_try_advisory_xact_lock(1203508);') == 't',
                      'COMPETING_REPAIR')
            tx = TransactionDB(session)
            ledger = verify_source(tx)
            before = u.baseline(tx, project=False)
            if expected_baseline is not None:
                b.require(before == expected_baseline, 'PRE_BASELINE_DELTA')
            if before_mutation:
                before_mutation(tx)
            for i, signature in enumerate(ROUTINES, 1):
                session.execute('ALTER FUNCTION ' + signature + ' OWNER TO skia_migrator; '
                                'SET LOCAL ROLE skia_migrator; '
                                'REVOKE ALL ON FUNCTION ' + signature +
                                ' FROM PUBLIC,skia_runtime,skia_onboarding,skia_bootstrap; '
                                'GRANT EXECUTE ON FUNCTION ' + signature + ' TO skia_migrator; '
                                + ('GRANT EXECUTE ON FUNCTION ' + signature + ' TO skia_runtime; '
                                   if signature == ROUTINES[0] else '') + 'RESET ROLE;')
                if inject_failure_after == i:
                    raise ValueError('INJECTED_ROLLBACK')
            b.require(b.structure(tx)['hash'] == CANONICAL, 'FINAL_SECURITY')
            b.require(u.baseline(tx, project=False) == before, 'BUSINESS_DATA_DELTA')
            b.require(tx.query('SELECT jsonb_agg(jsonb_build_array(path,sha256) ORDER BY path) '
                               'FROM public.production_bootstrap_migrations;')[0] == ledger, 'LEDGER_DELTA')
            b.require(tx.query('SELECT count(*) FROM public.system_naming_presets;') == [0], 'CATALOG_DELTA')
            if precommit:
                precommit(tx)
            session.execute('COMMIT;')
        except BaseException:
            session.execute('ROLLBACK;')
            raise
    b.require(db.fingerprint() == RAW, 'FINAL_RAW')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute-disposable', action='store_true')
    parser.add_argument('--container')
    args = parser.parse_args()
    if not args.execute_disposable:
        print('MODE=PLAN; PRODUCTION_EXECUTION=DISABLED')
    else:
        try:
            repair(b.DB(args.container, 'skia_prod', 'skia_bootstrap'))
            print('DISPOSABLE_REPAIR=PASS')
        except Exception:
            print('DISPOSABLE_REPAIR=REJECTED; NO_AUTOMATIC_RETRY')
            raise SystemExit(1)
