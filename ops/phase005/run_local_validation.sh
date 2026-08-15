#!/usr/bin/env bash
set -euo pipefail

die() { printf 'PHASE-005 local validation: %s\n' "$1" >&2; exit 1; }
[[ "${PHASE005_LOCAL_TEST_APPROVAL:-}" == PHASE005_EPHEMERAL_POSTGRES_APPROVED ]] || die 'explicit local-test approval missing'
command -v docker >/dev/null 2>&1 || die 'docker unavailable'

repo_root="$(git rev-parse --show-toplevel)"
container="skia-phase005-rls-test-$$"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --rm -d --name "$container" --network none \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$container" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$container" pg_isready -U postgres >/dev/null 2>&1 || die 'ephemeral PostgreSQL did not become ready'

run_sql() { docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
assert_baseline_state() {
  local state
  state="$(run_sql -At -c "SELECT
    (SELECT bool_and(NOT c.relrowsecurity AND c.relforcerowsecurity) FROM pg_class c WHERE c.relname IN ('assets','asset_logs','asset_relationships'))::text||'|'||
    (SELECT string_agg(tablename||'='||md5(concat_ws('|',policyname,permissive,roles::text,cmd,COALESCE(qual,''),COALESCE(with_check,''))),',' ORDER BY tablename) FROM pg_policies WHERE schemaname='public' AND tablename IN ('assets','asset_logs','asset_relationships'))")"
  [[ "$state" == 'true|asset_logs=4acd83f5389f69069dedf6f93fffca8b,asset_relationships=14a883076b3bc7bd6a2fc4491659c6bd,assets=f39b9225e6e95b3e654e3161748f5c1a' ]] \
    || die 'negative FK case changed RLS or baseline policies'
}

# Missing and incorrect approvals must stop before any DDL.
set +e
run_sql -f /dev/stdin < "$repo_root/ops/phase005/activate_canonical_rls.sql" >/dev/null 2>&1
missing_guard_rc=$?
set -e
[[ "$missing_guard_rc" == 3 ]] || die "missing-variable guard returned $missing_guard_rc, expected 3"

run_sql < "$repo_root/ops/phase005/tests/setup_baseline.sql"
set +e
run_sql -v phase005_environment=staging -v expected_database=postgres \
  -v execution_approval=NOT_APPROVED -f /dev/stdin \
  < "$repo_root/ops/phase005/activate_canonical_rls.sql" >/dev/null 2>&1
approval_guard_rc=$?
set -e
[[ "$approval_guard_rc" == 3 ]] || die "approval guard returned $approval_guard_rc, expected 3"

# An unrelated fourth FK with the same generic definition must be accepted.
unrelated_fk_count="$(run_sql -At -c "SELECT count(*) FROM pg_constraint WHERE contype='f' AND pg_get_constraintdef(oid,true)='FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE'")"
[[ "$unrelated_fk_count" == 2 ]] || die "additional-FK fixture not established"

# Missing required FK must block before any policy/RLS change.
run_sql -c 'ALTER TABLE asset_logs DROP CONSTRAINT asset_logs_asset_id_fkey'
set +e
run_sql -v phase005_environment=staging -v expected_database=postgres \
  -v execution_approval=PHASE005_CANONICAL_RLS_ACTIVATION_APPROVED \
  -f /dev/stdin < "$repo_root/ops/phase005/activate_canonical_rls.sql" >/dev/null 2>&1
missing_fk_rc=$?
set -e
[[ "$missing_fk_rc" == 3 ]] || die "missing-FK guard returned $missing_fk_rc, expected 3"
assert_baseline_state
run_sql -c 'ALTER TABLE asset_logs ADD CONSTRAINT asset_logs_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE'

# Correct identity with wrong ON DELETE semantics must also block.
run_sql -c 'ALTER TABLE asset_relationships DROP CONSTRAINT asset_relationships_target_asset_id_fkey'
run_sql -c 'ALTER TABLE asset_relationships ADD CONSTRAINT asset_relationships_target_asset_id_fkey FOREIGN KEY (target_asset_id) REFERENCES assets(id) ON DELETE RESTRICT'
set +e
run_sql -v phase005_environment=staging -v expected_database=postgres \
  -v execution_approval=PHASE005_CANONICAL_RLS_ACTIVATION_APPROVED \
  -f /dev/stdin < "$repo_root/ops/phase005/activate_canonical_rls.sql" >/dev/null 2>&1
incorrect_fk_rc=$?
set -e
[[ "$incorrect_fk_rc" == 3 ]] || die "incorrect-FK guard returned $incorrect_fk_rc, expected 3"
assert_baseline_state
run_sql -c 'ALTER TABLE asset_relationships DROP CONSTRAINT asset_relationships_target_asset_id_fkey'
run_sql -c 'ALTER TABLE asset_relationships ADD CONSTRAINT asset_relationships_target_asset_id_fkey FOREIGN KEY (target_asset_id) REFERENCES assets(id) ON DELETE CASCADE'

run_sql -v phase005_environment=staging -v expected_database=postgres \
  -v execution_approval=PHASE005_CANONICAL_RLS_ACTIVATION_APPROVED \
  -f /dev/stdin < "$repo_root/ops/phase005/activate_canonical_rls.sql"
run_sql < "$repo_root/ops/phase005/tests/assert_semantics.sql"
run_sql < "$repo_root/ops/phase005/verify_canonical_rls.sql"

# A second activation must converge without DDL.
run_sql -v phase005_environment=staging -v expected_database=postgres \
  -v execution_approval=PHASE005_CANONICAL_RLS_ACTIVATION_APPROVED \
  -f /dev/stdin < "$repo_root/ops/phase005/activate_canonical_rls.sql"

run_sql -v phase005_environment=staging -v expected_database=postgres \
  -v rollback_approval=PHASE005_CANONICAL_RLS_ROLLBACK_APPROVED \
  -f /dev/stdin < "$repo_root/ops/phase005/rollback_canonical_rls.sql"

# A second rollback must also converge without DDL.
run_sql -v phase005_environment=staging -v expected_database=postgres \
  -v rollback_approval=PHASE005_CANONICAL_RLS_ROLLBACK_APPROVED \
  -f /dev/stdin < "$repo_root/ops/phase005/rollback_canonical_rls.sql"

# Exact-policy drift must stop both tools before changes.
run_sql -c "ALTER POLICY asset_logs_tenant_isolation ON asset_logs USING (true)"
set +e
run_sql -v phase005_environment=staging -v expected_database=postgres \
  -v execution_approval=PHASE005_CANONICAL_RLS_ACTIVATION_APPROVED \
  -f /dev/stdin < "$repo_root/ops/phase005/activate_canonical_rls.sql" >/dev/null 2>&1
drift_activation_rc=$?
run_sql -v phase005_environment=staging -v expected_database=postgres \
  -v rollback_approval=PHASE005_CANONICAL_RLS_ROLLBACK_APPROVED \
  -f /dev/stdin < "$repo_root/ops/phase005/rollback_canonical_rls.sql" >/dev/null 2>&1
drift_rollback_rc=$?
set -e
[[ "$drift_activation_rc" == 3 ]] || die "activation drift guard returned $drift_activation_rc, expected 3"
[[ "$drift_rollback_rc" == 3 ]] || die "rollback drift guard returned $drift_rollback_rc, expected 3"

printf 'PHASE005_LOCAL_VALIDATION=APPROVED\n'
