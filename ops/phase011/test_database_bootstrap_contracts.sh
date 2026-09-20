#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
password="r1c_upgrade_test_only"
containers=()
roots=()
cleanup() {
  for container in "${containers[@]-}"; do [[ -n "$container" ]] && docker rm -f "$container" >/dev/null 2>&1 || true; done
  for root in "${roots[@]-}"; do [[ -n "$root" ]] && rm -rf "$root"; done
}
trap cleanup EXIT

new_scenario() {
  local name="$1" container root
  container="skia-r1c-${name}-$$"
  root="$(mktemp -d "/tmp/skia-r1c-${name}.XXXXXX")"
  containers+=("$container")
  roots+=("$root")
  mkdir -p "$root/source" "$root/runtime" "$root/secrets"
  cp -R "$repo_root/." "$root/source/"
  cp "$repo_root/ops/phase011/provision_database_roles.sql" "$root/runtime/provision_database_roles.sql"
  cat > "$root/secrets/production.env" <<EOF
POSTGRES_BOOTSTRAP_PASSWORD=$password
SKIA_MIGRATOR_DB_PASSWORD=$password
SKIA_RUNTIME_DB_PASSWORD=$password
SKIA_ONBOARDING_DB_PASSWORD=$password
EOF
  docker run --name "$container" \
    -e POSTGRES_USER=skia_bootstrap -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod \
    -d postgres:16.14-alpine >/dev/null
  for _ in {1..40}; do
    docker exec "$container" pg_isready -U skia_bootstrap -d skia_prod >/dev/null 2>&1 && break
    sleep 1
  done
  docker exec "$container" pg_isready -U skia_bootstrap -d skia_prod >/dev/null
  SCENARIO_CONTAINER="$container"
  SCENARIO_ROOT="$root"
}

provision() {
  local container="$1"
  docker exec -i "$container" psql -X -U skia_bootstrap -d skia_prod -v ON_ERROR_STOP=1 \
    -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" \
    < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null
}

prepare_pre035() {
  local container="$1" root="$2"
  provision "$container"
  docker cp "$root/source/." "$container:/repo"
  docker exec "$container" sh -ceu \
    "cp -a /repo /repo-pre035; sed -i -e '/035_remove_legacy_rack_authorities.sql/d' -e '/036_nomenclature_v2_foundation.sql/d' -e '/037_nomenclature_v2_enforcement_audit_writer.sql/d' -e '/038_nomenclature_v2_acceptance_function_contract.sql/d' -e '/039_nomenclature_operation_binding.sql/d' /repo-pre035/ops/phase010/bootstrap.manifest"
  docker exec -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" \
    "$container" /repo-pre035/ops/phase010/run_clean_bootstrap.sh >/dev/null
}

activate_rls() {
  local container="$1"
  provision "$container"
  docker exec -i "$container" psql -X -U skia_bootstrap -d skia_prod -v ON_ERROR_STOP=1 \
    -v phase011_environment=production -v expected_database=skia_prod \
    -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED \
    -f /repo/ops/phase011/activate_clean_production_rls.sql >/dev/null
}

run_contract() {
  local container="$1" root="$2" contract="$3"
  SKIA_PROD_ROOT="$root" SKIA_POSTGRES_CONTAINER="$container" SKIA_DATABASE_CONTRACT="$contract" \
    "$repo_root/ops/phase011/run_database_bootstrap.sh"
}

counts() {
  docker exec "$1" psql -X -U skia_bootstrap -d skia_prod -Atqc \
    "SELECT (SELECT count(*) FROM tenants)||'|'||(SELECT count(*) FROM users)||'|'||(SELECT count(*) FROM assets)"
}

migrator_counts() {
  docker exec -e PGPASSWORD="$password" "$1" \
    psql -X -U skia_migrator -d skia_prod -Atqc \
    "SELECT (SELECT count(*) FROM tenants)||'|'||(SELECT count(*) FROM users)||'|'||(SELECT count(*) FROM assets)"
}

legacy_column_count() {
  docker exec "$1" psql -X -U skia_bootstrap -d skia_prod -Atqc \
    "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('switches','patch_panels','pdus') AND column_name='rack_id'"
}

require_equal() {
  local actual="$1" expected="$2" label="$3"
  if [[ "$actual" != "$expected" ]]; then
    printf 'assertion failed: %s expected=%s actual=%s\n' "$label" "$expected" "$actual" >&2
    exit 1
  fi
}

insert_representative_data() {
  docker exec -i "$1" psql -X -U skia_bootstrap -d skia_prod -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO tenants(id,name) VALUES('c1000000-0000-4000-8000-000000000001','R1C tenant');
INSERT INTO users(id,email,name,password_hash) VALUES('c1100000-0000-4000-8000-000000000001','r1c@example.invalid','R1C user','not-a-real-password-hash');
INSERT INTO branches(id,tenant_id,code,name,status) VALUES('c1200000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','R1C','R1C branch','active');
INSERT INTO asset_types(id,code,name,requires_nomenclature) VALUES('c1300000-0000-4000-8000-000000000001','R1C_LEGACY','R1C legacy asset',false);
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,seq_digits,last_seq,active)
VALUES('c1350000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','R1C_LEGACY','R1C','-',false,3,0,true);
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,nomenclature_id,nomenclature_sequence,name)
VALUES('c1400000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','c1300000-0000-4000-8000-000000000001','R1C-001','c1350000-0000-4000-8000-000000000001',1,'R1C asset');
SQL
}

insert_valid_legacy_rack_value() {
  docker exec -i "$1" psql -X -U skia_bootstrap -d skia_prod -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
BEGIN;
INSERT INTO tenants(id,name) VALUES('d1000000-0000-4000-8000-000000000001','R1C fail tenant');
INSERT INTO branches(id,tenant_id,code,name,status) VALUES('d1200000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','FAIL','Fail branch','active');
SELECT set_config('app.tenant_id','d1000000-0000-4000-8000-000000000001',false);
SELECT set_config('app.branch_id','d1200000-0000-4000-8000-000000000001',false);
INSERT INTO zones(id,tenant_id,branch_id,code,name) VALUES('d1300000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','Z1','Zone 1');
INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,placement_code,status,zone_id,physical_identity,physical_identity_governed)
VALUES('d1400000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','MDF','MDF','MDF01','active','d1300000-0000-4000-8000-000000000001',NULL,false);
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_zone,context_mode,seq_digits,last_seq,active)
SELECT gen_random_uuid(),'d1000000-0000-4000-8000-000000000001',code,code,'-',true,code='MDF',CASE WHEN code='MDF' THEN 'CANONICAL_ZONE' ELSE 'LEGACY_INTERNAL_AREA' END,3,0,true
FROM asset_types WHERE code IN ('MDF','RACK','SWITCH');
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,mount_mode)
SELECT 'd1500000-0000-4000-8000-000000000001',nr.tenant_id,'d1200000-0000-4000-8000-000000000001',at.id,'d1400000-0000-4000-8000-000000000001','MDF-FAIL-Z1-001',nr.id,1,'MDF','NONE'
FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.asset_type_code='MDF' AND nr.tenant_id='d1000000-0000-4000-8000-000000000001';
INSERT INTO mdf_idf(id,asset_id,tenant_id,branch_id,type) VALUES('d1600000-0000-4000-8000-000000000001','d1500000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','MDF');
UPDATE locations SET asset_id='d1500000-0000-4000-8000-000000000001',physical_identity='MDF01',physical_identity_governed=true WHERE id='d1400000-0000-4000-8000-000000000001';
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,mount_mode)
SELECT 'd1500000-0000-4000-8000-000000000002',nr.tenant_id,'d1200000-0000-4000-8000-000000000001',at.id,'d1400000-0000-4000-8000-000000000001','RACK-FAIL-001',nr.id,1,'Rack','NONE'
FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.asset_type_code='RACK' AND nr.tenant_id='d1000000-0000-4000-8000-000000000001';
INSERT INTO racks(id,asset_id,tenant_id,branch_id,mdf_idf_id) VALUES('d1700000-0000-4000-8000-000000000001','d1500000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','d1600000-0000-4000-8000-000000000001');
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,mount_mode,housing_rack_id)
SELECT 'd1500000-0000-4000-8000-000000000003',nr.tenant_id,'d1200000-0000-4000-8000-000000000001',at.id,'d1400000-0000-4000-8000-000000000001','SWITCH-FAIL-001',nr.id,1,'Switch','RACK_MOUNTED','d1700000-0000-4000-8000-000000000001'
FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.asset_type_code='SWITCH' AND nr.tenant_id='d1000000-0000-4000-8000-000000000001';
INSERT INTO switches(id,asset_id,tenant_id,branch_id,rack_id) VALUES('d1800000-0000-4000-8000-000000000001','d1500000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','d1700000-0000-4000-8000-000000000001');
COMMIT;
SQL
}

new_scenario clean
clean_container="$SCENARIO_CONTAINER"
clean_root="$SCENARIO_ROOT"
prepare_pre035 "$clean_container" "$clean_root"
activate_rls "$clean_container"
clean_output="$(run_contract "$clean_container" "$clean_root" clean)"
grep -q '^EMPTY_DATABASE_GUARD=APPROVED$' <<<"$clean_output"
grep -q '^LEDGER_COUNT=31$' <<<"$clean_output"
grep -q '^SCHEMA_HASH=e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6$' <<<"$clean_output"

new_scenario upgrade
upgrade_container="$SCENARIO_CONTAINER"
upgrade_root="$SCENARIO_ROOT"
prepare_pre035 "$upgrade_container" "$upgrade_root"
activate_rls "$upgrade_container"
insert_representative_data "$upgrade_container"
upgrade_pre="$(counts "$upgrade_container")"
require_equal "$upgrade_pre" '1|1|1' 'existing pre-upgrade counts'
upgrade_migrator_pre="$(migrator_counts "$upgrade_container")"
require_equal "$upgrade_migrator_pre" '1|1|0' 'restricted migrator FORCE RLS visibility'
upgrade_output="$(run_contract "$upgrade_container" "$upgrade_root" upgrade)"
upgrade_post="$(counts "$upgrade_container")"
require_equal "$upgrade_post" "$upgrade_pre" 'existing post-upgrade counts'
grep -q '^EXISTING_DATA_PRESERVATION=APPROVED$' <<<"$upgrade_output"
grep -q '^SCHEMA_HASH=e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6$' <<<"$upgrade_output"
[[ "$(docker exec "$upgrade_container" psql -X -U skia_bootstrap -d skia_prod -Atqc "SELECT count(*) FROM production_bootstrap_migrations WHERE path='migrations/035_remove_legacy_rack_authorities.sql'")" == 1 ]]
require_equal "$(legacy_column_count "$upgrade_container")" 0 'post-upgrade legacy columns removed'

idempotent_output="$(run_contract "$upgrade_container" "$upgrade_root" upgrade)"
grep -q '^EXISTING_DATA_PRESERVATION=APPROVED$' <<<"$idempotent_output"
grep -q '^SCHEMA_HASH=e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6$' <<<"$idempotent_output"
[[ "$(counts "$upgrade_container")" == "$upgrade_pre" ]]
[[ "$(docker exec "$upgrade_container" psql -X -U skia_bootstrap -d skia_prod -Atqc "SELECT count(*) FROM production_bootstrap_migrations WHERE path='migrations/035_remove_legacy_rack_authorities.sql'")" == 1 ]]
require_equal "$(legacy_column_count "$upgrade_container")" 0 'post-035 rerun legacy columns remain absent'

new_scenario fail
fail_container="$SCENARIO_CONTAINER"
fail_root="$SCENARIO_ROOT"
prepare_pre035 "$fail_container" "$fail_root"
activate_rls "$fail_container"
insert_valid_legacy_rack_value "$fail_container"
fail_pre="$(counts "$fail_container")"
require_equal "$(docker exec "$fail_container" psql -X -U skia_bootstrap -d skia_prod -Atqc 'SELECT count(*) FROM switches WHERE rack_id IS NOT NULL')" 1 'legacy Rack precondition'
set +e
run_contract "$fail_container" "$fail_root" upgrade >/tmp/skia-r1c-fail-output-$$ 2>&1
fail_rc=$?
set -e
if [[ "$fail_rc" == 0 ]]; then echo 'fail-closed runner unexpectedly succeeded' >&2; exit 1; fi
require_equal "$(counts "$fail_container")" "$fail_pre" 'fail-closed data preservation'
require_equal "$(docker exec "$fail_container" psql -X -U skia_bootstrap -d skia_prod -Atqc "SELECT count(*) FROM production_bootstrap_migrations WHERE path='migrations/035_remove_legacy_rack_authorities.sql'")" 0 'fail-closed Migration 035 ledger'
require_equal "$(docker exec "$fail_container" psql -X -U skia_bootstrap -d skia_prod -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('switches','patch_panels','pdus') AND column_name='rack_id'")" 3 'fail-closed legacy schema preservation'
rm -f /tmp/skia-r1c-fail-output-$$

printf 'POSTGRES_VERSION=16.14\nCLEAN_BOOTSTRAP=PASS\nCLEAN_LEDGER_COUNT=31\nCLEAN_EMPTY_GUARD=PASS\n'
printf 'PRE035_FORCE_RLS_UPGRADE=PASS\nPRE035_PRE_COUNTS=%s\nPRE035_RESTRICTED_MIGRATOR_COUNTS=%s\nPRE035_POST_COUNTS=%s\nPRE035_MIGRATION_035_COUNT=1\n' "$upgrade_pre" "$upgrade_migrator_pre" "$upgrade_post"
printf 'POST035_EXISTING_DATABASE=PASS\nPOST035_PRE_COUNTS=%s\nPOST035_POST_COUNTS=%s\nPOST035_MIGRATION_035_COUNT=1\n' "$upgrade_pre" "$(counts "$upgrade_container")"
printf 'EXISTING_FINGERPRINT_MATCH=PASS\nIDEMPOTENCY_WITH_DATA=PASS\nFAIL_CLOSED_WITH_DATA=PASS\nFAIL_CLOSED_RUNNER_EXIT=%s\nNEW_REGRESSIONS=NONE\n' "$fail_rc"
