#!/usr/bin/env bash
set -euo pipefail

# Read-only gate for PHASE-002. This script never prepares or removes fixtures.
die() { printf 'PHASE-002 preflight: %s\n' "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "required command unavailable: $1"; }

[[ "${SKIA_ENVIRONMENT:-}" == "staging" ]] || die "SKIA_ENVIRONMENT must equal staging"
[[ "${PHASE002_PREFLIGHT_ACK:-}" == "READ_ONLY_STAGING_PREFLIGHT" ]] || die "explicit read-only acknowledgement missing"
[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is required via the authorized external environment"
[[ -n "${PHASE002_EXPECTED_DB:-}" ]] || die "PHASE002_EXPECTED_DB is required"
[[ -n "${PHASE002_EXPECTED_HOST_REGEX:-}" ]] || die "PHASE002_EXPECTED_HOST_REGEX is required"
need psql

actual_host="$(hostname)"
[[ "$actual_host" =~ $PHASE002_EXPECTED_HOST_REGEX ]] || die "host is not authorized for this staging preflight"

# Transaction is explicitly read-only; output contains booleans/counts, never credentials.
psql -X "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v expected_db="$PHASE002_EXPECTED_DB" \
  -v expected_host_regex="$PHASE002_EXPECTED_HOST_REGEX" <<'SQL'
BEGIN READ ONLY;
SELECT (current_database() = :'expected_db') AS database_matches \gset
\if :database_matches
\else
  \echo 'BLOCKED: unexpected database'
  \quit 22
\endif

DO $preflight$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(required.name, ', ')
    INTO missing
    FROM (VALUES
      ('tenants'), ('branches'), ('users'), ('user_tenants'), ('user_branches'),
      ('roles'), ('permissions'), ('role_permissions'), ('user_roles'), ('sessions'),
      ('asset_types'), ('assets'), ('asset_logs'), ('asset_relationships')
    ) AS required(name)
   WHERE to_regclass('public.' || required.name) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'incompatible schema; missing required tables: %', missing;
  END IF;

  IF EXISTS (
    SELECT 1 FROM tenants WHERE name IN ('TEST-TENANT-A','TEST-TENANT-B','TEST-TENANT-C')
  ) OR EXISTS (
    SELECT 1 FROM branches WHERE name IN
      ('TEST-BRANCH-A1','TEST-BRANCH-A2','TEST-BRANCH-B1','TEST-BRANCH-B2','TEST-BRANCH-C1','TEST-BRANCH-C2')
  ) OR EXISTS (
    SELECT 1 FROM users WHERE email LIKE 'phase002-%@test.invalid'
  ) OR EXISTS (
    SELECT 1 FROM assets WHERE internal_code LIKE 'TEST-ASSET-%'
  ) THEN
    RAISE EXCEPTION 'fixture collision detected; preparation is blocked';
  END IF;
END
$preflight$;

SELECT current_database() AS database_checked,
       current_user AS runtime_role,
       'compatible/no TEST collision' AS result;
ROLLBACK;
SQL
