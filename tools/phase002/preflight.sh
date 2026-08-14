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
[[ -n "${PHASE002_ACTIVE_BACKEND_SOURCE_ROOT:-}" ]] || die "active backend release source root is required"
[[ "${PHASE002_BACKEND_PROVENANCE_ACK:-}" == "ACTIVE_BACKEND_RELEASE_SOURCE" ]] || die "active backend provenance acknowledgement missing"
[[ "${PHASE002_NEUTRAL_ROLE_NAME:-}" == "operator" ]] || die "approved neutral role name must equal operator"
[[ "${PHASE002_EXPECTED_BACKEND_SHA:-}" == "d155910c231e96446672508534ccec83bf0d830f" ]] || die "backend SHA differs from the approved CAMPAÑA A runtime baseline"
need psql
need git

actual_host="$(hostname)"
[[ "$actual_host" =~ $PHASE002_EXPECTED_HOST_REGEX ]] || die "host is not authorized for this staging preflight"
backend_git_root="$(git -C "$PHASE002_ACTIVE_BACKEND_SOURCE_ROOT" rev-parse --show-toplevel 2>/dev/null)" || die "active backend source provenance is not a Git checkout"
active_backend_root="$(cd "$backend_git_root" && pwd -P)"
[[ "$active_backend_root" != "/opt/apps/skia/staging" ]] || die "legacy staging checkout is not accepted as active backend provenance"
actual_backend_sha="$(git -C "$active_backend_root" rev-parse HEAD)"
[[ "$actual_backend_sha" == "$PHASE002_EXPECTED_BACKEND_SHA" ]] || die "active backend release SHA is not the approved runtime baseline"

runtime_trace_paths=(
  backend/main.go backend/import_handlers.go backend/tenant_middleware.go
  backend/tenant_context.go backend/role_scope.go backend/dcim_assets.go
  backend/config_admin.go backend/dashboard.go backend/session_context.go
  backend/session_store.go backend/postgres_session_store.go
)
for runtime_path in "${runtime_trace_paths[@]}"; do
  git -C "$active_backend_root" cat-file -e "$PHASE002_EXPECTED_BACKEND_SHA:$runtime_path" 2>/dev/null \
    || die "approved runtime source path is absent: $runtime_path"
done
git -C "$active_backend_root" diff --quiet "$PHASE002_EXPECTED_BACKEND_SHA" -- "${runtime_trace_paths[@]}" \
  || die "active backend authorization source differs from approved runtime SHA"
[[ -z "$(git -C "$active_backend_root" status --porcelain --untracked-files=all -- "${runtime_trace_paths[@]}")" ]] \
  || die "active backend authorization source has local modifications"

phase003_governance_evidence_sha="7d68fa2e6b2dff05cfec9d21fed81c88414fd90c"
static_role_trace_sha="d2e9c3519a18915ab3867d6526f0d1100559bd16"
printf '%s\n' \
  "phase003_governance_evidence_sha=$phase003_governance_evidence_sha" \
  "canonical_static_role_trace_sha=$static_role_trace_sha" \
  "active_backend_runtime_sha=$actual_backend_sha" \
  "relevant_runtime_source_differs=false" \
  "frontend_runtime_sha=UNKNOWN_BLOCKED"

# Transaction is explicitly read-only; output contains booleans/counts, never credentials.
psql -X "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v expected_db="$PHASE002_EXPECTED_DB" \
  -v expected_host_regex="$PHASE002_EXPECTED_HOST_REGEX" \
  -v governance_evidence_sha="$phase003_governance_evidence_sha" \
  -v static_role_trace_sha="$static_role_trace_sha" \
  -v active_backend_sha="$actual_backend_sha" \
  -v neutral_role_name="$PHASE002_NEUTRAL_ROLE_NAME" <<'SQL'
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
  permission_rows integer;
  permission_id uuid;
  permission_global boolean;
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

  -- PHASE-003 approved one neutral runtime role name and one normative,
  -- NO-ENFORCED catalog permission. Never infer or clone a real role set.
  SELECT count(*),(array_agg(id ORDER BY id))[1],bool_or(is_global)
    INTO permission_rows,permission_id,permission_global
    FROM permissions WHERE code='dcim:view';
  IF permission_rows<>1
     OR permission_id<>'550e8400-e29b-41d4-a716-446655440401'::uuid
     OR permission_global THEN
    RAISE EXCEPTION 'approved normative permission dcim:view is absent, ambiguous, global, or has an unexpected ID';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    WHERE t.relname='roles' AND c.contype='c'
      AND pg_get_constraintdef(c.oid) ~* 'name'
      AND pg_get_constraintdef(c.oid) !~* 'operator'
  ) THEN
    RAISE EXCEPTION 'roles.name has a check constraint not proven compatible with operator';
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
  IF EXISTS (
    SELECT 1 FROM roles
    WHERE id::text LIKE '02000000-0000-4000-8300-%'
      AND (id::text NOT IN ('02000000-0000-4000-8300-0000000000a2',
                            '02000000-0000-4000-8300-0000000000b2',
                            '02000000-0000-4000-8300-0000000000c2')
           OR name<>'operator' OR is_global)
  ) THEN
    RAISE EXCEPTION 'canonical role range contains an obsolete, privileged, or unexpected role';
  END IF;
  IF EXISTS (
    SELECT 1 FROM roles r
    WHERE (r.id='02000000-0000-4000-8300-0000000000a2'::uuid AND r.tenant_id<>'02000000-0000-4000-8000-00000000000a'::uuid)
       OR (r.id='02000000-0000-4000-8300-0000000000b2'::uuid AND r.tenant_id<>'02000000-0000-4000-8000-00000000000b'::uuid)
       OR (r.id='02000000-0000-4000-8300-0000000000c2'::uuid AND r.tenant_id<>'02000000-0000-4000-8000-00000000000c'::uuid)
  ) THEN
    RAISE EXCEPTION 'canonical neutral role is attached to an unexpected tenant';
  END IF;
END
$preflight$;

SELECT current_database() AS database_checked,
       current_user AS runtime_role,
       :'governance_evidence_sha' AS phase003_governance_evidence_sha,
       :'static_role_trace_sha' AS canonical_static_role_trace_sha,
       :'active_backend_sha' AS active_backend_runtime_sha,
       false AS relevant_runtime_source_differs,
       'UNKNOWN_BLOCKED' AS frontend_runtime_sha,
       :'neutral_role_name' AS neutral_role_name,
       CASE WHEN EXISTS (SELECT 1 FROM tenants WHERE id::text LIKE '02000000-0000-4000-8000-%')
            THEN 'canonical V1 present: idempotent verification/convergence mode'
            ELSE 'empty canonical fixture range: preparation mode' END AS fixture_mode;
SELECT code,id::text AS normative_permission_id,is_global,
       md5(id::text) AS permission_set_hash,
       'NO ENFORCED' AS runtime_enforcement
FROM permissions WHERE code='dcim:view';
ROLLBACK;
SQL
