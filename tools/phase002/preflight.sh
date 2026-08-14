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
  admin_variants integer;
  operator_variants integer;
  empty_role_sets integer;
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

  -- Exact role names are application semantics. Approximate permission-name
  -- matching is forbidden: all eligible source pairs must be equivalent.
  WITH role_sets AS (
    SELECT r.name,count(rp.permission_id) AS permission_count,
           md5(coalesce(string_agg(rp.permission_id::text,',' ORDER BY rp.permission_id),'')) AS permission_hash
    FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id
    WHERE r.name IN ('admin','operator') AND NOT r.is_global
    GROUP BY r.id,r.name
  )
  SELECT count(DISTINCT permission_hash) FILTER (WHERE name='admin'),
         count(DISTINCT permission_hash) FILTER (WHERE name='operator'),
         count(*) FILTER (WHERE permission_count=0)
    INTO admin_variants,operator_variants,empty_role_sets FROM role_sets;
  IF admin_variants<>1 OR operator_variants<>1 OR empty_role_sets<>0 THEN
    RAISE EXCEPTION 'RBAC equivalence is absent or ambiguous (admin variants %, operator variants %)',admin_variants,operator_variants;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM roles r JOIN role_permissions rp ON rp.role_id=r.id
    WHERE r.name IN ('admin','operator') AND NOT r.is_global
    GROUP BY r.tenant_id HAVING count(DISTINCT r.name)=2
  ) THEN
    RAISE EXCEPTION 'no tenant contains a complete real admin/operator source pair';
  END IF;

  -- Canonical V1 rows are allowed for idempotent verification/convergence.
  -- Same aliases bound to any noncanonical ID are foreign collisions.
  IF EXISTS (SELECT 1 FROM tenants WHERE name IN ('TEST-TENANT-A','TEST-TENANT-B','TEST-TENANT-C') AND id::text NOT LIKE '02000000-0000-4000-8000-%')
     OR EXISTS (SELECT 1 FROM branches WHERE name LIKE 'TEST-BRANCH-%' AND id::text NOT LIKE '02000000-0000-4000-8100-%')
     OR EXISTS (SELECT 1 FROM users WHERE email LIKE 'phase002-%@test.invalid' AND id::text NOT LIKE '02000000-0000-4000-8200-%')
     OR EXISTS (SELECT 1 FROM assets WHERE internal_code LIKE 'TEST-ASSET-%'
       AND id<>md5('phase002:asset:'||substring(internal_code from 12 for 2)||':'||right(internal_code,3))::uuid) THEN
    RAISE EXCEPTION 'noncanonical TEST collision detected; preparation is blocked';
  END IF;
END
$preflight$;

SELECT current_database() AS database_checked,
       current_user AS runtime_role,
       CASE WHEN EXISTS (SELECT 1 FROM tenants WHERE id::text LIKE '02000000-0000-4000-8000-%')
            THEN 'canonical V1 present: idempotent verification/convergence mode'
            ELSE 'empty canonical fixture range: preparation mode' END AS fixture_mode;
WITH source_tenant AS (
  SELECT r.tenant_id FROM roles r JOIN role_permissions rp ON rp.role_id=r.id
  WHERE r.name IN ('admin','operator') AND NOT r.is_global
  GROUP BY r.tenant_id HAVING count(DISTINCT r.name)=2 ORDER BY r.tenant_id LIMIT 1
), source AS (
  SELECT r.id,r.tenant_id,r.name,
         count(rp.permission_id) AS permission_count,
         md5(string_agg(rp.permission_id::text,',' ORDER BY rp.permission_id)) AS permission_hash
  FROM roles r JOIN role_permissions rp ON rp.role_id=r.id
  WHERE r.name IN ('admin','operator') AND NOT r.is_global
    AND r.tenant_id=(SELECT tenant_id FROM source_tenant)
  GROUP BY r.id,r.tenant_id,r.name
)
SELECT name,id::text AS deterministic_source_role,tenant_id::text AS source_tenant,
       permission_count,permission_hash FROM source ORDER BY name;
ROLLBACK;
SQL
