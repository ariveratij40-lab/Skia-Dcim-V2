#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-phase12d-b3b3-$$"
password="phase12d_b3b3_test_only"
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

provision() {
  docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
    -v migrator_password="$password" -v runtime_password="$password" \
    -v onboarding_password="$password" \
    < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null
}
psqlq() { docker exec "$container" psql -X -U postgres -d skia_prod -Atq -v ON_ERROR_STOP=1 -c "$1"; }

provision
for _ in 1 2; do
  docker exec -e PGPASSWORD="$password" \
    -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" \
    "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null
done
provision

# The canonical runner must reject a ledger checksum that no longer matches
# the immutable migration artifact, then approve again after fixture repair.
migration_hash="$(shasum -a 256 "$repo_root/migrations/028_secure_import_commit_coordinator_interface.sql" | awk '{print $1}')"
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -c "UPDATE production_bootstrap_migrations SET sha256=repeat('0',64) WHERE path='migrations/028_secure_import_commit_coordinator_interface.sql'" >/dev/null
if docker exec -e PGPASSWORD="$password" \
  -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null 2>&1; then
  echo 'CHECKSUM_DRIFT=UNEXPECTEDLY_ACCEPTED' >&2
  exit 1
fi
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -c "UPDATE production_bootstrap_migrations SET sha256='$migration_hash' WHERE path='migrations/028_secure_import_commit_coordinator_interface.sql'" >/dev/null
docker exec -e PGPASSWORD="$password" \
  -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES
 ('71000000-0000-4000-8000-000000000001','B3B3 tenant'),
 ('71000000-0000-4000-8000-000000000002','Foreign tenant');
INSERT INTO users(id,email,password_hash,name) VALUES
 ('72000000-0000-4000-8000-000000000001','b3b3@example.test','x','B3B3 user');
INSERT INTO branches(id,tenant_id,code,name) VALUES
 ('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','B1','Branch one'),
 ('73000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','B2','Branch two'),
 ('73000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000002','BX','Foreign branch');
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,active) VALUES
 ('74000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','MDF','MDF',true);
ALTER TABLE assets DISABLE TRIGGER trg_enforce_asset_nomenclature;
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,nomenclature_id,nomenclature_sequence,name)
SELECT '75000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',
       '73000000-0000-4000-8000-000000000001',id,'MDF-001',
       '74000000-0000-4000-8000-000000000001',1,'Committed asset'
FROM asset_types WHERE code='MDF';
ALTER TABLE assets ENABLE TRIGGER trg_enforce_asset_nomenclature;
INSERT INTO inventory_imports(id,tenant_id,branch_id,file_name,status,workflow_status,created_by) VALUES
 (7101,'71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','authorized.csv','validated','READY','72000000-0000-4000-8000-000000000001'),
 (7102,'71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002','other-branch.csv','validated','READY','72000000-0000-4000-8000-000000000001'),
 (7103,'71000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003','foreign.csv','validated','READY','72000000-0000-4000-8000-000000000001'),
 (7104,'71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','pending.csv','pending','PENDING','72000000-0000-4000-8000-000000000001');
INSERT INTO inventory_import_rows(id,import_id,tenant_id,branch_id,row_number,status,data,normalized_row_hash,canonical_asset_id,committed_at) VALUES
 (7111,7101,'71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',1,'VALID','{"asset_type":"MDF","zone_code":"Z1"}',repeat('a',64),NULL,NULL),
 (7112,7101,'71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',2,'COMMITTED','{"asset_type":"MDF","zone_code":"Z1"}',repeat('b',64),'75000000-0000-4000-8000-000000000001',NOW()),
 (7113,7101,'71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',3,'FAILED','{}',repeat('c',64),NULL,NULL),
 (7114,7101,'71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',4,'INVALID','{}',repeat('d',64),NULL,NULL),
 (7115,7101,'71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',5,'STAGED','{}',repeat('e',64),NULL,NULL),
 (7116,7101,'71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',6,'VALID','{}',repeat('f',64),NULL,NULL),
 (7121,7102,'71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002',1,'VALID','{}',repeat('1',64),NULL,NULL),
 (7131,7103,'71000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003',1,'VALID','{}',repeat('2',64),NULL,NULL);
SQL

scope="'71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001'"
[[ "$(psqlq "SET ROLE skia_runtime; SELECT count(*) FROM public.list_import_rows_for_commit(7101,$scope) WHERE result_code='IMPORT_ROW'")" == 6 ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT normalized_row_hash||'|'||(row_data->>'asset_type') FROM public.list_import_rows_for_commit(7101,$scope) WHERE row_id=7111")" == "$(printf 'a%.0s' {1..64})|MDF" ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT canonical_asset_id FROM public.list_import_rows_for_commit(7101,$scope) WHERE row_id=7112")" == 75000000-0000-4000-8000-000000000001 ]]
for spec in \
  "7102 '71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001'" \
  "7101 '71000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000001'" \
  "7999 '71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001'" \
  "7104 '71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001'"; do
  set -- $spec
  [[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.list_import_rows_for_commit($1,$2)")" == NOT_FOUND_OR_UNAUTHORIZED ]]
done

for table in inventory_imports inventory_import_rows import_jobs import_items; do
  for statement in "SELECT * FROM $table" "INSERT INTO $table DEFAULT VALUES" \
    "UPDATE $table SET id=id" "DELETE FROM $table WHERE false"; do
    if docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
      -c "SET ROLE skia_runtime; $statement" >/dev/null 2>&1; then exit 1; fi
  done
done

# Transaction A claims and rolls back. Transaction B records one durable failed attempt.
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<SQL >/dev/null
BEGIN; SET ROLE skia_runtime;
SELECT * FROM public.claim_import_row_for_commit(7101,7111,$scope,repeat('a',64));
ROLLBACK;
SQL
[[ "$(psqlq "SELECT status||'|'||commit_attempts FROM inventory_import_rows WHERE id=7111")" == 'VALID|0' ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code||'|'||row_status||'|'||commit_attempts FROM public.fail_import_row_after_rollback(7101,7111,$scope,repeat('a',64),'CANONICAL_WRITE_FAILED')")" == 'FAILED_RECORDED|FAILED|1' ]]
[[ "$(psqlq "SELECT status||'|'||last_error_code||'|'||commit_attempts||'|'||(canonical_asset_id IS NULL)||'|'||(committed_at IS NULL) FROM inventory_import_rows WHERE id=7111")" == 'FAILED|CANONICAL_WRITE_FAILED|1|true|true' ]]

# Stale hash and terminal state cannot be overwritten.
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -c "UPDATE inventory_import_rows SET normalized_row_hash=repeat('9',64) WHERE id=7116" >/dev/null
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.fail_import_row_after_rollback(7101,7116,$scope,repeat('f',64),'STALE_FAILURE')")" == HASH_MISMATCH ]]
[[ "$(psqlq "SELECT status||'|'||commit_attempts FROM inventory_import_rows WHERE id=7116")" == 'VALID|0' ]]
committed_before="$(psqlq "SELECT status||'|'||canonical_asset_id||'|'||commit_attempts FROM inventory_import_rows WHERE id=7112")"
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.fail_import_row_after_rollback(7101,7112,$scope,repeat('b',64),'LATE_FAILURE')")" == INVALID_STATE ]]
[[ "$(psqlq "SELECT status||'|'||canonical_asset_id||'|'||commit_attempts FROM inventory_import_rows WHERE id=7112")" == "$committed_before" ]]

# Preserve migration 027 second-commit behavior.
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code||'|'||canonical_asset_id FROM public.claim_import_row_for_commit(7101,7112,$scope,repeat('b',64))")" == 'ALREADY_COMMITTED|75000000-0000-4000-8000-000000000001' ]]

[[ "$(psqlq 'SELECT count(*) FROM production_bootstrap_migrations')" == 20 ]]
[[ "$(psqlq "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('validate_import_row_for_commit','claim_import_row_for_commit','complete_import_row_commit','fail_import_row_commit','recompute_inventory_import_state','list_import_rows_for_commit','fail_import_row_after_rollback')")" == 7 ]]
docker exec -i "$container" psql -X -U postgres -d skia_prod \
  -v phase011_environment=production -v expected_database=skia_prod \
  -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED \
  < "$repo_root/ops/phase011/activate_clean_production_rls.sql" >/dev/null
docker exec -i "$container" psql -X -U postgres -d skia_prod \
  < "$repo_root/ops/phase011/validate_runtime_auth_role.sql" >/dev/null
schema_hash="$(docker exec "$container" pg_dump -U postgres -d skia_prod \
  --schema-only --no-owner --no-privileges | sed '/^\\restrict /d;/^\\unrestrict /d' | shasum -a 256 | awk '{print $1}')"

printf '%s\n' 'POSTGRES_VERSION=16.14' 'FRESH_BOOTSTRAP=PASS' 'SECOND_BOOTSTRAP=PASS' \
  'LEDGER_COUNT=20' 'ROW_ENUMERATION=PASS' 'NO_EXISTENCE_LEAK=PASS' \
  'NORMALIZED_HASH_VISIBLE=PASS' 'DIRECT_STAGING_ACCESS=DENIED' \
  'POST_ROLLBACK_FAILURE_PERSISTENCE=PASS' 'FAILED_ATTEMPT_DELTA=1' \
  'STALE_FAILURE_WRITE=DENIED' 'COMMITTED_TERMINAL=PASS' \
  'SECOND_COMMIT_REGRESSION=PASS' 'CHECKSUM_PROTECTION=PASS' \
  'RUNTIME_AUTH_VALIDATOR=APPROVED'
printf 'SCHEMA_HASH=%s\n' "$schema_hash"
