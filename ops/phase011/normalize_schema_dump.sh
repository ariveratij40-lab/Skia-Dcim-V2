#!/usr/bin/env bash
set -euo pipefail
# Remove pg_dump transport/session metadata while retaining schema DDL.
sed -E \
  -e '/^\\(restrict|unrestrict) /d' \
  -e '/^--/d' \
  -e '/^[[:space:]]*$/d' \
  -e '/^SET /d' \
  -e '/^SELECT pg_catalog\.set_config/d' \
  -e '/^COMMENT ON EXTENSION /d'
