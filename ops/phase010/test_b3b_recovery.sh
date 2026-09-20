#!/usr/bin/env bash
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tooling_sha="${B3B_TOOLING_SHA:?Exact committed B3B_TOOLING_SHA required}"
[[ "$tooling_sha" =~ ^[0-9a-f]{40}$ ]]
[[ "$(git -C "$repo" rev-parse "$tooling_sha^{commit}")" == "$tooling_sha" ]]
test_root=$(mktemp -d /tmp/skia-hf3.XXXXXX)
container=skia-hf3-$$
password=$(openssl rand -hex 20)
trap 'docker rm -f "$container-api" "$container-web" "$container" >/dev/null 2>&1 || true' EXIT
mkdir "$test_root/application" "$test_root/pre039" "$test_root/tooling"
paths=(docs/phases/active/PHASE_1_2F_B3B_RELEASE_ALIGNMENT.md
 docs/phase1_2f/PHASE_1_2F_B3B_RELEASE_ALIGNMENT.md docs/phase1_2f/B3B_RECOVERY_SECURITY_AUTHORITY.md
 ops/phase010/b3b_release.py ops/phase010/b3b_recovery.py ops/phase010/b3b_structure.sql
 ops/phase010/test_b3b_release.py ops/phase010/test_b3b_release.sh
 ops/phase010/test_b3b_recovery.py ops/phase010/test_b3b_recovery.sh)
git -C "$repo" archive "$tooling_sha" -- "${paths[@]}" | tar -xf - -C "$test_root/tooling"
git -C "$repo" archive 0c01d79ae714465ab95aac896e4100d0be893185 | tar -xf - -C "$test_root/application"
cp -R "$test_root/application/." "$test_root/pre039/"
# Historical fixture only; never edit the immutable application package.
sed -i.bak '/040_nomenclature_v2_initial_preset_catalog.sql/d' "$test_root/pre039/ops/phase010/bootstrap.manifest"
docker run --name "$container" -e POSTGRES_USER=skia_bootstrap -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=skia_prod -d postgres:16.14-alpine >/dev/null
for _ in {1..40}; do
 docker exec "$container" pg_isready -U skia_bootstrap -d skia_prod >/dev/null 2>&1 && break
 sleep 1
done
docker cp "$test_root/pre039/." "$container":/fixture
provision(){
 docker exec "$container" psql -X -U skia_bootstrap -d skia_prod -v ON_ERROR_STOP=1 \
  -v migrator_password="$password" -v runtime_password="$password" -v onboarding_password="$password" \
  -f /fixture/ops/phase011/provision_database_roles.sql >/dev/null
}
provision
docker exec -e PHASE010_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod" "$container" bash /fixture/ops/phase010/run_clean_bootstrap.sh >/dev/null
provision
docker exec "$container" psql -X -U skia_bootstrap -d skia_prod -v ON_ERROR_STOP=1 \
 -v phase011_environment=production -v expected_database=skia_prod \
 -v execution_approval=PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED \
 -f /fixture/ops/phase011/activate_clean_production_rls.sql >/dev/null
docker exec "$container" psql -X -U skia_bootstrap -d skia_prod -v ON_ERROR_STOP=1 \
 -c "INSERT INTO tenants(id,name) VALUES ('b3b00000-0000-4000-8000-000000000001','HF3 recovery fixture')" >/dev/null
if [[ "${B3B_RUNTIME_SMOKE:-NO}" == YES ]]; then
 docker run -d --name "$container-api" --network "container:$container" \
  -e DATABASE_URL="postgresql://skia_runtime:$password@localhost/skia_prod?sslmode=disable" \
  -e MIGRATOR_DATABASE_URL="postgresql://skia_migrator:$password@localhost/skia_prod?sslmode=disable" \
  -e ONBOARDING_DATABASE_URL="postgresql://skia_onboarding:$password@localhost/skia_prod?sslmode=disable" \
  -e SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true \
  --health-cmd='wget -q --spider http://localhost:8080/api/health' --health-interval=2s \
  skia-hf3-api:0c01d79 >/dev/null
 docker run -d --name "$container-web" --network "container:$container" \
  --health-cmd='wget -q --spider http://127.0.0.1:3000/login' --health-interval=2s \
  skia-hf3-web:0c01d79 >/dev/null
 for _ in {1..60}; do
  if [[ "$(docker inspect -f '{{.State.Health.Status}}' "$container-api")" == healthy && \
        "$(docker inspect -f '{{.State.Health.Status}}' "$container-web")" == healthy ]]; then break; fi
  sleep 1
 done
fi
B3B_DISPOSABLE=YES B3B_CONTAINER="$container" B3B_APPLICATION="$test_root/application" \
B3B_GIT_REPO="$repo" B3B_TOOLING_SHA="$tooling_sha" B3B_PASSWORD="$password" \
PYTHONDONTWRITEBYTECODE=1 python3 "$test_root/tooling/ops/phase010/test_b3b_recovery.py"
printf 'HF3_EVIDENCE_ROOT=%s\n' "$test_root"
