#!/usr/bin/env bash
set -euo pipefail

repo_root="${1:?repository root required}"
source_sql="$repo_root/ops/phase005/activate_canonical_rls.sql"
expected_sha=44ce694fa159b4c75c88bddc09d6de84955a7e72d7f3d4e7dce9c5d439ceaad9
: "${PROD_MIGRATOR_DSN:?PROD_MIGRATOR_DSN is required}"

actual_sha="$(sha256sum "$source_sql" | awk '{print $1}')"
[[ "$actual_sha" == "$expected_sha" ]] || {
  echo 'BLOCKED: canonical PHASE-005 RLS source hash differs' >&2
  exit 65
}

adapted="$(mktemp)"
trap 'rm -f "$adapted"' EXIT
chmod 600 "$adapted"
sed \
  -e "s/:'phase005_environment' = 'staging'/:'phase005_environment' = 'production'/" \
  -e "s/PHASE005_CANONICAL_RLS_ACTIVATION_APPROVED/PHASE011_CANONICAL_RLS_ACTIVATION_APPROVED/g" \
  "$source_sql" > "$adapted"

psql "$PROD_MIGRATOR_DSN" -X -v ON_ERROR_STOP=1 \
  -v phase005_environment=production \
  -v expected_database=skia_prod \
  -v execution_approval=PHASE011_CANONICAL_RLS_ACTIVATION_APPROVED \
  -f "$adapted"
