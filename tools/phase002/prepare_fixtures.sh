#!/usr/bin/env bash
set -euo pipefail

# Safety wrapper for prepare_fixtures.sql. This wrapper only establishes and
# protects the external manifest destination; it does not grant execution
# approval. All SQL guards and required psql variables remain mandatory.

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${PHASE002_MANIFEST_PATH:?PHASE002_MANIFEST_PATH is required}"

command -v git >/dev/null 2>&1 || { echo "BLOCKED: git is required for tooling provenance" >&2; exit 20; }
command -v psql >/dev/null 2>&1 || { echo "BLOCKED: psql is required" >&2; exit 20; }

script_source=${BASH_SOURCE[0]}
script_name=$(basename -- "$script_source")
script_dir=$(cd -- "$(dirname -- "$script_source")" 2>/dev/null && pwd -P) \
  || { echo "BLOCKED: cannot resolve wrapper directory" >&2; exit 20; }
wrapper_path="$script_dir/$script_name"
sql_path="$script_dir/prepare_fixtures.sql"

[[ -f "$wrapper_path" && ! -L "$wrapper_path" ]] \
  || { echo "BLOCKED: wrapper must be a regular canonical file" >&2; exit 20; }
[[ -f "$sql_path" && ! -L "$sql_path" ]] \
  || { echo "BLOCKED: canonical prepare_fixtures.sql is missing or is a symlink" >&2; exit 20; }

repo_root=$(git -C "$script_dir" rev-parse --show-toplevel 2>/dev/null) \
  || { echo "BLOCKED: wrapper is not inside a Git checkout" >&2; exit 20; }
repo_root=$(cd -- "$repo_root" && pwd -P) \
  || { echo "BLOCKED: cannot resolve Git checkout" >&2; exit 20; }
[[ "$script_dir" == "$repo_root/tools/phase002" ]] \
  || { echo "BLOCKED: wrapper is outside the canonical tools/phase002 directory" >&2; exit 20; }
[[ "$repo_root" != "/opt/apps/skia/staging" ]] \
  || { echo "BLOCKED: legacy staging checkout is not accepted" >&2; exit 20; }

tooling_paths=(tools/phase002/prepare_fixtures.sh tools/phase002/prepare_fixtures.sql)
for tooling_path in "${tooling_paths[@]}"; do
  git -C "$repo_root" ls-files --error-unmatch "$tooling_path" >/dev/null 2>&1 \
    || { echo "BLOCKED: canonical tooling file is not tracked" >&2; exit 20; }
done
git -C "$repo_root" diff --quiet HEAD -- "${tooling_paths[@]}" \
  || { echo "BLOCKED: canonical tooling has local modifications" >&2; exit 20; }
git -C "$repo_root" diff --cached --quiet HEAD -- "${tooling_paths[@]}" \
  || { echo "BLOCKED: canonical tooling has staged modifications" >&2; exit 20; }
tooling_checkout_sha=$(git -C "$repo_root" rev-parse HEAD)
[[ "$tooling_checkout_sha" =~ ^[0-9a-f]{40}$ ]] \
  || { echo "BLOCKED: tooling checkout SHA is invalid" >&2; exit 20; }
printf 'phase002_tooling_checkout_sha=%s\n' "$tooling_checkout_sha"

psql_vars=()
while (($#)); do
  [[ "$1" == "-v" && $# -ge 2 && "$2" == *=* ]] \
    || { echo "BLOCKED: only approved psql variables are accepted" >&2; exit 20; }
  variable_name=${2%%=*}
  case "$variable_name" in
    phase002_environment|expected_db|execution_approval|profile_baseline_approval|neutral_role_name|\
    hash_a_admin|hash_a_operator|hash_a_multi|hash_b_admin|hash_b_operator|hash_b_multi|\
    hash_c_admin|hash_c_operator|hash_c_multi) ;;
    *) echo "BLOCKED: unapproved psql variable" >&2; exit 20 ;;
  esac
  psql_vars+=("$1" "$2")
  shift 2
done

case "$PHASE002_MANIFEST_PATH" in
  /*) ;;
  *) echo "BLOCKED: manifest path must be absolute" >&2; exit 20 ;;
esac

case "$PHASE002_MANIFEST_PATH" in
  "$repo_root"|"$repo_root"/*)
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
  -v repo_root="$repo_root" \
  "${psql_vars[@]}" \
  -f "$sql_path"

if [[ ! -s "$PHASE002_MANIFEST_PATH" ]]; then
  echo "FAILED: committed preparation did not produce a manifest" >&2
  exit 25
fi

trap - EXIT
echo "Fixture preparation completed; manifest retained externally with mode 0600."
