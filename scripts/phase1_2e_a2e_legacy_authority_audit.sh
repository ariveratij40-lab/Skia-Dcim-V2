#!/usr/bin/env bash
set -euo pipefail

# Phase 1.2E A2E — Legacy Authority Eradication Audit
# Read-only gate. It MUST NOT mutate source files or PostgreSQL data/schema.
#
# Usage:
#   DATABASE_URL='postgres://...' bash scripts/phase1_2e_a2e_legacy_authority_audit.sh
# or provide PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD for psql.

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

BASE_EXPECTED="9d1fcd9e47eb0485e87b4fd012f1c851d10002ab"
BRANCH_EXPECTED="phase/1.2e-a2e-legacy-authority-audit"

printf 'PHASE_1_2E_A2E_AUDIT=START\n'
printf 'HEAD=%s\n' "$(git rev-parse HEAD)"
printf 'BRANCH=%s\n' "$(git branch --show-current)"
printf 'BASE_IS_ANCESTOR='; git merge-base --is-ancestor "$BASE_EXPECTED" HEAD && echo YES || echo NO

printf '\n=== 1. RUNTIME SOURCE REFERENCES TO LEGACY AUTHORITY ===\n'
# Exact rack_id token intentionally does not match housing_rack_id.
# Historical migrations, docs, generated artifacts, vendor code and tests are
# excluded from the runtime blocker count but audited separately below.
RUNTIME_PATHS=(backend frontend)
RUNTIME_EXCLUDES=(
  '--glob=!**/*_test.go'
  '--glob=!**/*.test.ts'
  '--glob=!**/*.test.tsx'
  '--glob=!**/node_modules/**'
  '--glob=!**/.next/**'
  '--glob=!**/dist/**'
)

set +e
RUNTIME_EXACT="$(rg -n --hidden --no-heading "\\brack_id\\b|\\brackId\\b" "${RUNTIME_PATHS[@]}" "${RUNTIME_EXCLUDES[@]}" 2>/dev/null)"
RUNTIME_RC=$?
set -e
if [[ $RUNTIME_RC -gt 1 ]]; then
  echo "RUNTIME_SCAN_ERROR=YES"
  exit 2
fi
if [[ -n "$RUNTIME_EXACT" ]]; then
  echo "$RUNTIME_EXACT"
  RUNTIME_COUNT="$(printf '%s\n' "$RUNTIME_EXACT" | wc -l | tr -d ' ')"
else
  RUNTIME_COUNT=0
fi
printf 'RUNTIME_LEGACY_REFERENCE_COUNT=%s\n' "$RUNTIME_COUNT"

printf '\n=== 2. HISTORICAL / TEST REFERENCES (NON-RUNTIME EVIDENCE) ===\n'
set +e
HISTORICAL="$(rg -n --hidden --no-heading "\\brack_id\\b|\\brackId\\b" migrations docs backend frontend \
  --glob='**/*_test.go' --glob='**/*.test.ts' --glob='**/*.test.tsx' --glob='migrations/**' --glob='docs/**' 2>/dev/null)"
HISTORICAL_RC=$?
set -e
if [[ $HISTORICAL_RC -gt 1 ]]; then
  echo "HISTORICAL_SCAN_ERROR=YES"
  exit 2
fi
if [[ -n "$HISTORICAL" ]]; then
  echo "$HISTORICAL"
  HISTORICAL_COUNT="$(printf '%s\n' "$HISTORICAL" | wc -l | tr -d ' ')"
else
  HISTORICAL_COUNT=0
fi
printf 'HISTORICAL_TEST_REFERENCE_COUNT=%s\n' "$HISTORICAL_COUNT"

printf '\n=== 3. MIGRATION 035 ABSENCE ===\n'
if compgen -G 'migrations/035*' >/dev/null; then
  echo 'MIGRATION_035_PRESENT=YES'
  printf '%s\n' migrations/035*
else
  echo 'MIGRATION_035_PRESENT=NO'
fi

printf '\n=== 4. POSTGRESQL LEGACY DATA / DIVERGENCE / DB DEPENDENCIES ===\n'
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
SELECT 'LEGACY_VALUES|assets.specs.rack_id|' || count(*) FILTER (WHERE specs ? 'rack_id') || '|TOTAL|' || count(*)
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

printf '\n=== 5. GATE SUMMARY ===\n'
if [[ "$RUNTIME_COUNT" -eq 0 ]]; then
  echo 'STATIC_RUNTIME_GATE=PASS'
else
  echo 'STATIC_RUNTIME_GATE=BLOCKED'
fi

echo 'PHASE_1_2E_A2E_AUDIT=COMPLETE'
