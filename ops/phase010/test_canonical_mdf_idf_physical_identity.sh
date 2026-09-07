#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-b3b5b-031-$$"
password="b3b5b_031_test_only"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run --name "$container" -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod -d postgres:16.14-alpine >/dev/null
for _ in {1..30}; do docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null 2>&1 && break; sleep 1; done
docker cp "$repo_root/." "$container:/repo"
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null
for _ in 1 2; do docker exec -e PGPASSWORD="$password" -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null; done
ledger="$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc 'SELECT count(*) FROM production_bootstrap_migrations')"
[[ "$ledger" == 23 ]]
[[ "$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "SELECT count(*) FROM locations WHERE physical_identity IS NOT NULL")" == 0 ]]
docker exec "$container" createdb -U postgres -O skia_migrator skia_031_rollback
docker exec "$container" sh -c "cp -a /repo /repo-pre031 && sed -i '/031_canonical_mdf_idf_physical_identity.sql/d' /repo-pre031/ops/phase010/bootstrap.manifest"
docker exec -e PGPASSWORD="$password" -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_031_rollback" "$container" /repo-pre031/ops/phase010/run_clean_bootstrap.sh >/dev/null
if docker exec "$container" psql -X -U skia_migrator -d skia_031_rollback -v ON_ERROR_STOP=1 -1 -f /repo/migrations/031_canonical_mdf_idf_physical_identity.sql -c 'SELECT 1/0' >/dev/null 2>&1; then exit 1; fi
[[ "$(docker exec "$container" psql -X -U postgres -d skia_031_rollback -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='locations' AND column_name IN ('physical_identity','physical_identity_governed','normalized_physical_identity')")" == 0 ]]
[[ "$(docker exec "$container" psql -X -U postgres -d skia_031_rollback -Atqc 'SELECT count(*) FROM production_bootstrap_migrations')" == 22 ]]
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES ('81000000-0000-4000-8000-000000000001','T1'),('81000000-0000-4000-8000-000000000002','T2');
INSERT INTO branches(id,tenant_id,code,name,status) VALUES ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','B1','B1','active'),('82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','B2','B2','active'),('82000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000002','B3','B3','active');
INSERT INTO zones(id,tenant_id,branch_id,code,name,status) VALUES ('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Z1','Z1','active'),('83000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Z2','Z2','active'),('83000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002','Z3','Z3','active'),('83000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000003','Z4','Z4','active');
-- Ordinary non-MDF/IDF locations remain unaffected.
INSERT INTO locations(id,tenant_id,branch_id,placement_type,name,status,zone_id) VALUES
 ('84000000-0000-4000-8000-000000000099','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','WAREHOUSE','ordinary','active','83000000-0000-4000-8000-000000000001');
UPDATE locations SET name='ordinary updated' WHERE id='84000000-0000-4000-8000-000000000099';
DO $$ BEGIN BEGIN
  INSERT INTO locations(tenant_id,branch_id,placement_type,name,status,zone_id,physical_identity)
  VALUES ('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','MDF','orphan','active','83000000-0000-4000-8000-000000000001','MDF-01');
  RAISE EXCEPTION 'orphan identity accepted';
EXCEPTION WHEN check_violation THEN NULL; END; END $$;

BEGIN;
INSERT INTO locations(id,tenant_id,branch_id,placement_type,name,status,zone_id) VALUES
 ('84000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','MDF','one','active','83000000-0000-4000-8000-000000000001'),
 ('84000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','MDF','different','active','83000000-0000-4000-8000-000000000001'),
 ('84000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','MDF','zone','active','83000000-0000-4000-8000-000000000002'),
 ('84000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','IDF','type','active','83000000-0000-4000-8000-000000000001'),
 ('84000000-0000-4000-8000-000000000005','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002','MDF','branch','active','83000000-0000-4000-8000-000000000003'),
 ('84000000-0000-4000-8000-000000000006','81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000003','MDF','tenant','active','83000000-0000-4000-8000-000000000004');
ALTER TABLE assets DISABLE TRIGGER USER;
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,name,status)
SELECT ('85000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
       CASE WHEN n=6 THEN '81000000-0000-4000-8000-000000000002'::uuid ELSE '81000000-0000-4000-8000-000000000001'::uuid END,
       CASE WHEN n=5 THEN '82000000-0000-4000-8000-000000000002'::uuid WHEN n=6 THEN '82000000-0000-4000-8000-000000000003'::uuid ELSE '82000000-0000-4000-8000-000000000001'::uuid END,
       (SELECT id FROM asset_types WHERE code=CASE WHEN n=4 THEN 'IDF' ELSE 'MDF' END),
       ('84000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
       'FIXTURE-'||n,'fixture '||n,'active'
FROM generate_series(1,6) n;
ALTER TABLE assets ENABLE TRIGGER USER;
INSERT INTO mdf_idf(id,asset_id,tenant_id,branch_id,type)
SELECT ('86000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
       ('85000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
       CASE WHEN n=6 THEN '81000000-0000-4000-8000-000000000002'::uuid ELSE '81000000-0000-4000-8000-000000000001'::uuid END,
       CASE WHEN n=5 THEN '82000000-0000-4000-8000-000000000002'::uuid WHEN n=6 THEN '82000000-0000-4000-8000-000000000003'::uuid ELSE '82000000-0000-4000-8000-000000000001'::uuid END,
       CASE WHEN n=4 THEN 'IDF' ELSE 'MDF' END
FROM generate_series(1,6) n;
UPDATE locations l SET asset_id=a.id FROM assets a WHERE a.location_id=l.id;
UPDATE locations SET
 physical_identity=CASE WHEN id='84000000-0000-4000-8000-000000000002' THEN 'MDF-02' ELSE 'MDF 01' END,
 physical_identity_governed=true
WHERE id BETWEEN '84000000-0000-4000-8000-000000000001' AND '84000000-0000-4000-8000-000000000006';
COMMIT;

DO $$ BEGIN
 BEGIN UPDATE locations SET physical_identity=NULL WHERE id='84000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'identity null accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE locations SET physical_identity='MDF-99' WHERE id='84000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'identity rewrite accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE locations SET asset_id=NULL WHERE id='84000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'detach accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE locations SET asset_id='85000000-0000-4000-8000-000000000002' WHERE id='84000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'reattach accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE locations SET placement_type='WAREHOUSE' WHERE id='84000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'type escape accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE locations SET physical_identity_governed=false WHERE id='84000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'governance downgrade accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE locations SET tenant_id='81000000-0000-4000-8000-000000000002' WHERE id='84000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'tenant mutation accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE locations SET branch_id='82000000-0000-4000-8000-000000000002' WHERE id='84000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'branch mutation accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE locations SET zone_id='83000000-0000-4000-8000-000000000002' WHERE id='84000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'duplicate relocation accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN UPDATE locations SET tenant_id='81000000-0000-4000-8000-000000000002',branch_id='82000000-0000-4000-8000-000000000003',zone_id='83000000-0000-4000-8000-000000000004',asset_id='85000000-0000-4000-8000-000000000006',placement_type='IDF',physical_identity=NULL,physical_identity_governed=false WHERE id='84000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'multi-column escape accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
UPDATE locations SET physical_identity=' mdf--01 ' WHERE id='84000000-0000-4000-8000-000000000001';
-- A valid relocation to a free zone preserves identity and governance.
UPDATE locations SET zone_id='83000000-0000-4000-8000-000000000002' WHERE id='84000000-0000-4000-8000-000000000002';
DO $$ BEGIN
 BEGIN UPDATE locations SET zone_id='83000000-0000-4000-8000-000000000003' WHERE id='84000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'invalid zone mutation accepted'; EXCEPTION WHEN foreign_key_violation OR check_violation THEN NULL; END;
END $$;
SQL
[[ "$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "SELECT zone_id='83000000-0000-4000-8000-000000000001' AND asset_id='85000000-0000-4000-8000-000000000001' AND placement_type='MDF' AND physical_identity_governed AND normalized_physical_identity='MDF-01' FROM locations WHERE id='84000000-0000-4000-8000-000000000001'")" == t ]]

# A same-scope asset without mdf_idf proves that the subtype is authoritative.
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
ALTER TABLE assets DISABLE TRIGGER USER;
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name,status)
VALUES ('85000000-0000-4000-8000-000000000007','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',(SELECT id FROM asset_types WHERE code='MDF'),'FIXTURE-7','missing subtype','active');
ALTER TABLE assets ENABLE TRIGGER USER;
SQL

expect_attachment_denied() {
  local location_id="$1" asset_id="$2" placement_type="$3" label="$4"
  if docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -v location_id="$location_id" -v asset_id="$asset_id" -v placement_type="$placement_type" <<'SQL' >/dev/null 2>&1
BEGIN;
INSERT INTO locations(id,tenant_id,branch_id,placement_type,name,status,zone_id)
VALUES (:'location_id','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',:'placement_type','invalid attachment','active','83000000-0000-4000-8000-000000000001');
UPDATE locations SET asset_id=:'asset_id',physical_identity='ATTACH-TEST',physical_identity_governed=true WHERE id=:'location_id';
COMMIT;
SQL
  then
    echo "$label accepted" >&2
    exit 1
  fi
  [[ "$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "SELECT count(*) FROM locations WHERE id='$location_id'")" == 0 ]]
}
expect_attachment_denied 84000000-0000-4000-8000-000000000010 85000000-0000-4000-8000-000000000006 MDF wrong-tenant
expect_attachment_denied 84000000-0000-4000-8000-000000000011 85000000-0000-4000-8000-000000000005 MDF wrong-branch
expect_attachment_denied 84000000-0000-4000-8000-000000000012 85000000-0000-4000-8000-000000000004 MDF wrong-type
expect_attachment_denied 84000000-0000-4000-8000-000000000013 85000000-0000-4000-8000-000000000007 MDF missing-subtype

# A real pre-031 legacy row is preserved as ungoverned without inferred identity.
docker exec -i "$container" psql -X -U postgres -d skia_031_rollback -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES ('91000000-0000-4000-8000-000000000001','legacy tenant');
INSERT INTO branches(id,tenant_id,code,name,status) VALUES ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','LEG','legacy branch','active');
INSERT INTO zones(id,tenant_id,branch_id,code,name,status) VALUES ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','LEGACY','legacy zone','active');
INSERT INTO locations(id,tenant_id,branch_id,placement_type,name,status,zone_id) VALUES
 ('94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','MDF','legacy valid','active','93000000-0000-4000-8000-000000000001'),
 ('94000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','MDF','legacy duplicate','active','93000000-0000-4000-8000-000000000001'),
 ('94000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','MDF','legacy invalid graph','active','93000000-0000-4000-8000-000000000001');
ALTER TABLE assets DISABLE TRIGGER USER;
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,name,status)
SELECT ('95000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',(SELECT id FROM asset_types WHERE code='MDF'),('94000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'LEGACY-'||n,'legacy asset '||n,'active' FROM generate_series(1,2) n;
ALTER TABLE assets ENABLE TRIGGER USER;
INSERT INTO mdf_idf(id,asset_id,tenant_id,branch_id,type)
SELECT ('96000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('95000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','MDF' FROM generate_series(1,2) n;
UPDATE locations l SET asset_id=a.id FROM assets a WHERE a.location_id=l.id;
SQL
docker exec -e PGPASSWORD="$password" "$container" psql -X -U skia_migrator -d skia_031_rollback -v ON_ERROR_STOP=1 -1 -f /repo/migrations/031_canonical_mdf_idf_physical_identity.sql >/dev/null
[[ "$(docker exec "$container" psql -X -U postgres -d skia_031_rollback -Atqc "SELECT physical_identity IS NULL AND NOT physical_identity_governed FROM locations WHERE id='94000000-0000-4000-8000-000000000001'")" == t ]]
docker exec -i "$container" psql -X -U postgres -d skia_031_rollback -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
UPDATE locations SET physical_identity='MDF-LEGACY-01',physical_identity_governed=true WHERE id='94000000-0000-4000-8000-000000000001';
SQL
[[ "$(docker exec "$container" psql -X -U postgres -d skia_031_rollback -Atqc "SELECT physical_identity_governed AND normalized_physical_identity='MDF-LEGACY-01' FROM locations WHERE id='94000000-0000-4000-8000-000000000001'")" == t ]]
if docker exec "$container" psql -X -U postgres -d skia_031_rollback -v ON_ERROR_STOP=1 -c "UPDATE locations SET physical_identity=' mdf legacy 01 ',physical_identity_governed=true WHERE id='94000000-0000-4000-8000-000000000002'" >/dev/null 2>&1; then exit 1; fi
[[ "$(docker exec "$container" psql -X -U postgres -d skia_031_rollback -Atqc "SELECT NOT physical_identity_governed AND physical_identity IS NULL FROM locations WHERE id='94000000-0000-4000-8000-000000000002'")" == t ]]
if docker exec "$container" psql -X -U postgres -d skia_031_rollback -v ON_ERROR_STOP=1 -c "UPDATE locations SET physical_identity='MDF-INVALID-01',physical_identity_governed=true WHERE id='94000000-0000-4000-8000-000000000003'" >/dev/null 2>&1; then exit 1; fi
[[ "$(docker exec "$container" psql -X -U postgres -d skia_031_rollback -Atqc "SELECT NOT physical_identity_governed AND physical_identity IS NULL FROM locations WHERE id='94000000-0000-4000-8000-000000000003'")" == t ]]

# Actual runtime role with production-equivalent transaction-local scope cannot
# durably commit an ungoverned MDF or IDF shell.
for placement_type in MDF IDF; do
  if docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -v placement_type="$placement_type" <<'SQL' >/dev/null 2>&1
BEGIN;
SET LOCAL ROLE skia_runtime;
SELECT set_config('app.tenant_id','81000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.branch_id','82000000-0000-4000-8000-000000000001',true);
INSERT INTO locations(id,tenant_id,branch_id,placement_type,name,status,zone_id)
VALUES (gen_random_uuid(),'81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',:'placement_type','runtime bypass','active','83000000-0000-4000-8000-000000000001');
COMMIT;
SQL
  then
    echo "runtime $placement_type null-identity shell committed" >&2
    exit 1
  fi
done
[[ "$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "SELECT count(*) FROM locations WHERE name='runtime bypass'")" == 0 ]]

# Repository-authorized lifecycle is decommissioning, not hard deletion. It
# preserves the governed graph and therefore leaves no orphan of any kind.
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
UPDATE assets SET status='decommissioned',inventory_status='retired' WHERE id='85000000-0000-4000-8000-000000000006';
SQL
[[ "$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "SELECT count(*) FROM locations l LEFT JOIN assets a ON a.id=l.asset_id WHERE l.physical_identity_governed AND a.id IS NULL")" == 0 ]]
[[ "$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "SELECT count(*) FROM locations l JOIN assets a ON a.id=l.asset_id WHERE l.id='84000000-0000-4000-8000-000000000006' AND a.status='decommissioned' AND a.inventory_status='retired'")" == 1 ]]
[[ "$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "SELECT count(*) FROM mdf_idf m LEFT JOIN assets a ON a.id=m.asset_id WHERE a.id IS NULL")" == 0 ]]

# Two independent transactions build the same governed domain identity. The
# unique index serializes them; the losing transaction rolls back its full graph.
counter_count_before="$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc 'SELECT count(*) FROM nomenclature_branch_counters')"
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c 'ALTER TABLE assets DISABLE TRIGGER USER' >/dev/null
concurrent_candidate() {
  local suffix="$1"
  docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -v suffix="$suffix" <<'SQL' >/dev/null 2>&1
BEGIN;
INSERT INTO locations(id,tenant_id,branch_id,placement_type,name,status,zone_id)
VALUES (('a4000000-0000-4000-8000-'||lpad(:'suffix',12,'0'))::uuid,'81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','MDF','concurrent '||:'suffix','active','83000000-0000-4000-8000-000000000001');
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,name,status)
VALUES (('a5000000-0000-4000-8000-'||lpad(:'suffix',12,'0'))::uuid,'81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',(SELECT id FROM asset_types WHERE code='MDF'),('a4000000-0000-4000-8000-'||lpad(:'suffix',12,'0'))::uuid,'CONCURRENT-'||:'suffix','concurrent','active');
INSERT INTO mdf_idf(id,asset_id,tenant_id,branch_id,type)
VALUES (('a6000000-0000-4000-8000-'||lpad(:'suffix',12,'0'))::uuid,('a5000000-0000-4000-8000-'||lpad(:'suffix',12,'0'))::uuid,'81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','MDF');
UPDATE locations SET asset_id=('a5000000-0000-4000-8000-'||lpad(:'suffix',12,'0'))::uuid,physical_identity='RACE-031',physical_identity_governed=true WHERE id=('a4000000-0000-4000-8000-'||lpad(:'suffix',12,'0'))::uuid;
SELECT pg_sleep(0.2);
COMMIT;
SQL
}
set +e
concurrent_candidate 1 & candidate_one=$!
concurrent_candidate 2 & candidate_two=$!
wait "$candidate_one"; rc_one=$?
wait "$candidate_two"; rc_two=$?
set -e
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c 'ALTER TABLE assets ENABLE TRIGGER USER' >/dev/null
winner_count=0
conflict_count=0
[[ "$rc_one" -eq 0 ]] && winner_count=$((winner_count+1)) || conflict_count=$((conflict_count+1))
[[ "$rc_two" -eq 0 ]] && winner_count=$((winner_count+1)) || conflict_count=$((conflict_count+1))
[[ "$winner_count" == 1 && "$conflict_count" == 1 ]]
[[ "$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "SELECT count(*) FROM locations WHERE normalized_physical_identity='RACE-031'")" == 1 ]]
[[ "$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "SELECT count(*) FROM assets WHERE internal_code LIKE 'CONCURRENT-%'")" == 1 ]]
[[ "$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "SELECT count(*) FROM mdf_idf WHERE id::text LIKE 'a6000000-%'")" == 1 ]]
[[ "$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "SELECT count(*) FROM asset_logs WHERE asset_id::text LIKE 'a5000000-%'")" == 0 ]]
[[ "$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc 'SELECT count(*) FROM nomenclature_branch_counters')" == "$counter_count_before" ]]
schema_hash="$(docker exec "$container" pg_dump -U skia_migrator -d skia_prod --schema-only --no-owner --no-privileges | sed '/^\\restrict /d;/^\\unrestrict /d' | sha256sum | awk '{print $1}')"
printf 'POSTGRES_VERSION=16.14\nLEDGER_COUNT=%s\nSCHEMA_HASH=%s\nMIGRATION_031_ROLLBACK=PASS\nMIGRATION_031_TESTS=PASS\nWRONG_TENANT_ATTACHMENT=DENIED_ZERO_DELTA\nWRONG_BRANCH_ATTACHMENT=DENIED_ZERO_DELTA\nWRONG_TYPE_ATTACHMENT=DENIED_ZERO_DELTA\nMISSING_SUBTYPE_ATTACHMENT=DENIED_ZERO_DELTA\nLEGACY_REMEDIATION_VALID=PASS\nLEGACY_REMEDIATION_DUPLICATE=DENIED_ZERO_DELTA\nLEGACY_REMEDIATION_INVALID_GRAPH=DENIED_ZERO_DELTA\nDIRECT_RUNTIME_NEW_MDF_NULL_IDENTITY=DENIED\nDIRECT_RUNTIME_NEW_IDF_NULL_IDENTITY=DENIED\nDELETE_LIFECYCLE=DECOMMISSIONED_GRAPH_PRESERVED_NO_ORPHANS\nCONCURRENT_DUPLICATE=ONE_WINNER_ONE_CONTROLLED_CONFLICT\nCONCURRENT_WINNER_COUNT=%s\nCONCURRENT_CONFLICT_COUNT=%s\nCONCURRENT_LOSER_ZERO_DELTA=PASS\nINVALID_ZONE_MUTATION=DENIED_ZERO_DELTA\nDUPLICATE_ZONE_RELOCATION=CONTROLLED_CONFLICT_ORIGINAL_PRESERVED\nTENANT_BRANCH_MULTICOLUMN_MUTATIONS=DENIED_ZERO_DELTA\nIDENTITY_ATTACHMENT_GOVERNANCE_MUTATIONS=PASS\nNON_MDF_IDF_GOVERNANCE_IMPACT=NONE\n' "$ledger" "$schema_hash" "$winner_count" "$conflict_count"
