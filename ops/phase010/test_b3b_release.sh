#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Pure gates remain independent. HF3 replaces the failed historical restore path.
B3B_DISPOSABLE=NO PYTHONDONTWRITEBYTECODE=1 python3 "$repo_root/ops/phase010/test_b3b_release.py"
exec bash "$repo_root/ops/phase010/test_b3b_recovery.sh"
