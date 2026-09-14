#!/usr/bin/env bash
set -euo pipefail

# Phase 1.2E A2E — Legacy Authority Eradication Audit
# Read-only gate. It MUST NOT mutate source files or PostgreSQL data/schema.
#
# The blocker is use of the deprecated storage authorities themselves:
#   switches.rack_id
#   patch_panels.rack_id
#   pdus.rack_id
#   assets.specs['rack_id'] / assets.specs->>'rack_id'
#
# API/DTO names such as JSON "rack_id", RackBuilder rackId, racks.id identifiers,
# and aliases such as assets.housing_rack_id AS rack_id are compatibility names
# and are NOT legacy storage-authority references.

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

BASE_EXPECTED="9d1fcd9e47eb0485e87b4fd012f1c851d10002ab"

printf 'PHASE_1_2E_A2E_AUDIT=START\n'
printf 'HEAD=%s\n' "$(git rev-parse HEAD)"
printf 'BRANCH=%s\n' "$(git branch --show-current)"
printf 'BASE_IS_ANCESTOR='; git merge-base --is-ancestor "$BASE_EXPECTED" HEAD && echo YES || echo NO

printf '\n=== 1. RUNTIME REFERENCES TO LEGACY STORAGE AUTHORITIES ===\n'
# Multiline PCRE2 patterns intentionally target table-qualified SQL/storage
# access. Generic rack_id/rackId API names are not blockers.
RUNTIME_PATHS=(backend frontend)
RUNTIME_EXCLUDES=(
  '--glob=!**/*_test.go'
  '--glob=!**/*.test.ts'
  '--glob=!**/*.test.tsx'
  '--glob=!**/node_modules/**'
  '--glob=!**/.next/**'
  '--glob=!**/dist/**'
)

PATTERN='(?is)(switches|patch_panels|pdus)\s*(?:\.|[^;`]{0,220})\brack_id\b|\b(?:s|sw|p|pp|pdu)\.rack_id\b|\bspecs\s*(?:->>?\s*|\[\s*)["'"'']rack_id["'"'']|\bspecs\b[^\n;]{0,120}["'"'']rack_id["'"'']'

if command -v rg >/dev/null 2>&1; then
  set +e
  RUNTIME_EXACT="$(rg -n -U -P --hidden --no-heading "$PATTERN" "${RUNTIME_PATHS[@]}" "${RUNTIME_EXCLUDES[@]}" 2>/dev/null)"
  RUNTIME_RC=$?
  set -e
  if [[ $RUNTIME_RC -gt 1 ]]; then
    echo 'RUNTIME_SCAN_ERROR=YES'
    exit 2
  fi
else
  # Conservative fallback: search explicit legacy table/JSON authority forms.
  set +e
  RUNTIME_EXACT="$(grep -RInE '(switches|patch_panels|pdus).*rack_id|\.(rack_id)\b|specs.*rack_id' backend frontend \
    --include='*.go' --include='*.ts' --include='*.tsx' \
    --exclude='*_test.go' --exclude='*.test.ts' --exclude='*.test.tsx' \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist 2>/dev/null)"
  RUNTIME_RC=$?
  set -e
  if [[ $RUNTIME_RC -gt 1 ]]; then
    echo 'RUNTIME_SCAN_ERROR=YES'
    exit 2
  fi
fi

if [[ -n "$RUNTIME_EXACT" ]]; then
  echo "$RUNTIME_EXACT"
  RUNTIME_COUNT="$(printf '%s\n' "$RUNTIME_EXACT" | wc -l | tr -d ' ')"
else
  RUNTIME_COUNT=0
fi
printf 'RUNTIME_LEGACY_AUTHORITY_REFERENCE_COUNT=%s\n' "$RUNTIME_COUNT"

printf '\n=== 2. GENERIC rack_id/rackId CONTRACT NAMES (NON-BLOCKING EVIDENCE) ===\n'
set +e
GENERIC="$(rg -n --hidden --no-heading '\brack_id\b|\brackId\b' backend frontend \
  --glob='!**/*_test.go' --glob='!**/*.test.ts' --glob='!**/*.test.tsx' \
  --glob='!**/node_modules/**' --glob='!**/.next/**' --glob='!**/dist/**' 2>/dev/null)"
GENERIC_RC=$?
set -e
if [[ $GENERIC_RC -gt 1 ]]; then
  echo 'GENERIC_SCAN_ERROR=YES'
  exit 2
fi
if [[ -n "$GENERIC" ]]; then
  echo "$GENERIC"
  GENERIC_COUNT="$(printf '%s\n' "$GENERIC" | wc -l | tr -d ' ')"
else
  GENERIC_COUNT=0
fi
printf 'GENERIC_RACK_CONTRACT_REFERENCE_COUNT=%s\n' "$GENERIC_COUNT"

printf '\n=== 3. HISTORICAL / TEST REFERENCES (NON-RUNTIME EVIDENCE) ===\n'
set +e
HISTORICAL="$(rg -n --hidden --no-heading '\brack_id\b|\brackId\b' migrations docs backend frontend \
  --glob='**/*_test.go' --glob='**/*.test.ts' --glob='**/*.test.tsx' --glob='migrations/**' --glob='docs/**' 2>/dev/null)"
HISTORICAL_RC=$?
set -e
if [[ $HISTORICAL_RC -gt 1 ]]; then
  echo 'HISTORICAL_SCAN_ERROR=YES'
  exit 2
fi
if [[ -n "$HISTORICAL" ]]; then
  echo "$HISTORICAL"
  HISTORICAL_COUNT="$(printf '%s\n' "$HISTORICAL" | wc -l | tr -d ' ')"
else
  HISTORICAL_COUNT=0
fi
printf 'HISTORICAL_TEST_REFERENCE_COUNT=%s\n' "$HISTORICAL_COUNT"

printf '\n=== 4. MIGRATION 035 ABSENCE ===\n'
if compgen -G 'migrations/035*' >/dev/null; then
  echo 'MIGRATION_035_PRESENT=YES'
  printf '%s\n' migrations/035*
else
  echo 'MIGRATION_035_PRESENT=NO'
fi

printf '\n=== 5. POSTGRESQL LEGACY DATA / DIVERGENCE / DB DEPENDENCIES ===\n'
if ! command -v psql >/dev/null 2>&1; then
  echo 'PSQL_AVAILABLE=NO'
  echo 'DB_AUDIT=NOT_RUN'
else
  echo 'PSQL_AVAILABLE=YES'
  PSQL=(psql -X -v ON_ERROR_STOP=1 -At)
  if [[ -n "${DATABASE_URL:-}" ]]; then
    PSQL+=("$DATABASE_URL")
  fi

  "${PSQL[@]}" <<'SQL'
BEGIN READ ONLY;

SELECT 'LEGACY_COLUMN|' || table_name || '.' || column_name
FROM information_schema.columns
WHERE table_schema='public'
  AND (table_name,column_name) IN (
    ('switches','rack_id'),
    ('patch_panels','rack_id'),
    ('pdus','rack_id')
  )
ORDER BY table_name,column_name;

SELECT 'LEGACY_VALUES|switches.rack_id|' || count(*) FILTER (WHERE rack_id IS NOT NULL) || '|TOTAL|' || count(*)
FROM public.switches
UNION ALL
SELECT 'LEGACY_VALUES|patch_panels.rack_id|' || count(*) FILTER (WHERE rack_id IS NOT NULL) || '|TOTAL|' || count(*)
FROM public.patch_panels
UNION ALL
SELECT 'LEGACY_VALUES|pdus.rack_id|' || count(*) FILTER (WHERE rack_id IS NOT NULL) || '|TOTAL|' || count(*)
FROM public.pdus
UNION ALL
SELECT 'LEGACY_VALUES|assets.specs.rack_id|' || count(*) FILTER (WHERE specs ? 'rack_id' AND NULLIF(btrim(specs->>'rack_id'),'') IS NOT NULL) || '|TOTAL|' || count(*)
FROM public.assets;

SELECT 'DIVERGENCE|switches.rack_id_vs_assets.housing_rack_id|' || count(*)
FROM public.switches s
JOIN public.assets a ON a.id=s.asset_id AND a.tenant_id=s.tenant_id AND a.branch_id=s.branch_id
WHERE s.rack_id IS NOT NULL AND s.rack_id IS DISTINCT FROM a.housing_rack_id
UNION ALL
SELECT 'DIVERGENCE|patch_panels.rack_id_vs_assets.housing_rack_id|' || count(*)
FROM public.patch_panels p
JOIN public.assets a ON a.id=p.asset_id AND a.tenant_id=p.tenant_id AND a.branch_id=p.branch_id
WHERE p.rack_id IS NOT NULL AND p.rack_id IS DISTINCT FROM a.housing_rack_id
UNION ALL
SELECT 'DIVERGENCE|pdus.rack_id_vs_assets.housing_rack_id|' || count(*)
FROM public.pdus p
JOIN public.assets a ON a.id=p.asset_id AND a.tenant_id=p.tenant_id AND a.branch_id=p.branch_id
WHERE p.rack_id IS NOT NULL AND p.rack_id IS DISTINCT FROM a.housing_rack_id
UNION ALL
SELECT 'DIVERGENCE|assets.specs.rack_id_vs_assets.housing_rack_id|' || count(*)
FROM public.assets a
WHERE a.specs ? 'rack_id'
  AND NULLIF(btrim(a.specs->>'rack_id'),'') IS DISTINCT FROM a.housing_rack_id::text;

SELECT 'DB_VIEW_DEPENDENCY|' || schemaname || '.' || viewname
FROM pg_views
WHERE schemaname NOT IN ('pg_catalog','information_schema')
  AND definition ~ '(^|[^A-Za-z0-9_])rack_id([^A-Za-z0-9_]|$)'
ORDER BY schemaname,viewname;

SELECT 'DB_FUNCTION_DEPENDENCY|' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  AND pg_get_functiondef(p.oid) ~ '(^|[^A-Za-z0-9_])rack_id([^A-Za-z0-9_]|$)'
ORDER BY n.nspname,p.proname;

ROLLBACK;
SQL
  echo 'DB_AUDIT=COMPLETE_READ_ONLY'
fi

printf '\n=== 6. GATE SUMMARY ===\n'
if [[ "$RUNTIME_COUNT" -eq 0 ]]; then
  echo 'STATIC_RUNTIME_GATE=PASS'
else
  echo 'STATIC_RUNTIME_GATE=BLOCKED'
fi

echo 'PHASE_1_2E_A2E_AUDIT=COMPLETE'
