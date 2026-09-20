#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-b2d-upgrades-$$"
password=b2d_disposable_only
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run --name "$container" -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod -d postgres:16.14-alpine >/dev/null
for _ in {1..40}; do docker exec "$container" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$container" mkdir /repo
docker cp "$repo_root/ops" "$container:/repo/ops"
docker cp "$repo_root/migrations" "$container:/repo/migrations"
q(){ docker exec "$container" psql -X -U postgres -d "$db_name" -Atqc "$1"; }
provision(){ docker exec "$container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" -f /repo/ops/phase011/provision_database_roles.sql >/dev/null; }
bootstrap(){ docker exec -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/$db_name" "$container" bash "$1/ops/phase010/run_clean_bootstrap.sh" >/dev/null; }
db_name=skia_prod
provision
for version in 035 036 037 038; do
 db_name="upgrade_$version"
 docker exec "$container" createdb -U postgres -O skia_migrator "$db_name"
 provision
 docker exec "$container" sh -c "cp -a /repo /pre$version; awk '1; /migrations\/${version}_/{exit}' /repo/ops/phase010/bootstrap.manifest > /pre$version/ops/phase010/bootstrap.manifest"
 bootstrap "/pre$version"
 docker exec -i "$container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO tenants(id,name) VALUES('f2000000-0000-4000-8000-000000000001','B2d upgrade');
INSERT INTO branches(id,tenant_id,code,name) VALUES('f2100000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','UP','Upgrade');
SELECT set_config('app.tenant_id','f2000000-0000-4000-8000-000000000001',false);
SELECT set_config('app.branch_id','f2100000-0000-4000-8000-000000000001',false);
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,include_branch,seq_digits,last_seq,active) VALUES('f2200000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','SERVER','SRV',true,4,0,true);
UPDATE naming_rules SET last_seq=7 WHERE id='f2200000-0000-4000-8000-000000000001';
INSERT INTO nomenclature_branch_counters(nomenclature_id,tenant_id,branch_id,last_seq) VALUES('f2200000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001',7);
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name,nomenclature_id,nomenclature_sequence) SELECT 'f2300000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001',id,'SRV-UP-0007','Historical server','f2200000-0000-4000-8000-000000000001',7 FROM asset_types WHERE code='SERVER';
SQL
 # 037 adds derived scope columns, not changes to historical asset identity.
 snapshot="SELECT jsonb_build_object('tenants',(SELECT jsonb_agg(to_jsonb(t)) FROM tenants t),'branches',(SELECT jsonb_agg(to_jsonb(b)) FROM branches b),'assets',(SELECT jsonb_agg(to_jsonb(a)-'nomenclature_sequence_scope'-'nomenclature_sequence_scope_location_id') FROM assets a),'counters',(SELECT jsonb_agg(to_jsonb(c)) FROM nomenclature_branch_counters c),'rule',(SELECT jsonb_build_array(id,tenant_id,asset_type_code,prefix,seq_digits,last_seq,active) FROM naming_rules WHERE id='f2200000-0000-4000-8000-000000000001'))"
 before="$(q "$snapshot")"
 bootstrap /repo
 bootstrap /repo
 provision
 docker exec "$container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 -v phase011_environment=production -v expected_database="$db_name" -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED -f /repo/ops/phase011/activate_clean_production_rls.sql >/dev/null
 [[ "$(q "$snapshot")" == "$before" ]]
 [[ "$(q 'SELECT count(*) FROM production_bootstrap_migrations')" == 31 ]]
 [[ "$(q "SELECT count(*) FROM production_bootstrap_migrations WHERE path='migrations/039_nomenclature_operation_binding.sql'")" == 1 ]]
 hash="$(docker exec "$container" pg_dump -U skia_migrator -d "$db_name" --schema-only --no-owner --no-privileges | sed '/^\\restrict /d;/^\\unrestrict /d' | shasum -a 256 | awk '{print $1}')"
 [[ "$hash" == e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6 ]]
 echo "POST${version}_UPGRADE=PASS DATA_IDENTITIES_COUNTERS=PRESERVED LEDGER=31 MIGRATION_039_COUNT=1 HASH=$hash"
done
