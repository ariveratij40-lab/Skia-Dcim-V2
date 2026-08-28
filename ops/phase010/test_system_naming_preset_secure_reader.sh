#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-naming-preset-reader-$RANDOM"
bootstrap_password="bootstrap-test"
migrator_password="migrator-test"
runtime_password="runtime-test"
onboarding_password="onboarding-test"

cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$container" -e POSTGRES_DB=skia_prod \
  -e POSTGRES_USER=skia_bootstrap -e POSTGRES_PASSWORD="$bootstrap_password" \
  -v "$repo_root:/repo:ro" postgres:16.14-alpine >/dev/null
until docker exec "$container" pg_isready -U skia_bootstrap -d skia_prod >/dev/null 2>&1; do sleep 1; done

docker exec -i "$container" psql -X -U skia_bootstrap -d skia_prod -v ON_ERROR_STOP=1 \
  -v migrator_password="$migrator_password" -v runtime_password="$runtime_password" \
  -v onboarding_password="$onboarding_password" \
  < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null

docker exec -e PHASE010_DATABASE_URL="postgresql://skia_migrator:${migrator_password}@localhost/skia_prod" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null
docker exec -e PHASE010_DATABASE_URL="postgresql://skia_migrator:${migrator_password}@localhost/skia_prod" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null

docker exec -i "$container" psql -X -U skia_bootstrap -d skia_prod -v ON_ERROR_STOP=1 \
  -v migrator_password="$migrator_password" -v runtime_password="$runtime_password" \
  -v onboarding_password="$onboarding_password" \
  < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null

docker exec -e PGPASSWORD="$bootstrap_password" "$container" psql -X -U skia_bootstrap -d skia_prod \
  -v phase011_environment=production -v expected_database=skia_prod \
  -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED \
  -f /repo/ops/phase011/activate_clean_production_rls.sql >/dev/null

docker exec -e PGPASSWORD="$migrator_password" "$container" psql -X -U skia_migrator -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO system_naming_presets(asset_type_code,preset_version,prefix,separator,include_branch,include_placement,seq_digits,active)
VALUES ('SWITCH',1,'SW','-',true,true,4,true),('MDF',1,'MDF','-',true,false,3,false);
SQL

security_state="$(docker exec -e PGPASSWORD="$bootstrap_password" "$container" psql -X -U skia_bootstrap -d skia_prod -Atqc \
  "SELECT p.prosecdef||'|'||r.rolname||'|'||array_to_string(p.proconfig,',')||'|'||has_function_privilege('skia_runtime',p.oid,'EXECUTE')||'|'||has_function_privilege('skia_onboarding',p.oid,'EXECUTE')||'|'||has_table_privilege('skia_runtime','public.system_naming_presets','SELECT') FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='public.read_active_system_naming_presets(text[])'::regprocedure")"
[[ "$security_state" == 'true|skia_migrator|search_path=pg_catalog, pg_temp|true|false|false' ]]

result_one="$(docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -Atqc \
  "SELECT asset_type_code||'|'||preset_version||'|'||prefix||'|'||separator||'|'||include_branch||'|'||include_placement||'|'||seq_digits FROM public.read_active_system_naming_presets(ARRAY['SWITCH'])")"
result_two="$(docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -Atqc \
  "SELECT asset_type_code||'|'||preset_version||'|'||prefix||'|'||separator||'|'||include_branch||'|'||include_placement||'|'||seq_digits FROM public.read_active_system_naming_presets(ARRAY['SWITCH'])")"
[[ "$result_one" == 'SWITCH|1|SW|-|true|true|4' && "$result_two" == "$result_one" ]]

inactive="$(docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -Atqc \
  "SELECT count(*) FROM public.read_active_system_naming_presets(ARRAY['MDF'])")"
invalid="$(docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -Atqc \
  "SELECT count(*) FROM public.read_active_system_naming_presets(ARRAY[\$\$SWITCH'); DELETE FROM naming_rules; --\$\$])")"
[[ "$inactive" == 0 && "$invalid" == 0 ]]

before_counts="$(docker exec -e PGPASSWORD="$migrator_password" "$container" psql -X -U skia_migrator -d skia_prod -Atqc \
  "SELECT (SELECT count(*) FROM system_naming_presets)||'|'||(SELECT count(*) FROM naming_rules)||'|'||(SELECT count(*) FROM assets)||'|'||(SELECT coalesce(sum(last_seq),0) FROM naming_rules)||'|'||(SELECT coalesce(sum(last_seq),0) FROM nomenclature_counters)||'|'||(SELECT coalesce(sum(last_seq),0) FROM nomenclature_branch_counters)")"
docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -Atqc \
  "SELECT count(*) FROM public.read_active_system_naming_presets(ARRAY['SWITCH'])" >/dev/null
after_counts="$(docker exec -e PGPASSWORD="$migrator_password" "$container" psql -X -U skia_migrator -d skia_prod -Atqc \
  "SELECT (SELECT count(*) FROM system_naming_presets)||'|'||(SELECT count(*) FROM naming_rules)||'|'||(SELECT count(*) FROM assets)||'|'||(SELECT coalesce(sum(last_seq),0) FROM naming_rules)||'|'||(SELECT coalesce(sum(last_seq),0) FROM nomenclature_counters)||'|'||(SELECT coalesce(sum(last_seq),0) FROM nomenclature_branch_counters)")"
[[ "$before_counts" == "$after_counts" ]]

for sql in \
  'SELECT * FROM system_naming_presets' \
  "INSERT INTO system_naming_presets(asset_type_code,preset_version,prefix) VALUES('IDF',9,'X')" \
  "UPDATE system_naming_presets SET prefix='X'" \
  'DELETE FROM system_naming_presets'; do
  if docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -v ON_ERROR_STOP=1 -c "$sql" >/dev/null 2>&1; then
    echo "runtime table operation unexpectedly succeeded: $sql" >&2
    exit 1
  fi
done

if docker exec -e PGPASSWORD="$onboarding_password" "$container" psql -X -U skia_onboarding -d skia_prod -v ON_ERROR_STOP=1 \
  -c "SELECT * FROM public.read_active_system_naming_presets(ARRAY['SWITCH'])" >/dev/null 2>&1; then
  echo 'PUBLIC-derived function execution unexpectedly succeeded' >&2
  exit 1
fi

docker exec -e PGPASSWORD="$bootstrap_password" "$container" psql -X -U skia_bootstrap -d skia_prod \
  -f /repo/ops/phase011/validate_runtime_auth_role.sql >/dev/null

schema_hash="$(docker exec -e PGPASSWORD="$migrator_password" "$container" pg_dump -U skia_migrator -d skia_prod --schema-only --no-owner --no-privileges | sed '/^\\restrict /d;/^\\unrestrict /d' | sha256sum | awk '{print $1}')"
ledger="$(docker exec -e PGPASSWORD="$migrator_password" "$container" psql -X -U skia_migrator -d skia_prod -Atqc 'SELECT count(*) FROM production_bootstrap_migrations')"
printf 'SYSTEM_NAMING_PRESET_READER_SECURITY=APPROVED\nSCHEMA_HASH=%s\nLEDGER_COUNT=%s\n' "$schema_hash" "$ledger"
