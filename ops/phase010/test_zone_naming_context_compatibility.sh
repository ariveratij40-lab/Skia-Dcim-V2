#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-phase12d-b1c-$$"
password="phase12d_b1c_test_only"
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

# Exercise the real migration boundary: establish the canonical schema through
# 025, persist representative legacy state, then let the checksum runner apply
# 026 and its ledger row in one transaction.
docker exec "$container" sh -c \
  "cp /repo/ops/phase010/bootstrap.manifest /tmp/bootstrap.manifest.full && sed -e '/026_zone_naming_context_compatibility.sql/d' -e '/027_secure_import_staging_interface.sql/d' -e '/028_secure_import_commit_coordinator_interface.sql/d' /tmp/bootstrap.manifest.full > /repo/ops/phase010/bootstrap.manifest"

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -v migrator_password="$password" -v runtime_password="$password" \
  -v onboarding_password="$password" \
  < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null
docker exec -e PGPASSWORD="$password" \
  -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES
 ('41000000-0000-4000-8000-000000000001','Pre-026 tenant');
INSERT INTO branches(id,tenant_id,code,name,status) VALUES
 ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','B1','Pre-026 branch','active');
INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES
 ('43000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','SITE','Pre-026 site','active');
INSERT INTO floors(id,tenant_id,building_id,name) VALUES
 ('44000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','Pre-026 floor');
INSERT INTO zones(id,tenant_id,branch_id,building_id,floor_id,code,name,status) VALUES
 ('45000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001','ZONE1','Pre-026 zone','active');
INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,floor_id,zone_id,code,name,status) VALUES
 ('46000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001','AREA','Pre-026 area','active');
INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,placement_code,status,internal_area_id) VALUES
 ('47000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','Pre-026 MDF','MDF','MDF01','active','46000000-0000-4000-8000-000000000001');

INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_site,include_internal_area,seq_digits,last_seq,active)
VALUES
 ('48000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','MDF','MDF','-',true,true,true,4,0,true),
 ('48000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000001','IDF','IDF','-',true,true,true,4,0,true);

INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name)
SELECT '49000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',id,
       '47000000-0000-4000-8000-000000000001','MDF-B1-SITE-AREA-0007',
       '48000000-0000-4000-8000-000000000001',7,'Pre-026 issued asset'
FROM asset_types WHERE code='MDF';

UPDATE naming_rules SET last_seq=7
WHERE id='48000000-0000-4000-8000-000000000001';
INSERT INTO nomenclature_branch_counters(nomenclature_id,tenant_id,branch_id,last_seq) VALUES
 ('48000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',7),
 ('48000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',0);
INSERT INTO nomenclature_counters(nomenclature_id,tenant_id,branch_id,placement_id,last_seq) VALUES
 ('48000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000001',7),
 ('48000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000001',0);
SQL

snapshot_query() {
  docker exec "$container" psql -X -U postgres -d skia_prod -At -F '|' -c "$1"
}

counters_before="$(snapshot_query "
  SELECT 'rule',id::text,last_seq::text FROM naming_rules
    WHERE id IN ('48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000002')
  UNION ALL SELECT 'branch',nomenclature_id::text,last_seq::text FROM nomenclature_branch_counters
    WHERE nomenclature_id IN ('48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000002')
  UNION ALL SELECT 'placement',nomenclature_id::text,last_seq::text FROM nomenclature_counters
    WHERE nomenclature_id IN ('48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000002')
  ORDER BY 1,2")"
codes_before="$(snapshot_query "SELECT id::text,asset_type_id::text,location_id::text,nomenclature_id::text,nomenclature_sequence::text,internal_code FROM assets WHERE id='49000000-0000-4000-8000-000000000001'")"
rules_before="$(snapshot_query "SELECT id::text,tenant_id::text,asset_type_code,prefix,separator,include_branch::text,include_location::text,seq_digits::text,reset_per_location::text,last_seq::text,active::text,include_placement::text,include_site::text,include_internal_area::text FROM naming_rules WHERE id IN ('48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000002') ORDER BY id")"

docker exec "$container" cp /tmp/bootstrap.manifest.full /repo/ops/phase010/bootstrap.manifest
docker exec -e PGPASSWORD="$password" \
  -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null

counters_after="$(snapshot_query "
  SELECT 'rule',id::text,last_seq::text FROM naming_rules
    WHERE id IN ('48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000002')
  UNION ALL SELECT 'branch',nomenclature_id::text,last_seq::text FROM nomenclature_branch_counters
    WHERE nomenclature_id IN ('48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000002')
  UNION ALL SELECT 'placement',nomenclature_id::text,last_seq::text FROM nomenclature_counters
    WHERE nomenclature_id IN ('48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000002')
  ORDER BY 1,2")"
codes_after="$(snapshot_query "SELECT id::text,asset_type_id::text,location_id::text,nomenclature_id::text,nomenclature_sequence::text,internal_code FROM assets WHERE id='49000000-0000-4000-8000-000000000001'")"
rules_after="$(snapshot_query "SELECT id::text,tenant_id::text,asset_type_code,prefix,separator,include_branch::text,include_location::text,seq_digits::text,reset_per_location::text,last_seq::text,active::text,include_placement::text,include_site::text,include_internal_area::text FROM naming_rules WHERE id IN ('48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000002') ORDER BY id")"

[[ "$counters_before" == "$counters_after" ]]
[[ "$codes_before" == "$codes_after" ]]
[[ "$rules_before" == "$rules_after" ]]
[[ "$(snapshot_query "SELECT count(*) FROM naming_rules WHERE id IN ('48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000002') AND rule_version=1 AND context_mode='LEGACY_INTERNAL_AREA' AND include_zone=false AND supersedes_rule_id IS NULL")" == 2 ]]
[[ "$(snapshot_query "SELECT count(*) FROM naming_rules WHERE supersedes_rule_id IN ('48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000002')")" == 0 ]]

# The second full-bootstrap execution proves ledger/checksum idempotency after
# the real 025 -> 026 transition and preservation checks.
docker exec -e PGPASSWORD="$password" \
  -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES
 ('51000000-0000-4000-8000-000000000001','B1C tenant'),
 ('51000000-0000-4000-8000-000000000002','B1C other tenant');
INSERT INTO branches(id,tenant_id,code,name,status) VALUES
 ('52000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','B1','Primary','active'),
 ('52000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','B2','Other branch','active'),
 ('52000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000002','BX','Other tenant','active');
INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES
 ('53000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','SITE','Site','active'),
 ('53000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000002','SITE2','Site 2','active'),
 ('53000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000002','52000000-0000-4000-8000-000000000003','SITEX','Site X','active');
INSERT INTO floors(id,tenant_id,building_id,name) VALUES
 ('54000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','Floor'),
 ('54000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000002','Floor'),
 ('54000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000003','Floor');
INSERT INTO zones(id,tenant_id,branch_id,building_id,floor_id,code,name,status) VALUES
 ('55000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001','ZONE1','Zone 1','active'),
 ('55000000-0000-4000-8000-000000000004','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001','ZONE4','Zone 4','active'),
 ('55000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000002','54000000-0000-4000-8000-000000000002','ZONE2','Zone 2','active'),
 ('55000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000002','52000000-0000-4000-8000-000000000003','53000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000003','ZONEX','Zone X','active');
INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,floor_id,zone_id,code,name,status) VALUES
 ('56000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000001','AREA','Area','active'),
 ('56000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001',NULL,NULL,'LEGACY','Legacy area','active');

INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,status,internal_area_id) VALUES
 ('57000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','Legacy MDF','MDF','active','56000000-0000-4000-8000-000000000001'),
 ('57000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','Legacy IDF','IDF','active','56000000-0000-4000-8000-000000000001');
INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,status,zone_id) VALUES
 ('57000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','Zone MDF','MDF','active','55000000-0000-4000-8000-000000000001'),
 ('57000000-0000-4000-8000-000000000004','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','Zone IDF','IDF','active','55000000-0000-4000-8000-000000000001');
INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,status,zone_id,internal_area_id) VALUES
 ('57000000-0000-4000-8000-000000000005','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','Dual','MDF','active','55000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000001');

DO $$ BEGIN
  BEGIN
    INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,status) VALUES('57000000-0000-4000-8000-000000000006','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','Neither','MDF','active');
    RAISE EXCEPTION 'neither_reference_unexpectedly_allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,status,zone_id,internal_area_id) VALUES('57000000-0000-4000-8000-000000000007','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','Mismatch','MDF','active','55000000-0000-4000-8000-000000000004','56000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'dual_mismatch_unexpectedly_allowed';
  EXCEPTION WHEN foreign_key_violation OR check_violation THEN NULL; END;
  BEGIN
    INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,status,zone_id,internal_area_id) VALUES('57000000-0000-4000-8000-000000000008','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','Unprovable','MDF','active','55000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'dual_unprovable_unexpectedly_allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,status,zone_id) VALUES('57000000-0000-4000-8000-000000000009','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','Cross branch','MDF','active','55000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'cross_branch_zone_unexpectedly_allowed';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,status,zone_id) VALUES('57000000-0000-4000-8000-000000000010','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','Cross tenant','MDF','active','55000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'cross_tenant_zone_unexpectedly_allowed';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;

INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_site,include_internal_area,seq_digits,last_seq,active)
VALUES('58000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','MDF','MDF','-',true,true,true,3,0,true);
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_site,include_internal_area,include_zone,context_mode,seq_digits,last_seq,active)
VALUES('58000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','IDF','IDF','-',true,false,false,true,'CANONICAL_ZONE',3,0,true);

INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name)
SELECT '59000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',id,'57000000-0000-4000-8000-000000000001','MDF-B1-SITE-AREA-001','58000000-0000-4000-8000-000000000001',1,'Legacy code'
FROM asset_types WHERE code='MDF';
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name)
SELECT '59000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',id,'57000000-0000-4000-8000-000000000004','IDF-B1-ZONE1-001','58000000-0000-4000-8000-000000000002',1,'Zone code'
FROM asset_types WHERE code='IDF';

DO $$ BEGIN
  BEGIN
    INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name)
    SELECT '59000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',id,'57000000-0000-4000-8000-000000000002','IDF-B1-ZONE1-002','58000000-0000-4000-8000-000000000002',2,'No zone'
    FROM asset_types WHERE code='IDF';
    RAISE EXCEPTION 'zone_rule_fell_back_to_internal_area';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,active,rule_version,supersedes_rule_id,context_mode,include_zone,include_internal_area)
VALUES('58000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000001','MDF','MDF',false,2,'58000000-0000-4000-8000-000000000001','CANONICAL_ZONE',true,false);
DO $$ BEGIN
  BEGIN
    INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,active,rule_version,supersedes_rule_id,context_mode,include_zone,include_internal_area)
    VALUES('58000000-0000-4000-8000-000000000004','51000000-0000-4000-8000-000000000001','MDF','MDF',false,2,'58000000-0000-4000-8000-000000000001','CANONICAL_ZONE',true,false);
    RAISE EXCEPTION 'duplicate_rule_version_unexpectedly_allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,active,rule_version,supersedes_rule_id,context_mode,include_zone,include_internal_area)
    VALUES('58000000-0000-4000-8000-000000000005','51000000-0000-4000-8000-000000000002','MDF','MDF',false,2,'58000000-0000-4000-8000-000000000001','CANONICAL_ZONE',true,false);
    RAISE EXCEPTION 'cross_tenant_successor_unexpectedly_allowed';
  EXCEPTION WHEN foreign_key_violation OR check_violation THEN NULL; END;
END $$;

DO $$ BEGIN
 IF (SELECT internal_code FROM assets WHERE id='59000000-0000-4000-8000-000000000001')<>'MDF-B1-SITE-AREA-001' THEN RAISE EXCEPTION 'legacy_code_changed'; END IF;
 IF (SELECT internal_code FROM assets WHERE id='59000000-0000-4000-8000-000000000002')<>'IDF-B1-ZONE1-001' THEN RAISE EXCEPTION 'zone_code_invalid'; END IF;
 IF EXISTS(SELECT 1 FROM naming_rules WHERE id IN ('58000000-0000-4000-8000-000000000001','58000000-0000-4000-8000-000000000002') AND rule_version<>1) THEN RAISE EXCEPTION 'root_version_invalid'; END IF;
END $$;
SQL

ledger="$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc 'SELECT count(*) FROM production_bootstrap_migrations')"
schema_hash="$(docker exec "$container" pg_dump -U postgres -d skia_prod --schema-only --no-owner --no-privileges | sed '/^\\restrict /d;/^\\unrestrict /d' | shasum -a 256 | awk '{print $1}')"
[[ "$ledger" == 20 ]]

printf 'POSTGRES_VERSION=%s\n' "$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc 'SHOW server_version')"
printf 'SCHEMA_HASH=%s\nLEDGER_COUNT=%s\n' "$schema_hash" "$ledger"
printf 'COUNTERS_BEFORE=%s\nCOUNTERS_AFTER=%s\n' \
  "${counters_before//$'\n'/;}" "${counters_after//$'\n'/;}"
printf 'CODES_BEFORE=%s\nCODES_AFTER=%s\n' "$codes_before" "$codes_after"
printf '%s\n' 'FRESH_BOOTSTRAP=PASS' 'SECOND_BOOTSTRAP=PASS' \
  'PRE_026_FIXTURE_CREATED=PASS' 'MIGRATION_026_EXECUTED=PASS' \
  'VERSION_BACKFILL=PASS' 'NAMING_RULE_IDENTITY_PRESERVED=PASS' \
  'USED_RULE_SUCCESSOR_CREATED=NO' 'UNUSED_RULE_SUCCESSOR_CREATED=NO' \
  'COUNTERS_UNCHANGED=PASS' 'CODES_UNCHANGED=PASS' \
  'ASSET_IDENTITY_PRESERVED=PASS' 'USED_RULE_PRESERVED=PASS' \
  'UNUSED_RULE_PRESERVED=PASS' \
  'LEGACY_INTERNAL_AREA_MDF=PASS' 'LEGACY_INTERNAL_AREA_IDF=PASS' \
  'ZONE_ONLY_MDF=PASS' 'ZONE_ONLY_IDF=PASS' 'DUAL_MATCHING=PASS' \
  'DUAL_MISMATCH=DENIED' 'DUAL_UNPROVABLE=DENIED' 'NEITHER_REFERENCE=DENIED' \
  'CROSS_TENANT_ZONE=DENIED' 'CROSS_BRANCH_ZONE=DENIED' \
  'LEGACY_NAMING_CONTEXT=PASS' 'CANONICAL_ZONE_NAMING_CONTEXT=PASS' \
  'ZONE_MODE_LEGACY_FALLBACK=DENIED' 'RULE_VERSION_INTEGRITY=PASS' \
  'ZONE_NAMING_CONTEXT_COMPATIBILITY=APPROVED'
