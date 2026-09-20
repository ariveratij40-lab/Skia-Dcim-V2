#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-nomenclature-v2-039-$$"
password="nomenclature_v2_039_test_only"
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

validate(){ docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -f /repo/ops/phase011/validate_runtime_auth_role.sql >/dev/null; }
validate
[[ "$(q skia_prod 'SHOW server_version')" == 16.14* ]]
[[ "$(q skia_prod 'SELECT count(*) FROM production_bootstrap_migrations')" == 31 ]]
[[ "$(q skia_prod "SELECT count(*) FROM production_bootstrap_migrations WHERE path='migrations/039_nomenclature_operation_binding.sql'")" == 1 ]]
[[ "$(q skia_prod 'SELECT count(*) FROM system_naming_presets')" == 0 ]]

# A same-name overload must not inherit allowlisting by name. Exercise PUBLIC
# defaults, explicit runtime EXECUTE, and a nonprivileged inherited role.
for mode in public explicit inherited; do
  q skia_prod "CREATE FUNCTION public.read_system_naming_preset_v2(integer) RETURNS integer LANGUAGE sql AS 'SELECT 1'" >/dev/null
  if [[ "$mode" != public ]]; then
    q skia_prod 'REVOKE ALL ON FUNCTION public.read_system_naming_preset_v2(integer) FROM PUBLIC' >/dev/null
    if [[ "$mode" == explicit ]]; then
      q skia_prod 'GRANT EXECUTE ON FUNCTION public.read_system_naming_preset_v2(integer) TO skia_runtime' >/dev/null
    else
      q skia_prod 'CREATE ROLE hf1_inherited; GRANT hf1_inherited TO skia_runtime; GRANT EXECUTE ON FUNCTION public.read_system_naming_preset_v2(integer) TO hf1_inherited' >/dev/null
    fi
  fi
  if validate > /dev/null 2>&1; then echo "validator accepted $mode overload" >&2; exit 1; fi
  q skia_prod 'DROP FUNCTION public.read_system_naming_preset_v2(integer)' >/dev/null
  if [[ "$mode" == inherited ]]; then q skia_prod 'REVOKE hf1_inherited FROM skia_runtime; DROP ROLE hf1_inherited' >/dev/null; fi
  validate
done

# Existing post-038 database and transactional failure: full schema equality,
# then successful upgrade and idempotency, without editing host artifacts.
docker exec "$container" createdb -U postgres -O skia_migrator rollback_039
provision rollback_039
docker exec "$container" sh -c "cp -a /repo /repo-pre039 && sed -i '/039_nomenclature_operation_binding.sql/d' /repo-pre039/ops/phase010/bootstrap.manifest"
bootstrap rollback_039 /repo-pre039
dump_hash(){ docker exec "$container" pg_dump -U skia_migrator -d "$1" --schema-only --no-owner --no-privileges | sed '/^\\restrict /d;/^\\unrestrict /d' | sha256sum | awk '{print $1}'; }
before="$(dump_hash rollback_039)"
if docker exec "$container" psql -X -U skia_migrator -d rollback_039 -v ON_ERROR_STOP=1 -1 -f /repo/migrations/039_nomenclature_operation_binding.sql -c 'SELECT 1/0' >/dev/null 2>&1; then exit 1; fi
[[ "$(dump_hash rollback_039)" == "$before" ]]
[[ "$(q rollback_039 'SELECT count(*) FROM production_bootstrap_migrations')" == 30 ]]
bootstrap rollback_039 /repo
bootstrap rollback_039 /repo
[[ "$(q rollback_039 'SELECT count(*) FROM production_bootstrap_migrations')" == 31 ]]
# A changed applied migration is rejected by the canonical checksum authority.
docker exec "$container" sh -c "cp -a /repo /repo-bad-checksum && printf '\n-- checksum tamper test\n' >> /repo-bad-checksum/migrations/039_nomenclature_operation_binding.sql"
if bootstrap rollback_039 /repo-bad-checksum >/dev/null 2>&1; then echo 'checksum protection failed' >&2; exit 1; fi
(cd "$repo_root/backend" &&
 NOMENCLATURE_ACCEPTANCE_ADMIN_DATABASE_URL="postgresql://postgres:$password@127.0.0.1:$host_port/skia_prod?sslmode=disable" \
 NOMENCLATURE_ACCEPTANCE_RUNTIME_DATABASE_URL="postgresql://skia_runtime:$password@127.0.0.1:$host_port/skia_prod?sslmode=disable" \
 GOCACHE=/tmp/skia-b2c-go-cache go test ./... -v -run 'TestNomenclatureAcceptance.*PostgreSQL16' -count=1)
schema_hash="$(dump_hash skia_prod)"
[[ "$schema_hash" == e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6 ]]
printf 'HF1_POSTGRES=PASS\nPOSTGRES_VERSION=16.14\nFRESH_BOOTSTRAP=PASS\nSECOND_BOOTSTRAP=PASS\nEXISTING_DB_UPGRADE=PASS\nMIGRATION_039_ROLLBACK=PASS\nCHECKSUM_PROTECTION=PASS\nEFFECTIVE_SIGNATURE_VALIDATOR=PASS\nLEDGER_COUNT=31\nSCHEMA_HASH=%s\n' "$schema_hash"
