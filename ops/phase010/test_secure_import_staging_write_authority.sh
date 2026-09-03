#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-b3b4a-$$"
password="b3b4a_test_only"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --name "$container" -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod \
  -d postgres:16.14-alpine >/dev/null
for _ in {1..30}; do
  docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null
docker cp "$repo_root/." "$container:/repo"

provision(){
  docker exec -i "$container" psql -X -U postgres -d "$1" -v ON_ERROR_STOP=1 \
    -v migrator_password="$password" -v runtime_password="$password" \
    -v onboarding_password="$password" \
    < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null
}
bootstrap(){
  docker exec -e PGPASSWORD="$password" \
    -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/$1" \
    "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null
}
psqlq(){ docker exec "$container" psql -X -U postgres -d skia_prod -Atq -v ON_ERROR_STOP=1 -c "$1"; }

provision skia_prod
bootstrap skia_prod
bootstrap skia_prod
provision skia_prod

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES
 ('81000000-0000-4000-8000-000000000001','Authorized tenant'),
 ('81000000-0000-4000-8000-000000000002','Foreign tenant');
INSERT INTO users(id,email,name,password_hash) VALUES
 ('82000000-0000-4000-8000-000000000001','writer@example.test','Writer','x'),
 ('82000000-0000-4000-8000-000000000002','foreign@example.test','Foreign','x');
INSERT INTO branches(id,tenant_id,code,name,status) VALUES
 ('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','A','Branch A','active'),
 ('83000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','B','Branch B','active'),
 ('83000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000002','X','Foreign','active');
INSERT INTO user_tenants(user_id,tenant_id) VALUES
 ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001'),
 ('82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002');
INSERT INTO user_branches(user_id,branch_id) VALUES
 ('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001'),
 ('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002'),
 ('82000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000003');
CREATE ROLE b3b4a_public_test NOLOGIN;
SQL

scope_a="SELECT set_config('app.tenant_id','81000000-0000-4000-8000-000000000001',true); SELECT set_config('app.branch_id','83000000-0000-4000-8000-000000000001',true);"
scope_b="SELECT set_config('app.tenant_id','81000000-0000-4000-8000-000000000001',true); SELECT set_config('app.branch_id','83000000-0000-4000-8000-000000000002',true);"
scope_x="SELECT set_config('app.tenant_id','81000000-0000-4000-8000-000000000002',true); SELECT set_config('app.branch_id','83000000-0000-4000-8000-000000000003',true);"

import_a="$(psqlq "BEGIN; SET ROLE skia_runtime; $scope_a SELECT public.create_inventory_import_staging('a.csv','MDF','inventory','parser','82000000-0000-4000-8000-000000000001'); COMMIT" | tail -n 1)"
import_b="$(psqlq "BEGIN; SET ROLE skia_runtime; $scope_b SELECT public.create_inventory_import_staging('b.csv','IDF','inventory','parser','82000000-0000-4000-8000-000000000001'); COMMIT" | tail -n 1)"
import_x="$(psqlq "BEGIN; SET ROLE skia_runtime; $scope_x SELECT public.create_inventory_import_staging('x.csv','MDF','inventory','parser','82000000-0000-4000-8000-000000000002'); COMMIT" | tail -n 1)"
[[ -n "$import_a" && -n "$import_b" && -n "$import_x" ]]
[[ "$(psqlq "SELECT tenant_id||'|'||branch_id||'|'||status||'|'||workflow_status FROM inventory_imports WHERE id=$import_a")" == '81000000-0000-4000-8000-000000000001|83000000-0000-4000-8000-000000000001|pending|STAGING' ]]

stage(){
  local import_id="$1" row="$2" state="$3" hash_char="$4" payload="$5" error="${6:-NULL}" expected_char="${7:-}"
  local expected_sql="NULL"
  [[ -n "$expected_char" ]] && expected_sql="repeat('$expected_char',64)"
  psqlq "BEGIN; SET ROLE skia_runtime; $scope_a SELECT result_code||'|'||row_status FROM public.stage_inventory_import_row($import_id,$row,'$payload',repeat('$hash_char',64),'$state',$error,$expected_sql); COMMIT" | tail -n 1
}
[[ "$(stage "$import_a" 1 STAGED a '{"asset_type":"MDF"}')" == 'ROW_STAGED|STAGED' ]]
[[ "$(stage "$import_a" 2 VALID b '{"asset_type":"IDF","zone_code":"Z1"}')" == 'ROW_STAGED|VALID' ]]
[[ "$(stage "$import_a" 3 INVALID c '{"asset_type":"MDF"}' "'ZONE_REQUIRED'")" == 'ROW_STAGED|INVALID' ]]
[[ "$(stage "$import_a" 1 STAGED a '{"asset_type":"MDF"}')" == 'ROW_UNCHANGED|STAGED' ]]
[[ "$(stage "$import_a" 1 STAGED a '{"asset_type":"IDF"}')" == 'HASH_CONFLICT|STAGED' ]]
[[ "$(stage "$import_a" 1 VALID d '{"asset_type":"MDF","zone_code":"Z2"}' NULL a)" == 'ROW_RESTAGED|VALID' ]]
[[ "$(psqlq "SELECT data->>'zone_code'||'|'||normalized_row_hash||'|'||status FROM inventory_import_rows WHERE import_id=$import_a AND row_number=1")" == "Z2|$(printf 'd%.0s' {1..64})|VALID" ]]

# Cross-scope and absent/malformed scope calls expose no header/row and write nothing.
for sql in \
  "BEGIN; SET ROLE skia_runtime; $scope_a SELECT * FROM public.stage_inventory_import_row($import_b,9,'{}',repeat('e',64),'VALID',NULL,NULL); COMMIT" \
  "BEGIN; SET ROLE skia_runtime; $scope_a SELECT * FROM public.stage_inventory_import_row($import_x,9,'{}',repeat('e',64),'VALID',NULL,NULL); COMMIT"; do
  [[ "$(psqlq "$sql" | tail -n 1)" == 'NOT_FOUND_OR_UNAUTHORIZED||' ]]
done
[[ "$(psqlq "SELECT count(*) FROM inventory_import_rows WHERE row_number=9")" == 0 ]]
for sql in \
  "SET ROLE skia_runtime; SELECT public.create_inventory_import_staging('none.csv','MDF',NULL,NULL,'82000000-0000-4000-8000-000000000001')" \
  "BEGIN; SET ROLE skia_runtime; SELECT set_config('app.branch_id','83000000-0000-4000-8000-000000000001',true); SELECT public.create_inventory_import_staging('missing-tenant.csv','MDF',NULL,NULL,'82000000-0000-4000-8000-000000000001'); COMMIT" \
  "BEGIN; SET ROLE skia_runtime; SELECT set_config('app.tenant_id','81000000-0000-4000-8000-000000000001',true); SELECT public.create_inventory_import_staging('missing-branch.csv','MDF',NULL,NULL,'82000000-0000-4000-8000-000000000001'); COMMIT" \
  "BEGIN; SET ROLE skia_runtime; $scope_a SELECT public.create_inventory_import_staging('foreign-user.csv','MDF',NULL,NULL,'82000000-0000-4000-8000-000000000002'); COMMIT" \
  "BEGIN; SET ROLE skia_runtime; SELECT set_config('app.tenant_id','not-a-uuid',true); SELECT set_config('app.branch_id','83000000-0000-4000-8000-000000000001',true); SELECT public.create_inventory_import_staging('bad-tenant.csv','MDF',NULL,NULL,'82000000-0000-4000-8000-000000000001'); COMMIT" \
  "BEGIN; SET ROLE skia_runtime; SELECT set_config('app.tenant_id','81000000-0000-4000-8000-000000000001',true); SELECT set_config('app.branch_id','not-a-uuid',true); SELECT public.create_inventory_import_staging('bad-branch.csv','MDF',NULL,NULL,'82000000-0000-4000-8000-000000000001'); COMMIT"; do
  if docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c "$sql" >/dev/null 2>&1; then exit 1; fi
done
[[ "$(psqlq "SELECT count(*) FROM inventory_imports")" == 3 ]]

# State guards and PUBLIC denial.
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c \
  "UPDATE inventory_import_rows SET status='COMMITTING' WHERE import_id=$import_a AND row_number=1" >/dev/null
[[ "$(stage "$import_a" 1 VALID d '{"asset_type":"MDF","zone_code":"Z2"}')" == 'RESTAGE_DENIED|COMMITTING' ]]
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c \
  "UPDATE inventory_import_rows SET status='COMMITTED',canonical_asset_id=NULL,committed_at=NULL WHERE import_id=$import_a AND row_number=1" >/dev/null 2>&1 && exit 1 || true
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c \
  "UPDATE inventory_import_rows SET status='VALID' WHERE import_id=$import_a AND row_number=1" >/dev/null
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<SQL >/dev/null
INSERT INTO asset_types(id,code,name,requires_nomenclature)
VALUES('84000000-0000-4000-8000-000000000001','B3B4A_TEST','B3B4A terminal fixture',false);
ALTER TABLE assets DISABLE TRIGGER trg_enforce_asset_nomenclature;
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name)
VALUES('85000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',
       '83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001',
       'B3B4A-TERMINAL','Terminal fixture');
ALTER TABLE assets ENABLE TRIGGER trg_enforce_asset_nomenclature;
INSERT INTO inventory_import_rows(import_id,tenant_id,branch_id,row_number,status,data,
  normalized_row_hash,canonical_asset_id,committed_at)
VALUES($import_a,'81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',
  6,'COMMITTED','{}',repeat('6',64),'85000000-0000-4000-8000-000000000001',CURRENT_TIMESTAMP);
SQL
[[ "$(stage "$import_a" 6 VALID 6 '{}')" == 'RESTAGE_DENIED|COMMITTED' ]]
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c \
  "DELETE FROM inventory_import_rows WHERE import_id=$import_a AND row_number=6; DELETE FROM assets WHERE id='85000000-0000-4000-8000-000000000001'; DELETE FROM asset_types WHERE id='84000000-0000-4000-8000-000000000001'" >/dev/null
for state in COMMITTING COMMITTED FAILED; do
  if docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c \
    "BEGIN; SET ROLE skia_runtime; $scope_a SELECT * FROM public.stage_inventory_import_row($import_a,8,'{}',repeat('f',64),'$state',NULL,NULL); COMMIT" >/dev/null 2>&1; then exit 1; fi
done
if docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c \
  "SET ROLE b3b4a_public_test; SELECT public.finalize_inventory_import_staging($import_a)" >/dev/null 2>&1; then exit 1; fi

# Concurrent same identity produces one durable row and deterministic idempotency.
concurrent_sql="BEGIN; SET ROLE skia_runtime; $scope_a SELECT result_code FROM public.stage_inventory_import_row($import_a,7,'{\"asset_type\":\"MDF\"}',repeat('7',64),'VALID',NULL,NULL); COMMIT"
docker exec "$container" psql -X -U postgres -d skia_prod -Atq -v ON_ERROR_STOP=1 -c "$concurrent_sql" >/tmp/b3b4a-one-$$ & p1=$!
docker exec "$container" psql -X -U postgres -d skia_prod -Atq -v ON_ERROR_STOP=1 -c "$concurrent_sql" >/tmp/b3b4a-two-$$ & p2=$!
wait "$p1"; wait "$p2"
[[ "$(psqlq "SELECT count(*) FROM inventory_import_rows WHERE import_id=$import_a AND row_number=7")" == 1 ]]
same_results="$(sort /tmp/b3b4a-one-$$ /tmp/b3b4a-two-$$ | tr '\n' '|')"
[[ "$same_results" == 'ROW_STAGED|ROW_UNCHANGED|' ]]
changed_one="BEGIN; SET ROLE skia_runtime; $scope_a SELECT result_code FROM public.stage_inventory_import_row($import_a,7,'{\"asset_type\":\"MDF\",\"zone_code\":\"ZA\"}',repeat('8',64),'VALID',NULL,repeat('7',64)); COMMIT"
changed_two="BEGIN; SET ROLE skia_runtime; $scope_a SELECT result_code FROM public.stage_inventory_import_row($import_a,7,'{\"asset_type\":\"MDF\",\"zone_code\":\"ZB\"}',repeat('9',64),'VALID',NULL,repeat('7',64)); COMMIT"
docker exec "$container" psql -X -U postgres -d skia_prod -Atq -v ON_ERROR_STOP=1 -c "$changed_one" >/tmp/b3b4a-one-$$ & p1=$!
docker exec "$container" psql -X -U postgres -d skia_prod -Atq -v ON_ERROR_STOP=1 -c "$changed_two" >/tmp/b3b4a-two-$$ & p2=$!
wait "$p1"; wait "$p2"
[[ "$(psqlq "SELECT count(*) FROM inventory_import_rows WHERE import_id=$import_a AND row_number=7")" == 1 ]]
changed_results="$(sort /tmp/b3b4a-one-$$ /tmp/b3b4a-two-$$ | tr '\n' '|')"
[[ "$changed_results" == 'ROW_CONTENT_CONFLICT|ROW_RESTAGED|' ]]
[[ "$(psqlq "SELECT normalized_row_hash IN (repeat('8',64),repeat('9',64)) FROM inventory_import_rows WHERE import_id=$import_a AND row_number=7")" == t ]]
winner_hash="$(psqlq "SELECT left(normalized_row_hash,1) FROM inventory_import_rows WHERE import_id=$import_a AND row_number=7")"
[[ "$winner_hash" == 8 || "$winner_hash" == 9 ]]
loser_hash=8; loser_zone=ZA
[[ "$winner_hash" == 8 ]] && loser_hash=9 && loser_zone=ZB
conflict_row_before="$(psqlq "SELECT data::text||'|'||normalized_row_hash||'|'||status||'|'||COALESCE(error_message,'') FROM inventory_import_rows WHERE import_id=$import_a AND row_number=7")"
conflict_header_before="$(psqlq "SELECT status||'|'||workflow_status||'|'||total_items||'|'||valid_items||'|'||items_with_errors||'|'||items_with_warnings||'|'||updated_at FROM inventory_imports WHERE id=$import_a")"
[[ "$(stage "$import_a" 7 VALID "$loser_hash" "{\"asset_type\":\"MDF\",\"zone_code\":\"$loser_zone\"}" NULL 7)" == 'ROW_CONTENT_CONFLICT|VALID' ]]
[[ "$(psqlq "SELECT data::text||'|'||normalized_row_hash||'|'||status||'|'||COALESCE(error_message,'') FROM inventory_import_rows WHERE import_id=$import_a AND row_number=7")" == "$conflict_row_before" ]]
[[ "$(psqlq "SELECT status||'|'||workflow_status||'|'||total_items||'|'||valid_items||'|'||items_with_errors||'|'||items_with_warnings||'|'||updated_at FROM inventory_imports WHERE id=$import_a")" == "$conflict_header_before" ]]
rm -f /tmp/b3b4a-one-$$ /tmp/b3b4a-two-$$

# Progress authority is scope-bound and invalid counters write nothing.
progress_before="$(psqlq "SELECT status||'|'||workflow_status||'|'||total_items||'|'||valid_items||'|'||items_with_errors||'|'||items_with_warnings FROM inventory_imports WHERE id=$import_a")"
for scope in "$scope_b" "$scope_x"; do
  [[ "$(psqlq "BEGIN; SET ROLE skia_runtime; $scope SELECT public.update_inventory_import_progress($import_a,4,3,1,0); COMMIT" | tail -n 1)" == NOT_FOUND_OR_UNAUTHORIZED ]]
  [[ "$(psqlq "SELECT status||'|'||workflow_status||'|'||total_items||'|'||valid_items||'|'||items_with_errors||'|'||items_with_warnings FROM inventory_imports WHERE id=$import_a")" == "$progress_before" ]]
done
for counters in "-1,0,0,0" "1,-1,0,0" "1,0,-1,0" "1,0,0,-1" "1,1,1,0" "NULL,0,0,0"; do
  if docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c \
    "BEGIN; SET ROLE skia_runtime; $scope_a SELECT public.update_inventory_import_progress($import_a,$counters); COMMIT" >/dev/null 2>&1; then exit 1; fi
  [[ "$(psqlq "SELECT status||'|'||workflow_status||'|'||total_items||'|'||valid_items||'|'||items_with_errors||'|'||items_with_warnings FROM inventory_imports WHERE id=$import_a")" == "$progress_before" ]]
done

# Empty and cross-scope finalization never produce READY or mutate the header.
import_empty="$(psqlq "BEGIN; SET ROLE skia_runtime; $scope_a SELECT public.create_inventory_import_staging('empty.csv','MDF','inventory','parser','82000000-0000-4000-8000-000000000001'); COMMIT" | tail -n 1)"
empty_before="$(psqlq "SELECT status||'|'||workflow_status||'|'||COALESCE(total_items,0)||'|'||COALESCE(valid_items,0)||'|'||COALESCE(items_with_errors,0) FROM inventory_imports WHERE id=$import_empty")"
[[ "$empty_before" == 'pending|STAGING|0|0|0' ]]
[[ "$(psqlq "BEGIN; SET ROLE skia_runtime; $scope_a SELECT result_code||'|'||aggregate_state FROM public.finalize_inventory_import_staging($import_empty); COMMIT" | tail -n 1)" == 'STAGING_INCOMPLETE|STAGING' ]]
[[ "$(psqlq "SELECT status||'|'||workflow_status||'|'||COALESCE(total_items,0)||'|'||COALESCE(valid_items,0)||'|'||COALESCE(items_with_errors,0) FROM inventory_imports WHERE id=$import_empty")" == "$empty_before" ]]
for scope in "$scope_b" "$scope_x"; do
  [[ "$(psqlq "BEGIN; SET ROLE skia_runtime; $scope SELECT result_code||'|'||COALESCE(aggregate_state,'') FROM public.finalize_inventory_import_staging($import_empty); COMMIT" | tail -n 1)" == 'NOT_FOUND_OR_UNAUTHORIZED|' ]]
  [[ "$(psqlq "SELECT status||'|'||workflow_status||'|'||COALESCE(total_items,0)||'|'||COALESCE(valid_items,0)||'|'||COALESCE(items_with_errors,0) FROM inventory_imports WHERE id=$import_empty")" == "$empty_before" ]]
done

[[ "$(psqlq "BEGIN; SET ROLE skia_runtime; $scope_a SELECT public.update_inventory_import_progress($import_a,5,3,1,1); COMMIT" | tail -n 1)" == PROGRESS_UPDATED ]]
[[ "$(stage "$import_a" 4 STAGED e '{"asset_type":"MDF"}')" == 'ROW_STAGED|STAGED' ]]
[[ "$(psqlq "BEGIN; SET ROLE skia_runtime; $scope_a SELECT result_code||'|'||aggregate_state FROM public.finalize_inventory_import_staging($import_a); COMMIT" | tail -n 1)" == 'STAGING_INCOMPLETE|STAGING' ]]
[[ "$(stage "$import_a" 4 VALID f '{"asset_type":"MDF","zone_code":"Z4"}' NULL e)" == 'ROW_RESTAGED|VALID' ]]
[[ "$(psqlq "BEGIN; SET ROLE skia_runtime; $scope_a SELECT result_code||'|'||aggregate_state FROM public.finalize_inventory_import_staging($import_a); COMMIT" | tail -n 1)" == 'STAGING_FINALIZED|READY' ]]

for table in inventory_imports inventory_import_rows import_jobs import_items; do
  for statement in "SELECT * FROM $table" "INSERT INTO $table DEFAULT VALUES" \
    "UPDATE $table SET id=id" "DELETE FROM $table WHERE false"; do
    if docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
      -c "SET ROLE skia_runtime; $statement" >/dev/null 2>&1; then exit 1; fi
  done
done
[[ "$(psqlq "SELECT count(*) FROM information_schema.role_usage_grants WHERE grantee='skia_runtime' AND object_type='SEQUENCE'")" == 0 ]]
[[ "$(psqlq "SELECT (SELECT count(*) FROM assets)||'|'||(SELECT count(*) FROM locations)||'|'||(SELECT count(*) FROM mdf_idf)||'|'||(SELECT count(*) FROM asset_logs)||'|'||(SELECT COALESCE(sum(last_seq),0) FROM naming_rules)")" == '0|0|0|0|0' ]]

# 028 legacy fixture remains byte-for-byte equivalent after 029.
docker exec "$container" createdb -U postgres -O skia_migrator skia_legacy
docker exec "$container" sh -c "grep -Ev '029_secure_import_staging_write_authority.sql|030_secure_import_commit_completion_rls_compatibility.sql' /repo/ops/phase010/bootstrap.manifest > /tmp/pre029.manifest && cp /repo/ops/phase010/bootstrap.manifest /tmp/full.manifest && cp /tmp/pre029.manifest /repo/ops/phase010/bootstrap.manifest"
provision skia_legacy; bootstrap skia_legacy
docker exec -i "$container" psql -X -U postgres -d skia_legacy -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES('91000000-0000-4000-8000-000000000001','Legacy');
INSERT INTO users(id,email,name,password_hash) VALUES('92000000-0000-4000-8000-000000000001','legacy@test','Legacy','x');
INSERT INTO branches(id,tenant_id,name) VALUES('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Legacy branch');
INSERT INTO asset_types(id,code,name,requires_nomenclature) VALUES('94000000-0000-4000-8000-000000000001','B3B4A_LEGACY','Legacy committed asset',false);
ALTER TABLE assets DISABLE TRIGGER trg_enforce_asset_nomenclature;
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name) VALUES('95000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','B3B4A-LEGACY-001','Legacy committed asset');
ALTER TABLE assets ENABLE TRIGGER trg_enforce_asset_nomenclature;
INSERT INTO inventory_imports(id,tenant_id,branch_id,file_name,status,created_by) VALUES(9001,'91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','legacy.csv','validated','92000000-0000-4000-8000-000000000001');
INSERT INTO inventory_import_rows(id,import_id,tenant_id,branch_id,row_number,status,data,normalized_row_hash,canonical_asset_id,committed_at) VALUES(9002,9001,'91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',1,'COMMITTED','{"legacy":true}',repeat('9',64),'95000000-0000-4000-8000-000000000001','2026-01-01 00:00:00+00');
SQL
legacy_before="$(docker exec "$container" psql -X -U postgres -d skia_legacy -Atqc "SELECT i.status||'|'||r.status||'|'||r.data::text||'|'||r.normalized_row_hash||'|'||r.canonical_asset_id||'|'||r.committed_at FROM inventory_imports i JOIN inventory_import_rows r ON r.import_id=i.id WHERE i.id=9001")"
docker exec "$container" cp /tmp/full.manifest /repo/ops/phase010/bootstrap.manifest
bootstrap skia_legacy
legacy_after="$(docker exec "$container" psql -X -U postgres -d skia_legacy -Atqc "SELECT i.status||'|'||r.status||'|'||r.data::text||'|'||r.normalized_row_hash||'|'||r.canonical_asset_id||'|'||r.committed_at FROM inventory_imports i JOIN inventory_import_rows r ON r.import_id=i.id WHERE i.id=9001")"
[[ "$legacy_before" == "$legacy_after" ]]
[[ "$legacy_after" == *'|COMMITTED|'*'|95000000-0000-4000-8000-000000000001|'* ]]

# Runner-style single transaction rolls back all 029 functions on deliberate failure.
docker exec "$container" createdb -U postgres -O skia_migrator skia_failure
docker exec "$container" cp /tmp/pre029.manifest /repo/ops/phase010/bootstrap.manifest
provision skia_failure; bootstrap skia_failure
if docker exec "$container" psql -X -U skia_migrator -d skia_failure -v ON_ERROR_STOP=1 -1 \
  -f /repo/migrations/029_secure_import_staging_write_authority.sql -c 'SELECT 1/0' >/dev/null 2>&1; then exit 1; fi
[[ "$(docker exec "$container" psql -X -U postgres -d skia_failure -Atqc "SELECT count(*) FROM pg_proc WHERE proname IN ('create_inventory_import_staging','stage_inventory_import_row','update_inventory_import_progress','finalize_inventory_import_staging')")" == 0 ]]
[[ "$(docker exec "$container" psql -X -U postgres -d skia_failure -Atqc 'SELECT count(*) FROM production_bootstrap_migrations')" == 20 ]]

docker exec "$container" cp /tmp/full.manifest /repo/ops/phase010/bootstrap.manifest
docker exec -i "$container" psql -X -U postgres -d skia_prod \
  -v phase011_environment=production -v expected_database=skia_prod \
  -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED \
  < "$repo_root/ops/phase011/activate_clean_production_rls.sql" >/dev/null
docker exec -i "$container" psql -X -U postgres -d skia_prod < "$repo_root/ops/phase011/validate_runtime_auth_role.sql" >/dev/null
[[ "$(psqlq 'SELECT count(*) FROM production_bootstrap_migrations')" == 22 ]]

printf '%s\n' 'POSTGRES_VERSION=16.14' 'FRESH_BOOTSTRAP=PASS' 'SECOND_BOOTSTRAP=PASS' \
  'LEDGER_COUNT=22' 'HEADER_CREATION=PASS' 'ROW_STAGING=PASS' 'STATE_AUTHORITY=PASS' \
  'IDEMPOTENT_RESTAGE=PASS' 'HASH_PAYLOAD_CONFLICT=DENIED' \
  'CONCURRENT_SAME_ROW=IDEMPOTENT' 'CONCURRENT_DIFFERENT_CONTENT=ONE_WINNER_ONE_CONFLICT' \
  'CROSS_SCOPE=DENIED' 'CROSS_SCOPE_PROGRESS_FINALIZE=DENIED' 'INVALID_COUNTERS=DENIED' \
  'EMPTY_IMPORT_FINALIZATION=STAGING_INCOMPLETE' \
  'MISSING_OR_MALFORMED_SCOPE=DENIED' 'COMMITTING_COMMITTED_RESTAGE=DENIED' 'PUBLIC_EXECUTE=DENIED' \
  'DIRECT_STAGING_ACCESS=DENIED' 'SEQUENCE_ACCESS=DENIED' \
  'CANONICAL_DOMAIN_DELTAS=ZERO' 'LEGACY_028_FIXTURE=PASS' \
  'MIGRATION_FAILURE_ROLLBACK=PASS' 'RUNTIME_AUTH_VALIDATOR=APPROVED'
