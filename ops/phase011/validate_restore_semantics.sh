#!/usr/bin/env bash
set -euo pipefail
: "${SOURCE_DSN:?SOURCE_DSN required}"
: "${RESTORE_DSN:?RESTORE_DSN required}"

tmp_dir="$(mktemp -d)"
chmod 700 "$tmp_dir"
trap 'rm -rf "$tmp_dir"' EXIT

constraint_sql="SELECT concat_ws('|',t.relname,c.conname,c.contype,pg_get_constraintdef(c.oid,true),c.condeferrable,c.condeferred,c.convalidated) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY 1"
psql "$SOURCE_DSN" -X -At -v ON_ERROR_STOP=1 -c "$constraint_sql" >"$tmp_dir/source.raw"
psql "$RESTORE_DSN" -X -At -v ON_ERROR_STOP=1 -c "$constraint_sql" >"$tmp_dir/restore.raw"
chmod 600 "$tmp_dir"/*

[[ "$(wc -l <"$tmp_dir/source.raw" | tr -d ' ')" == 225 ]]
[[ "$(wc -l <"$tmp_dir/restore.raw" | tr -d ' ')" == 225 ]]

comm -3 "$tmp_dir/source.raw" "$tmp_dir/restore.raw" >"$tmp_dir/raw.diff"
# comm contains one source and one restore line per differing constraint.
[[ "$(wc -l <"$tmp_dir/raw.diff" | tr -d ' ')" == 32 ]]
[[ "$(sed 's/^[[:space:]]*//' "$tmp_dir/raw.diff" | cut -d'|' -f3 | sort -u)" == c ]]
[[ "$(sed 's/^[[:space:]]*//' "$tmp_dir/raw.diff" | cut -d'|' -f1-3 | sort -u | wc -l | tr -d ' ')" == 16 ]]

normalize_checks() {
  sed -E \
    -e 's/::character varying::text/::character varying/g' \
    -e 's/\]::text\[\]/\]/g' "$1"
}
normalize_checks "$tmp_dir/source.raw" >"$tmp_dir/source.semantic"
normalize_checks "$tmp_dir/restore.raw" >"$tmp_dir/restore.semantic"
cmp -s "$tmp_dir/source.semantic" "$tmp_dir/restore.semantic"

source_fp="$(sha256sum "$tmp_dir/source.semantic" | awk '{print $1}')"
restore_fp="$(sha256sum "$tmp_dir/restore.semantic" | awk '{print $1}')"
[[ "$source_fp" == "$restore_fp" ]]
[[ "$source_fp" == 19f95417bba53f97adc66ae024abcbcde87bca9a650a0ea22f1e00024fe840b1 ]]
printf 'CONSTRAINT_COUNT=225\nRAW_SERIALIZER_DIFFS=16\nSEMANTIC_DIFFS=0\n'
printf 'SOURCE_SEMANTIC_SHA256=%s\nRESTORE_SEMANTIC_SHA256=%s\n' "$source_fp" "$restore_fp"
printf 'RESTORE_CONSTRAINT_SEMANTICS=APPROVED\n'
