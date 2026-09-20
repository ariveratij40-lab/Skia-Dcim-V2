#!/usr/bin/env bash
set -euo pipefail
prod_root="${SKIA_PROD_ROOT:-/opt/apps/skia/prod}"
postgres_container="${SKIA_POSTGRES_CONTAINER:-skia_postgres_prod}"
database_contract="${SKIA_DATABASE_CONTRACT:-clean}"
case "$database_contract" in
  clean|upgrade) ;;
  *) echo "BLOCKED: SKIA_DATABASE_CONTRACT must be clean or upgrade" >&2; exit 64 ;;
esac
cd "$prod_root"
set -a
. secrets/production.env
set +a

docker cp runtime/provision_database_roles.sql "$postgres_container":/tmp/provision_database_roles.sql
docker exec -i -e PGPASSWORD="$POSTGRES_BOOTSTRAP_PASSWORD" "$postgres_container" \
  psql -X -U skia_bootstrap -d skia_prod -v ON_ERROR_STOP=1 \
  -v migrator_password="$SKIA_MIGRATOR_DB_PASSWORD" \
  -v runtime_password="$SKIA_RUNTIME_DB_PASSWORD" \
  -v onboarding_password="$SKIA_ONBOARDING_DB_PASSWORD" \
  -f /tmp/provision_database_roles.sql >/dev/null

# Migration 035 runs as the restricted migrator under FORCE RLS. Perform its
# legacy-value guard with the bootstrap identity so rows cannot be hidden by
# tenant policies. The checks are conditional for idempotent post-035 runs.
docker exec -i -e PGPASSWORD="$POSTGRES_BOOTSTRAP_PASSWORD" "$postgres_container" \
  psql -X -U skia_bootstrap -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $guard$
DECLARE
  switch_values bigint := 0;
  patch_panel_values bigint := 0;
  pdu_values bigint := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='switches' AND column_name='rack_id') THEN
    EXECUTE 'SELECT count(*) FROM public.switches WHERE rack_id IS NOT NULL' INTO switch_values;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patch_panels' AND column_name='rack_id') THEN
    EXECUTE 'SELECT count(*) FROM public.patch_panels WHERE rack_id IS NOT NULL' INTO patch_panel_values;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pdus' AND column_name='rack_id') THEN
    EXECUTE 'SELECT count(*) FROM public.pdus WHERE rack_id IS NOT NULL' INTO pdu_values;
  END IF;
  IF switch_values <> 0 OR patch_panel_values <> 0 OR pdu_values <> 0 THEN
    RAISE EXCEPTION 'Migration 035 blocked by bootstrap precheck: legacy Rack authority repopulated (switches=%, patch_panels=%, pdus=%)', switch_values, patch_panel_values, pdu_values USING ERRCODE='23514';
  END IF;
END
$guard$;
SQL

pre_fixture_counts='0|0|0'
if [[ "$database_contract" == upgrade ]]; then
  pre_fixture_counts="$(docker exec -e PGPASSWORD="$POSTGRES_BOOTSTRAP_PASSWORD" "$postgres_container" \
    psql -X -U skia_bootstrap -d skia_prod -Atqc \
    "SELECT (SELECT count(*) FROM tenants)||'|'||(SELECT count(*) FROM users)||'|'||(SELECT count(*) FROM assets)")"
fi

docker cp source/. "$postgres_container":/repo
migrator_dsn="postgresql://skia_migrator:${SKIA_MIGRATOR_DB_PASSWORD}@localhost/skia_prod"
for run in 1 2; do
  docker exec -e PHASE010_DATABASE_URL="$migrator_dsn" "$postgres_container" \
    /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null
  printf 'BOOTSTRAP_INVOCATION_%s=APPROVED\n' "$run"
done

# Re-run the idempotent role artifact after tables exist, then prove the exact
# onboarding authority can provision identity while retaining no other grants.
docker exec -e PGPASSWORD="$POSTGRES_BOOTSTRAP_PASSWORD" "$postgres_container" \
  psql -X -U skia_bootstrap -d skia_prod -v ON_ERROR_STOP=1 \
  -v migrator_password="$SKIA_MIGRATOR_DB_PASSWORD" \
  -v runtime_password="$SKIA_RUNTIME_DB_PASSWORD" \
  -v onboarding_password="$SKIA_ONBOARDING_DB_PASSWORD" \
  -f /tmp/provision_database_roles.sql >/dev/null
docker cp source/ops/phase011/validate_onboarding_role.sql "$postgres_container":/tmp/validate_onboarding_role.sql
docker cp source/ops/phase011/validate_runtime_auth_role.sql "$postgres_container":/tmp/validate_runtime_auth_role.sql
docker exec -e PGPASSWORD="$POSTGRES_BOOTSTRAP_PASSWORD" "$postgres_container" \
  psql -X -U skia_bootstrap -d skia_prod -f /tmp/validate_onboarding_role.sql
docker exec -e PGPASSWORD="$POSTGRES_BOOTSTRAP_PASSWORD" "$postgres_container" \
  psql -X -U skia_bootstrap -d skia_prod -f /tmp/validate_runtime_auth_role.sql

schema_hash="$(docker exec -e PGPASSWORD="$SKIA_MIGRATOR_DB_PASSWORD" "$postgres_container" \
  pg_dump -U skia_migrator -d skia_prod --schema-only --no-owner --no-privileges |
  sed '/^\\restrict /d;/^\\unrestrict /d' | sha256sum | awk '{print $1}')"
ledger="$(docker exec -e PGPASSWORD="$SKIA_MIGRATOR_DB_PASSWORD" "$postgres_container" \
  psql -X -U skia_migrator -d skia_prod -Atqc 'SELECT count(*) FROM production_bootstrap_migrations')"
roles="$(docker exec -e PGPASSWORD="$POSTGRES_BOOTSTRAP_PASSWORD" "$postgres_container" \
  psql -X -U skia_bootstrap -d skia_prod -Atqc \
  "SELECT string_agg(rolname||'|super='||rolsuper||'|bypass='||rolbypassrls||'|createdb='||rolcreatedb||'|createrole='||rolcreaterole,',' ORDER BY rolname) FROM pg_roles WHERE rolname IN ('skia_migrator','skia_runtime','skia_onboarding')")"
fixture_counts="$(docker exec -e PGPASSWORD="$POSTGRES_BOOTSTRAP_PASSWORD" "$postgres_container" \
  psql -X -U skia_bootstrap -d skia_prod -Atqc \
  "SELECT (SELECT count(*) FROM tenants)||'|'||(SELECT count(*) FROM users)||'|'||(SELECT count(*) FROM assets)")"

printf 'SCHEMA_HASH=%s\nLEDGER_COUNT=%s\nROLES=%s\n' \
  "$schema_hash" "$ledger" "$roles"
[[ "$schema_hash" == e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6 ]]
[[ "$ledger" == 32 ]]
case "$database_contract" in
  clean)
    [[ "$fixture_counts" == '0|0|0' ]]
    printf 'DATABASE_CONTRACT=clean\nEMPTY_COUNTS_TENANTS_USERS_ASSETS=%s\nEMPTY_DATABASE_GUARD=APPROVED\n' \
      "$fixture_counts"
    ;;
  upgrade)
    [[ "$fixture_counts" == "$pre_fixture_counts" ]]
    printf 'DATABASE_CONTRACT=upgrade\nPRE_COUNTS_TENANTS_USERS_ASSETS=%s\nPOST_COUNTS_TENANTS_USERS_ASSETS=%s\nEXISTING_DATA_PRESERVATION=APPROVED\n' \
      "$pre_fixture_counts" "$fixture_counts"
    ;;
esac
