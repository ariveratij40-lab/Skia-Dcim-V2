#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-b3a-040-$$"
password="$(openssl rand -hex 20)"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run --name "$container" -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod -p 127.0.0.1::5432 -d postgres:16.14-alpine >/dev/null
for _ in {1..40}; do docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null 2>&1 && break; sleep 1; done
port="$(docker port "$container" 5432/tcp | awk -F: '{print $NF}')"
# Only versioned implementation paths; never transfer local secrets/node_modules.
tar -C "$repo_root" -cf - migrations ops docs/phase1_2f | docker exec -i "$container" sh -c 'mkdir /repo; tar -xf - -C /repo'
q(){ docker exec "$container" psql -X -U postgres -d "$1" -Atqc "$2"; }
provision(){ docker exec "$container" psql -X -U postgres -d "$1" -v ON_ERROR_STOP=1 -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" -f /repo/ops/phase011/provision_database_roles.sql >/dev/null; }
bootstrap(){ docker exec -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/$1" "$container" bash "$2/ops/phase010/run_clean_bootstrap.sh" >/dev/null; }
hash(){ docker exec "$container" pg_dump -U skia_migrator -d "$1" --schema-only --no-owner --no-privileges | sed '/^\\restrict /d;/^\\unrestrict /d' | shasum -a 256 | awk '{print $1}'; }
provision skia_prod
docker exec "$container" sh -c "cp -a /repo /pre039; sed -i '/040_nomenclature_v2_initial_preset_catalog.sql/d' /pre039/ops/phase010/bootstrap.manifest"
docker exec "$container" createdb -U postgres -O skia_migrator b3a_pre039
provision b3a_pre039
bootstrap b3a_pre039 /pre039
provision b3a_pre039
docker exec "$container" psql -X -U postgres -d b3a_pre039 -v ON_ERROR_STOP=1 -v phase011_environment=production -v expected_database=b3a_pre039 -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED -f /repo/ops/phase011/activate_clean_production_rls.sql >/dev/null
[[ "$(q b3a_pre039 'SELECT count(*) FROM production_bootstrap_migrations')" == 31 ]]
bootstrap skia_prod /repo
bootstrap skia_prod /repo
provision skia_prod
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -v phase011_environment=production -v expected_database=skia_prod -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED -f /repo/ops/phase011/activate_clean_production_rls.sql >/dev/null
docker exec "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 -f /repo/ops/phase011/validate_runtime_auth_role.sql
[[ "$(q skia_prod 'SELECT count(*) FROM production_bootstrap_migrations')" == 32 ]]
[[ "$(q skia_prod "SELECT count(*) FROM production_bootstrap_migrations WHERE path='migrations/040_nomenclature_v2_initial_preset_catalog.sql'")" == 1 ]]
[[ "$(q skia_prod 'SELECT count(*) FROM system_naming_presets')" == 12 ]]
[[ "$(q skia_prod "SELECT has_table_privilege('skia_runtime','system_naming_presets','SELECT')")" == f ]]
[[ "$(q skia_prod "SELECT rolbypassrls FROM pg_roles WHERE rolname='skia_runtime'")" == f ]]
schema_hash="$(hash skia_prod)"
[[ "$schema_hash" == e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6 ]]
echo "FRESH_BOOTSTRAP=PASS SECOND_BOOTSTRAP=PASS LEDGER=32 SCHEMA_HASH=$schema_hash"
(cd "$repo_root/backend" &&
 B3A_DISPOSABLE=YES \
 B3A_PRE039_ADMIN_DATABASE_URL="postgresql://postgres:$password@127.0.0.1:$port/b3a_pre039?sslmode=disable" \
 B3A_PRE039_RUNTIME_DATABASE_URL="postgresql://skia_runtime:$password@127.0.0.1:$port/b3a_pre039?sslmode=disable" \
 NOMENCLATURE_ACCEPTANCE_ADMIN_DATABASE_URL="postgresql://postgres:$password@127.0.0.1:$port/skia_prod?sslmode=disable" \
 NOMENCLATURE_ACCEPTANCE_RUNTIME_DATABASE_URL="postgresql://skia_runtime:$password@127.0.0.1:$port/skia_prod?sslmode=disable" \
 GOCACHE=/tmp/skia-b2c-go-cache go test -race ./... -run '^TestB3a' -count=1 -v)
bootstrap b3a_pre039 /repo
bootstrap b3a_pre039 /repo
[[ "$(q b3a_pre039 'SELECT count(*) FROM production_bootstrap_migrations')" == 32 ]]
[[ "$(q b3a_pre039 'SELECT count(*) FROM system_naming_presets')" == 12 ]]
docker exec "$container" sh -c "cp -a /repo /bad-checksum; printf '\n-- tamper\n' >> /bad-checksum/migrations/040_nomenclature_v2_initial_preset_catalog.sql"
if bootstrap b3a_pre039 /bad-checksum >/dev/null 2>&1; then echo 'CHECKSUM_PROTECTION=FAIL'; exit 1; fi
echo 'POST039_UPGRADE=PASS CHECKSUM_PROTECTION=PASS B3A_POSTGRES=PASS'
