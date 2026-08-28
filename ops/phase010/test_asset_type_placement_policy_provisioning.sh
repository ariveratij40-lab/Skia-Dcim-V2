#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-phase12d-b3b-$$"
password="phase12d_b3b_test_only"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --name "$container" -e POSTGRES_PASSWORD="$password" \
  -e POSTGRES_DB=skia_prod -d postgres:16.14-alpine >/dev/null
for _ in {1..30}; do
  docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$container" pg_isready -U postgres -d skia_prod >/dev/null
docker cp "$repo_root/." "$container:/repo"

docker exec -i "$container" psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
  -v migrator_password="$password" -v runtime_password="$password" \
  -v onboarding_password="$password" \
  < "$repo_root/ops/phase011/provision_database_roles.sql" >/dev/null

docker exec -e PGPASSWORD="$password" \
  -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null
docker exec -e PGPASSWORD="$password" \
  -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" \
  "$container" /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null

mapping="$(docker exec -e PGPASSWORD="$password" "$container" psql -X -U skia_migrator -d skia_prod -Atqc \
  "SELECT string_agg(code||'='||placement_policy,',' ORDER BY code) FROM asset_types")"
expected="AC_UNIT=ZONE,BACKBONE=RELATIONSHIP_ONLY,CCTV=ZONE,FIREWALL=HOUSING,IDF=ZONE,MDF=ZONE,NODE=ZONE,PATCH_PANEL=HOUSING,PDU=HOUSING,RACK=MDF_IDF,SERVER=HOUSING,SWITCH=HOUSING,UPS=ZONE"
[[ "$mapping" == "$expected" ]]

read -r ledger type_count access_points class_count assets locations relationships <<<"$(docker exec -e PGPASSWORD="$password" "$container" psql -X -U skia_migrator -d skia_prod -Atqc \
  "SELECT (SELECT count(*) FROM production_bootstrap_migrations),(SELECT count(*) FROM asset_types),(SELECT count(*) FROM asset_types WHERE code='ACCESS_POINT'),(SELECT count(*) FROM asset_types WHERE asset_class IS NOT NULL),(SELECT count(*) FROM assets),(SELECT count(*) FROM locations),(SELECT count(*) FROM asset_relationships)" | tr '|' ' ')"
[[ "$ledger" == 17 && "$type_count" == 13 && "$access_points" == 0 ]]
[[ "$class_count" == 0 && "$assets" == 0 && "$locations" == 0 && "$relationships" == 0 ]]

# A separate database at the approved baseline proves that an unknown future
# type remains byte-for-byte unchanged and that drift checks fail closed.
docker exec "$container" createdb -U postgres skia_conflict
while IFS= read -r relative_path; do
  [[ -n "$relative_path" ]] || continue
  [[ "$relative_path" != "migrations/025_asset_type_placement_policy_provisioning.sql" ]] || break
  docker exec "$container" psql -X -U postgres -d skia_conflict -v ON_ERROR_STOP=1 \
    -f "/repo/$relative_path" >/dev/null
done < "$repo_root/ops/phase010/bootstrap.manifest"
docker exec "$container" psql -X -U postgres -d skia_conflict -v ON_ERROR_STOP=1 \
  -c "INSERT INTO asset_types(code,name,description,icon,asset_class,placement_policy) VALUES('CUSTOM_TEST','Custom future type','unchanged','Test',NULL,NULL)" >/dev/null
custom_before="$(docker exec "$container" psql -X -U postgres -d skia_conflict -Atqc \
  "SELECT md5(row_to_json(a)::text) FROM asset_types a WHERE code='CUSTOM_TEST'")"
docker exec "$container" psql -X -U postgres -d skia_conflict -v ON_ERROR_STOP=1 -1 \
  -f /repo/migrations/025_asset_type_placement_policy_provisioning.sql >/dev/null
custom_after="$(docker exec "$container" psql -X -U postgres -d skia_conflict -Atqc \
  "SELECT md5(row_to_json(a)::text) FROM asset_types a WHERE code='CUSTOM_TEST'")"
[[ "$custom_before" == "$custom_after" ]]

# A conflicting valid policy must fail atomically without changing any policy.
docker exec "$container" psql -X -U postgres -d skia_conflict -v ON_ERROR_STOP=1 \
  -c "UPDATE asset_types SET placement_policy='ZONE' WHERE code='SERVER'" >/dev/null
if docker exec "$container" psql -X -U postgres -d skia_conflict -v ON_ERROR_STOP=1 -1 \
  -f /repo/migrations/025_asset_type_placement_policy_provisioning.sql >/dev/null 2>&1; then
  echo 'CONFLICT_DRIFT=UNEXPECTEDLY_ACCEPTED' >&2
  exit 1
fi
conflict_state="$(docker exec "$container" psql -X -U postgres -d skia_conflict -Atqc \
  "SELECT count(*) FILTER (WHERE placement_policy IS NOT NULL),max(placement_policy) FILTER (WHERE code='SERVER'),max(placement_policy) FILTER (WHERE code='CUSTOM_TEST') FROM asset_types")"
[[ "$conflict_state" == '13|ZONE|' ]]

# Missing canonical targets must also be rejected before any UPDATE.
docker exec "$container" psql -X -U postgres -d skia_conflict -v ON_ERROR_STOP=1 \
  -c "DELETE FROM asset_types WHERE code='MDF'" >/dev/null
if docker exec "$container" psql -X -U postgres -d skia_conflict -v ON_ERROR_STOP=1 -1 \
  -f /repo/migrations/025_asset_type_placement_policy_provisioning.sql >/dev/null 2>&1; then
  echo 'MISSING_TARGET_DRIFT=UNEXPECTEDLY_ACCEPTED' >&2
  exit 1
fi

printf 'POSTGRES_VERSION=%s\n' "$(docker exec "$container" psql -X -U postgres -d skia_prod -Atqc 'SHOW server_version')"
printf 'MIGRATION_CHAIN=PASS\nIDEMPOTENCY=PASS\nLEDGER_COUNT=%s\n' "$ledger"
printf 'TARGET_ASSET_TYPES_EXPECTED=13\nTARGET_ASSET_TYPES_WITH_EXPECTED_POLICY=13\n'
printf 'UNEXPECTED_ASSET_TYPES_UPDATED=0\nASSET_TYPES_INSERTED=0\nASSET_TYPES_DELETED=0\n'
printf 'ASSET_CLASS_ROWS_CHANGED=0\nEXISTING_ASSET_ROWS_CHANGED=0\nPLACEMENT_ROWS_CHANGED=0\nRELATIONSHIP_ROWS_CHANGED=0\n'
printf 'ACCESS_POINT_CREATED=NO\nUNKNOWN_ASSET_TYPE_UNCHANGED=YES\n'
printf 'CONFLICT_DRIFT=DENIED\nMISSING_TARGET_DRIFT=DENIED\nPLACEMENT_POLICY_PROVISIONING=APPROVED\n'
