#!/usr/bin/env bash
set -euo pipefail

release_file="${1:-runtime/RELEASE.env}"
compose_file="${2:-runtime/docker-compose.production.yml}"

[[ -f "$release_file" ]] || {
  printf 'release manifest not found: %s\n' "$release_file" >&2
  exit 1
}
[[ -f "$compose_file" ]] || {
  printf 'compose file not found: %s\n' "$compose_file" >&2
  exit 1
}

set -a
# RELEASE.env is an operator-owned, non-secret environment manifest.
# shellcheck disable=SC1090
. "$release_file"
set +a

for variable in API_SOURCE_SHA WEB_SOURCE_SHA; do
  value="${!variable:-}"
  [[ "$value" =~ ^[0-9a-f]{40}$ && "$value" != 0000000000000000000000000000000000000000 ]] || {
    printf '%s must be an exact lowercase 40-character Git SHA\n' "$variable" >&2
    exit 1
  }
done

docker compose --env-file "$release_file" -f "$compose_file" config >/dev/null
printf 'RELEASE_PROVENANCE=APPROVED\nAPI_SOURCE_SHA=%s\nWEB_SOURCE_SHA=%s\n' \
  "$API_SOURCE_SHA" "$WEB_SOURCE_SHA"
