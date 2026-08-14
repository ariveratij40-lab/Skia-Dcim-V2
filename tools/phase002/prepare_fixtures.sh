#!/usr/bin/env bash
set -euo pipefail

# Safety wrapper for prepare_fixtures.sql. This wrapper only establishes and
# protects the external manifest destination; it does not grant execution
# approval. All SQL guards and required psql variables remain mandatory.

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${PHASE002_MANIFEST_PATH:?PHASE002_MANIFEST_PATH is required}"
: "${PHASE002_REPO_ROOT:?PHASE002_REPO_ROOT is required}"

case "$PHASE002_MANIFEST_PATH" in
  /*) ;;
  *) echo "BLOCKED: manifest path must be absolute" >&2; exit 20 ;;
esac

case "$PHASE002_REPO_ROOT" in
  /*) ;;
  *) echo "BLOCKED: repository root must be absolute" >&2; exit 20 ;;
esac

case "$PHASE002_MANIFEST_PATH" in
  "$PHASE002_REPO_ROOT"|"$PHASE002_REPO_ROOT"/*)
    echo "BLOCKED: manifest path must be outside the repository" >&2
    exit 21
    ;;
esac

manifest_parent=${PHASE002_MANIFEST_PATH%/*}
if [[ ! -d "$manifest_parent" || -L "$manifest_parent" ]]; then
  echo "BLOCKED: manifest parent must be an existing non-symlink directory" >&2
  exit 22
fi
if [[ -e "$PHASE002_MANIFEST_PATH" || -L "$PHASE002_MANIFEST_PATH" ]]; then
  echo "BLOCKED: manifest destination already exists" >&2
  exit 23
fi

umask 077
: >"$PHASE002_MANIFEST_PATH"
chmod 600 "$PHASE002_MANIFEST_PATH"

cleanup_failed_manifest() {
  status=$?
  if (( status != 0 )); then
    rm -f -- "$PHASE002_MANIFEST_PATH"
  fi
  exit "$status"
}
trap cleanup_failed_manifest EXIT

manifest_mode=$(stat -c '%a' -- "$PHASE002_MANIFEST_PATH" 2>/dev/null || true)
if [[ ! "$manifest_mode" =~ ^[0-7]{3,4}$ ]]; then
  manifest_mode=$(stat -f '%Lp' "$PHASE002_MANIFEST_PATH" 2>/dev/null || true)
fi
if [[ ! "$manifest_mode" =~ ^[0-7]{3,4}$ ]]; then
  echo "BLOCKED: no supported stat implementation returned an octal mode" >&2
  exit 24
fi
manifest_mode=${manifest_mode#0}
if [[ "$manifest_mode" != 600 ]]; then
  echo "BLOCKED: manifest permissions are not 0600" >&2
  exit 24
fi

psql -X "$DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -v manifest_path="$PHASE002_MANIFEST_PATH" \
  -v repo_root="$PHASE002_REPO_ROOT" \
  "$@"

if [[ ! -s "$PHASE002_MANIFEST_PATH" ]]; then
  echo "FAILED: committed preparation did not produce a manifest" >&2
  exit 25
fi

trap - EXIT
echo "Fixture preparation completed; manifest retained externally with mode 0600."
