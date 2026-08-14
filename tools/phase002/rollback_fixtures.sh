#!/usr/bin/env bash
set -euo pipefail

die() { printf 'PHASE-002 rollback wrapper: %s\n' "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "required command unavailable: $1"; }
mode() { stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1"; }

[[ "${SKIA_ENVIRONMENT:-}" == staging ]] || die "staging-only guard failed"
[[ "${PHASE002_ROLLBACK_APPROVAL:-}" == PHASE002_ROLLBACK_V1_APPROVED ]] || die "rollback approval missing"
[[ -n "${PHASE002_MANIFEST_PATH:-}" && -f "$PHASE002_MANIFEST_PATH" ]] || die "external manifest missing"
[[ ! -L "$PHASE002_MANIFEST_PATH" ]] || die "manifest symlinks are forbidden"
[[ "$PHASE002_MANIFEST_PATH" == /* ]] || die "manifest path must be absolute"
[[ "$(mode "$PHASE002_MANIFEST_PATH")" == 600 ]] || die "manifest mode must be 600"
[[ "${PHASE002_MANIFEST_SHA256:-}" =~ ^[0-9a-f]{64}$ ]] || die "expected SHA-256 must be 64 lowercase hex characters"
[[ "${PHASE002_EXPECTED_ROLE_PERMISSION_COUNT:-}" == 3 ]] || die "approved RBAC permission-row count must equal 3"
[[ "${PHASE002_EXPECTED_SESSION_COUNT:-}" =~ ^[0-9]+$ ]] || die "exact session-row count missing"
[[ -n "${PHASE002_EXPECTED_DB:-}" && -n "${DATABASE_URL:-}" ]] || die "authorized database inputs missing"

repo_root="$(git rev-parse --show-toplevel)"
case "$PHASE002_MANIFEST_PATH" in "$repo_root"/*) die "manifest must be outside repository";; esac

if command -v shasum >/dev/null 2>&1; then
  actual_sha="$(shasum -a 256 "$PHASE002_MANIFEST_PATH" | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  actual_sha="$(sha256sum "$PHASE002_MANIFEST_PATH" | awk '{print $1}')"
else
  die "no SHA-256 implementation available"
fi
[[ "$actual_sha" == "$PHASE002_MANIFEST_SHA256" ]] || die "manifest checksum mismatch; psql was not invoked"
need psql

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec psql -X "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v wrapper_checksum_verified=SHA256_MATCHED_BY_ROLLBACK_WRAPPER \
  -v phase002_environment=staging \
  -v execution_approval="$PHASE002_ROLLBACK_APPROVAL" \
  -v expected_db="$PHASE002_EXPECTED_DB" \
  -v expected_role_permission_count="$PHASE002_EXPECTED_ROLE_PERMISSION_COUNT" \
  -v expected_session_count="$PHASE002_EXPECTED_SESSION_COUNT" \
  -v manifest_path="$PHASE002_MANIFEST_PATH" \
  -f "$script_dir/rollback_fixtures.sql"
