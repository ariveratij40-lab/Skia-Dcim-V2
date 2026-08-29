#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-phase12c-legacy-$$"
password="phase12c_test_only"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --name "$container" -e POSTGRES_PASSWORD="$password" \
  -e POSTGRES_DB=skia_prod -d postgres:16.14-alpine >/dev/null
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

# Reproduce the canonical checksum ledger through 022. The canonical runner
# below then discovers these entries and applies 023/024/025/026 from the manifest.
while IFS= read -r relative_path; do
  [[ -n "$relative_path" ]] || continue
  [[ "$relative_path" != "migrations/023_canonical_physical_model_v2_additive.sql" ]] || break
  checksum="$(shasum -a 256 "$repo_root/$relative_path" | awk '{print $1}')"
  docker exec -e PGPASSWORD="$password" "$container" \
    psql -X -U skia_migrator -d skia_prod -v ON_ERROR_STOP=1 -1 \
      -f "/repo/$relative_path" \
      -c "CREATE TABLE IF NOT EXISTS production_bootstrap_migrations(path text PRIMARY KEY,sha256 char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now()); INSERT INTO production_bootstrap_migrations(path,sha256) VALUES ('$relative_path','$checksum');" \
      >/dev/null
done < "$repo_root/ops/phase010/bootstrap.manifest"

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  < "$repo_root/ops/phase010/fixtures/physical_model_v2_legacy.sql"

docker exec -e PGPASSWORD="$password" \
  -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null
docker exec -e PGPASSWORD="$password" \
  -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -v migrator_password="$password" -v runtime_password="$password" \
  -v onboarding_password="$password" \
  < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null
docker exec -i "$container" psql -X -U postgres -d skia_prod \
  -v phase011_environment=production -v expected_database=skia_prod \
  -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED \
  < "$repo_root/ops/phase011/activate_clean_production_rls.sql" >/dev/null
docker exec -i "$container" psql -X -U postgres -d skia_prod \
  < "$repo_root/ops/phase011/validate_runtime_auth_role.sql" >/dev/null
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  < "$repo_root/ops/phase010/fixtures/validate_physical_model_v2_legacy.sql"

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES('41000000-0000-4000-8000-000000000002','Isolation tenant');
INSERT INTO branches(id,tenant_id,code,name) VALUES
 ('42000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000001','TJ2','Branch two'),
 ('42000000-0000-4000-8000-000000000003','41000000-0000-4000-8000-000000000002','OTR','Other tenant');
INSERT INTO zones(id,tenant_id,branch_id,code,name) VALUES
 ('49000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','ZA1','Visible'),
 ('49000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000002','ZA2','Other branch'),
 ('49000000-0000-4000-8000-000000000003','41000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000003','ZB1','Other tenant');
SQL
visible="$(docker exec -e PGPASSWORD="$password" "$container" psql -X -U skia_runtime -d skia_prod -Atqc "SELECT set_config('app.tenant_id','41000000-0000-4000-8000-000000000001',false); SELECT set_config('app.branch_id','42000000-0000-4000-8000-000000000001',false); SELECT count(*) FROM zones" | tail -n 1)"
[[ "$visible" == 1 ]]
if docker exec -e PGPASSWORD="$password" "$container" psql -X -U skia_runtime -d skia_prod -Atqc \
  "SELECT set_config('app.tenant_id','41000000-0000-4000-8000-000000000001',false); SELECT set_config('app.branch_id','42000000-0000-4000-8000-000000000001',false); INSERT INTO zones(tenant_id,branch_id,code,name) VALUES('41000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000003','DENIED','Denied')" >/dev/null 2>&1; then
  echo 'CROSS_SCOPE_WRITE=UNEXPECTEDLY_ALLOWED' >&2
  exit 1
fi

ledger="$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc 'SELECT count(*) FROM production_bootstrap_migrations')"
version="$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "SELECT current_setting('server_version')")"
grants="$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='skia_runtime' AND table_schema='public' AND table_name='system_naming_presets'")"
[[ "$ledger" == 19 ]]
[[ "$version" == 16.14* ]]
[[ "$grants" == 0 ]]
if docker exec -e PGPASSWORD="$password" "$container" \
  psql -X -U skia_runtime -d skia_prod -Atqc 'SELECT count(*) FROM system_naming_presets' >/dev/null 2>&1; then
  echo 'RUNTIME_PRESET_DIRECT_SELECT=UNEXPECTEDLY_ALLOWED' >&2
  exit 1
fi

printf 'POSTGRES_VERSION=%s\nMIGRATION_LEDGER=%s\n' "$version" "$ledger"
printf '%s\n' 'FRESH_MIGRATION=PASS' 'IDEMPOTENCY=PASS' \
  'LEGACY_FIXTURE_MIGRATION=PASS' 'TENANT_ISOLATION=PASS' \
  'BRANCH_ISOLATION=PASS' 'CROSS_SCOPE_WRITE=DENIED' \
  'RUNTIME_PRESET_DIRECT_SELECT=DENIED'
