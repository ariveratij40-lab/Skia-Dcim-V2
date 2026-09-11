#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-a2b-housing-$$"
password="a2b_housing_test_only"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --name "$container" -p 127.0.0.1::5432 -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod -d postgres:16.14-alpine >/dev/null
for _ in {1..40}; do docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null 2>&1 && break; sleep 1; done
docker cp "$repo_root/." "$container:/repo"
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" \
  < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null
docker exec -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" \
  < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -v phase011_environment=production -v expected_database=skia_prod \
  -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED \
  -f /repo/ops/phase011/activate_clean_production_rls.sql >/dev/null

port="$(docker port "$container" 5432/tcp | sed 's/.*://')"
admin_url="postgresql://postgres:$password@127.0.0.1:$port/skia_prod?sslmode=disable"
runtime_url="postgresql://skia_runtime:$password@127.0.0.1:$port/skia_prod?sslmode=disable"
(cd "$repo_root/backend" && \
  ASSET_NOMENCLATURE_TEST_DATABASE_URL="$admin_url" \
  ASSET_NOMENCLATURE_RUNTIME_TEST_DATABASE_URL="$runtime_url" \
  GOCACHE=/tmp/skia-a2b-go-cache \
  go test -count=1 -run '^(TestCanonicalHousingSpecializedHTTPPostgreSQL16|TestSpecializedHandlerRollbackIsAtomic|TestSwitchLifecyclePostgres)$' ./...)

ledger="$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc 'SELECT count(*) FROM production_bootstrap_migrations')"
[[ "$ledger" == 26 ]]
printf 'POSTGRES_VERSION=16.14\nCANONICAL_HOUSING_WRITE_PATHS=PASS\nTRANSACTIONAL_ZERO_DELTA=PASS\nLEDGER_COUNT=%s\n' "$ledger"
