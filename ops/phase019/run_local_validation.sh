#!/usr/bin/env bash
set -euo pipefail

die() { printf 'BLOCKED: %s\n' "$*" >&2; exit 1; }
[[ "${PHASE019_LOCAL_TEST_APPROVAL:-}" == PHASE019_EPHEMERAL_POSTGRES_APPROVED ]] || die 'explicit local-test approval missing'
command -v docker >/dev/null || die 'docker is required'

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-phase019-nomenclature-$$"
password='phase019-local-only'
runtime_password='phase019-runtime-only'
migrator_password='phase019-migrator-only'
onboarding_password='phase019-onboarding-only'
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$container" -p 127.0.0.1::5432 \
  -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod \
  -v "$repo_root:/repo:ro" postgres:16-alpine >/dev/null
until docker exec -e PGPASSWORD="$password" "$container" pg_isready -U postgres -d skia_prod >/dev/null 2>&1; do sleep 1; done

provision() {
  docker exec -e PGPASSWORD="$password" "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
    -v migrator_password="$migrator_password" -v runtime_password="$runtime_password" \
    -v onboarding_password="$onboarding_password" -f /repo/ops/phase011/provision_database_roles.sql >/dev/null
}
provision

docker exec -e PHASE010_DATABASE_URL="postgresql://skia_migrator:${migrator_password}@localhost/skia_prod" "$container" \
  /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null
provision
docker exec -e PGPASSWORD="$password" "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -v phase011_environment=production -v expected_database=skia_prod \
  -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED \
  -f /repo/ops/phase011/activate_clean_production_rls.sql >/dev/null
docker exec -e PGPASSWORD="$password" "$container" psql -X -U postgres -d skia_prod \
  -f /repo/ops/phase011/validate_runtime_auth_role.sql >/dev/null

port="$(docker port "$container" 5432/tcp | awk -F: '{print $NF}')"
pushd "$repo_root/backend" >/dev/null
ASSET_NOMENCLATURE_TEST_DATABASE_URL="postgresql://postgres:${password}@127.0.0.1:${port}/skia_prod?sslmode=disable" \
ASSET_NOMENCLATURE_RUNTIME_TEST_DATABASE_URL="postgresql://skia_runtime:${runtime_password}@127.0.0.1:${port}/skia_prod?sslmode=disable" \
GOCACHE="${TMPDIR:-/tmp}/skia-phase019-go-cache" \
  go test -run '^(TestAssetNomenclatureConcurrentSequence|TestSpecializedHandlerRollbackIsAtomic|TestPlacementScopedCountersAndWarehouseStatus|TestSelectedBranchSessionMatchesTenantTxGUCAndAsset)$' -count=1 ./...
popd >/dev/null

docker exec -i -e PGPASSWORD="$password" "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES ('81000000-0000-0000-0000-000000000001','Negative validation');
INSERT INTO branches(id,tenant_id,name) VALUES ('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','A');
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,last_seq,active,include_branch)
VALUES ('84000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','SWITCH','SW',0,true,false);
DO $$
BEGIN
  BEGIN
    INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name)
    SELECT '83000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001',
      '82000000-0000-0000-0000-000000000001',id,'SW-MANUAL-001','Forbidden'
    FROM asset_types WHERE code='SWITCH';
    RAISE EXCEPTION 'asset without nomenclature unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SQL

# Positive runtime create and direct RLS visibility, using only the allow-list.
docker exec -i -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
BEGIN;
SELECT set_config('app.tenant_id','81000000-0000-0000-0000-000000000001',true);
SELECT set_config('app.branch_id','82000000-0000-0000-0000-000000000001',true);
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,last_seq,active,include_branch)
VALUES ('84000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000001','RACK','RK',0,true,false);
UPDATE naming_rules SET last_seq=last_seq+1 WHERE id='84000000-0000-0000-0000-000000000001';
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name,nomenclature_id,nomenclature_sequence)
SELECT '85000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001',
       '82000000-0000-0000-0000-000000000001',id,'SW-0001','Runtime switch',
       '84000000-0000-0000-0000-000000000001',1 FROM asset_types WHERE code='SWITCH';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM assets WHERE id='85000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'managed asset insert produced no row';
  END IF;
END $$;
INSERT INTO switches(id,asset_id,tenant_id,branch_id)
VALUES ('86000000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000001',
        '81000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001');
SELECT id FROM switches WHERE id='86000000-0000-0000-0000-000000000001';
COMMIT;
SQL

# The normative row is tenant-scoped, must begin at sequence zero, and its
# structure becomes immutable after the first issued sequence. Metadata/state
# remain editable because they do not rewrite an already-issued identity.
if docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -v ON_ERROR_STOP=1 \
  -c "BEGIN; SELECT set_config('app.tenant_id','81000000-0000-0000-0000-000000000001',true); INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,last_seq) VALUES ('84000000-0000-0000-0000-000000000003','81000000-0000-0000-0000-000000000001','PDU','PDU',7); COMMIT;" >/dev/null 2>&1; then
  die 'runtime unexpectedly created a rule with client-controlled last_seq'
fi
if docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -v ON_ERROR_STOP=1 \
  -c "BEGIN; SELECT set_config('app.tenant_id','81000000-0000-0000-0000-000000000001',true); UPDATE naming_rules SET prefix='DETACHED' WHERE id='84000000-0000-0000-0000-000000000001'; COMMIT;" >/dev/null 2>&1; then
  die 'issued nomenclature structure was unexpectedly mutable'
fi
docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -v ON_ERROR_STOP=1 \
  -c "BEGIN; SELECT set_config('app.tenant_id','81000000-0000-0000-0000-000000000001',true); UPDATE naming_rules SET description='Operational metadata',active=false WHERE id='84000000-0000-0000-0000-000000000001'; COMMIT;" >/dev/null

# Without the request transaction GUCs, FORCE RLS exposes neither rules nor
# satellite rows even though the role has the exact table privileges.
global_visibility="$(docker exec -e PGPASSWORD="$runtime_password" "$container" \
  psql -X -U skia_runtime -d skia_prod -Atqc \
  "SELECT (SELECT count(*)::text FROM naming_rules)||(SELECT count(*)::text FROM switches)")"
[[ "$global_visibility" == '00' ]] || die "global connection bypassed FORCE RLS: $global_visibility"

managed_visibility="$(docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -Atqc \
  "BEGIN; SELECT set_config('app.tenant_id','81000000-0000-0000-0000-000000000001',true); SELECT set_config('app.branch_id','82000000-0000-0000-0000-000000000001',true); SELECT count(*) FROM assets WHERE id='85000000-0000-0000-0000-000000000001'; ROLLBACK;")"
if [[ "$managed_visibility" != *$'\n1' ]]; then
  managed_admin="$(docker exec -e PGPASSWORD="$password" "$container" psql -X -U postgres -d skia_prod -Atqc \
    "SELECT id||'|'||tenant_id||'|'||branch_id FROM assets WHERE id='85000000-0000-0000-0000-000000000001'")"
  die "managed asset not visible in its tenant transaction: $managed_visibility admin=$managed_admin"
fi

# A different context cannot see the rule or satellite record.
visibility="$(docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -Atqc \
  "BEGIN; SELECT set_config('app.tenant_id','00000000-0000-0000-0000-000000000001',true); SELECT set_config('app.branch_id','00000000-0000-0000-0000-000000000002',true); SELECT (SELECT count(*)::text FROM naming_rules)||(SELECT count(*)::text FROM switches); ROLLBACK;")"
[[ "$visibility" == *$'\n00' || "$visibility" == '00' ]] || die "cross-tenant visibility detected: $visibility"

expect_managed_update_denied() {
  local assignment="$1"
  if docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -v ON_ERROR_STOP=1 \
    -c "BEGIN; SELECT set_config('app.tenant_id','81000000-0000-0000-0000-000000000001',true); SELECT set_config('app.branch_id','82000000-0000-0000-0000-000000000001',true); UPDATE assets SET ${assignment} WHERE id='85000000-0000-0000-0000-000000000001'; COMMIT;" >/dev/null 2>&1; then
    die "managed identity update unexpectedly accepted: $assignment"
  fi
}
expect_managed_update_denied 'nomenclature_id=NULL'
expect_managed_update_denied 'nomenclature_sequence=NULL'
expect_managed_update_denied "asset_type_id=(SELECT id FROM asset_types WHERE code='RACK')"
expect_managed_update_denied "tenant_id='00000000-0000-0000-0000-000000000001'"
expect_managed_update_denied "internal_code='MANUAL-DETACHED'"

if docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -v ON_ERROR_STOP=1 \
  -c "BEGIN; SELECT set_config('app.tenant_id','81000000-0000-0000-0000-000000000001',true); SELECT set_config('app.branch_id','82000000-0000-0000-0000-000000000001',true); INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name,nomenclature_id,nomenclature_sequence) SELECT '88000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001',id,'ARBITRARY-CODE','Detached code','84000000-0000-0000-0000-000000000001',2 FROM asset_types WHERE code='SWITCH'; COMMIT;" >/dev/null 2>&1; then
  die 'runtime unexpectedly inserted code disconnected from nomenclature identity'
fi

# Simulate a pre-migration row and prove ordinary legacy updates remain valid.
docker exec -i -e PGPASSWORD="$password" "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
ALTER TABLE assets DISABLE TRIGGER trg_enforce_asset_nomenclature;
ALTER TABLE assets DISABLE TRIGGER trg_enforce_asset_nomenclature_update;
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name)
SELECT '87000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001',
       '82000000-0000-0000-0000-000000000001',id,'LEGACY-SW-1','Legacy switch'
FROM asset_types WHERE code='SWITCH';
ALTER TABLE assets ENABLE TRIGGER trg_enforce_asset_nomenclature;
ALTER TABLE assets ENABLE TRIGGER trg_enforce_asset_nomenclature_update;
SQL
docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -v ON_ERROR_STOP=1 \
  -c "BEGIN; SELECT set_config('app.tenant_id','81000000-0000-0000-0000-000000000001',true); SELECT set_config('app.branch_id','82000000-0000-0000-0000-000000000001',true); UPDATE assets SET name='Legacy switch updated' WHERE id='87000000-0000-0000-0000-000000000001'; COMMIT;" >/dev/null

if docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -v ON_ERROR_STOP=1 \
  -c "BEGIN; SELECT set_config('app.tenant_id','81000000-0000-0000-0000-000000000001',true); SELECT set_config('app.branch_id','82000000-0000-0000-0000-000000000001',true); UPDATE switches SET port_count=48;" >/dev/null 2>&1; then
  die 'runtime unexpectedly updated satellite table'
fi

schema_hash="$(docker exec -e PGPASSWORD="$migrator_password" "$container" \
  pg_dump -U skia_migrator -d skia_prod --schema-only --no-owner --no-privileges |
  sed '/^\\restrict /d;/^\\unrestrict /d' | sha256sum | awk '{print $1}')"
printf 'SCHEMA_HASH=%s\n' "$schema_hash"
printf 'PHASE019_ASSET_NOMENCLATURE_VALIDATION=APPROVED\n'
