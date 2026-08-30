# Phase 1.2D-B3B3 — Secure commit coordinator interface

Baseline: `a55bfb951665ce2f19e9ed9d2c70a19d05a12a67`.

Migration 027 remains immutable. Its five functions safely validate, claim,
complete, fail and recompute one already-known row, but the application could
not enumerate an import or retrieve the persisted normalized hash without a
forbidden direct staging-table read. A canonical transaction rollback also
reverted `VALID -> COMMITTING`, so the original failure function could not
durably record that failed attempt afterward.

Migration 028 adds only two narrowly scoped `SECURITY DEFINER` functions.
They are owned by `skia_migrator`, pin `search_path` to
`pg_catalog, pg_temp`, schema-qualify application objects, revoke PUBLIC and
grant exact EXECUTE to `skia_runtime`. No table, sequence or RLS grant changes.

## Import-scoped enumeration

`list_import_rows_for_commit(import_id, tenant_id, branch_id)` proves the
header belongs to the exact tenant and branch and is in an allowed commit or
idempotency state. A foreign tenant, foreign branch, wrong import or disallowed
header state returns the same `NOT_FOUND_OR_UNAUTHORIZED` result.

For an authorized import it returns only coordinator fields: row ID, source
row number, row status, persisted `normalized_row_hash`, staged JSON data and
the durable canonical asset link. It returns all authoritative row states,
including COMMITTED, because deterministic summaries and second-commit
idempotency require the existing asset result. The coordinator, not the list
function, decides which VALID rows to claim.

## Post-rollback failure persistence

`fail_import_row_after_rollback(import_id, row_id, tenant_id, branch_id,
expected_hash, error_code)` implements a separate follow-up transaction after
the canonical transaction has rolled back. It locks the exact scoped row and
accepts only a current VALID state with the exact persisted hash. It then
transitions to FAILED, records a bounded error code and increments
`commit_attempts` once.

The rolled-back claim increment is not durable; the follow-up increment is.
One failed canonical attempt therefore has durable delta 1. A concurrent
COMMITTING/COMMITTED transition, revalidation, state change or hash change is
rejected. COMMITTED remains terminal and can never be overwritten by a stale
failure report.

## Payload audit and remaining application work

The existing application staging paths are not yet sufficient for canonical
MDF/IDF commit:

- `processImportFileAsync` writes legacy `import_items` and then writes
  `assets` directly with an `IMP-*` code; it does not create authoritative
  `inventory_import_rows` with Zone data or a normalized hash.
- `saveImportResult` attempts to create `inventory_import_rows` without the
  required `data` JSON and does not persist `normalized_row_hash`,
  `zone_id`/`zone_code`, or a canonical type contract.
- No active producer currently demonstrates deterministic normalized content
  containing canonical MDF/IDF type plus Zone authority.

B3B4 must converge parsing to authoritative staging and define the canonical
JSON/hash producer before the B3B commit handler can safely be implemented.
The frontend, handler and `processImportFileAsync` are intentionally unchanged
in B3B3.

## Validation and accounting

PostgreSQL 16.14 tests cover fresh and second bootstrap, ledger 20, exact row
enumeration, hash/data visibility, no existence leak, direct staging denial,
post-rollback failure persistence, attempt delta 1, stale hash/state denial,
COMMITTED terminal behavior, migration-027 second commit behavior, hardened
function metadata and the runtime validator. The complete migration-027
harness remains approved. The canonical post-028 schema fingerprint is
`e3041e9c6d79e4418c9d5ec82885abfb851c78615b5711b7de905f054eef3ba1`.

This interface refinement closes no application bypass:

- `BYPASSES_FIXED_BY_B3B3=0`
- `BYPASSES_REMAINING=23`
