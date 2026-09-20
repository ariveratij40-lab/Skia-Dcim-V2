#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-b2d-validation-$$"
password="b2d_disposable_test_only"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run --name "$container" -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod -p 127.0.0.1::5432 -d postgres:16.14-alpine >/dev/null
for _ in {1..40}; do docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null 2>&1 && break; sleep 1; done
port="$(docker port "$container" 5432/tcp | awk -F: '{print $NF}')"
docker cp "$repo_root/." "$container:/repo"
# Historical B2d owns its preset fixtures; B3a tests actual 040 publication.
docker exec "$container" sed -i '/040_nomenclature_v2_initial_preset_catalog.sql/d' /repo/ops/phase010/bootstrap.manifest
provision(){ docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" -f /repo/ops/phase011/provision_database_roles.sql >/dev/null; }
provision
for pass in 1 2; do
 docker exec -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" "$container" bash /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null
 echo "BOOTSTRAP_PASS_$pass=PASS"
done
provision
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -v phase011_environment=production -v expected_database=skia_prod -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED -f /repo/ops/phase011/activate_clean_production_rls.sql >/dev/null
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -f /repo/ops/phase011/validate_runtime_auth_role.sql
# Ownership is an effective EXECUTE authority even without an explicit grant.
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c "CREATE FUNCTION public.read_system_naming_preset_v2(integer) RETURNS integer LANGUAGE sql AS 'SELECT 1'; REVOKE ALL ON FUNCTION public.read_system_naming_preset_v2(integer) FROM PUBLIC; ALTER FUNCTION public.read_system_naming_preset_v2(integer) OWNER TO skia_runtime;" >/dev/null
if docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -f /repo/ops/phase011/validate_runtime_auth_role.sql >/dev/null 2>&1; then
 echo 'OWNERSHIP_OVERLOAD_VALIDATOR=FAIL' >&2; exit 1
fi
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c 'DROP FUNCTION public.read_system_naming_preset_v2(integer)' >/dev/null
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -f /repo/ops/phase011/validate_runtime_auth_role.sql >/dev/null
echo 'OWNERSHIP_OVERLOAD_DENIED_AND_REMOVAL_REVALIDATED=PASS'
docker exec "$container" psql -X -U postgres -d skia_prod -Atc "SELECT 'POSTGRES_VERSION='||current_setting('server_version'); SELECT 'LEDGER_COUNT='||count(*) FROM production_bootstrap_migrations; SELECT 'SEED_COUNT='||count(*) FROM system_naming_presets; SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('naming_rules','assets','locations','buildings','floors','zones','mdf_idf','racks','nomenclature_branch_counters','nomenclature_counters','audit_logs') ORDER BY relname;"
hash="$(docker exec "$container" pg_dump -U skia_migrator -d skia_prod --schema-only --no-owner --no-privileges | sed '/^\\restrict /d;/^\\unrestrict /d' | shasum -a 256 | awk '{print $1}')"
[[ "$hash" == e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6 ]]
echo "SCHEMA_FINGERPRINT=$hash"
cd "$repo_root/backend"
NOMENCLATURE_ACCEPTANCE_ADMIN_DATABASE_URL="postgresql://postgres:$password@127.0.0.1:$port/skia_prod?sslmode=disable" \
NOMENCLATURE_ACCEPTANCE_RUNTIME_DATABASE_URL="postgresql://skia_runtime:$password@127.0.0.1:$port/skia_prod?sslmode=disable" \
GOCACHE=/tmp/skia-b2c-go-cache go test ./... -run '^TestB2d(UPS|Ordered)' -count=1 -v
if [[ "${B2D_EXTENDED:-0}" == 1 ]]; then
 NOMENCLATURE_ACCEPTANCE_ADMIN_DATABASE_URL="postgresql://postgres:$password@127.0.0.1:$port/skia_prod?sslmode=disable" \
 NOMENCLATURE_ACCEPTANCE_RUNTIME_DATABASE_URL="postgresql://skia_runtime:$password@127.0.0.1:$port/skia_prod?sslmode=disable" \
 GOCACHE=/tmp/skia-b2c-go-cache go test ./... -run "${B2D_EXTENDED_RUN:-^TestB2d(CounterStress|AcceptanceStress|SecurityMatrix)$}" -count=1 -v -timeout 20m
fi
if [[ "${B2D_HISTORICAL:-0}" == 1 ]]; then
 for historical_sha in 9dacf5ee2db1ae6e0d48a7f5765d1de57de343ef 82deb8f38e5edf74ce1163d9dc179fd456214d37; do
  historical_dir="$(mktemp -d /tmp/skia-b2d-historical.XXXXXX)"
  git -C "$repo_root" archive "$historical_sha" backend | tar -x -C "$historical_dir"
  cp "$repo_root/ops/phase010/testdata/b2d_historical_test.go" "$historical_dir/backend/b2d_historical_test.go"
  echo "HISTORICAL_SHA=$historical_sha TEST_DIRECTORY=$historical_dir"
  (cd "$historical_dir/backend" && DATABASE_URL="postgresql://skia_runtime:$password@127.0.0.1:$port/skia_prod?sslmode=disable" \
   MIGRATOR_DATABASE_URL="postgresql://skia_migrator:$password@127.0.0.1:$port/skia_prod?sslmode=disable" \
   ONBOARDING_DATABASE_URL="postgresql://skia_onboarding:$password@127.0.0.1:$port/skia_prod?sslmode=disable" \
   NOMENCLATURE_ACCEPTANCE_ADMIN_DATABASE_URL="postgresql://postgres:$password@127.0.0.1:$port/skia_prod?sslmode=disable" \
   SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true GOCACHE=/tmp/skia-b2c-go-cache go test ./... -run '^TestB2dHistorical' -count=1 -v)
 done
fi
