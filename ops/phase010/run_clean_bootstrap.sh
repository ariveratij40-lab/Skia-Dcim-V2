#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
manifest="$repo_root/ops/phase010/bootstrap.manifest"
: "${PHASE010_DATABASE_URL:?PHASE010_DATABASE_URL is required}"

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

case "$PHASE010_DATABASE_URL" in
  *localhost*|*127.0.0.1*|*host.docker.internal*) ;;
  *) echo "BLOCKED: only an explicitly local PostgreSQL endpoint is allowed" >&2; exit 64 ;;
esac

while IFS= read -r relative_path; do
  [[ -n "$relative_path" ]] || continue
  file="$repo_root/$relative_path"
  [[ -f "$file" ]] || { echo "BLOCKED: missing manifest entry $relative_path" >&2; exit 65; }
  checksum="$(sha256_file "$file")"
  psql "$PHASE010_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/dev/null
CREATE TABLE IF NOT EXISTS production_bootstrap_migrations (
  path TEXT PRIMARY KEY,
  sha256 CHAR(64) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO \$\$
DECLARE recorded CHAR(64);
BEGIN
  SELECT sha256 INTO recorded FROM production_bootstrap_migrations WHERE path = '$relative_path';
  IF recorded IS NOT NULL AND recorded <> '$checksum' THEN
    RAISE EXCEPTION 'bootstrap artifact changed after application: $relative_path';
  END IF;
END \$\$;
SQL
  applied="$(psql "$PHASE010_DATABASE_URL" -X -Atqc "SELECT count(*) FROM production_bootstrap_migrations WHERE path = '$relative_path'")"
  if [[ "$applied" == "0" ]]; then
    psql "$PHASE010_DATABASE_URL" -X -v ON_ERROR_STOP=1 -1 \
      -f "$file" \
      -c "INSERT INTO production_bootstrap_migrations(path, sha256) VALUES ('$relative_path', '$checksum')" \
      >/dev/null
  fi
done < "$manifest"

psql "$PHASE010_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$repo_root/ops/phase010/validate_bootstrap.sql"
psql "$PHASE010_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$repo_root/ops/phase010/validate_physical_model_v2.sql"
