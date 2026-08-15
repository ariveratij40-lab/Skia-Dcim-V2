#!/usr/bin/env bash
set -euo pipefail

die() { printf 'runner emission test: %s\n' "$1" >&2; exit 1; }
repo_root="$(git rev-parse --show-toplevel)"
runner="$repo_root/tools/phase002/run_isolation_tests.sh"
tmp="$(mktemp -d)"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT
chmod 700 "$tmp"
printf 'TENANT_A_ID=test\n' >"$tmp/context.env"
printf 'EMAIL_A_ADMIN=test@example.invalid\nPASSWORD_A_ADMIN=test-only\n' >"$tmp/credentials.env"
chmod 600 "$tmp/context.env" "$tmp/credentials.env"

run_prefix_scenario() {
  local name="$1" statement="$2" expected_status="$3" expected_exit="$4" script output rc
  script="$tmp/$name.sh"
  output="$tmp/$name.out"
  awk '/^# Explicit expectations for ISO-001\.\.ISO-022\./ {exit} {print}' "$runner" >"$script"
  printf '%s\n' "$statement" >>"$script"
  chmod 700 "$script"
  set +e
  SKIA_ENVIRONMENT=staging PHASE002_TEST_APPROVAL=PHASE002_CAMPAIGN_AUTHORIZED \
    PHASE002_CAMPAIGN=B PHASE002_BASE_URL=https://invalid.test \
    PHASE002_CONTEXT_FILE="$tmp/context.env" PHASE002_CREDENTIALS_FILE="$tmp/credentials.env" \
    bash "$script" >"$output" 2>&1
  rc=$?
  set -e
  [[ "$rc" == "$expected_exit" ]] || die "$name exit=$rc expected=$expected_exit"
  grep -qx "CAMPAIGN_EXECUTION_STATUS=$expected_status" "$output" || die "$name missing status"
  grep -qx "PROCESS_EXIT_CODE=$expected_exit" "$output" || die "$name missing exit"
  grep -q '^ID[[:space:]]' "$output" || die "$name missing matrix header"
}

# A guard failure occurs before external files or HTTP, but must still emit.
set +e
env -i PATH="$PATH" bash "$runner" >"$tmp/guard.out" 2>&1
guard_rc=$?
set -e
[[ "$guard_rc" == 1 ]] || die "guard exit=$guard_rc expected=1"
grep -qx 'CAMPAIGN_EXECUTION_STATUS=INCOMPLETE' "$tmp/guard.out" || die 'guard missing INCOMPLETE'
grep -qx 'PROCESS_EXIT_CODE=1' "$tmp/guard.out" || die 'guard missing exit'
grep -q '^ID[[:space:]]' "$tmp/guard.out" || die 'guard missing matrix header'

run_prefix_scenario normal 'campaign_complete=true' COMPLETE 0
run_prefix_scenario command_failure 'false' INCOMPLETE 1
run_prefix_scenario controlled_hup 'kill -HUP $$' INCOMPLETE 129
run_prefix_scenario controlled_int 'kill -INT $$' INCOMPLETE 130
run_prefix_scenario controlled_term 'kill -TERM $$' INCOMPLETE 143

printf 'RUNNER_EMISSION_TESTS=APPROVED\n'
