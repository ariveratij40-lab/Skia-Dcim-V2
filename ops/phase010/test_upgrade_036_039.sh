#!/usr/bin/env bash
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PYTHONDONTWRITEBYTECODE=1
exec 2> >(python3 "$repo/ops/phase010/upgrade_harness_diagnostics.py" --redact-stream >&2)
stage=$(mktemp -d /tmp/skia-upgrade-matrix.XXXXXX)
container=skia-upgrade-matrix-$(basename "$stage" | tr '.' '-')-$$
password=$(openssl rand -hex 20)
finish(){
 local rc=$?
 trap - EXIT
 if [[ "$rc" != 0 ]]; then
  # Snapshot before any cleanup; preserve failed DB/container for diagnosis.
  PYTHONDONTWRITEBYTECODE=1 python3 "$repo/ops/phase010/upgrade_harness_diagnostics.py" \
   --container "$container" --directory "$stage/diagnostics" --exit-code "$rc" || true
  printf 'FAILED_CONTAINER_PRESERVED=%s\nEVIDENCE=%s\n' "$container" "$stage"
 else
  # Success cleanup only; anonymous PG volume belongs exclusively to this run.
  docker rm -fv "$container-api" "$container" >/dev/null 2>&1 || true
 fi
 exit "$rc"
}
trap finish EXIT
printf 'DISPOSABLE_CONTAINER=%s\nEVIDENCE=%s\n' "$container" "$stage"
mkdir "$stage/source"
git -C "$repo" archive 658cfa35becaf75f851a27d44180fef20ea0f2ce | tar -xf - -C "$stage/source"
docker run -d --name "$container" -e POSTGRES_USER=skia_bootstrap -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod postgres:16.14-alpine >/dev/null
ready=NO
for _ in {1..60}; do
 if docker logs "$container" 2>&1 | grep -q 'PostgreSQL init process complete' && docker exec "$container" psql -X -U skia_bootstrap -d skia_prod -Atc 'select 1' >/dev/null 2>&1; then ready=YES; break; fi
 sleep 1
done
[[ "$ready" == YES ]]
docker cp "$stage/source/." "$container":/fixture
provision(){
 docker exec "$container" psql -X -U skia_bootstrap -d skia_prod -v ON_ERROR_STOP=1 -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" -f /fixture/ops/phase011/provision_database_roles.sql >/dev/null
}
provision
docker exec -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" "$container" bash /fixture/ops/phase010/run_clean_bootstrap.sh >/dev/null
provision
docker exec "$container" psql -X -U skia_bootstrap -d skia_prod -v ON_ERROR_STOP=1 -v phase011_environment=production -v expected_database=skia_prod -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED -f /fixture/ops/phase011/activate_clean_production_rls.sql >/dev/null
UPGRADE_CONTAINER="$container" UPGRADE_STAGE="$stage" UPGRADE_PASSWORD="$password" PYTHONDONTWRITEBYTECODE=1 python3 "$repo/ops/phase010/test_upgrade_036_039.py"
printf 'EVIDENCE=%s\n' "$stage"
