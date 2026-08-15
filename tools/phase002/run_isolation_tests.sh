#!/usr/bin/env bash
set -euo pipefail

tmp_dir=
results=
campaign_complete=false
results_emitted=false

emit_results() {
  local execution_status="$1" process_exit="$2"
  [[ "$results_emitted" == false ]] || return 0
  results_emitted=true
  printf 'CAMPAIGN_EXECUTION_STATUS=%s\n' "$execution_status"
  printf 'PROCESS_EXIT_CODE=%s\n' "$process_exit"
  printf 'Campaign %s verdicts (no bodies, cookies, tokens or IDs):\n' "${PHASE002_CAMPAIGN:-UNKNOWN}"
  if [[ -n "$results" && -f "$results" ]]; then
    awk -F '\t' 'BEGIN {OFS="\t"} {print $1,$2,$3,$4,$5,$6,$7,$8,$9}' "$results"
  else
    printf 'ID\tACTOR\tOPERATION\tHTTP\tSTATUS\tEXPECTED_COUNT\tOBSERVED_COUNT\tCROSS_TENANT_LEAK\tCROSS_BRANCH_LEAK\n'
  fi
}

finalize() {
  local process_exit=$? execution_status=INCOMPLETE
  trap - EXIT HUP INT TERM
  if [[ "$campaign_complete" == true && "$process_exit" == 0 ]]; then
    execution_status=COMPLETE
  fi
  emit_results "$execution_status" "$process_exit"
  if [[ -n "$tmp_dir" && -d "$tmp_dir" ]]; then
    find "$tmp_dir" -type f -exec sh -c 'for f do : > "$f"; done' sh {} + 2>/dev/null || true
    rm -rf "$tmp_dir"
  fi
  exit "$process_exit"
}

terminate() {
  local signal="$1" code=1
  case "$signal" in
    HUP) code=129 ;;
    INT) code=130 ;;
    TERM) code=143 ;;
  esac
  exit "$code"
}

trap finalize EXIT
trap 'terminate HUP' HUP
trap 'terminate INT' INT
trap 'terminate TERM' TERM

tmp_dir="$(mktemp -d)"
chmod 700 "$tmp_dir"
results="$tmp_dir/results.tsv"
umask 077
printf 'ID\tACTOR\tOPERATION\tHTTP\tSTATUS\tEXPECTED_COUNT\tOBSERVED_COUNT\tCROSS_TENANT_LEAK\tCROSS_BRANCH_LEAK\n' >"$results"

die() { printf 'PHASE-002 isolation runner: %s\n' "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "required command unavailable: $1"; }
mode() {
  local value
  value=$(stat -c '%a' -- "$1" 2>/dev/null || true)
  if [[ ! "$value" =~ ^[0-7]{3,4}$ ]]; then
    value=$(stat -f '%Lp' "$1" 2>/dev/null || true)
  fi
  [[ "$value" =~ ^[0-7]{3,4}$ ]] || return 1
  printf '%s\n' "${value#0}"
}

[[ "${SKIA_ENVIRONMENT:-}" == staging ]] || die "staging-only guard failed"
[[ "${PHASE002_TEST_APPROVAL:-}" == PHASE002_CAMPAIGN_AUTHORIZED ]] || die "campaign approval missing"
[[ "${PHASE002_CAMPAIGN:-}" == A || "${PHASE002_CAMPAIGN:-}" == B ]] || die "campaign must be A or B"
[[ "${PHASE002_BASE_URL:-}" == https://* ]] || die "authorized HTTPS base URL missing"
[[ -f "${PHASE002_CONTEXT_FILE:-}" ]] || die "external context file missing"
[[ -f "${PHASE002_CREDENTIALS_FILE:-}" ]] || die "external credentials file missing"
[[ "$(mode "$PHASE002_CONTEXT_FILE")" == 600 ]] || die "context file mode must be 600"
[[ "$(mode "$PHASE002_CREDENTIALS_FILE")" == 600 ]] || die "credentials file mode must be 600"
need curl
need jq

repo_root="$(git rev-parse --show-toplevel)"
case "$PHASE002_CONTEXT_FILE" in "$repo_root"/*) die "context file must be outside repository";; esac
case "$PHASE002_CREDENTIALS_FILE" in "$repo_root"/*) die "credentials file must be outside repository";; esac
# Files are generated through the separately authorized secret-delivery process.
# shellcheck disable=SC1090
source "$PHASE002_CONTEXT_FILE"
# shellcheck disable=SC1090
source "$PHASE002_CREDENTIALS_FILE"

HTTP_CODE=000
BODY_FILE=
http_request() {
  local actor="$1" method="$2" path="$3" body="${4:-}"
  local jar="$tmp_dir/${actor}.cookies"
  BODY_FILE="$(mktemp "$tmp_dir/body.XXXXXX")"
  chmod 600 "$BODY_FILE"
  if [[ -n "$body" ]]; then
    HTTP_CODE="$(curl --silent --show-error --output "$BODY_FILE" --write-out '%{http_code}' --request "$method" \
      --cookie "$jar" --cookie-jar "$jar" --header 'Content-Type: application/json' --data-binary @- \
      "$PHASE002_BASE_URL$path" <<<"$body")"
  else
    HTTP_CODE="$(curl --silent --show-error --output "$BODY_FILE" --write-out '%{http_code}' --request "$method" \
      --cookie "$jar" --cookie-jar "$jar" "$PHASE002_BASE_URL$path")"
  fi
}

record() {
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$@" >>"$results"
}

expect_code() {
  local id="$1" actor="$2" operation="$3" allowed="$4"
  local status=FALLIDO
  [[ " $allowed " == *" $HTTP_CODE "* ]] && status=APROBADO
  record "$id" "$actor" "$operation" "$HTTP_CODE" "$status" N/A N/A false false
}

expect_denied() {
  local id="$1" actor="$2" operation="$3"
  local status=FALLIDO
  [[ " $HTTP_CODE " == ' 401 ' || " $HTTP_CODE " == ' 403 ' || " $HTTP_CODE " == ' 404 ' ]] && status=APROBADO
  record "$id" "$actor" "$operation" "$HTTP_CODE" "$status" 0 0 false false
}

validate_asset_list() {
  local id="$1" actor="$2" operation="$3" expected_prefix="$4" expected_id="$5" expected_count="$6"
  local expected_tenant="${expected_prefix:11:1}" expected_branch="${expected_prefix:11:2}"
  local observed=0 other_tenant=0 other_branch=0 expected_id_seen=0 missing_aliases=0 status=FALLIDO n alias
  if [[ "$HTTP_CODE" == 200 ]] && jq -e '.assets | type == "array"' "$BODY_FILE" >/dev/null 2>&1; then
    observed="$(jq '[.assets[] | select((.internal_code // "") | startswith("TEST-ASSET-"))] | length' "$BODY_FILE")"
    expected_id_seen="$(jq --arg id "$expected_id" '[.assets[] | select(.id == $id)] | length' "$BODY_FILE")"
    other_tenant="$(jq --arg tenant "$expected_tenant" '[.assets[] | (.internal_code // "") as $code | select(($code | test("^TEST-ASSET-")) and ($code[11:12] != $tenant))] | length' "$BODY_FILE")"
    other_branch="$(jq --arg branch "$expected_branch" '[.assets[] | (.internal_code // "") as $code | select(($code | test("^TEST-ASSET-")) and ($code[11:13] != $branch))] | length' "$BODY_FILE")"
    for n in {1..10}; do
      alias="$(printf '%s-%03d' "$expected_prefix" "$n")"
      jq -e --arg code "$alias" 'any(.assets[]; .internal_code == $code)' "$BODY_FILE" >/dev/null || missing_aliases=$((missing_aliases+1))
    done
    if [[ "$observed" == "$expected_count" && "$expected_id_seen" == 1 && "$missing_aliases" == 0 && "$other_tenant" == 0 && "$other_branch" == 0 ]]; then
      status=APROBADO
    fi
  fi
  record "$id" "$actor" "$operation" "$HTTP_CODE" "$status" "$expected_count" "$observed" \
    "$([[ "$other_tenant" == 0 ]] && echo false || echo true)" \
    "$([[ "$other_branch" == 0 ]] && echo false || echo true)"
  if [[ "$other_tenant" != 0 ]]; then
    return 86
  fi
}

login_actor() {
  local id="$1" actor="$2" email_var="$3" password_var="$4"
  local email="${!email_var:-}" password="${!password_var:-}"
  [[ -n "$email" && -n "$password" ]] || die "credentials missing for actor alias $actor"
  http_request "$actor" POST /api/auth/login "{\"email\":\"$email\",\"password\":\"$password\"}"
  expect_code "$id" "$actor" login '200'
}

select_tenant() { http_request "$1" POST /api/auth/select-tenant "{\"tenantId\":\"$2\"}"; }
select_branch() { http_request "$1" POST /api/auth/select-branch "{\"branchId\":\"$2\"}"; }

# Explicit expectations for ISO-001..ISO-022.
login_actor ISO-001 a_admin EMAIL_A_ADMIN PASSWORD_A_ADMIN
http_request a_admin GET /api/auth/me; expect_code ISO-001 a_admin session '200'
invalid_email="${EMAIL_INVALID:-}"; invalid_password="${PASSWORD_INVALID:-}"
[[ -n "$invalid_email" && -n "$invalid_password" ]] || die "external invalid-login test values missing"
http_request invalid POST /api/auth/login "{\"email\":\"$invalid_email\",\"password\":\"$invalid_password\"}"
expect_denied ISO-002 invalid invalid_login
select_tenant a_admin "$TENANT_A_ID"; expect_code ISO-003 a_admin select_tenant_A '200'
select_branch a_admin "$BRANCH_A1_ID"; expect_code ISO-004 a_admin select_branch_A1 '200'

login_actor SETUP a_operator EMAIL_A_OPERATOR PASSWORD_A_OPERATOR
select_tenant a_operator "$TENANT_A_ID"; select_branch a_operator "$BRANCH_A1_ID"
http_request a_operator GET /api/dcim/assets; validate_asset_list ISO-005 a_operator assets_A1 TEST-ASSET-A1 "$ASSET_A1_001_ID" 10
select_branch a_operator "$BRANCH_A2_ID"; expect_denied ISO-006 a_operator deny_branch_A2

login_actor SETUP a_multi EMAIL_A_MULTI PASSWORD_A_MULTI
select_tenant a_multi "$TENANT_A_ID"
select_branch a_multi "$BRANCH_A1_ID"; http_request a_multi GET /api/dcim/assets; validate_asset_list ISO-007 a_multi assets_A1 TEST-ASSET-A1 "$ASSET_A1_001_ID" 10
select_branch a_multi "$BRANCH_A2_ID"; http_request a_multi GET /api/dcim/assets; validate_asset_list ISO-007 a_multi assets_A2 TEST-ASSET-A2 "$ASSET_A2_001_ID" 10

select_tenant a_admin "$TENANT_B_ID"; expect_denied ISO-008 a_admin deny_tenant_B
select_branch a_admin "$BRANCH_B1_ID"; expect_denied ISO-009 a_admin deny_branch_B1
http_request a_admin GET "/api/dcim/assets?tenant_id=$TENANT_B_ID&branch_id=$BRANCH_B1_ID"
validate_asset_list ISO-010 a_admin manipulated_query_still_A1 TEST-ASSET-A1 "$ASSET_A1_001_ID" 10
http_request a_admin GET "/api/dcim/assets/$ASSET_A1_001_ID"; expect_code ISO-011 a_admin own_asset_A1 '200'
record ISO-011 a_admin logs_relationships_endpoint_absent N/A BLOQUEADO N/A N/A false false
http_request a_admin GET "/api/dcim/assets/$ASSET_B1_001_ID"; expect_denied ISO-012 a_admin deny_asset_B1
record ISO-012 a_admin relationship_endpoint_absent N/A BLOQUEADO N/A N/A false false
record ISO-013 actor_without_context protected_endpoint N/A BLOQUEADO N/A N/A false false
record ISO-014 actor_without_branch branch_endpoint N/A BLOQUEADO N/A N/A false false
http_request invalid_session GET /api/dcim/assets; expect_denied ISO-015 invalid_session protected_endpoint
record ISO-016 expired_or_revoked natural_expiry_observation N/A BLOQUEADO N/A N/A false false

login_actor SETUP b_admin EMAIL_B_ADMIN PASSWORD_B_ADMIN
select_tenant b_admin "$TENANT_B_ID"; select_branch b_admin "$BRANCH_B1_ID"
http_request b_admin GET /api/dcim/assets; validate_asset_list ISO-017 b_admin assets_B1 TEST-ASSET-B1 "$ASSET_B1_001_ID" 10
login_actor SETUP c_admin EMAIL_C_ADMIN PASSWORD_C_ADMIN
select_tenant c_admin "$TENANT_C_ID"; select_branch c_admin "$BRANCH_C2_ID"
http_request c_admin GET /api/dcim/assets; validate_asset_list ISO-018 c_admin assets_C2 TEST-ASSET-C2 "$ASSET_C2_001_ID" 10
select_tenant b_admin "$TENANT_C_ID"; expect_denied ISO-019 b_admin deny_tenant_C
select_branch b_admin "$BRANCH_C1_ID"; expect_denied ISO-019 b_admin deny_branch_C1
select_tenant c_admin "$TENANT_A_ID"; expect_denied ISO-020 c_admin deny_tenant_A
select_branch c_admin "$BRANCH_A2_ID"; expect_denied ISO-020 c_admin deny_branch_A2

for tenant in a b c; do
  case "$tenant" in
    a) tenant_upper=A ;;
    b) tenant_upper=B ;;
    c) tenant_upper=C ;;
    *) die "unsupported tenant alias in ISO-021" ;;
  esac
  actor="${tenant}_operator"; email_var="EMAIL_${tenant_upper}_OPERATOR"; password_var="PASSWORD_${tenant_upper}_OPERATOR"
  login_actor SETUP "$actor" "$email_var" "$password_var"
  http_request "$actor" POST /api/auth/logout; expect_code ISO-021 "$actor" logout '200'
  http_request "$actor" GET /api/auth/me; expect_denied ISO-021 "$actor" reuse_after_logout
done
record ISO-022 all_actors postgres_context_correlation N/A BLOQUEADO N/A N/A false false

# The EXIT trap emits exactly one redacted matrix, marked COMPLETE, then securely
# truncates/removes bodies and cookie jars. Any abnormal exit emits INCOMPLETE.
campaign_complete=true
