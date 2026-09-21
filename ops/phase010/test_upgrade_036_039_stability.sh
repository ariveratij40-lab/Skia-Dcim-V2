#!/usr/bin/env bash
# Sequential independent containers/anonymous volumes; no production target.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
evidence=$(mktemp -d /tmp/skia-upgrade-stability.XXXXXX)
printf 'STABILITY_EVIDENCE=%s\n' "$evidence"
run_case(){
 local label=$1 mode=$2
 if UPGRADE_TEST_MODE="$mode" bash "$repo/ops/phase010/test_upgrade_036_039.sh" >"$evidence/$label.log" 2>&1; then
  printf '%s=PASS\n' "$label" | tee -a "$evidence/results.txt"
 else
  printf '%s=FAIL\n' "$label" | tee -a "$evidence/results.txt"
  exit 1
 fi
}
run_case FAILURE_EVIDENCE_RETENTION observability
for iteration in {1..10}; do
 run_case "EXACT_CASE_ITERATION_$(printf '%02d' "$iteration")" exact
done
for cycle in 1 2 3; do
 run_case "PREFIX_MATRIX_CYCLE_$cycle" matrix
done
run_case TOOLING_REGRESSION regression
printf 'PROSPECTIVE_TOOLING_STABILITY=PASS\n'
