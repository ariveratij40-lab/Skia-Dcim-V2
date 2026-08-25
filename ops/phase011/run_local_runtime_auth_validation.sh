#!/usr/bin/env bash
set -euo pipefail

die() { printf 'BLOCKED: %s\n' "$*" >&2; exit 1; }
[[ "${PHASE011_LOCAL_TEST_APPROVAL:-}" == PHASE011_EPHEMERAL_POSTGRES_APPROVED ]] || die 'explicit local-test approval missing'
command -v docker >/dev/null || die 'docker is required'

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="skia-phase011-runtime-auth-test-$$"
bootstrap_password='phase011-bootstrap-test'
runtime_password='phase011-runtime-test'
migrator_password='phase011-migrator-test'
onboarding_password='phase011-onboarding-test'
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$container" \
  -e POSTGRES_PASSWORD="$bootstrap_password" \
  -v "$repo_root:/repo:ro" postgres:16-alpine >/dev/null
until docker exec -e PGPASSWORD="$bootstrap_password" "$container" pg_isready -U postgres >/dev/null 2>&1; do
  sleep 1
done
docker exec -e PGPASSWORD="$bootstrap_password" "$container" \
  psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c 'CREATE DATABASE skia_prod' >/dev/null

provision() {
  docker exec -e PGPASSWORD="$bootstrap_password" "$container" \
    psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 \
    -v migrator_password="$migrator_password" \
    -v runtime_password="$runtime_password" \
    -v onboarding_password="$onboarding_password" \
    -f /repo/ops/phase011/provision_database_roles.sql >/dev/null
}

provision
docker exec -e PHASE010_DATABASE_URL="postgresql://skia_migrator:${migrator_password}@localhost/skia_prod" "$container" \
  /repo/ops/phase010/run_clean_bootstrap.sh >/dev/null
provision
provision

docker exec -e PGPASSWORD="$bootstrap_password" "$container" \
  psql -X -U postgres -d skia_prod -f /repo/ops/phase011/validate_onboarding_role.sql >/dev/null
docker exec -e PGPASSWORD="$bootstrap_password" "$container" \
  psql -X -U postgres -d skia_prod -f /repo/ops/phase011/validate_runtime_auth_role.sql

docker exec -e PGPASSWORD="$bootstrap_password" "$container" \
  psql -X -U postgres -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO tenants(id,name,logo,created_at) VALUES ('10000000-0000-0000-0000-000000000001','Runtime validation','',NOW());
INSERT INTO users(id,email,name,password_hash,status,created_at) VALUES ('20000000-0000-0000-0000-000000000001','runtime-validation@example.invalid','Runtime','$test$','active',NOW());
INSERT INTO branches(id,tenant_id,name,city,status,created_at) VALUES ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Principal','Principal','active',NOW());
INSERT INTO user_tenants(user_id,tenant_id) VALUES ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
INSERT INTO user_branches(user_id,branch_id) VALUES ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
SQL

docker exec -e PGPASSWORD="$runtime_password" "$container" \
  psql -X -U skia_runtime -d skia_prod -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
SELECT id FROM users WHERE email='runtime-validation@example.invalid';
SELECT t.id FROM tenants t JOIN user_tenants ut ON ut.tenant_id=t.id WHERE ut.user_id='20000000-0000-0000-0000-000000000001';
SELECT b.id FROM branches b JOIN user_branches ub ON ub.branch_id=b.id WHERE ub.user_id='20000000-0000-0000-0000-000000000001';
SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id='20000000-0000-0000-0000-000000000001';
SELECT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id WHERE false;
INSERT INTO sessions(id,user_id,token,expires_at,created_at) VALUES ('60000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','runtime-validation-token',4102444800,NOW());
SELECT id FROM sessions WHERE token='runtime-validation-token';
UPDATE sessions SET tenant_id='10000000-0000-0000-0000-000000000001',branch_id='30000000-0000-0000-0000-000000000001' WHERE token='runtime-validation-token';
DELETE FROM sessions WHERE token='runtime-validation-token';
SQL

expect_denied() {
  local statement="$1"
  if docker exec -e PGPASSWORD="$runtime_password" "$container" \
    psql -X -U skia_runtime -d skia_prod -v ON_ERROR_STOP=1 -c "$statement" >/dev/null 2>&1; then
    die "runtime unexpectedly executed: $statement"
  fi
}
expect_denied "INSERT INTO users(id,email,name,password_hash,status,created_at) VALUES ('70000000-0000-0000-0000-000000000001','denied@example.invalid','Denied','x','active',NOW())"
expect_denied 'UPDATE users SET name=name'
expect_denied 'DELETE FROM users'
expect_denied 'TRUNCATE sessions'
expect_denied 'SELECT * FROM tickets'
expect_denied 'CREATE TABLE runtime_forbidden(id integer)'
expect_denied 'CREATE ROLE runtime_forbidden'

printf 'PHASE011_RUNTIME_AUTH_LOCAL_VALIDATION=APPROVED\n'
