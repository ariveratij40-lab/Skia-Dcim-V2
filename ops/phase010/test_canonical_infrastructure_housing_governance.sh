#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-a2a-034-$$"
password="a2a_034_test_only"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --name "$container" -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod -d postgres:16.14-alpine >/dev/null
for _ in {1..40}; do docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null 2>&1 && break; sleep 1; done
docker cp "$repo_root/." "$container:/repo"
provision(){ docker exec -i "$container" psql -X -U postgres -d "$1" -v ON_ERROR_STOP=1 -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null; }
bootstrap(){ docker exec -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/$1" "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null; }
sql(){ docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 "$@"; }
expect_fail(){ if sql -1 -c "$1" >/dev/null 2>&1; then echo "unexpected success: $2" >&2; exit 1; fi; }

provision skia_prod
bootstrap skia_prod
bootstrap skia_prod
provision skia_prod
sql -v phase011_environment=production \
  -v expected_database=skia_prod \
  -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED \
  -f /repo/ops/phase011/activate_clean_production_rls.sql >/dev/null
sql -f /repo/ops/phase011/validate_runtime_auth_role.sql >/dev/null

sql >/dev/null <<'SQL'
BEGIN;
INSERT INTO tenants(id,name) VALUES
 ('a2000000-0000-4000-8000-000000000001','A2A tenant'),
 ('a2000000-0000-4000-8000-000000000002','Foreign tenant');
INSERT INTO branches(id,tenant_id,code,name,status) VALUES
 ('a2100000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','A1','A1','active'),
 ('a2100000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001','A2','A2','active'),
 ('a2100000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000002','B1','B1','active');
SELECT set_config('app.tenant_id','a2000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.branch_id','a2100000-0000-4000-8000-000000000001',true);
INSERT INTO zones(id,tenant_id,branch_id,code,name) VALUES
 ('a2200000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','Z1','Zone 1'),
 ('a2200000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','Z2','Zone 2');
INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,placement_code,status,zone_id,physical_identity,physical_identity_governed) VALUES
 ('a2300000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','MDF','MDF','MDF01','active','a2200000-0000-4000-8000-000000000001',NULL,false),
 ('a2300000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','IDF','IDF','IDF01','active','a2200000-0000-4000-8000-000000000001',NULL,false),
 ('a2300000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','Room','WAREHOUSE','ROOM01','active','a2200000-0000-4000-8000-000000000002',NULL,false);
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_zone,context_mode,seq_digits,last_seq,active)
SELECT gen_random_uuid(),'a2000000-0000-4000-8000-000000000001',code,
 CASE code WHEN 'RACK' THEN 'RK' WHEN 'PATCH_PANEL' THEN 'PP' WHEN 'SWITCH' THEN 'SW' WHEN 'BACKBONE' THEN 'BB' ELSE code END,
 '-',true,code IN ('MDF','IDF'),CASE WHEN code IN ('MDF','IDF') THEN 'CANONICAL_ZONE' ELSE 'LEGACY_INTERNAL_AREA' END,3,0,true
FROM asset_types WHERE code IN ('MDF','IDF','RACK','PATCH_PANEL','SWITCH','PDU','UPS','BACKBONE');

INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,mount_mode)
SELECT 'a2400000-0000-4000-8000-000000000001',nr.tenant_id,'a2100000-0000-4000-8000-000000000001',at.id,'a2300000-0000-4000-8000-000000000001','MDF-A1-Z1-001',nr.id,1,'MDF','NONE' FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.asset_type_code='MDF' AND nr.tenant_id='a2000000-0000-4000-8000-000000000001';
INSERT INTO mdf_idf(id,asset_id,tenant_id,branch_id,type) VALUES('a2500000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','MDF');
UPDATE locations SET asset_id='a2400000-0000-4000-8000-000000000001',physical_identity='MDF01',physical_identity_governed=true WHERE id='a2300000-0000-4000-8000-000000000001';
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,mount_mode)
SELECT 'a2400000-0000-4000-8000-000000000002',nr.tenant_id,'a2100000-0000-4000-8000-000000000001',at.id,'a2300000-0000-4000-8000-000000000002','IDF-A1-Z1-001',nr.id,1,'IDF','NONE' FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.asset_type_code='IDF' AND nr.tenant_id='a2000000-0000-4000-8000-000000000001';
INSERT INTO mdf_idf(id,asset_id,tenant_id,branch_id,type) VALUES('a2500000-0000-4000-8000-000000000002','a2400000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','IDF');
UPDATE locations SET asset_id='a2400000-0000-4000-8000-000000000002',physical_identity='IDF01',physical_identity_governed=true WHERE id='a2300000-0000-4000-8000-000000000002';
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,mount_mode)
SELECT 'a2400000-0000-4000-8000-000000000011',nr.tenant_id,'a2100000-0000-4000-8000-000000000001',at.id,'a2300000-0000-4000-8000-000000000001','MDF-A1-Z1-002',nr.id,2,'MDF 2','NONE' FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.asset_type_code='MDF' AND nr.tenant_id='a2000000-0000-4000-8000-000000000001';
INSERT INTO mdf_idf(id,asset_id,tenant_id,branch_id,type) VALUES('a2500000-0000-4000-8000-000000000003','a2400000-0000-4000-8000-000000000011','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','MDF');
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,mount_mode)
SELECT 'a2400000-0000-4000-8000-000000000012',nr.tenant_id,'a2100000-0000-4000-8000-000000000001',at.id,'a2300000-0000-4000-8000-000000000002','IDF-A1-Z1-002',nr.id,2,'IDF 2','NONE' FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.asset_type_code='IDF' AND nr.tenant_id='a2000000-0000-4000-8000-000000000001';
INSERT INTO mdf_idf(id,asset_id,tenant_id,branch_id,type) VALUES('a2500000-0000-4000-8000-000000000004','a2400000-0000-4000-8000-000000000012','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','IDF');

INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,mount_mode)
SELECT 'a2400000-0000-4000-8000-000000000003',nr.tenant_id,'a2100000-0000-4000-8000-000000000001',at.id,'a2300000-0000-4000-8000-000000000001','RK-A1-001',nr.id,1,'Rack MDF','NONE' FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.asset_type_code='RACK' AND nr.tenant_id='a2000000-0000-4000-8000-000000000001';
INSERT INTO racks(id,asset_id,tenant_id,branch_id,mdf_idf_id) VALUES('a2600000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','a2500000-0000-4000-8000-000000000001');
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,mount_mode)
SELECT 'a2400000-0000-4000-8000-000000000004',nr.tenant_id,'a2100000-0000-4000-8000-000000000001',at.id,'a2300000-0000-4000-8000-000000000002','RK-A1-002',nr.id,2,'Rack IDF','NONE' FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.asset_type_code='RACK' AND nr.tenant_id='a2000000-0000-4000-8000-000000000001';
INSERT INTO racks(id,asset_id,tenant_id,branch_id,mdf_idf_id) VALUES('a2600000-0000-4000-8000-000000000002','a2400000-0000-4000-8000-000000000004','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','a2500000-0000-4000-8000-000000000002');

INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,mount_mode,housing_rack_id)
SELECT 'a2400000-0000-4000-8000-000000000005',nr.tenant_id,'a2100000-0000-4000-8000-000000000001',at.id,'a2300000-0000-4000-8000-000000000002','PP-A1-001',nr.id,1,'Panel','RACK_MOUNTED','a2600000-0000-4000-8000-000000000002' FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.asset_type_code='PATCH_PANEL' AND nr.tenant_id='a2000000-0000-4000-8000-000000000001';
INSERT INTO patch_panels(id,asset_id,tenant_id,branch_id) VALUES('a2700000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000005','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001');
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,mount_mode,housing_rack_id)
SELECT 'a2400000-0000-4000-8000-000000000006',nr.tenant_id,'a2100000-0000-4000-8000-000000000001',at.id,'a2300000-0000-4000-8000-000000000002','SW-A1-001',nr.id,1,'Switch','RACK_MOUNTED','a2600000-0000-4000-8000-000000000002' FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.asset_type_code='SWITCH' AND nr.tenant_id='a2000000-0000-4000-8000-000000000001';
INSERT INTO switches(id,asset_id,tenant_id,branch_id) VALUES('a2700000-0000-4000-8000-000000000002','a2400000-0000-4000-8000-000000000006','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001');
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,mount_mode,housing_rack_id)
SELECT 'a2400000-0000-4000-8000-000000000007',nr.tenant_id,'a2100000-0000-4000-8000-000000000001',at.id,'a2300000-0000-4000-8000-000000000002','PDU-A1-001',nr.id,1,'PDU','RACK_MOUNTED','a2600000-0000-4000-8000-000000000002' FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.asset_type_code='PDU' AND nr.tenant_id='a2000000-0000-4000-8000-000000000001';
INSERT INTO pdus(id,asset_id,tenant_id,branch_id) VALUES('a2700000-0000-4000-8000-000000000003','a2400000-0000-4000-8000-000000000007','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001');
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,mount_mode,housing_rack_id)
SELECT 'a2400000-0000-4000-8000-000000000008',nr.tenant_id,'a2100000-0000-4000-8000-000000000001',at.id,'a2300000-0000-4000-8000-000000000002','UPS-A1-001',nr.id,1,'UPS Rack','RACK_MOUNTED','a2600000-0000-4000-8000-000000000002' FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.asset_type_code='UPS' AND nr.tenant_id='a2000000-0000-4000-8000-000000000001';
INSERT INTO ups(id,asset_id,tenant_id,branch_id) VALUES('a2700000-0000-4000-8000-000000000004','a2400000-0000-4000-8000-000000000008','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001');
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,mount_mode)
SELECT 'a2400000-0000-4000-8000-000000000009',nr.tenant_id,'a2100000-0000-4000-8000-000000000001',at.id,'a2300000-0000-4000-8000-000000000003','UPS-A1-002',nr.id,2,'UPS Room','ROOM_MOUNTED' FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.asset_type_code='UPS' AND nr.tenant_id='a2000000-0000-4000-8000-000000000001';
INSERT INTO ups(id,asset_id,tenant_id,branch_id) VALUES('a2700000-0000-4000-8000-000000000005','a2400000-0000-4000-8000-000000000009','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001');
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,nomenclature_id,nomenclature_sequence,name,mount_mode)
SELECT 'a2400000-0000-4000-8000-000000000010',nr.tenant_id,'a2100000-0000-4000-8000-000000000001',at.id,'BB-A1-001',nr.id,1,'Backbone','NONE' FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.asset_type_code='BACKBONE' AND nr.tenant_id='a2000000-0000-4000-8000-000000000001';
INSERT INTO backbone_links(id,asset_id,tenant_id,branch_id,origin_id,destination_id,circuit_code) VALUES('a2800000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000010','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000002','CIRCUIT-A');
INSERT INTO backbone_links(id,asset_id,tenant_id,branch_id,origin_id,destination_id,circuit_code) VALUES('a2800000-0000-4000-8000-000000000002','a2400000-0000-4000-8000-000000000010','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000002','CIRCUIT-B');
INSERT INTO asset_relationships(id,tenant_id,branch_id,source_asset_id,target_asset_id,relationship_type) VALUES('a2900000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000006','a2400000-0000-4000-8000-000000000005','CONNECTED_TO');
COMMIT;
SQL

expect_fail "UPDATE assets SET location_id='a2300000-0000-4000-8000-000000000003' WHERE id='a2400000-0000-4000-8000-000000000003'" 'Rack placement mismatch'
expect_fail "UPDATE racks SET mdf_idf_id=NULL WHERE id='a2600000-0000-4000-8000-000000000001'" 'Rack missing parent'
expect_fail "UPDATE racks SET mdf_idf_id='a2600000-0000-4000-8000-000000000002' WHERE id='a2600000-0000-4000-8000-000000000001'" 'Rack wrong parent type'
expect_fail "UPDATE racks SET branch_id='a2100000-0000-4000-8000-000000000002' WHERE id='a2600000-0000-4000-8000-000000000001'" 'Rack cross branch parent'
expect_fail "UPDATE racks SET tenant_id='a2000000-0000-4000-8000-000000000002' WHERE id='a2600000-0000-4000-8000-000000000001'" 'Rack cross tenant parent'
expect_fail "UPDATE assets SET housing_rack_id=NULL WHERE id='a2400000-0000-4000-8000-000000000005'" 'Patch Panel missing Rack'
expect_fail "UPDATE assets SET branch_id='a2100000-0000-4000-8000-000000000002' WHERE id='a2400000-0000-4000-8000-000000000005'" 'Patch Panel cross branch Rack'
expect_fail "UPDATE assets SET tenant_id='a2000000-0000-4000-8000-000000000002' WHERE id='a2400000-0000-4000-8000-000000000005'" 'Patch Panel cross tenant Rack'
expect_fail "UPDATE assets SET location_id='a2300000-0000-4000-8000-000000000001' WHERE id='a2400000-0000-4000-8000-000000000005'" 'Patch Panel location mismatch'
expect_fail "UPDATE assets SET mount_mode='NONE' WHERE id='a2400000-0000-4000-8000-000000000005'" 'Patch Panel wrong mount mode'
expect_fail "UPDATE assets SET mount_mode='NONE' WHERE id='a2400000-0000-4000-8000-000000000006'" 'Switch wrong mount mode'
expect_fail "UPDATE assets SET location_id='a2300000-0000-4000-8000-000000000001' WHERE id='a2400000-0000-4000-8000-000000000006'" 'Switch location mismatch'
expect_fail "UPDATE assets SET branch_id='a2100000-0000-4000-8000-000000000002' WHERE id='a2400000-0000-4000-8000-000000000006'" 'Switch cross branch Rack'
expect_fail "UPDATE assets SET tenant_id='a2000000-0000-4000-8000-000000000002' WHERE id='a2400000-0000-4000-8000-000000000006'" 'Switch cross tenant Rack'
expect_fail "UPDATE assets SET housing_rack_id=NULL WHERE id='a2400000-0000-4000-8000-000000000007'" 'PDU missing Rack'
expect_fail "UPDATE assets SET location_id='a2300000-0000-4000-8000-000000000001' WHERE id='a2400000-0000-4000-8000-000000000007'" 'PDU location mismatch'
expect_fail "UPDATE assets SET mount_mode='NONE' WHERE id='a2400000-0000-4000-8000-000000000007'" 'PDU wrong mount mode'
expect_fail "UPDATE assets SET housing_rack_id=NULL WHERE id='a2400000-0000-4000-8000-000000000008'" 'UPS Rack missing'
expect_fail "UPDATE assets SET housing_rack_id='a2600000-0000-4000-8000-000000000002' WHERE id='a2400000-0000-4000-8000-000000000009'" 'room UPS with Rack'
expect_fail "UPDATE assets SET location_id=NULL WHERE id='a2400000-0000-4000-8000-000000000009'" 'room UPS without location'
expect_fail "UPDATE assets SET housing_rack_id='a2600000-0000-4000-8000-000000000001' WHERE id='a2400000-0000-4000-8000-000000000001'" 'MDF housed in Rack'
expect_fail "UPDATE assets SET mount_mode='ROOM_MOUNTED' WHERE id='a2400000-0000-4000-8000-000000000002'" 'IDF wrong mount mode'
expect_fail "UPDATE backbone_links SET destination_id=origin_id WHERE id='a2800000-0000-4000-8000-000000000001'" 'Backbone self link'
expect_fail "UPDATE backbone_links SET destination_id='a2400000-0000-4000-8000-000000000003' WHERE id='a2800000-0000-4000-8000-000000000001'" 'Backbone MDF to Rack'
expect_fail "UPDATE backbone_links SET origin_id='a2400000-0000-4000-8000-000000000002' WHERE id='a2800000-0000-4000-8000-000000000001'" 'Backbone IDF origin'
expect_fail "UPDATE backbone_links SET destination_id='a2400000-0000-4000-8000-000000000011' WHERE id='a2800000-0000-4000-8000-000000000001'" 'Backbone MDF to MDF'
expect_fail "UPDATE backbone_links SET origin_id='a2400000-0000-4000-8000-000000000002', destination_id='a2400000-0000-4000-8000-000000000012' WHERE id='a2800000-0000-4000-8000-000000000001'" 'Backbone IDF to IDF'
expect_fail "UPDATE backbone_links SET origin_id='a2400000-0000-4000-8000-000000000002', destination_id='a2400000-0000-4000-8000-000000000011' WHERE id='a2800000-0000-4000-8000-000000000001'" 'Backbone IDF to MDF'
expect_fail "UPDATE backbone_links SET origin_id='a2400000-0000-4000-8000-000000000003' WHERE id='a2800000-0000-4000-8000-000000000001'" 'Backbone Rack to IDF'
expect_fail "UPDATE backbone_links SET branch_id='a2100000-0000-4000-8000-000000000002' WHERE id='a2800000-0000-4000-8000-000000000001'" 'Backbone cross branch'
expect_fail "UPDATE backbone_links SET tenant_id='a2000000-0000-4000-8000-000000000002' WHERE id='a2800000-0000-4000-8000-000000000001'" 'Backbone cross tenant'
expect_fail "UPDATE backbone_links SET circuit_code='CIRCUIT-B' WHERE id='a2800000-0000-4000-8000-000000000001'" 'duplicate circuit'
expect_fail "UPDATE backbone_links SET circuit_code='   ' WHERE id='a2800000-0000-4000-8000-000000000001'" 'blank circuit'
expect_fail "INSERT INTO asset_relationships(id,tenant_id,branch_id,source_asset_id,target_asset_id,relationship_type) VALUES(gen_random_uuid(),'a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000006','a2400000-0000-4000-8000-000000000005','CONTAINS')" 'generic containment'
expect_fail "INSERT INTO asset_relationships(id,tenant_id,branch_id,source_asset_id,target_asset_id,relationship_type) VALUES(gen_random_uuid(),'a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000006','a2400000-0000-4000-8000-000000000005','HOUSED_IN')" 'generic housed in'
expect_fail "INSERT INTO asset_relationships(id,tenant_id,branch_id,source_asset_id,target_asset_id,relationship_type) VALUES(gen_random_uuid(),'a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000006','a2400000-0000-4000-8000-000000000005','BACKBONE_TO')" 'generic backbone to'
expect_fail "UPDATE asset_relationships SET tenant_id='a2000000-0000-4000-8000-000000000002' WHERE id='a2900000-0000-4000-8000-000000000001'" 'relationship cross tenant'
expect_fail "UPDATE assets SET location_id='a2300000-0000-4000-8000-000000000003' WHERE id='a2400000-0000-4000-8000-000000000002'" 'parent relocation divergence'
expect_fail "UPDATE asset_relationships SET branch_id='a2100000-0000-4000-8000-000000000002' WHERE id='a2900000-0000-4000-8000-000000000001'" 'relationship cross branch'

# Two concurrent inserts of the same logical circuit produce one winner.
set +e
sql -1 -c "INSERT INTO backbone_links(id,asset_id,tenant_id,branch_id,origin_id,destination_id,circuit_code) VALUES(gen_random_uuid(),'a2400000-0000-4000-8000-000000000010','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000002','CIRCUIT-C')" >/dev/null 2>&1 & first=$!
sql -1 -c "INSERT INTO backbone_links(id,asset_id,tenant_id,branch_id,origin_id,destination_id,circuit_code) VALUES(gen_random_uuid(),'a2400000-0000-4000-8000-000000000010','a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000002','CIRCUIT-C')" >/dev/null 2>&1 & second=$!
wait "$first"; first_rc=$?; wait "$second"; second_rc=$?
set -e
[[ $(( (first_rc==0) + (second_rc==0) )) == 1 ]]

# Conflicting housing changes serialize on the asset row; the valid writer wins
# and the divergent writer fails at deferred final-state validation.
set +e
sql -c "BEGIN; UPDATE assets SET name=name WHERE id='a2400000-0000-4000-8000-000000000006'; SELECT pg_sleep(1); COMMIT" >/dev/null 2>&1 & first=$!
sleep 0.1
sql -c "BEGIN; UPDATE assets SET housing_rack_id='a2600000-0000-4000-8000-000000000001' WHERE id='a2400000-0000-4000-8000-000000000006'; COMMIT" >/dev/null 2>&1 & second=$!
wait "$first"; first_rc=$?; wait "$second"; second_rc=$?
set -e
[[ "$first_rc" == 0 && "$second_rc" != 0 ]]

# A malformed pre-034 graph must roll back the migration completely.
docker exec "$container" createdb -U postgres -O skia_migrator skia_034_rollback
provision skia_034_rollback
docker exec "$container" sh -c "cp -a /repo /repo-pre034 && sed -i '/034_canonical_infrastructure_housing_governance.sql/d' /repo-pre034/ops/phase010/bootstrap.manifest"
docker exec -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_034_rollback" "$container" /repo-pre034/ops/phase010/run_clean_bootstrap.sh >/dev/null
if docker exec "$container" psql -X -U skia_migrator -d skia_034_rollback -v ON_ERROR_STOP=1 -1 \
  -f /repo/migrations/034_canonical_infrastructure_housing_governance.sql \
  -c 'SELECT 1/0' >/dev/null 2>&1; then echo 'forced rollback unexpectedly committed' >&2; exit 1; fi
[[ "$(docker exec "$container" psql -X -U postgres -d skia_034_rollback -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_name='assets' AND column_name='mount_mode'")" == 0 ]]

ledger="$(sql -Atqc 'SELECT count(*) FROM production_bootstrap_migrations')"
hash="$(docker exec "$container" pg_dump -U skia_migrator -d skia_prod --schema-only --no-owner --no-privileges | sed '/^\\restrict /d;/^\\unrestrict /d' | sha256sum | awk '{print $1}')"
rls="$(sql -Atqc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('assets','mdf_idf','racks','patch_panels','switches','pdus','ups','backbone_links','nodes','asset_relationships','locations') AND c.relrowsecurity AND c.relforcerowsecurity")"
runtime_exec="$(sql -Atqc "SELECT has_function_privilege('skia_runtime','public.assert_canonical_asset_housing(uuid)','EXECUTE') AND NOT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.assert_canonical_asset_housing(uuid)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')")"
role_restricted="$(sql -Atqc "SELECT NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole FROM pg_roles WHERE rolname='skia_runtime'")"
[[ "$ledger" == 26 ]]
[[ "$rls" == 11 ]]
[[ "$runtime_exec" == t ]]
[[ "$role_restricted" == t ]]
printf 'POSTGRES_VERSION=16.14\nMIGRATION_034_TESTS=PASS\nMIGRATION_034_ROLLBACK=PASS\nFRESH_BOOTSTRAP=PASS\nSECOND_BOOTSTRAP=PASS\nLEDGER_COUNT=%s\nRLS_FORCE_TABLES=%s\nSCHEMA_HASH=%s\n' "$ledger" "$rls" "$hash"
