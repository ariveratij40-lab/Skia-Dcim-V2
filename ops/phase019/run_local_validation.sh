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
GOCACHE="${TMPDIR:-/tmp}/skia-phase019-go-cache" \
  go test -run '^TestAssetNomenclatureConcurrentSequence$' -count=1 ./...
popd >/dev/null

docker exec -e PGPASSWORD="$password" "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES ('81000000-0000-0000-0000-000000000001','Negative validation');
INSERT INTO branches(id,tenant_id,name) VALUES ('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','A');
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,last_seq,active)
VALUES ('84000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','SWITCH','SW',0,true);
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
docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
BEGIN;
SELECT set_config('app.tenant_id','81000000-0000-0000-0000-000000000001',true);
SELECT set_config('app.branch_id','82000000-0000-0000-0000-000000000001',true);
UPDATE naming_rules SET last_seq=last_seq+1 WHERE id='84000000-0000-0000-0000-000000000001';
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name,nomenclature_id,nomenclature_sequence)
SELECT '85000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001',
       '82000000-0000-0000-0000-000000000001',id,'SW-0001','Runtime switch',
       '84000000-0000-0000-0000-000000000001',1 FROM asset_types WHERE code='SWITCH';
INSERT INTO switches(id,asset_id,tenant_id,branch_id)
VALUES ('86000000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000001',
        '81000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001');
SELECT id FROM switches WHERE id='86000000-0000-0000-0000-000000000001';
COMMIT;
SQL

# A different context cannot see the rule or satellite record.
visibility="$(docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -Atqc \
  "BEGIN; SELECT set_config('app.tenant_id','00000000-0000-0000-0000-000000000001',true); SELECT set_config('app.branch_id','00000000-0000-0000-0000-000000000002',true); SELECT (SELECT count(*)::text FROM naming_rules)||(SELECT count(*)::text FROM switches); ROLLBACK;")"
[[ "$visibility" == *$'\n00' || "$visibility" == '00' ]] || die "cross-tenant visibility detected: $visibility"

if docker exec -e PGPASSWORD="$runtime_password" "$container" psql -X -U skia_runtime -d skia_prod -v ON_ERROR_STOP=1 \
  -c "BEGIN; SELECT set_config('app.tenant_id','81000000-0000-0000-0000-000000000001',true); SELECT set_config('app.branch_id','82000000-0000-0000-0000-000000000001',true); UPDATE switches SET port_count=48;" >/dev/null 2>&1; then
  die 'runtime unexpectedly updated satellite table'
fi

schema_hash="$(docker exec -e PGPASSWORD="$migrator_password" "$container" \
  pg_dump -U skia_migrator -d skia_prod --schema-only --no-owner --no-privileges |
  sed '/^\\restrict /d;/^\\unrestrict /d' | sha256sum | awk '{print $1}')"
printf 'SCHEMA_HASH=%s\n' "$schema_hash"
printf 'PHASE019_ASSET_NOMENCLATURE_VALIDATION=APPROVED\n'
