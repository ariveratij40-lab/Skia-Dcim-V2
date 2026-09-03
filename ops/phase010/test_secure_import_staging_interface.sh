#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-b3b2-$$"; password="b3b2_test_only"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }; trap cleanup EXIT
docker run --name "$container" -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod -d postgres:16.14-alpine >/dev/null
for _ in {1..30}; do docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null 2>&1 && break; sleep 1; done
docker cp "$repo_root/." "$container:/repo"
psqlq(){ docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "$1"; }
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" \
  < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null
docker exec "$container" sh -c "cp /repo/ops/phase010/bootstrap.manifest /tmp/bootstrap.manifest.full && sed -e '/027_secure_import_staging_interface.sql/d' -e '/028_secure_import_commit_coordinator_interface.sql/d' -e '/029_secure_import_staging_write_authority.sql/d' -e '/030_secure_import_commit_completion_rls_compatibility.sql/d' /tmp/bootstrap.manifest.full > /repo/ops/phase010/bootstrap.manifest"
docker exec -e PGPASSWORD="$password" -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES('60000000-0000-4000-8000-000000000001','Pre-027');
INSERT INTO users(id,email,name,password_hash) VALUES('60000000-0000-4000-8000-000000000002','pre027@test','Pre 027','x');
INSERT INTO branches(id,tenant_id,name,status) VALUES('60000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001','Pre branch','active');
INSERT INTO inventory_imports(id,tenant_id,branch_id,file_name,status,created_by,total_items,valid_items)
 VALUES(6001,'60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','legacy.csv','validated','60000000-0000-4000-8000-000000000002',1,1);
INSERT INTO inventory_import_rows(id,import_id,tenant_id,branch_id,row_number,status,data,error_message)
 VALUES(6002,6001,'60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003',1,'validated','{"name":"Legacy MDF","raw":"unchanged"}',NULL);
SQL
pre027_snapshot="$(psqlq "SELECT id||'|'||import_id||'|'||tenant_id||'|'||branch_id||'|'||row_number||'|'||status||'|'||data::text||'|'||COALESCE(error_message,'') FROM inventory_import_rows WHERE id=6002")"
docker exec "$container" cp /tmp/bootstrap.manifest.full /repo/ops/phase010/bootstrap.manifest
docker exec -e PGPASSWORD="$password" -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null
[[ "$(psqlq "SELECT id||'|'||import_id||'|'||tenant_id||'|'||branch_id||'|'||row_number||'|'||status||'|'||data::text||'|'||COALESCE(error_message,'') FROM inventory_import_rows WHERE id=6002")" == "$pre027_snapshot" ]]
[[ "$(psqlq "SELECT normalized_row_hash IS NULL AND canonical_asset_id IS NULL AND committed_at IS NULL AND last_error_code IS NULL AND commit_attempts=0 FROM inventory_import_rows WHERE id=6002")" == t ]]
docker exec -e PGPASSWORD="$password" -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" \
  < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES('61000000-0000-4000-8000-000000000001','T1'),('61000000-0000-4000-8000-000000000002','T2');
INSERT INTO users(id,email,name,password_hash) VALUES('62000000-0000-4000-8000-000000000001','b3b2@test','B3B2','x');
CREATE ROLE b3b2_public_test NOLOGIN;
INSERT INTO branches(id,tenant_id,name,status) VALUES
 ('63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','B1','active'),
 ('63000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','B2','active'),
 ('63000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000002','BX','active');
INSERT INTO asset_types(id,code,name,requires_nomenclature) VALUES('64000000-0000-4000-8000-000000000001','IMPORT_TEST','Import test',false);
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,seq_digits,last_seq,active)
 VALUES('64000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','IMPORT_TEST','TEST','-',false,3,0,true);
UPDATE naming_rules SET last_seq=1 WHERE id='64000000-0000-4000-8000-000000000002';
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,nomenclature_id,nomenclature_sequence,name) VALUES
 ('65000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','TEST-001','64000000-0000-4000-8000-000000000002',1,'Test');
UPDATE naming_rules SET last_seq=2 WHERE id='64000000-0000-4000-8000-000000000002';
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,nomenclature_id,nomenclature_sequence,name) VALUES
 ('65000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002','64000000-0000-4000-8000-000000000001','TEST-002','64000000-0000-4000-8000-000000000002',2,'Other branch');
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,seq_digits,last_seq,active)
 VALUES('64000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000002','IMPORT_TEST','TESTX','-',false,3,0,true);
UPDATE naming_rules SET last_seq=1 WHERE id='64000000-0000-4000-8000-000000000003';
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,nomenclature_id,nomenclature_sequence,name) VALUES
 ('65000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000003','64000000-0000-4000-8000-000000000001','TESTX-001','64000000-0000-4000-8000-000000000003',1,'Other tenant');
INSERT INTO inventory_imports(id,tenant_id,branch_id,file_name,status,created_by) VALUES
 (6101,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','a.csv','validated','62000000-0000-4000-8000-000000000001'),
 (6102,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002','b.csv','validated','62000000-0000-4000-8000-000000000001');
INSERT INTO inventory_import_rows(id,import_id,tenant_id,branch_id,row_number,status,data,normalized_row_hash) VALUES
 (6111,6101,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',1,'VALID','{}',repeat('a',64)),
 (6112,6101,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',2,'VALID','{}',repeat('b',64)),
 (6113,6102,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002',1,'VALID','{}',repeat('c',64)),
 (6114,6101,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',4,'pending','{}',NULL),
 (6115,6101,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',5,'STAGED','{}',repeat('d',64)),
 (6116,6101,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',6,'INVALID','{}',repeat('e',64)),
 (6117,6101,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',7,'FAILED','{}',repeat('f',64)),
 (6118,6101,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',8,'VALID','{}',repeat('1',64)),
 (6119,6101,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',9,'VALID','{}',repeat('2',64)),
 (6120,6101,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',10,'VALID','{}',repeat('3',64)),
 (6121,6101,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',11,'VALID','{}',repeat('4',64)),
 (6122,6101,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',12,'VALID','{}',repeat('5',64));
SQL

[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.claim_import_row_for_commit(6101,6111,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('a',64))")" == READY_FOR_COMMIT ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.complete_import_row_commit(6101,6111,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('a',64),'65000000-0000-4000-8000-000000000001')")" == COMMITTED ]]
second_commit_before="$(psqlq "SELECT status||'|'||canonical_asset_id||'|'||committed_at||'|'||commit_attempts||'|'||COALESCE(last_error_code,'')||'|'||normalized_row_hash FROM inventory_import_rows WHERE id=6111")"
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code||'|'||canonical_asset_id FROM public.claim_import_row_for_commit(6101,6111,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('a',64))")" == 'ALREADY_COMMITTED|65000000-0000-4000-8000-000000000001' ]]
[[ "$(psqlq "SELECT status||'|'||canonical_asset_id||'|'||committed_at||'|'||commit_attempts||'|'||COALESCE(last_error_code,'')||'|'||normalized_row_hash FROM inventory_import_rows WHERE id=6111")" == "$second_commit_before" ]]
if docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -c "UPDATE inventory_import_rows SET normalized_row_hash=repeat('z',64) WHERE id=6111" >/dev/null 2>&1; then exit 1; fi
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.claim_import_row_for_commit(6101,6113,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('c',64))")" == NOT_FOUND_OR_UNAUTHORIZED ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.claim_import_row_for_commit(6101,6112,'61000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000001',repeat('b',64))")" == NOT_FOUND_OR_UNAUTHORIZED ]]
[[ "$(psqlq "SELECT commit_attempts FROM inventory_import_rows WHERE id IN (6112,6113) ORDER BY id")" == $'0\n0' ]]
[[ "$(psqlq "SELECT commit_attempts FROM inventory_import_rows WHERE id=6111")" == 1 ]]

for table in inventory_imports inventory_import_rows import_jobs import_items; do
  for statement in "SELECT * FROM $table" "INSERT INTO $table DEFAULT VALUES" \
    "UPDATE $table SET id=id" "DELETE FROM $table WHERE false"; do
    if docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
      -c "SET ROLE skia_runtime; $statement" >/dev/null 2>&1; then exit 1; fi
  done
done

[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.claim_import_row_for_commit(6101,6118,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('x',64))")" == INVALID_STATE ]]
[[ "$(psqlq "SELECT commit_attempts FROM inventory_import_rows WHERE id=6118")" == 0 ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.claim_import_row_for_commit(6101,6114,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('0',64))")" == INVALID_STATE ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.claim_import_row_for_commit(6102,6118,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('1',64))")" == NOT_FOUND_OR_UNAUTHORIZED ]]
for row_hash in "6115 d" "6116 e" "6117 f"; do
  set -- $row_hash
  [[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.claim_import_row_for_commit(6101,$1,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('$2',64))")" == INVALID_STATE ]]
done
for row in 6115 6116 6117 6118 6111; do
  [[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.complete_import_row_commit(6101,$row,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('a',64),'65000000-0000-4000-8000-000000000001')")" == INVALID_STATE ]]
done
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.claim_import_row_for_commit(6101,6118,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('1',64))")" == READY_FOR_COMMIT ]]
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.fail_import_row_commit(6101,6118,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','CANONICAL_VALIDATION_FAILED')")" == FAILED_RETRYABLE ]]
[[ "$(psqlq "SELECT status||'|'||last_error_code||'|'||(canonical_asset_id IS NULL)||'|'||(committed_at IS NULL) FROM inventory_import_rows WHERE id=6118")" == 'FAILED|CANONICAL_VALIDATION_FAILED|true|true' ]]
for row in 6115 6116 6117 6111; do
  [[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.fail_import_row_commit(6101,$row,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','INVALID_STATE_TEST')")" == INVALID_STATE ]]
done
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.claim_import_row_for_commit(6101,6119,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('2',64))")" == READY_FOR_COMMIT ]]
for bad_code in lowercase 'HAS SPACE' 'HAS-DASH' "$(printf 'A%.0s' {1..65})"; do
  [[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.fail_import_row_commit(6101,6119,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','$bad_code')")" == INVALID_ERROR_CODE ]]
done
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.fail_import_row_commit(6101,6119,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','VALID_FAILURE')")" == FAILED_RETRYABLE ]]

for spec in "6120 3 65000000-0000-4000-8000-000000000003" "6121 4 65000000-0000-4000-8000-000000000002"; do
  set -- $spec
  [[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.claim_import_row_for_commit(6101,$1,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('$2',64))")" == READY_FOR_COMMIT ]]
  link_before="$(psqlq "SELECT status||'|'||COALESCE(canonical_asset_id::text,'')||'|'||COALESCE(committed_at::text,'') FROM inventory_import_rows WHERE id=$1")"
  [[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.complete_import_row_commit(6101,$1,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('a',64),'$3')")" == NOT_FOUND_OR_UNAUTHORIZED ]]
  [[ "$(psqlq "SELECT status||'|'||COALESCE(canonical_asset_id::text,'')||'|'||COALESCE(committed_at::text,'') FROM inventory_import_rows WHERE id=$1")" == "$link_before" ]]
done

before="$(psqlq "SELECT status||'|'||COALESCE(canonical_asset_id::text,'')||'|'||COALESCE(committed_at::text,'')||'|'||commit_attempts||'|'||COALESCE(last_error_code,'') FROM inventory_import_rows WHERE id=6112")"
header_before="$(psqlq "SELECT status||'|'||COALESCE(workflow_status,'') FROM inventory_imports WHERE id=6101")"
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
BEGIN; SET ROLE skia_runtime;
SELECT * FROM public.claim_import_row_for_commit(6101,6112,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('b',64));
SELECT * FROM public.complete_import_row_commit(6101,6112,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('b',64),'65000000-0000-4000-8000-000000000001');
SELECT * FROM public.recompute_inventory_import_state(6101,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001');
ROLLBACK;
SQL
[[ "$(psqlq "SELECT status||'|'||COALESCE(canonical_asset_id::text,'')||'|'||COALESCE(committed_at::text,'')||'|'||commit_attempts||'|'||COALESCE(last_error_code,'') FROM inventory_import_rows WHERE id=6112")" == "$before" ]]
[[ "$(psqlq "SELECT status||'|'||COALESCE(workflow_status,'') FROM inventory_imports WHERE id=6101")" == "$header_before" ]]

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 >/dev/null <<'SQL' &
BEGIN; SET ROLE skia_runtime;
SELECT result_code FROM public.claim_import_row_for_commit(6101,6112,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('b',64));
SELECT pg_sleep(2); COMMIT;
SQL
first_claim_pid=$!
sleep 1
[[ "$(psqlq "SET ROLE skia_runtime; SELECT result_code FROM public.claim_import_row_for_commit(6101,6112,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('b',64))")" == INVALID_STATE ]]
wait "$first_claim_pid"
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO inventory_imports(id,tenant_id,branch_id,file_name,status,created_by) SELECT x,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',x||'.csv','validated','62000000-0000-4000-8000-000000000001' FROM generate_series(6201,6205) x;
INSERT INTO inventory_import_rows(import_id,tenant_id,branch_id,row_number,status,data,normalized_row_hash,canonical_asset_id,committed_at) VALUES
 (6201,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',1,'COMMITTED','{}',repeat('a',64),'65000000-0000-4000-8000-000000000001',NOW()),
 (6201,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',2,'COMMITTED','{}',repeat('b',64),'65000000-0000-4000-8000-000000000001',NOW()),
 (6202,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',1,'COMMITTED','{}',repeat('c',64),'65000000-0000-4000-8000-000000000001',NOW()),
 (6202,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',2,'FAILED','{}',repeat('d',64),NULL,NULL),
 (6203,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',1,'COMMITTED','{}',repeat('e',64),'65000000-0000-4000-8000-000000000001',NOW()),
 (6203,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',2,'INVALID','{}',repeat('f',64),NULL,NULL),
 (6204,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',1,'FAILED','{}',repeat('1',64),NULL,NULL),
 (6204,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',2,'INVALID','{}',repeat('2',64),NULL,NULL),
 (6205,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',1,'VALID','{}',repeat('3',64),NULL,NULL);
SQL
for expected in '6201 COMPLETED' '6202 PARTIAL' '6203 PARTIAL' '6204 FAILED' '6205 READY'; do
  set -- $expected
  [[ "$(psqlq "SET ROLE skia_runtime; SELECT aggregate_state FROM public.recompute_inventory_import_state($1,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001')")" == "$2" ]]
done
if docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c \
  "SET ROLE b3b2_public_test; SELECT * FROM public.validate_import_row_for_commit(6101,6111,'61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001')" >/dev/null 2>&1; then exit 1; fi
[[ "$(psqlq "SELECT count(*) FROM inventory_import_rows WHERE normalized_row_hash IS NULL")" == 1 ]]
[[ "$(psqlq 'SELECT count(*) FROM production_bootstrap_migrations')" == 22 ]]
docker exec "$container" createdb -U postgres -O skia_migrator skia_failure
docker exec "$container" sh -c "sed -e '/027_secure_import_staging_interface.sql/d' -e '/028_secure_import_commit_coordinator_interface.sql/d' -e '/029_secure_import_staging_write_authority.sql/d' -e '/030_secure_import_commit_completion_rls_compatibility.sql/d' /tmp/bootstrap.manifest.full > /repo/ops/phase010/bootstrap.manifest"
docker exec -e PGPASSWORD="$password" -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_failure" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null
docker exec "$container" psql -X -U postgres -d skia_failure -v ON_ERROR_STOP=1 \
  -c 'ALTER TABLE inventory_import_rows ADD COLUMN canonical_asset_id TEXT' >/dev/null
docker exec "$container" cp /tmp/bootstrap.manifest.full /repo/ops/phase010/bootstrap.manifest
if docker exec -e PGPASSWORD="$password" -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_failure" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null 2>&1; then exit 1; fi
[[ "$(docker exec "$container" psql -X -U postgres -d skia_failure -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_name='inventory_import_rows' AND column_name='normalized_row_hash'")" == 0 ]]
[[ "$(docker exec "$container" psql -X -U postgres -d skia_failure -Atqc "SELECT count(*) FROM pg_proc WHERE proname='claim_import_row_for_commit'")" == 0 ]]
[[ "$(docker exec "$container" psql -X -U postgres -d skia_failure -Atqc 'SELECT count(*) FROM production_bootstrap_migrations')" == 18 ]]
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
ALTER TABLE assets ENABLE ROW LEVEL SECURITY; ALTER TABLE assets FORCE ROW LEVEL SECURITY;
ALTER TABLE asset_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE asset_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE asset_relationships ENABLE ROW LEVEL SECURITY; ALTER TABLE asset_relationships FORCE ROW LEVEL SECURITY;
SQL
docker exec -i "$container" psql -X -U postgres -d skia_prod < "$repo_root/ops/phase011/validate_runtime_auth_role.sql" >/dev/null
printf '%s\n' 'POSTGRES_VERSION=16.14' 'FRESH_BOOTSTRAP=PASS' 'SECOND_BOOTSTRAP=PASS' 'LEDGER_COUNT=22' \
 'DIRECT_TABLE_ACCESS_RUNTIME=DENIED' 'CROSS_SCOPE=DENIED' 'SECOND_COMMIT_RETURNS_EXISTING_ASSET=PASS' \
 'OUTER_TRANSACTION_ROLLBACK=PASS' 'CONCURRENT_DOUBLE_CLAIM=SERIALIZED' 'PUBLIC_EXECUTE=DENIED' \
 'LEGACY_NULL_HASH_COMPATIBILITY=PASS' 'MIGRATION_FAILURE_ROLLBACK=PASS' \
 'RUNTIME_AUTH_VALIDATOR=APPROVED' 'SECURE_IMPORT_STAGING_INTERFACE=APPROVED'
