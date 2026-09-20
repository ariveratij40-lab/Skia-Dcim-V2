#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-nomenclature-v2-038-$$"
password="nomenclature_v2_038_test_only"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --name "$container" -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod -p 127.0.0.1::5432 -d postgres:16.14-alpine >/dev/null
for _ in {1..40}; do docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null 2>&1 && break; sleep 1; done
host_port="$(docker port "$container" 5432/tcp | awk -F: '{print $NF}')"
docker cp "$repo_root/." "$container:/repo"
# Historical contract tests arrange their own presets. Pin the disposable
# bootstrap at 039; test_nomenclature_v2_initial_preset_catalog.sh covers 040.
docker exec "$container" sed -i '/040_nomenclature_v2_initial_preset_catalog.sql/d' /repo/ops/phase010/bootstrap.manifest

provision(){ docker exec -i "$container" psql -X -U postgres -d "$1" -v ON_ERROR_STOP=1 \
  -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" \
  < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null; }
bootstrap(){ docker exec -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/$1" \
  "$container" "$2/ops/phase010/run_clean_bootstrap.sh" >/dev/null; }
q(){ docker exec "$container" psql -X -U postgres -d "$1" -Atqc "$2"; }
expect_fail(){ if docker exec "$container" psql -X -U "$1" -d "$2" -v ON_ERROR_STOP=1 -c "$3" >/dev/null 2>&1; then echo "unexpected success: $4" >&2; exit 1; fi; }

provision skia_prod
bootstrap skia_prod /repo
bootstrap skia_prod /repo
provision skia_prod
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -v phase011_environment=production -v expected_database=skia_prod \
  -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED \
  -f /repo/ops/phase011/activate_clean_production_rls.sql >/dev/null
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -f /repo/ops/phase011/validate_runtime_auth_role.sql >/dev/null
[[ "$(q skia_prod 'SELECT count(*) FROM production_bootstrap_migrations')" == 31 ]]
[[ "$(q skia_prod "SELECT count(*) FROM production_bootstrap_migrations WHERE path='migrations/038_nomenclature_v2_acceptance_function_contract.sql'")" == 1 ]]
[[ "$(q skia_prod 'SELECT count(*) FROM system_naming_presets')" == 0 ]]

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO system_naming_presets(id,preset_code,asset_type_code,preset_version,prefix,context_mode,sequence_scope,description,active)
VALUES('38000000-0000-4000-8000-000000000001','CCTV_V1','CCTV',1,'CAM','LEGACY_INTERNAL_AREA','BRANCH','active',true),
      ('38000000-0000-4000-8000-000000000002','CCTV_V2','CCTV',2,'CAM','LEGACY_INTERNAL_AREA','BRANCH','inactive',false);
SQL
runtime_sql="psql -X -U skia_runtime -d skia_prod -Atqc"
[[ "$(docker exec -e PGPASSWORD="$password" "$container" sh -c "$runtime_sql \"SELECT lookup_status FROM read_system_naming_preset_v2('CCTV',1)\"")" == FOUND_ACTIVE ]]
[[ "$(docker exec -e PGPASSWORD="$password" "$container" sh -c "$runtime_sql \"SELECT lookup_status FROM read_system_naming_preset_v2('CCTV',2)\"")" == FOUND_INACTIVE ]]
[[ "$(docker exec -e PGPASSWORD="$password" "$container" sh -c "$runtime_sql \"SELECT lookup_status FROM read_system_naming_preset_v2('CCTV',99)\"")" == NOT_FOUND ]]
expect_fail skia_runtime skia_prod 'SELECT * FROM system_naming_presets' 'runtime direct preset SELECT'
expect_fail skia_onboarding skia_prod "SELECT * FROM read_system_naming_preset_v2('CCTV',1)" 'onboarding exact reader'
[[ "$(q skia_prod "SELECT p.prosecdef||'|'||r.rolname||'|'||array_to_string(p.proconfig,',')||'|'||has_function_privilege('skia_runtime',p.oid,'EXECUTE')||'|'||has_function_privilege('skia_onboarding',p.oid,'EXECUTE') FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='public.read_system_naming_preset_v2(text,integer)'::regprocedure")" == 'true|skia_migrator|search_path=pg_catalog, pg_temp|true|false' ]]

# A deliberately failed transaction leaves neither Migration 038 function nor ledger row.
docker exec "$container" createdb -U postgres -O skia_migrator rollback_038
provision rollback_038
docker exec "$container" sh -c "grep -v -e '038_nomenclature_v2_acceptance_function_contract.sql' -e '039_nomenclature_operation_binding.sql' /repo/ops/phase010/bootstrap.manifest >/tmp/pre038.manifest && cp /repo/ops/phase010/bootstrap.manifest /tmp/full.manifest && cp /tmp/pre038.manifest /repo/ops/phase010/bootstrap.manifest"
bootstrap rollback_038 /repo
docker exec "$container" cp /tmp/full.manifest /repo/ops/phase010/bootstrap.manifest
if docker exec "$container" psql -X -U skia_migrator -d rollback_038 -v ON_ERROR_STOP=1 -1 -f /repo/migrations/038_nomenclature_v2_acceptance_function_contract.sql -c 'SELECT 1/0' >/dev/null 2>&1; then exit 1; fi
[[ "$(q rollback_038 "SELECT to_regprocedure('public.read_system_naming_preset_v2(text,integer)') IS NULL")" == t ]]

(cd "$repo_root/backend" && \
  NOMENCLATURE_ACCEPTANCE_ADMIN_DATABASE_URL="postgresql://postgres:$password@127.0.0.1:$host_port/skia_prod?sslmode=disable" \
  NOMENCLATURE_ACCEPTANCE_RUNTIME_DATABASE_URL="postgresql://skia_runtime:$password@127.0.0.1:$host_port/skia_prod?sslmode=disable" \
  GOCACHE=/tmp/skia-b2c-go-cache go test ./... -v -run 'TestNomenclatureAcceptance.*PostgreSQL16' -count=1)

schema_hash="$(docker exec -e PGPASSWORD="$password" "$container" pg_dump -U skia_migrator -d skia_prod --schema-only --no-owner --no-privileges | sed '/^\\restrict /d;/^\\unrestrict /d' | sha256sum | awk '{print $1}')"
[[ "$schema_hash" == e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6 ]]
printf 'POSTGRES_VERSION=16.14\nMIGRATION_038_TESTS=PASS\nFRESH_BOOTSTRAP=PASS\nSECOND_BOOTSTRAP=PASS\nMIGRATION_038_TRANSACTIONALITY=PASS\nEXACT_READER=PASS\nRUNTIME_SECURITY=PASS\nACCEPTANCE_CONCURRENCY=PASS\nPRODUCTION_PRESET_SEED_COUNT=0\nLEDGER_COUNT=31\nSCHEMA_HASH=%s\n' "$schema_hash"
