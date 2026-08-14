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
