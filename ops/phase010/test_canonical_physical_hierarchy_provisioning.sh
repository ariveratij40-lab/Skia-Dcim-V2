#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-b3b5c-032-$$"
password="b3b5c_032_test_only"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run --name "$container" -p 127.0.0.1::5432 -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod -d postgres:16.14-alpine >/dev/null
for _ in {1..30}; do docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null 2>&1 && break; sleep 1; done
docker cp "$repo_root/." "$container:/repo"
provision(){ docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null; }
bootstrap(){ docker exec -e PGPASSWORD="$password" -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null; }
q(){ docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "$1"; }

provision
bootstrap
bootstrap
provision
docker exec -i "$container" psql -X -U postgres -d skia_prod \
  -v phase011_environment=production -v expected_database=skia_prod \
  -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED \
  < "$repo_root/ops/phase011/activate_clean_production_rls.sql" >/dev/null
docker exec -i "$container" psql -X -U postgres -d skia_prod < "$repo_root/ops/phase011/validate_runtime_auth_role.sql" >/dev/null
[[ "$(q 'SELECT count(*) FROM production_bootstrap_migrations')" == 25 ]]

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES ('c1000000-0000-4000-8000-000000000001','T1'),('c1000000-0000-4000-8000-000000000002','T2');
INSERT INTO branches(id,tenant_id,code,name,status) VALUES
 ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','B1','B1','active'),
 ('c2000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','B2','B2','active'),
 ('c2000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000002','B3','B3','active');
INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES
 ('c3000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','S1','S1','active'),
 ('c3000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002','S2','S2','active'),
 ('c3000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000003','S3','S3','active');
INSERT INTO floors(id,tenant_id,building_id,code,name,status,hierarchy_governed) VALUES
 ('c4000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','P01','Piso 1','active',true),
 ('c4000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000002','P01','Piso 1','active',true),
 ('c4000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000003','P01','Piso 1','active',true);
INSERT INTO zones(id,tenant_id,branch_id,building_id,floor_id,code,name,status,hierarchy_governed) VALUES
 ('c5000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','PROD','Producción','active',true),
 ('c5000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000002','c4000000-0000-4000-8000-000000000002','PROD','Producción','active',true);
INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,floor_id,zone_id,code,name,status,hierarchy_governed) VALUES
 ('c6000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','AREA','Área','active',true);
DO $$ BEGIN
 BEGIN INSERT INTO floors(tenant_id,building_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001','BAD','bad',true); RAISE EXCEPTION 'cross tenant floor accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN INSERT INTO floors(tenant_id,building_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','P01','dup',true); RAISE EXCEPTION 'duplicate floor accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN INSERT INTO zones(tenant_id,branch_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','BAD','bad',true); RAISE EXCEPTION 'incomplete zone accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN INSERT INTO zones(tenant_id,branch_id,building_id,floor_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002','BAD2','bad',true); RAISE EXCEPTION 'wrong floor accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN INSERT INTO internal_areas(tenant_id,branch_id,site_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','BAD','bad',true); RAISE EXCEPTION 'incomplete area accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE zones SET hierarchy_governed=false,floor_id=NULL WHERE id='c5000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'zone downgrade accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE internal_areas SET hierarchy_governed=false,zone_id=NULL,floor_id=NULL WHERE id='c6000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'area downgrade accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SQL

expect_db_failure() {
  local label="$1" statement="$2"
  if docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c "BEGIN; $statement; COMMIT" >/dev/null 2>&1; then
    echo "$label=FAIL" >&2
    exit 1
  fi
  echo "$label=PASS"
}

expect_db_failure FLOOR_MISSING_BUILDING "INSERT INTO floors(tenant_id,building_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001',NULL,'MISS','Missing',true)"
expect_db_failure FLOOR_CROSS_TENANT_BUILDING "INSERT INTO floors(tenant_id,building_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001','XT','Cross tenant',true)"
expect_db_failure FLOOR_DUPLICATE "INSERT INTO floors(tenant_id,building_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','P01','Duplicate',true)"
expect_db_failure ZONE_MISSING_BUILDING "INSERT INTO zones(tenant_id,branch_id,building_id,floor_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001',NULL,'c4000000-0000-4000-8000-000000000001','MISSB','Missing',true)"
expect_db_failure ZONE_MISSING_FLOOR "INSERT INTO zones(tenant_id,branch_id,building_id,floor_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001',NULL,'MISSF','Missing',true)"
expect_db_failure ZONE_WRONG_BUILDING_FLOOR "INSERT INTO zones(tenant_id,branch_id,building_id,floor_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002','WRONG','Wrong',true)"
expect_db_failure ZONE_CROSS_TENANT "INSERT INTO zones(tenant_id,branch_id,building_id,floor_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','XT','Cross tenant',true)"
expect_db_failure ZONE_CROSS_BRANCH "INSERT INTO zones(tenant_id,branch_id,building_id,floor_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','XB','Cross branch',true)"
expect_db_failure ZONE_DUPLICATE "INSERT INTO zones(tenant_id,branch_id,building_id,floor_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','PROD','Duplicate',true)"
expect_db_failure INTERNAL_AREA_MISSING_SITE "INSERT INTO internal_areas(tenant_id,branch_id,site_id,floor_id,zone_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001',NULL,'c4000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','MS','Missing',true)"
expect_db_failure INTERNAL_AREA_MISSING_FLOOR "INSERT INTO internal_areas(tenant_id,branch_id,site_id,floor_id,zone_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001',NULL,'c5000000-0000-4000-8000-000000000001','MF','Missing',true)"
expect_db_failure INTERNAL_AREA_MISSING_ZONE "INSERT INTO internal_areas(tenant_id,branch_id,site_id,floor_id,zone_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001',NULL,'MZ','Missing',true)"
expect_db_failure INTERNAL_AREA_WRONG_FLOOR "INSERT INTO internal_areas(tenant_id,branch_id,site_id,floor_id,zone_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002','c5000000-0000-4000-8000-000000000001','WF','Wrong',true)"
expect_db_failure INTERNAL_AREA_WRONG_ZONE "INSERT INTO internal_areas(tenant_id,branch_id,site_id,floor_id,zone_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002','WZ','Wrong',true)"
expect_db_failure INTERNAL_AREA_CROSS_TENANT "INSERT INTO internal_areas(tenant_id,branch_id,site_id,floor_id,zone_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','XT','Cross tenant',true)"
expect_db_failure INTERNAL_AREA_CROSS_BRANCH "INSERT INTO internal_areas(tenant_id,branch_id,site_id,floor_id,zone_id,code,name,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','XB','Cross branch',true)"

run_concurrent_insert() {
  local kind="$1" first="$2" second="$3" count_sql="$4"
  local out1="${TMPDIR:-/tmp}/b3b5c-${kind}-1-$$" out2="${TMPDIR:-/tmp}/b3b5c-${kind}-2-$$"
  docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c "BEGIN; $first; SELECT pg_sleep(1); COMMIT" >"$out1" 2>&1 & local p1=$!
  docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c "BEGIN; $second; SELECT pg_sleep(1); COMMIT" >"$out2" 2>&1 & local p2=$!
  set +e; wait "$p1"; local r1=$?; wait "$p2"; local r2=$?; set -e
  local winners=0 conflicts=0
  if [[ "$r1" -eq 0 ]]; then winners=$((winners+1)); elif grep -q 'duplicate key' "$out1"; then conflicts=$((conflicts+1)); fi
  if [[ "$r2" -eq 0 ]]; then winners=$((winners+1)); elif grep -q 'duplicate key' "$out2"; then conflicts=$((conflicts+1)); fi
  rm -f "$out1" "$out2"
  if ! [[ "$winners" -eq 1 && "$conflicts" -eq 1 && "$(q "$count_sql")" == 1 ]]; then
    echo "${kind}_CONCURRENT_DUPLICATE=FAIL" >&2
    exit 1
  fi
  printf '%s_CONCURRENT_WINNER_COUNT=%s\n%s_CONCURRENT_CONFLICT_COUNT=%s\n%s_CONCURRENT_DURABLE_COUNT=1\n%s_CONCURRENT_LOSER_ZERO_DELTA=PASS\n' "$kind" "$winners" "$kind" "$conflicts" "$kind" "$kind"
}

run_concurrent_insert FLOOR \
 "INSERT INTO floors(id,tenant_id,building_id,code,name,status,hierarchy_governed) VALUES('c4000000-0000-4000-8000-000000000011','c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','PCON','Concurrent','active',true)" \
 "INSERT INTO floors(id,tenant_id,building_id,code,name,status,hierarchy_governed) VALUES('c4000000-0000-4000-8000-000000000012','c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','PCON','Concurrent','active',true)" \
 "SELECT count(*) FROM floors WHERE tenant_id='c1000000-0000-4000-8000-000000000001' AND building_id='c3000000-0000-4000-8000-000000000001' AND code='PCON'"
run_concurrent_insert ZONE \
 "INSERT INTO zones(id,tenant_id,branch_id,building_id,floor_id,code,name,status,hierarchy_governed) VALUES('c5000000-0000-4000-8000-000000000011','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','ZCON','Concurrent','active',true)" \
 "INSERT INTO zones(id,tenant_id,branch_id,building_id,floor_id,code,name,status,hierarchy_governed) VALUES('c5000000-0000-4000-8000-000000000012','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','ZCON','Concurrent','active',true)" \
 "SELECT count(*) FROM zones WHERE tenant_id='c1000000-0000-4000-8000-000000000001' AND branch_id='c2000000-0000-4000-8000-000000000001' AND code='ZCON'"
echo 'FLOOR_CONCURRENT_DUPLICATE=ONE_WINNER_ONE_CONTROLLED_CONFLICT'
echo 'ZONE_CONCURRENT_DUPLICATE=ONE_WINNER_ONE_CONTROLLED_CONFLICT'
echo 'EXPLICIT_032_NEGATIVE_MATRIX=COMPLETE'

# Runtime has only SELECT+INSERT and RLS restricts both visibility and writes.
[[ "$(q "SELECT string_agg(privilege_type,',' ORDER BY privilege_type) FROM information_schema.role_table_grants WHERE grantee='skia_runtime' AND table_name='floors'")" == INSERT,SELECT ]]
[[ "$(q "SELECT string_agg(privilege_type,',' ORDER BY privilege_type) FROM information_schema.role_table_grants WHERE grantee='skia_runtime' AND table_name='zones'")" == INSERT,SELECT ]]
[[ "$(q "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='skia_runtime' AND table_name IN ('floors','zones') AND privilege_type IN ('UPDATE','DELETE','TRUNCATE')")" == 0 ]]
runtime_scope="SET LOCAL ROLE skia_runtime;
SELECT set_config('app.tenant_id','c1000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.branch_id','c2000000-0000-4000-8000-000000000001',true);"
runtime_labels=(RUNTIME_INCOMPLETE_FLOOR RUNTIME_INCOMPLETE_ZONE RUNTIME_INCOMPLETE_INTERNAL_AREA FLOOR_CROSS_BRANCH_BUILDING ACTIVE_NEW_ZONE_LEGACY_BYPASS ACTIVE_NEW_INTERNAL_AREA_LEGACY_BYPASS)
runtime_inserts=(
 "INSERT INTO floors(tenant_id,building_id,code,name) VALUES('c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','P02','incomplete')"
 "INSERT INTO zones(tenant_id,branch_id,code,name) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','BAD','incomplete')"
 "INSERT INTO internal_areas(tenant_id,branch_id,site_id,code,name) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','BAD','incomplete')"
 "INSERT INTO floors(tenant_id,building_id,code,name,status,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000002','XB','Cross branch','active',true)"
 "INSERT INTO zones(tenant_id,branch_id,building_id,floor_id,code,name,status,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','LEGACY','Bypass','active',false)"
 "INSERT INTO internal_areas(tenant_id,branch_id,site_id,floor_id,zone_id,code,name,status,hierarchy_governed) VALUES('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','LEGACY','Bypass','active',false)"
)
for index in "${!runtime_inserts[@]}"; do
  insert_sql="${runtime_inserts[$index]}"
  if docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c "BEGIN; $runtime_scope $insert_sql; COMMIT" >/dev/null 2>&1; then
    echo "${runtime_labels[$index]}=FAIL" >&2
    exit 1
  fi
  echo "${runtime_labels[$index]}=PASS"
done
[[ "$(q "SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN ('public.buildings'::regclass,'public.floors'::regclass,'public.zones'::regclass,'public.internal_areas'::regclass)")" == t ]]

port="$(docker port "$container" 5432/tcp | awk -F: 'NR==1{print $NF}')"
ASSET_NOMENCLATURE_TEST_DATABASE_URL="postgresql://postgres:$password@127.0.0.1:$port/skia_prod?sslmode=disable" \
ASSET_NOMENCLATURE_RUNTIME_TEST_DATABASE_URL="postgresql://skia_runtime:$password@127.0.0.1:$port/skia_prod?sslmode=disable" \
GOCACHE="${TMPDIR:-/tmp}/skia-b3b5c-integration-go-cache" \
  go -C "$repo_root/backend" test -v -race -tags integration -run '^TestPhysicalLocationHierarchyPostgreSQL16$' ./...
GOCACHE="${TMPDIR:-/tmp}/skia-b3b5c-unit-go-cache" \
  go -C "$repo_root/backend" test -v -run '^TestHandle(Floors|Zones|InternalAreas)' ./...

# Migration rollback leaves no 032 columns or objects on a pre-032 database.
docker exec "$container" createdb -U postgres -O skia_migrator skia_032_rollback
docker exec "$container" sh -c "cp -a /repo /repo-pre032 && sed -i '/032_canonical_physical_hierarchy_provisioning.sql/d' /repo-pre032/ops/phase010/bootstrap.manifest"
docker exec -e PGPASSWORD="$password" -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_032_rollback" "$container" /repo-pre032/ops/phase010/run_clean_bootstrap.sh >/dev/null
if docker exec "$container" psql -X -U skia_migrator -d skia_032_rollback -v ON_ERROR_STOP=1 -1 -f /repo/migrations/032_canonical_physical_hierarchy_provisioning.sql -c 'SELECT 1/0' >/dev/null 2>&1; then exit 1; fi
[[ "$(docker exec "$container" psql -X -U postgres -d skia_032_rollback -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND column_name='hierarchy_governed' AND table_name IN ('floors','zones','internal_areas')")" == 0 ]]
[[ "$(docker exec "$container" psql -X -U postgres -d skia_032_rollback -Atqc 'SELECT count(*) FROM production_bootstrap_migrations')" == 23 ]]

schema_hash="$(docker exec "$container" pg_dump -U skia_migrator -d skia_prod --schema-only --no-owner --no-privileges | sed '/^\\restrict /d;/^\\unrestrict /d' | sha256sum | awk '{print $1}')"
printf 'POSTGRES_VERSION=16.14\nLEDGER_COUNT=25\nSCHEMA_HASH=%s\nMIGRATION_032_TESTS=PASS\nMIGRATION_032_ROLLBACK=PASS\nRUNTIME_MINIMUM_PRIVILEGE=PASS\nRLS_FORCE=PASS\n' "$schema_hash"
