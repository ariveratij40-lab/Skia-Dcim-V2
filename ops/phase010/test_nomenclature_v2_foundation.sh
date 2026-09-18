#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-nomenclature-v2-036-$$"
password="nomenclature_v2_test_only"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --name "$container" -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod -d postgres:16.14-alpine >/dev/null
for _ in {1..40}; do docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null 2>&1 && break; sleep 1; done
docker cp "$repo_root/." "$container:/repo"

provision(){ docker exec -i "$container" psql -X -U postgres -d "$1" -v ON_ERROR_STOP=1 \
  -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" \
  < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null; }
bootstrap(){ docker exec -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/$1" \
  "$container" "$2/ops/phase010/run_clean_bootstrap.sh" >/dev/null; }
q(){ docker exec "$container" psql -X -U postgres -d "$1" -Atqc "$2"; }
expect_fail(){ if docker exec "$container" psql -X -U postgres -d "$1" -v ON_ERROR_STOP=1 -c "$2" >/dev/null 2>&1; then echo "unexpected success: $3" >&2; exit 1; fi; }

provision skia_prod
bootstrap skia_prod /repo
bootstrap skia_prod /repo
provision skia_prod
docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -v phase011_environment=production -v expected_database=skia_prod \
  -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED \
  -f /repo/ops/phase011/activate_clean_production_rls.sql >/dev/null
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -f /repo/ops/phase011/validate_runtime_auth_role.sql >/dev/null

[[ "$(q skia_prod "SELECT count(*) FROM production_bootstrap_migrations WHERE path='migrations/036_nomenclature_v2_foundation.sql'")" == 1 ]]
[[ "$(q skia_prod "SELECT count(*) FROM system_naming_presets")" == 0 ]]
[[ "$(q skia_prod "SELECT count(*) FROM naming_rules")" == 0 ]]

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO tenants(id,name) VALUES('f1000000-0000-4000-8000-000000000001','F tenant');
INSERT INTO users(id,email,name,password_hash) VALUES('f1100000-0000-4000-8000-000000000001','actor@example.invalid','Actor','not-real');
INSERT INTO system_naming_presets(
 id,preset_code,asset_type_code,preset_version,prefix,include_branch,include_zone,
 context_mode,sequence_scope,seq_digits,active)
VALUES('f1200000-0000-4000-8000-000000000001','MDF_V2_TEST','MDF',2,'MDF',true,true,
 'CANONICAL_ZONE','BRANCH',3,true);
INSERT INTO system_naming_presets(
 id,preset_code,asset_type_code,preset_version,prefix,include_branch,include_zone,
 context_mode,sequence_scope,seq_digits,active)
VALUES('f1200000-0000-4000-8000-000000000002','IDF_V2_TEST','IDF',2,'IDF',true,true,
 'CANONICAL_ZONE','BRANCH',3,true);

INSERT INTO naming_rules(
 id,tenant_id,asset_type_code,prefix,separator,include_branch,include_zone,context_mode,
 sequence_scope,seq_digits,last_seq,active,source_type,source_preset_id,source_preset_version,
 accepted_by,accepted_at,accepted_by_snapshot,customized_after_acceptance)
VALUES(
 'f1300000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','MDF','MDF','-',true,true,'CANONICAL_ZONE',
 'BRANCH',3,0,true,'PRESET','f1200000-0000-4000-8000-000000000001',2,
 'f1100000-0000-4000-8000-000000000001',now(),'{"user_id":"f1100000-0000-4000-8000-000000000001","email":"actor@example.invalid"}',false);

INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,active,source_type)
VALUES('f1300000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001','SERVER','SRV',false,'CUSTOM');
INSERT INTO naming_rules(
 id,tenant_id,asset_type_code,prefix,include_zone,context_mode,sequence_scope,active,
 source_type,source_preset_id,source_preset_version,accepted_at,accepted_by_snapshot,customized_after_acceptance)
VALUES('f1300000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001','IDF','IDF',true,'CANONICAL_ZONE','BRANCH',false,
 'DERIVED_FROM_PRESET','f1200000-0000-4000-8000-000000000002',2,now(),'{"user_id":"deleted-actor"}',true);
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,include_distribution,context_mode,sequence_scope,active,source_type)
VALUES('f1300000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000001','RACK','RK',true,'CANONICAL_DISTRIBUTION','DISTRIBUTION',false,'CUSTOM');
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,include_housing,context_mode,sequence_scope,active,source_type)
VALUES('f1300000-0000-4000-8000-000000000005','f1000000-0000-4000-8000-000000000001','SWITCH','SW',true,'CANONICAL_HOUSING','BRANCH',false,'CUSTOM');

UPDATE system_naming_presets SET active=false,description='controlled metadata update'
WHERE id='f1200000-0000-4000-8000-000000000001';
DELETE FROM users WHERE id='f1100000-0000-4000-8000-000000000001';
SQL

[[ "$(q skia_prod "SELECT source_type||'|'||(accepted_by IS NULL)||'|'||(accepted_by_snapshot->>'user_id') FROM naming_rules WHERE id='f1300000-0000-4000-8000-000000000001'")" == 'PRESET|true|f1100000-0000-4000-8000-000000000001' ]]

expect_fail skia_prod "UPDATE system_naming_presets SET prefix='X' WHERE id='f1200000-0000-4000-8000-000000000001'" 'preset structural mutation'
expect_fail skia_prod "UPDATE naming_rules SET source_type='CUSTOM',source_preset_id=NULL,source_preset_version=NULL,accepted_at=NULL,accepted_by_snapshot=NULL WHERE id='f1300000-0000-4000-8000-000000000001'" 'provenance rewrite'
expect_fail skia_prod "INSERT INTO naming_rules(tenant_id,asset_type_code,prefix,include_zone,context_mode,sequence_scope,source_type,source_preset_id,source_preset_version,accepted_at,accepted_by_snapshot) VALUES('f1000000-0000-4000-8000-000000000001','IDF','IDF',true,'CANONICAL_ZONE','BRANCH','PRESET','f1200000-0000-4000-8000-000000000001',2,now(),'{\"user_id\":\"x\"}')" 'preset type mismatch'
expect_fail skia_prod "INSERT INTO naming_rules(tenant_id,asset_type_code,prefix,context_mode,include_housing,include_placement,sequence_scope) VALUES('f1000000-0000-4000-8000-000000000001','SWITCH','SW','CANONICAL_HOUSING',true,true,'PLACEMENT')" 'housing placement competition'
expect_fail skia_prod "INSERT INTO naming_rules(tenant_id,asset_type_code,prefix,context_mode,include_distribution,sequence_scope) VALUES('f1000000-0000-4000-8000-000000000001','RACK','RK','CANONICAL_DISTRIBUTION',false,'DISTRIBUTION')" 'distribution scope without authority'

v1_count="$(q skia_prod "SELECT count(*) FROM read_active_system_naming_presets(ARRAY['MDF'])")"
v2_row="$(q skia_prod "UPDATE system_naming_presets SET active=true WHERE id='f1200000-0000-4000-8000-000000000001'; SELECT preset_code||'|'||context_mode||'|'||sequence_scope FROM read_active_system_naming_presets_v2(ARRAY['MDF'])")"
[[ "$v1_count" == 0 && "$v2_row" == 'MDF_V2_TEST|CANONICAL_ZONE|BRANCH' ]]

security="$(q skia_prod "SELECT has_function_privilege('skia_runtime','public.read_active_system_naming_presets_v2(text[])','EXECUTE')||'|'||has_function_privilege('skia_onboarding','public.read_active_system_naming_presets_v2(text[])','EXECUTE')||'|'||has_table_privilege('skia_runtime','public.system_naming_presets','SELECT')")"
[[ "$security" == 'true|false|false' ]]
[[ "$(q skia_prod "SELECT count(*) FROM pg_roles WHERE rolname='skia_runtime' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole")" == 1 ]]
metadata="$(q skia_prod "SELECT p.prosecdef||'|'||r.rolname||'|'||array_to_string(p.proconfig,',') FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='public.read_active_system_naming_presets_v2(text[])'::regprocedure")"
[[ "$metadata" == 'true|skia_migrator|search_path=pg_catalog, pg_temp' ]]

# Existing post-035 database upgrade: preserve legacy rules and every counter.
docker exec "$container" createdb -U postgres -O skia_migrator skia_upgrade
docker exec "$container" sh -c "cp -a /repo /repo-pre036 && sed -i '/036_nomenclature_v2_foundation.sql/d' /repo-pre036/ops/phase010/bootstrap.manifest"
bootstrap skia_upgrade /repo-pre036
docker exec -i "$container" psql -X -U postgres -d skia_upgrade -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO tenants(id,name) VALUES('f2000000-0000-4000-8000-000000000001','Upgrade tenant');
INSERT INTO branches(id,tenant_id,code,name) VALUES('f2100000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','UP','Upgrade');
SELECT set_config('app.tenant_id','f2000000-0000-4000-8000-000000000001',false);
SELECT set_config('app.branch_id','f2100000-0000-4000-8000-000000000001',false);
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,include_branch,seq_digits,last_seq,active)
VALUES('f2200000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','SERVER','SRV',true,4,0,true);
UPDATE naming_rules SET last_seq=7 WHERE id='f2200000-0000-4000-8000-000000000001';
INSERT INTO nomenclature_branch_counters(nomenclature_id,tenant_id,branch_id,last_seq)
VALUES('f2200000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001',7);
SQL
docker exec "$container" psql -X -U skia_migrator -d skia_upgrade -v ON_ERROR_STOP=1 -1 -f /repo/migrations/036_nomenclature_v2_foundation.sql >/dev/null
[[ "$(q skia_upgrade "SELECT source_type||'|'||sequence_scope||'|'||last_seq FROM naming_rules WHERE id='f2200000-0000-4000-8000-000000000001'")" == 'LEGACY_UNATTRIBUTED|BRANCH|7' ]]
[[ "$(q skia_upgrade "SELECT last_seq FROM nomenclature_branch_counters WHERE nomenclature_id='f2200000-0000-4000-8000-000000000001'")" == 7 ]]

# Forced failure proves transactional rollback leaves no partial B1 schema.
docker exec "$container" createdb -U postgres -O skia_migrator skia_rollback
bootstrap skia_rollback /repo-pre036
set +e
docker exec "$container" psql -X -U skia_migrator -d skia_rollback -v ON_ERROR_STOP=1 -1 \
  -f /repo/migrations/036_nomenclature_v2_foundation.sql -c 'SELECT 1/0' >/dev/null 2>&1
rollback_rc=$?
set -e
[[ "$rollback_rc" != 0 ]]
[[ "$(q skia_rollback "SELECT count(*) FROM information_schema.columns WHERE table_name='naming_rules' AND column_name='source_type'")" == 0 ]]
[[ "$(q skia_rollback "SELECT count(*) FROM pg_proc WHERE proname='read_active_system_naming_presets_v2'")" == 0 ]]

ledger="$(q skia_prod 'SELECT count(*) FROM production_bootstrap_migrations')"
schema_hash="$(docker exec "$container" pg_dump -U skia_migrator -d skia_prod --schema-only --no-owner --no-privileges | sed '/^\\restrict /d;/^\\unrestrict /d' | sha256sum | awk '{print $1}')"
[[ "$ledger" == 28 ]]
printf 'POSTGRES_VERSION=16.14\nMIGRATION_036_TESTS=PASS\nFRESH_BOOTSTRAP=PASS\nSECOND_BOOTSTRAP=PASS\nEXISTING_DB_UPGRADE=PASS\nMIGRATION_ROLLBACK=PASS\nPROVENANCE=PASS\nEXACT_PRESET_FK=PASS\nV1_READER_GUARD=PASS\nV2_READER=PASS\nSECURITY=PASS\nSEQUENCE_PRESERVATION=PASS\nPRESET_IMMUTABILITY=PASS\nPRODUCTION_PRESET_SEED_COUNT=0\nLEDGER_COUNT=%s\nSCHEMA_HASH=%s\n' "$ledger" "$schema_hash"
