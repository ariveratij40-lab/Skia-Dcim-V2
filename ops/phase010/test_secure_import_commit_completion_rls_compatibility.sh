#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-b3b5a-030-$$"
password="b3b5a_030_test_only"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run --name "$container" -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod -d postgres:16.14-alpine >/dev/null
for _ in {1..30}; do docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null 2>&1 && break; sleep 1; done
docker cp "$repo_root/." "$container:/repo"
provision(){ docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null; }
bootstrap(){ docker exec -e PGPASSWORD="$password" -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null; }
psqlq(){ docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "$1"; }

provision
bootstrap
bootstrap
provision

[[ "$(psqlq 'SELECT count(*) FROM production_bootstrap_migrations')" == 22 ]]
[[ "$(psqlq "SELECT prosecdef||'|'||pg_get_userbyid(proowner)||'|'||array_to_string(proconfig,',') FROM pg_proc WHERE oid='public.complete_import_row_commit(bigint,bigint,uuid,uuid,text,uuid)'::regprocedure")" == 't|skia_migrator|search_path=pg_catalog, pg_temp' ]]
[[ "$(psqlq "SELECT has_function_privilege('skia_runtime','public.complete_import_row_commit(bigint,bigint,uuid,uuid,text,uuid)','EXECUTE')||'|'||has_function_privilege('public','public.complete_import_row_commit(bigint,bigint,uuid,uuid,text,uuid)','EXECUTE')")" == 'true|false' ]]
[[ "$(psqlq "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='complete_import_row_commit'")" == 1 ]]
[[ "$(psqlq "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='skia_runtime' AND table_name IN ('inventory_imports','inventory_import_rows')")" == 0 ]]
[[ "$(psqlq "SELECT count(*) FROM information_schema.role_usage_grants WHERE grantee='skia_runtime' AND object_type='SEQUENCE'")" == 0 ]]

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES('a1000000-0000-4000-8000-000000000001','A'),('a1000000-0000-4000-8000-000000000002','B');
INSERT INTO users(id,email,name,password_hash) VALUES('a2000000-0000-4000-8000-000000000001','b3b5a@test','B3B5A','x');
INSERT INTO branches(id,tenant_id,code,name,status) VALUES
 ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','A','A','active'),
 ('a3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','B','B','active'),
 ('a3000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000002','C','C','active');
ALTER TABLE assets DISABLE TRIGGER trg_enforce_asset_nomenclature;
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name) SELECT
 'a4000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',id,'B3B5A-A','A' FROM asset_types WHERE code='MDF';
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name) SELECT
 'a4000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000002',id,'B3B5A-B','B' FROM asset_types WHERE code='MDF';
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name) SELECT
 'a4000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000003',id,'B3B5A-C','C' FROM asset_types WHERE code='MDF';
ALTER TABLE assets ENABLE TRIGGER trg_enforce_asset_nomenclature;
INSERT INTO inventory_imports(id,tenant_id,branch_id,file_name,status,workflow_status,created_by) VALUES
 (30101,'a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','030.csv','validated','READY','a2000000-0000-4000-8000-000000000001');
INSERT INTO inventory_import_rows(id,import_id,tenant_id,branch_id,row_number,status,data,normalized_row_hash) VALUES
 (30111,30101,'a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',1,'COMMITTING','{}',repeat('a',64)),
 (30112,30101,'a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',2,'VALID','{}',repeat('b',64)),
 (30113,30101,'a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',3,'FAILED','{}',repeat('c',64)),
 (30114,30101,'a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',4,'COMMITTING','{}',repeat('d',64)),
 (30115,30101,'a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',5,'COMMITTING','{}',repeat('e',64)),
 (30116,30101,'a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',6,'COMMITTING','{}',repeat('f',64)),
 (30117,30101,'a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',7,'INVALID','{}',repeat('7',64));
SQL

scope="'a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001'"
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.complete_import_row_commit(30101,30111,$scope,repeat('a',64),'a4000000-0000-4000-8000-000000000001')")" == COMMITTED ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.complete_import_row_commit(30101,30112,$scope,repeat('b',64),'a4000000-0000-4000-8000-000000000001')")" == INVALID_STATE ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.complete_import_row_commit(30101,30113,$scope,repeat('c',64),'a4000000-0000-4000-8000-000000000001')")" == INVALID_STATE ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.complete_import_row_commit(30101,30117,$scope,repeat('7',64),'a4000000-0000-4000-8000-000000000001')")" == INVALID_STATE ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.complete_import_row_commit(30101,30111,$scope,repeat('a',64),'a4000000-0000-4000-8000-000000000001')")" == INVALID_STATE ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.complete_import_row_commit(30101,30114,$scope,repeat('0',64),'a4000000-0000-4000-8000-000000000001')")" == HASH_MISMATCH ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.complete_import_row_commit(99999,30114,$scope,repeat('d',64),'a4000000-0000-4000-8000-000000000001')")" == NOT_FOUND_OR_UNAUTHORIZED ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.complete_import_row_commit(30101,30114,$scope,repeat('d',64),NULL)")" == INVALID_ARGUMENT ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.complete_import_row_commit(30101,30114,'a1000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000001',repeat('d',64),'a4000000-0000-4000-8000-000000000001')")" == NOT_FOUND_OR_UNAUTHORIZED ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.complete_import_row_commit(30101,30114,'a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000002',repeat('d',64),'a4000000-0000-4000-8000-000000000001')")" == NOT_FOUND_OR_UNAUTHORIZED ]]

for spec in \
  "30114 d a4000000-0000-4000-8000-000000009999" \
  "30115 e a4000000-0000-4000-8000-000000000002" \
  "30116 f a4000000-0000-4000-8000-000000000003"; do
  set -- $spec
  before="$(psqlq "SELECT status||'|'||COALESCE(canonical_asset_id::text,'') FROM inventory_import_rows WHERE id=$1")"
  if docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
    -c "SET ROLE skia_runtime; SELECT * FROM public.complete_import_row_commit(30101,$1,$scope,repeat('$2',64),'$3')" >/dev/null 2>&1; then
    exit 1
  fi
  [[ "$(psqlq "SELECT status||'|'||COALESCE(canonical_asset_id::text,'') FROM inventory_import_rows WHERE id=$1")" == "$before" ]]
done

[[ "$(psqlq "SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN ('public.assets'::regclass,'public.asset_logs'::regclass,'public.asset_relationships'::regclass,'public.mdf_idf'::regclass,'public.locations'::regclass)")" == t ]]

# Migration 030 itself must be atomic. Build the exact pre-030 schema in an
# isolated database, append a deliberate error to the same psql transaction,
# and prove that neither the function version nor constraints changed.
docker exec "$container" createdb -U postgres -O skia_migrator skia_030_rollback
docker exec "$container" sh -c "cp -a /repo /repo-pre030 && sed -i '/030_secure_import_commit_completion_rls_compatibility.sql/d' /repo-pre030/ops/phase010/bootstrap.manifest"
docker exec -e PGPASSWORD="$password" -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_030_rollback" \
  "$container" /repo-pre030/ops/phase010/run_clean_bootstrap.sh >/dev/null
if docker exec -i "$container" psql -X -U skia_migrator -d skia_030_rollback -v ON_ERROR_STOP=1 -1 \
  -f /repo/migrations/030_secure_import_commit_completion_rls_compatibility.sql \
  -c 'SELECT 1/0' >/dev/null 2>&1; then
  exit 1
fi
[[ "$(docker exec "$container" psql -X -U postgres -d skia_030_rollback -Atqc "SELECT count(*) FROM production_bootstrap_migrations")" == 21 ]]
[[ "$(docker exec "$container" psql -X -U postgres -d skia_030_rollback -Atqc "SELECT to_regprocedure('public.complete_import_row_commit(bigint,bigint,uuid,uuid,uuid)') IS NOT NULL")" == t ]]
[[ "$(docker exec "$container" psql -X -U postgres -d skia_030_rollback -Atqc "SELECT count(*) FROM pg_constraint WHERE conname IN ('assets_import_commit_scope_key','inventory_import_rows_canonical_asset_scope_fk')")" == 0 ]]

schema_hash="$(docker exec "$container" pg_dump -U skia_migrator -d skia_prod --schema-only --no-owner --no-privileges | sed '/^\\restrict /d;/^\\unrestrict /d' | sha256sum | awk '{print $1}')"
printf '%s\n' 'POSTGRES_VERSION=16.14' 'MIGRATION_030_TESTS=PASS' 'FUNCTION_SECURITY=PASS' \
  'COMMITTING_TO_COMMITTED=PASS' 'TERMINAL_STATES=PASS' 'HASH_MISMATCH=DENIED' \
  'CROSS_SCOPE_ASSET_LINKS=DENIED' 'FORCE_RLS_PRESERVED=PASS' 'MIGRATION_FAILURE_ROLLBACK=PASS' 'LEDGER_COUNT=22' \
  "SCHEMA_HASH=$schema_hash"
