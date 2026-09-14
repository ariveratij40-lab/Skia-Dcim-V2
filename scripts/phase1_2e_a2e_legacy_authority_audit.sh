#!/usr/bin/env bash
set -euo pipefail

# Phase 1.2E A2E — Legacy Authority Eradication Audit
# Read-only gate. It MUST NOT mutate source files or PostgreSQL data/schema.
#
# Blocking storage authorities:
#   switches.rack_id
#   patch_panels.rack_id
#   pdus.rack_id
#   assets.specs['rack_id'] / assets.specs->>'rack_id'
#
# Non-blocking compatibility names include JSON/API `rack_id`, RackBuilder
# `rackId`, racks.id identifiers, and aliases sourced from
# assets.housing_rack_id.
#
# Usage:
#   bash scripts/phase1_2e_a2e_legacy_authority_audit.sh --static-only
#   DATABASE_URL='postgres://...' bash scripts/phase1_2e_a2e_legacy_authority_audit.sh

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

BASE_EXPECTED="9d1fcd9e47eb0485e87b4fd012f1c851d10002ab"
STATIC_ONLY=NO
if [[ "${1:-}" == "--static-only" ]]; then
  STATIC_ONLY=YES
elif [[ $# -gt 0 ]]; then
  echo "UNKNOWN_ARGUMENT=$1"
  exit 64
fi

printf 'PHASE_1_2E_A2E_AUDIT=START\n'
printf 'HEAD=%s\n' "$(git rev-parse HEAD)"
printf 'BRANCH=%s\n' "$(git branch --show-current)"
printf 'BASE_IS_ANCESTOR='; git merge-base --is-ancestor "$BASE_EXPECTED" HEAD && echo YES || echo NO
printf 'STATIC_ONLY=%s\n' "$STATIC_ONLY"

printf '\n=== 1. RUNTIME REFERENCES TO LEGACY STORAGE AUTHORITIES ===\n'
# Frontend/API contract names cannot directly read/write PostgreSQL storage
# authorities, so the blocking scan is intentionally backend-only.
# Patterns target explicit SQL alias/column usage and JSON specs authority.
if command -v rg >/dev/null 2>&1; then
  BLOCK_PATTERN='(?is)\b(?:sw|pp|pdu|s|p)\.rack_id\b|\b(?:switches|patch_panels|pdus)\.rack_id\b|\bUPDATE\s+(?:public\.)?(?:switches|patch_panels|pdus)\s+SET\b[^;`]{0,500}\brack_id\b|\bINSERT\s+INTO\s+(?:public\.)?(?:switches|patch_panels|pdus)\s*\([^)]*\brack_id\b|\bSELECT\b[^;`]{0,700}\brack_id\b[^;`]{0,700}\bFROM\s+(?:public\.)?(?:switches|patch_panels|pdus)\b|\bspecs\s*(?:->>?\s*|\[\s*)["'"'']rack_id["'"'']'
  set +e
  RUNTIME_EXACT="$(rg -n -U -P --hidden --no-heading \
    --glob='!**/*_test.go' \
    --glob='!**/node_modules/**' \
    --glob='!**/dist/**' \
    "$BLOCK_PATTERN" backend 2>/dev/null)"
  RUNTIME_RC=$?
  set -e
else
  set +e
  RUNTIME_EXACT="$(grep -RInE \
    '(^|[^[:alnum:]_])((sw|pp|pdu|s|p)\.rack_id|(switches|patch_panels|pdus)\.rack_id|specs.*rack_id)([^[:alnum:]_]|$)' \
    backend --include='*.go' --exclude='*_test.go' 2>/dev/null)"
  RUNTIME_RC=$?
  set -e
fi

if [[ $RUNTIME_RC -gt 1 ]]; then
  echo 'RUNTIME_SCAN_ERROR=YES'
  exit 2
fi
if [[ -n "$RUNTIME_EXACT" ]]; then
  echo "$RUNTIME_EXACT"
  RUNTIME_COUNT="$(printf '%s\n' "$RUNTIME_EXACT" | wc -l | tr -d ' ')"
else
  RUNTIME_COUNT=0
fi
printf 'RUNTIME_LEGACY_AUTHORITY_REFERENCE_COUNT=%s\n' "$RUNTIME_COUNT"

printf '\n=== 2. GENERIC rack_id/rackId CONTRACT NAMES (NON-BLOCKING EVIDENCE) ===\n'
if command -v rg >/dev/null 2>&1; then
  set +e
  GENERIC="$(rg -n --hidden --no-heading \
    --glob='!**/*_test.go' \
    --glob='!**/*.test.ts' \
    --glob='!**/*.test.tsx' \
    --glob='!**/node_modules/**' \
    --glob='!**/.next/**' \
    --glob='!**/dist/**' \
    '\brack_id\b|\brackId\b' backend frontend 2>/dev/null)"
  GENERIC_RC=$?
  set -e
else
  set +e
  GENERIC="$(grep -RInE '(^|[^[:alnum:]_])(rack_id|rackId)([^[:alnum:]_]|$)' backend frontend \
    --include='*.go' --include='*.ts' --include='*.tsx' \
    --exclude='*_test.go' --exclude='*.test.ts' --exclude='*.test.tsx' \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist 2>/dev/null)"
  GENERIC_RC=$?
  set -e
fi
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
if command -v rg >/dev/null 2>&1; then
  set +e
  HISTORICAL="$(rg -n --hidden --no-heading \
    --glob='**/*_test.go' --glob='**/*.test.ts' --glob='**/*.test.tsx' \
    --glob='migrations/**' --glob='docs/**' \
    '\brack_id\b|\brackId\b' migrations docs backend frontend 2>/dev/null)"
  HISTORICAL_RC=$?
  set -e
else
  HISTORICAL=""
  HISTORICAL_RC=0
fi
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
  MIGRATION_035_PRESENT=YES
else
  echo 'MIGRATION_035_PRESENT=NO'
  MIGRATION_035_PRESENT=NO
fi

printf '\n=== 5. STATIC GATE SUMMARY ===\n'
if [[ "$RUNTIME_COUNT" -eq 0 ]]; then
  echo 'STATIC_RUNTIME_GATE=PASS'
else
  echo 'STATIC_RUNTIME_GATE=BLOCKED'
fi

if [[ "$STATIC_ONLY" == YES ]]; then
  echo 'DB_AUDIT=SKIPPED_STATIC_ONLY'
  echo 'PHASE_1_2E_A2E_AUDIT=COMPLETE'
  exit 0
fi

printf '\n=== 6. POSTGRESQL LEGACY DATA / DIVERGENCE / DB DEPENDENCIES ===\n'
if ! command -v psql >/dev/null 2>&1; then
  echo 'PSQL_AVAILABLE=NO'
  echo 'DB_AUDIT=NOT_RUN'
  exit 3
fi
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
echo 'PHASE_1_2E_A2E_AUDIT=COMPLETE'
