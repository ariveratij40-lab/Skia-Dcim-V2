#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-hf3-033-$$"
password="hf3_033_test_only"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --name "$container" -p 127.0.0.1::5432 -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod -d postgres:16.14-alpine >/dev/null
for _ in {1..30}; do docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null 2>&1 && break; sleep 1; done
docker cp "$repo_root/." "$container:/repo"
docker exec "$container" sh -c "cp -a /repo /repo-pre033 && sed -i '/033_canonical_zone_naming_provisioning.sql/d' /repo-pre033/ops/phase010/bootstrap.manifest"
provision(){ docker exec -i "$container" psql -X -U postgres -d "$1" -v ON_ERROR_STOP=1 -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null; }
bootstrap_pre(){ docker exec -e PGPASSWORD="$password" -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/$1" "$container" /repo-pre033/ops/phase010/run_clean_bootstrap.sh >/dev/null; }
bootstrap_full(){ docker exec -e PGPASSWORD="$password" -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/$1" "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null; }
q(){ docker exec "$container" psql -X -U postgres -d skia_prod -Atqc "$1"; }

provision skia_prod
bootstrap_pre skia_prod
provision skia_prod
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES
 ('33000000-0000-4000-8000-000000000001','Legacy'),
 ('33000000-0000-4000-8000-000000000002','Missing'),
 ('33000000-0000-4000-8000-000000000003','Canonical');
INSERT INTO branches(id,tenant_id,code,name,status) VALUES
 ('33400000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','B1','Branch 1','active');
INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES
 ('33500000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','33400000-0000-4000-8000-000000000001','SITE1','Site 1','active');
SELECT set_config('app.tenant_id','33000000-0000-4000-8000-000000000001',false);
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_site,include_internal_area,include_zone,context_mode,seq_digits,last_seq,active)
VALUES
 ('33100000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','MDF','MDF','-',true,true,true,false,'LEGACY_INTERNAL_AREA',3,0,true);
UPDATE naming_rules SET last_seq=7 WHERE id='33100000-0000-4000-8000-000000000001';
SELECT set_config('app.tenant_id','33000000-0000-4000-8000-000000000003',false);
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_site,include_internal_area,include_zone,include_placement,include_location,reset_per_location,context_mode,seq_digits,last_seq,active)
VALUES
 ('33100000-0000-4000-8000-000000000003','33000000-0000-4000-8000-000000000003','MDF','MDF','-',true,false,false,true,false,false,false,'CANONICAL_ZONE',3,0,true),
 ('33100000-0000-4000-8000-000000000004','33000000-0000-4000-8000-000000000003','IDF','IDF','-',true,false,false,true,false,false,false,'CANONICAL_ZONE',3,0,true);
UPDATE naming_rules SET last_seq=CASE asset_type_code WHEN 'MDF' THEN 4 ELSE 5 END
WHERE tenant_id='33000000-0000-4000-8000-000000000003';
SQL
docker exec "$container" psql -X -U skia_migrator -d skia_prod -v ON_ERROR_STOP=1 -1 -f /repo/migrations/033_canonical_zone_naming_provisioning.sql >/dev/null

[[ "$(q "SELECT count(*) FROM naming_rules WHERE tenant_id='33000000-0000-4000-8000-000000000001' AND context_mode='LEGACY_INTERNAL_AREA' AND NOT active")" == 1 ]]
[[ "$(q "SELECT count(*) FROM naming_rules WHERE tenant_id='33000000-0000-4000-8000-000000000001' AND context_mode='CANONICAL_ZONE' AND active AND include_branch AND include_zone AND NOT include_site AND NOT include_internal_area AND NOT include_placement AND last_seq=0")" == 2 ]]
[[ "$(q "SELECT count(*) FROM naming_rules c JOIN naming_rules p ON p.id=c.supersedes_rule_id WHERE c.tenant_id='33000000-0000-4000-8000-000000000001' AND c.rule_version=p.rule_version+1")" == 1 ]]
[[ "$(q "SELECT count(*) FROM naming_rules WHERE tenant_id='33000000-0000-4000-8000-000000000002' AND active AND context_mode='CANONICAL_ZONE' AND rule_version=1 AND supersedes_rule_id IS NULL")" == 2 ]]
[[ "$(q "SELECT sum(last_seq) FROM naming_rules WHERE tenant_id='33000000-0000-4000-8000-000000000003' AND active")" == 9 ]]
before="$(q 'SELECT count(*) FROM naming_rules')"
docker exec "$container" psql -X -U skia_migrator -d skia_prod -v ON_ERROR_STOP=1 -1 -f /repo/migrations/033_canonical_zone_naming_provisioning.sql >/dev/null
[[ "$(q 'SELECT count(*) FROM naming_rules')" == "$before" ]]

# The application onboarding identity receives both roots without table grants.
docker exec -e PGPASSWORD="$password" "$container" psql -X -U skia_onboarding -d skia_prod -v ON_ERROR_STOP=1 -c "INSERT INTO tenants(id,name) VALUES('33000000-0000-4000-8000-000000000004','Future')" >/dev/null
[[ "$(q "SELECT count(*) FROM naming_rules WHERE tenant_id='33000000-0000-4000-8000-000000000004' AND active AND context_mode='CANONICAL_ZONE'")" == 2 ]]
[[ "$(q "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='skia_runtime' AND table_name='naming_rules' AND privilege_type IN ('INSERT','UPDATE','DELETE')")" == 2 ]]

# Production chronology + real HTTP application path on the transitioned DB.
(cd "$repo_root/backend" && HF3_DATABASE_URL="postgresql://postgres:$password@127.0.0.1:$(docker port "$container" 5432/tcp | sed 's/.*://')/skia_prod?sslmode=disable" HF3_RUNTIME_DATABASE_URL="postgresql://skia_runtime:$password@127.0.0.1:$(docker port "$container" 5432/tcp | sed 's/.*://')/skia_prod?sslmode=disable" go test -tags=integration -run '^TestCanonicalZoneNamingPromotionHTTPPostgreSQL16$' -count=1)

# A malformed canonical active rule aborts all promotion work.
docker exec "$container" createdb -U postgres -O skia_migrator skia_033_rollback
provision skia_033_rollback
bootstrap_pre skia_033_rollback
provision skia_033_rollback
docker exec -i "$container" psql -X -U postgres -d skia_033_rollback -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name) VALUES('33200000-0000-4000-8000-000000000001','Legacy'),('33200000-0000-4000-8000-000000000002','Malformed');
SELECT set_config('app.tenant_id','33200000-0000-4000-8000-000000000001',false);
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,context_mode,include_zone,last_seq) VALUES('33300000-0000-4000-8000-000000000001','33200000-0000-4000-8000-000000000001','MDF','MDF','LEGACY_INTERNAL_AREA',false,0);
UPDATE naming_rules SET last_seq=3 WHERE id='33300000-0000-4000-8000-000000000001';
SELECT set_config('app.tenant_id','33200000-0000-4000-8000-000000000002',false);
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,context_mode,include_zone,include_site,include_internal_area) VALUES('33300000-0000-4000-8000-000000000002','33200000-0000-4000-8000-000000000002','MDF','MDF','CANONICAL_ZONE',true,true,false);
SQL
if docker exec "$container" psql -X -U skia_migrator -d skia_033_rollback -v ON_ERROR_STOP=1 -1 -f /repo/migrations/033_canonical_zone_naming_provisioning.sql >/dev/null 2>&1; then echo 'MALFORMED_STATE=ACCEPTED' >&2; exit 1; fi
[[ "$(docker exec "$container" psql -X -U postgres -d skia_033_rollback -Atqc "SELECT active||'|'||last_seq FROM naming_rules WHERE id='33300000-0000-4000-8000-000000000001'")" == 't|3' ]]
[[ "$(docker exec "$container" psql -X -U postgres -d skia_033_rollback -Atqc "SELECT count(*) FROM pg_proc WHERE proname='provision_canonical_zone_naming_rules'")" == 0 ]]

docker exec "$container" createdb -U postgres -O skia_migrator skia_033_fresh
provision skia_033_fresh
bootstrap_full skia_033_fresh
bootstrap_full skia_033_fresh
provision skia_033_fresh
ledger="$(docker exec "$container" psql -X -U postgres -d skia_033_fresh -Atqc 'SELECT count(*) FROM production_bootstrap_migrations')"
[[ "$ledger" == 25 ]]
schema_hash="$(docker exec "$container" pg_dump -U skia_migrator -d skia_033_fresh --schema-only --no-owner --no-privileges | sed '/^\\restrict /d;/^\\unrestrict /d' | sha256sum | awk '{print $1}')"

printf 'POSTGRES_VERSION=16.14\nMIGRATION_033_TESTS=PASS\nMIGRATION_033_IDEMPOTENT=YES\nMIGRATION_033_ROLLBACK=PASS\nLEGACY_PROMOTION=PASS\nMISSING_ROOT_PROVISIONING=PASS\nNEW_TENANT_PROVISIONING=PASS\nFRESH_BOOTSTRAP=PASS\nSECOND_BOOTSTRAP=PASS\nLEDGER_COUNT=%s\nSCHEMA_HASH=%s\n' "$ledger" "$schema_hash"
