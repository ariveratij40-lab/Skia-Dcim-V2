#!/usr/bin/env bash
set -euo pipefail
cd /opt/apps/skia/prod
set -a
. secrets/production.env
set +a

docker cp runtime/provision_database_roles.sql skia_postgres_prod:/tmp/provision_database_roles.sql
docker exec -e PGPASSWORD="$POSTGRES_BOOTSTRAP_PASSWORD" skia_postgres_prod \
  psql -X -U skia_bootstrap -d skia_prod -v ON_ERROR_STOP=1 \
  -v migrator_password="$SKIA_MIGRATOR_DB_PASSWORD" \
  -v runtime_password="$SKIA_RUNTIME_DB_PASSWORD" \
  -v onboarding_password="$SKIA_ONBOARDING_DB_PASSWORD" \
  -f /tmp/provision_database_roles.sql >/dev/null

docker cp source/. skia_postgres_prod:/repo
migrator_dsn="postgresql://skia_migrator:${SKIA_MIGRATOR_DB_PASSWORD}@localhost/skia_prod"
for run in 1 2; do
  docker exec -e PHASE010_DATABASE_URL="$migrator_dsn" skia_postgres_prod \
    /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null
  printf 'BOOTSTRAP_INVOCATION_%s=APPROVED\n' "$run"
done

# Re-run the idempotent role artifact after tables exist, then prove the exact
# onboarding authority can provision identity while retaining no other grants.
docker exec -e PGPASSWORD="$POSTGRES_BOOTSTRAP_PASSWORD" skia_postgres_prod \
  psql -X -U skia_bootstrap -d skia_prod -v ON_ERROR_STOP=1 \
  -v migrator_password="$SKIA_MIGRATOR_DB_PASSWORD" \
  -v runtime_password="$SKIA_RUNTIME_DB_PASSWORD" \
  -v onboarding_password="$SKIA_ONBOARDING_DB_PASSWORD" \
  -f /tmp/provision_database_roles.sql >/dev/null
docker cp source/ops/phase011/validate_onboarding_role.sql skia_postgres_prod:/tmp/validate_onboarding_role.sql
docker cp source/ops/phase011/validate_runtime_auth_role.sql skia_postgres_prod:/tmp/validate_runtime_auth_role.sql
docker exec -e PGPASSWORD="$POSTGRES_BOOTSTRAP_PASSWORD" skia_postgres_prod \
  psql -X -U skia_bootstrap -d skia_prod -f /tmp/validate_onboarding_role.sql
docker exec -e PGPASSWORD="$POSTGRES_BOOTSTRAP_PASSWORD" skia_postgres_prod \
  psql -X -U skia_bootstrap -d skia_prod -f /tmp/validate_runtime_auth_role.sql

schema_hash="$(docker exec -e PGPASSWORD="$SKIA_MIGRATOR_DB_PASSWORD" skia_postgres_prod \
  pg_dump -U skia_migrator -d skia_prod --schema-only --no-owner --no-privileges |
  sed '/^\\restrict /d;/^\\unrestrict /d' | sha256sum | awk '{print $1}')"
ledger="$(docker exec -e PGPASSWORD="$SKIA_MIGRATOR_DB_PASSWORD" skia_postgres_prod \
  psql -X -U skia_migrator -d skia_prod -Atqc 'SELECT count(*) FROM production_bootstrap_migrations')"
roles="$(docker exec -e PGPASSWORD="$POSTGRES_BOOTSTRAP_PASSWORD" skia_postgres_prod \
  psql -X -U skia_bootstrap -d skia_prod -Atqc \
  "SELECT string_agg(rolname||'|super='||rolsuper||'|bypass='||rolbypassrls||'|createdb='||rolcreatedb||'|createrole='||rolcreaterole,',' ORDER BY rolname) FROM pg_roles WHERE rolname IN ('skia_migrator','skia_runtime','skia_onboarding')")"
fixture_counts="$(docker exec -e PGPASSWORD="$SKIA_MIGRATOR_DB_PASSWORD" skia_postgres_prod \
  psql -X -U skia_migrator -d skia_prod -Atqc \
  "SELECT (SELECT count(*) FROM tenants)||'|'||(SELECT count(*) FROM users)||'|'||(SELECT count(*) FROM assets)")"

printf 'SCHEMA_HASH=%s\nLEDGER_COUNT=%s\nROLES=%s\nEMPTY_COUNTS_TENANTS_USERS_ASSETS=%s\n' \
  "$schema_hash" "$ledger" "$roles" "$fixture_counts"
[[ "$schema_hash" == 2ec0d71affe55b47b6410d994e2242d5a5f7e1831e2ccce633d5c4ea1cc7ae2d ]]
[[ "$ledger" == 15 ]]
[[ "$fixture_counts" == '0|0|0' ]]
