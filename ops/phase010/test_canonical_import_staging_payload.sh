#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-b3b4-app-$$"
password="b3b4_app_test_only"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --name "$container" -p 127.0.0.1::5432 \
  -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod \
  -d postgres:16.14-alpine >/dev/null
for _ in {1..30}; do
  docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null
docker cp "$repo_root/." "$container:/repo"

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -v migrator_password="$password" -v runtime_password="$password" \
  -v onboarding_password="$password" \
  < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null
docker exec -e PGPASSWORD="$password" \
  -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -v migrator_password="$password" -v runtime_password="$password" \
  -v onboarding_password="$password" \
  < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null

activate_runtime_rls() {
  docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
    -v phase011_environment=production -v expected_database=skia_prod \
    -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED \
    < "$repo_root/ops/phase011/activate_clean_production_rls.sql" >/dev/null
}

# The clean bootstrap deliberately leaves the Phase011 asset policies inactive.
# Runtime integration tests must complete the canonical production sequence
# before opening any tenant-scoped connection. A second activation proves that
# the same authority remains idempotent; no test-local policy is created here.
activate_runtime_rls
activate_runtime_rls
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  < "$repo_root/ops/phase011/validate_runtime_auth_role.sql" >/dev/null

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES
 ('91000000-0000-4000-8000-000000000001','Canonical import tenant'),
 ('91000000-0000-4000-8000-000000000002','Foreign import tenant');
INSERT INTO users(id,email,name,password_hash) VALUES
 ('93000000-0000-4000-8000-000000000001','canonical-import@example.test','Canonical importer','x');
INSERT INTO branches(id,tenant_id,code,name,status) VALUES
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','A','Authorized','active'),
 ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','B','Other branch','active'),
 ('92000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000002','X','Other tenant','active');
INSERT INTO user_tenants(user_id,tenant_id) VALUES
 ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001');
INSERT INTO user_branches(user_id,branch_id) VALUES
 ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001');
INSERT INTO zones(id,tenant_id,branch_id,code,name,status) VALUES
 ('94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','PROD','Production','active'),
 ('94000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','OTHER','Other branch','active'),
 ('94000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000003','FOREIGN','Other tenant','active');
SQL

port="$(docker port "$container" 5432/tcp | awk -F: 'NR==1{print $NF}')"
export CANONICAL_IMPORT_ADMIN_TEST_DATABASE_URL="postgresql://postgres:$password@127.0.0.1:$port/skia_prod?sslmode=disable"
export CANONICAL_IMPORT_RUNTIME_TEST_DATABASE_URL="postgresql://skia_runtime:$password@127.0.0.1:$port/skia_prod?sslmode=disable"
export ASSET_NOMENCLATURE_TEST_DATABASE_URL="$CANONICAL_IMPORT_ADMIN_TEST_DATABASE_URL"
export ASSET_NOMENCLATURE_RUNTIME_TEST_DATABASE_URL="$CANONICAL_IMPORT_RUNTIME_TEST_DATABASE_URL"
export GOCACHE="${TMPDIR:-/tmp}/skia-b3b4-integration-go-cache"
test_pattern="${CANONICAL_IMPORT_GO_TEST_PATTERN:-^TestCanonicalImportStagingPostgresZeroDomainDelta$}"
(cd "$repo_root/backend" && go test -tags integration -run "$test_pattern" ./...)

echo "CANONICAL_IMPORT_STAGING_POSTGRES=PASS"
