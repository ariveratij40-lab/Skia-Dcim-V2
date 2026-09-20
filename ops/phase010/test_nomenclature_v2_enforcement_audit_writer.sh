#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-nomenclature-v2-037-$$"
password="nomenclature_v2_037_test_only"
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
runtime(){ docker exec -e PGPASSWORD="$password" "$container" psql -X -U skia_runtime -d skia_prod -v ON_ERROR_STOP=1 "$@"; }

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

[[ "$(q skia_prod "SELECT count(*) FROM production_bootstrap_migrations WHERE path='migrations/037_nomenclature_v2_enforcement_audit_writer.sql'")" == 1 ]]
[[ "$(q skia_prod 'SELECT count(*) FROM production_bootstrap_migrations')" == 31 ]]
[[ "$(q skia_prod 'SELECT count(*) FROM system_naming_presets')" == 0 ]]

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO tenants(id,name) VALUES
 ('a1000000-0000-4000-8000-000000000001','Tenant A'),
 ('b1000000-0000-4000-8000-000000000001','Tenant B');
INSERT INTO branches(id,tenant_id,code,name,status) VALUES
 ('a1100000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','A1','A1','active'),
 ('a1100000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','A2','A2','active'),
 ('b1100000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','B1','B1','active');
INSERT INTO users(id,email,name,password_hash,status) VALUES
 ('a1200000-0000-4000-8000-000000000001','admin@example.invalid','Admin','x','active'),
 ('a1200000-0000-4000-8000-000000000002','viewer@example.invalid','Viewer','x','active'),
 ('a1200000-0000-4000-8000-000000000003','super@example.invalid','Super admin','x','active'),
 ('b1200000-0000-4000-8000-000000000001','other@example.invalid','Other','x','active');
INSERT INTO user_tenants(user_id,tenant_id) VALUES
 ('a1200000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001'),
 ('a1200000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001'),
 ('a1200000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001'),
 ('b1200000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001');
INSERT INTO roles(id,tenant_id,name,is_global) VALUES
 ('a1300000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','admin',false),
 ('a1300000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','viewer',false),
 ('a1300000-0000-4000-8000-000000000003',NULL,'super_admin',true),
 ('b1300000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','admin',false);
INSERT INTO user_roles(user_id,tenant_id,role_id) VALUES
 ('a1200000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001'),
 ('a1200000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000002'),
 ('a1200000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000003'),
 ('b1200000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b1300000-0000-4000-8000-000000000001');
INSERT INTO system_naming_presets(id,preset_code,asset_type_code,preset_version,prefix,context_mode,sequence_scope,active)
VALUES('a1400000-0000-4000-8000-000000000001','B2B_TEST','SERVER',1,'SRV','LEGACY_INTERNAL_AREA','BRANCH',true);
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,context_mode,sequence_scope,source_type,
 source_preset_id,source_preset_version,accepted_at,accepted_by_snapshot,active)
VALUES('a1500000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','SERVER','SRV',
 'LEGACY_INTERNAL_AREA','BRANCH','PRESET','a1400000-0000-4000-8000-000000000001',1,now(),
 '{"schema_version":1,"user_id":"a1200000-0000-4000-8000-000000000001","tenant_id":"a1000000-0000-4000-8000-000000000001","role":"admin","email":"admin@example.invalid","name":"Admin"}',true);
INSERT INTO asset_types(id,code,name,requires_nomenclature)
VALUES('a1600000-0000-4000-8000-000000000001','B2B_ASSET','B2B asset',true);
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,context_mode,sequence_scope,source_type,active,seq_digits)
VALUES('a1500000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','B2B_ASSET','B2B','LEGACY_INTERNAL_AREA','BRANCH','CUSTOM',true,3);
INSERT INTO nomenclature_branch_counters(nomenclature_id,tenant_id,branch_id,last_seq)
VALUES('a1500000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001',2);
SQL

valid_snapshot='{"schema_version":1,"user_id":"a1200000-0000-4000-8000-000000000001","tenant_id":"a1000000-0000-4000-8000-000000000001","role":"admin","email":"admin@example.invalid","name":"Admin"}'
[[ "$(q skia_prod "SELECT nomenclature_acceptance_snapshot_is_valid('$valid_snapshot')")" == t ]]
for invalid in \
  '{"schema_version":1}' \
  '{"schema_version":1,"user_id":"a1200000-0000-4000-8000-000000000001","tenant_id":"a1000000-0000-4000-8000-000000000001","role":"admin","email":"admin@example.invalid","name":"Admin","unknown":true}' \
  '{"schema_version":1,"user_id":"bad","tenant_id":"a1000000-0000-4000-8000-000000000001","role":"admin","email":"admin@example.invalid","name":"Admin"}' \
  '{"schema_version":1,"user_id":"a1200000-0000-4000-8000-000000000001","tenant_id":"a1000000-0000-4000-8000-000000000001","role":"viewer","email":"admin@example.invalid","name":"Admin"}' \
  '{"schema_version":2,"user_id":"a1200000-0000-4000-8000-000000000001","tenant_id":"a1000000-0000-4000-8000-000000000001","role":"admin","email":"admin@example.invalid","name":"Admin"}'
do [[ "$(q skia_prod "SELECT nomenclature_acceptance_snapshot_is_valid('$invalid')")" == f ]]; done

# The database validates structure and length, but never rebuilds Go's code.
code100="$(printf 'X%.0s' {1..100})"
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -c \
  "INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name,nomenclature_id,nomenclature_sequence) VALUES('a1700000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000001','$code100','100 bytes','a1500000-0000-4000-8000-000000000002',1)" >/dev/null
expect_fail skia_prod "INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name,nomenclature_id,nomenclature_sequence) VALUES('a1700000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000001,'$(printf 'Y%.0s' {1..101})','too long','a1500000-0000-4000-8000-000000000002',2)" '101-byte code'
expect_fail skia_prod "UPDATE naming_rules SET prefix='CHANGED' WHERE id='a1500000-0000-4000-8000-000000000002'" 'issued rule mutation'

runtime -Atqc "BEGIN; SELECT set_config('app.tenant_id','a1000000-0000-4000-8000-000000000001',true); SELECT set_config('app.user_id','a1200000-0000-4000-8000-000000000001',true); SELECT write_nomenclature_onboarding_audit('a1800000-0000-4000-8000-000000000001','a1500000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001','NOMENCLATURE_PRESET_ACCEPTED'); COMMIT" >/dev/null
first_event="$(q skia_prod "SELECT id FROM audit_logs WHERE changes->>'operation_id'='a1800000-0000-4000-8000-000000000001'")"
retry_event="$(runtime -Atqc "BEGIN; SELECT set_config('app.tenant_id','a1000000-0000-4000-8000-000000000001',true); SELECT set_config('app.user_id','a1200000-0000-4000-8000-000000000001',true); SELECT write_nomenclature_onboarding_audit('a1800000-0000-4000-8000-000000000001','a1500000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001','NOMENCLATURE_PRESET_ACCEPTED'); COMMIT" | tail -1)"
[[ -n "$first_event" && "$retry_event" == "$first_event" ]]
[[ "$(q skia_prod "SELECT count(*) FROM audit_logs WHERE changes->>'operation_id'='a1800000-0000-4000-8000-000000000001'")" == 1 ]]
runtime -Atqc "BEGIN; SELECT set_config('app.tenant_id','a1000000-0000-4000-8000-000000000001',true); SELECT set_config('app.user_id','a1200000-0000-4000-8000-000000000003',true); SELECT write_nomenclature_onboarding_audit('a1800000-0000-4000-8000-000000000003','a1500000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001','NOMENCLATURE_PRESET_ACCEPTED'); COMMIT" >/dev/null

for actor in a1200000-0000-4000-8000-000000000002 b1200000-0000-4000-8000-000000000001; do
  if runtime -Atqc "BEGIN; SELECT set_config('app.tenant_id','a1000000-0000-4000-8000-000000000001',true); SELECT set_config('app.user_id','$actor',true); SELECT write_nomenclature_onboarding_audit(gen_random_uuid(),'a1500000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001','NOMENCLATURE_PRESET_ACCEPTED'); COMMIT" >/dev/null 2>&1; then exit 1; fi
done

set +e
runtime -Atqc "BEGIN; SELECT set_config('app.tenant_id','a1000000-0000-4000-8000-000000000001',true); SELECT set_config('app.user_id','a1200000-0000-4000-8000-000000000001',true); UPDATE naming_rules SET active=false WHERE id='a1500000-0000-4000-8000-000000000001'; SELECT write_nomenclature_onboarding_audit('a1800000-0000-4000-8000-000000000002','a1500000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001','NOMENCLATURE_PRESET_ACCEPTED'); SELECT 1/0; COMMIT" >/dev/null 2>&1
rollback_rc=$?
set -e
[[ "$rollback_rc" != 0 ]]
[[ "$(q skia_prod "SELECT active FROM naming_rules WHERE id='a1500000-0000-4000-8000-000000000001'")" == t ]]
[[ "$(q skia_prod "SELECT count(*) FROM audit_logs WHERE changes->>'operation_id'='a1800000-0000-4000-8000-000000000002'")" == 0 ]]

security="$(q skia_prod "SELECT p.prosecdef||'|'||r.rolname||'|'||array_to_string(p.proconfig,',')||'|'||has_function_privilege('skia_runtime',p.oid,'EXECUTE')||'|'||has_function_privilege('skia_onboarding',p.oid,'EXECUTE') FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action)'::regprocedure")"
[[ "$security" == 'true|skia_migrator|search_path=pg_catalog, pg_temp|true|false' ]]
[[ "$(q skia_prod "SELECT has_table_privilege('skia_runtime','audit_logs','SELECT,INSERT,UPDATE,DELETE')||'|'||has_table_privilege('skia_runtime','system_naming_presets','SELECT')||'|'||(SELECT rolbypassrls FROM pg_roles WHERE rolname='skia_runtime')")" == 'false|false|false' ]]

# A forced error after applying 037 proves the whole artifact rolls back.
docker exec "$container" createdb -U postgres -O skia_migrator skia_rollback
provision skia_rollback
docker exec "$container" sh -c "cp -a /repo /repo-pre037 && sed -i -e '/037_nomenclature_v2_enforcement_audit_writer.sql/d' -e '/038_nomenclature_v2_acceptance_function_contract.sql/d' -e '/039_nomenclature_operation_binding.sql/d' /repo-pre037/ops/phase010/bootstrap.manifest"
bootstrap skia_rollback /repo-pre037
set +e
docker exec "$container" psql -X -U skia_migrator -d skia_rollback -v ON_ERROR_STOP=1 -1 \
  -f /repo/migrations/037_nomenclature_v2_enforcement_audit_writer.sql -c 'SELECT 1/0' >/dev/null 2>&1
migration_rollback_rc=$?
set -e
[[ "$migration_rollback_rc" != 0 ]]
[[ "$(q skia_rollback "SELECT count(*) FROM information_schema.columns WHERE table_name='assets' AND column_name='nomenclature_sequence_scope'")" == 0 ]]
[[ "$(q skia_rollback "SELECT count(*) FROM pg_type WHERE typname='nomenclature_onboarding_audit_action'")" == 0 ]]

schema_hash="$(docker exec "$container" pg_dump -U skia_migrator -d skia_prod --schema-only --no-owner --no-privileges | sed '/^\\restrict /d;/^\\unrestrict /d' | sha256sum | awk '{print $1}')"
[[ "$schema_hash" == e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6 ]]
printf '%s\n' \
  'POSTGRES_VERSION=16.14' 'MIGRATION_037_TESTS=PASS' 'FRESH_BOOTSTRAP=PASS' \
  'SECOND_BOOTSTRAP=PASS' 'MIGRATION_037_ROLLBACK=PASS' 'SNAPSHOT_VALIDATION=PASS' \
  'ISSUED_RULE_IMMUTABILITY=PASS' 'CODE_LENGTH_BOUNDARY=PASS' 'AUDIT_SECURITY=PASS' \
  'AUDIT_ACTOR_AUTHORITY=PASS' 'AUDIT_IDEMPOTENCY=PASS' 'AUDIT_ROLLBACK_ATOMICITY=PASS' \
  'PRODUCTION_PRESET_SEED_COUNT=0' 'V2_CATALOG_ACTIVE=NO' 'LEDGER_COUNT=31' \
  "SCHEMA_HASH=$schema_hash"
