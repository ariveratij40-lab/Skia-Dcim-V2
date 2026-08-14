#!/usr/bin/env bash
set -euo pipefail

die() { printf 'PHASE-002 isolation runner: %s\n' "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "required command unavailable: $1"; }
[[ "${SKIA_ENVIRONMENT:-}" == staging ]] || die "staging-only guard failed"
[[ "${PHASE002_TEST_APPROVAL:-}" == PHASE002_CAMPAIGN_AUTHORIZED ]] || die "campaign approval missing"
[[ "${PHASE002_CAMPAIGN:-}" == A || "${PHASE002_CAMPAIGN:-}" == B ]] || die "campaign must be A or B"
[[ -n "${PHASE002_BASE_URL:-}" ]] || die "PHASE002_BASE_URL missing"
[[ "$PHASE002_BASE_URL" == https://* ]] || die "HTTPS is required"
[[ -f "${PHASE002_CONTEXT_FILE:-}" ]] || die "external context file missing"
[[ -f "${PHASE002_CREDENTIALS_FILE:-}" ]] || die "external credentials file missing"
[[ "$(stat -f '%Lp' "$PHASE002_CREDENTIALS_FILE" 2>/dev/null || stat -c '%a' "$PHASE002_CREDENTIALS_FILE")" == 600 ]] || die "credentials file mode must be 600"
need curl

# Both files must live outside the repository. They contain shell assignments;
# the context file has fixture IDs, while the credential file has temporary passwords.
repo_root="$(git rev-parse --show-toplevel)"
case "$PHASE002_CONTEXT_FILE" in "$repo_root"/*) die "context file must be outside repository";; esac
case "$PHASE002_CREDENTIALS_FILE" in "$repo_root"/*) die "credentials file must be outside repository";; esac
# shellcheck disable=SC1090
source "$PHASE002_CONTEXT_FILE"
# shellcheck disable=SC1090
source "$PHASE002_CREDENTIALS_FILE"

tmp_dir="$(mktemp -d)"
trap 'find "$tmp_dir" -type f -exec sh -c '\''for f do : > "$f"; done'\'' sh {} + 2>/dev/null || true; rm -rf "$tmp_dir"' EXIT
results="$tmp_dir/results.tsv"

request() {
  local id="$1" actor="$2" method="$3" path="$4" body="${5:-}" jar="$tmp_dir/${actor}.cookies"
  local code safe_path
  safe_path="$(printf '%s' "${path%%\?*}" | sed -E 's/[0-9a-fA-F-]{36}/[REDACTED-ID]/g')"
  if [[ -n "$body" ]]; then
    code="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --request "$method" \
      --cookie "$jar" --cookie-jar "$jar" --header 'Content-Type: application/json' --data-binary @- \
      "$PHASE002_BASE_URL$path" <<<"$body")"
  else
    code="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --request "$method" \
      --cookie "$jar" --cookie-jar "$jar" "$PHASE002_BASE_URL$path")"
  fi
  printf '%s\t%s\t%s\t%s\n' "$id" "$actor" "$safe_path" "$code" >>"$results"
}
login() {
  local id="$1" actor="$2" email_var="$3" password_var="$4"
  local email="${!email_var:-}" password="${!password_var:-}"
  [[ -n "$email" && -n "$password" ]] || die "credentials missing for $actor"
  request "$id" "$actor" POST /api/auth/login "{\"email\":\"$email\",\"password\":\"$password\"}"
}

# ISO-001..022 follow the approved matrix. Fixture IDs come from the
# nonsensitive external context file. Responses/cookies/tokens are never emitted.
login ISO-001 a_admin EMAIL_A_ADMIN PASSWORD_A_ADMIN
request ISO-001 a_admin GET /api/auth/me
request ISO-002 invalid POST /api/auth/login '{"email":"invalid@test.invalid","password":"invalid"}'
request ISO-003 a_admin POST /api/auth/select-tenant "{\"tenantId\":\"$TENANT_A_ID\"}"
request ISO-004 a_admin POST /api/auth/select-branch "{\"branchId\":\"$BRANCH_A1_ID\"}"

login SETUP-a_operator a_operator EMAIL_A_OPERATOR PASSWORD_A_OPERATOR
request ISO-005 a_operator GET /api/dcim/assets
request ISO-006 a_operator POST /api/auth/select-branch "{\"branchId\":\"$BRANCH_A2_ID\"}"
login SETUP-a_multi a_multi EMAIL_A_MULTI PASSWORD_A_MULTI
request ISO-007 a_multi POST /api/auth/select-branch "{\"branchId\":\"$BRANCH_A1_ID\"}"
request ISO-007 a_multi GET /api/dcim/assets
request ISO-007 a_multi POST /api/auth/select-branch "{\"branchId\":\"$BRANCH_A2_ID\"}"
request ISO-007 a_multi GET /api/dcim/assets
request ISO-008 a_admin POST /api/auth/select-tenant "{\"tenantId\":\"$TENANT_B_ID\"}"
request ISO-009 a_admin POST /api/auth/select-branch "{\"branchId\":\"$BRANCH_B1_ID\"}"
request ISO-010 a_admin GET "/api/dcim/assets?tenant_id=$TENANT_B_ID&branch_id=$BRANCH_B1_ID"
request ISO-011 a_admin GET "/api/dcim/assets/$ASSET_A1_001_ID"
printf 'ISO-011\ta_admin\tlogs/relationships endpoint not detected\tBLOQUEADO\n' >>"$results"
request ISO-012 a_admin GET "/api/dcim/assets/$ASSET_B1_001_ID"
printf 'ISO-012\ta_admin\tcross-tenant relationship endpoint not detected\tBLOQUEADO\n' >>"$results"
printf 'ISO-013\tactor_without_context\texternal setup required\tBLOQUEADO\n' >>"$results"
printf 'ISO-014\tactor_without_branch\texternal setup required\tBLOQUEADO\n' >>"$results"
request ISO-015 invalid_session GET /api/dcim/assets
printf 'ISO-016\texpired_or_revoked\tnatural expiry/read-only correlation required\tBLOQUEADO\n' >>"$results"

login SETUP-b_admin b_admin EMAIL_B_ADMIN PASSWORD_B_ADMIN
request ISO-017 b_admin POST /api/auth/select-branch "{\"branchId\":\"$BRANCH_B1_ID\"}"
request ISO-017 b_admin GET /api/dcim/assets
login SETUP-c_admin c_admin EMAIL_C_ADMIN PASSWORD_C_ADMIN
request ISO-018 c_admin POST /api/auth/select-branch "{\"branchId\":\"$BRANCH_C2_ID\"}"
request ISO-018 c_admin GET /api/dcim/assets
request ISO-019 b_admin POST /api/auth/select-tenant "{\"tenantId\":\"$TENANT_C_ID\"}"
request ISO-019 b_admin POST /api/auth/select-branch "{\"branchId\":\"$BRANCH_C1_ID\"}"
request ISO-020 c_admin POST /api/auth/select-tenant "{\"tenantId\":\"$TENANT_A_ID\"}"
request ISO-020 c_admin POST /api/auth/select-branch "{\"branchId\":\"$BRANCH_A2_ID\"}"

for tenant in a b c; do
  actor="${tenant}_operator"
  email_var="EMAIL_${tenant^^}_OPERATOR"
  password_var="PASSWORD_${tenant^^}_OPERATOR"
  login SETUP-operator "$actor" "$email_var" "$password_var"
  request ISO-021 "$actor" POST /api/auth/logout
  request ISO-021 "$actor" GET /api/auth/me
done
printf 'ISO-022\tall actors\tPOSTGRES read-only correlation required\tBLOQUEADO\n' >>"$results"

printf 'Campaign %s completed. Redacted result columns: test, actor alias, path, HTTP code.\n' "$PHASE002_CAMPAIGN"
sed 's/[[:cntrl:]]//g' "$results"
