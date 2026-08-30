# Phase 1.2D-B3B4A — secure staging write authority

## Authority problem

Migrations 027 and 028 intentionally removed direct runtime access to
`inventory_imports`, `inventory_import_rows`, `import_jobs`, and `import_items`.
They exposed commit-side operations, but no operation capable of creating the
canonical staging header or rows. Migration 029 closes only that authority gap;
it does not refactor the parser or create canonical assets.

## Security model and scope

The interface consists of four domain functions owned by `skia_migrator`, all
`SECURITY DEFINER`, with `search_path=pg_catalog,pg_temp` and every application
object schema-qualified. `PUBLIC` execution is revoked. `skia_runtime` receives
only `EXECUTE`; it retains no staging-table or sequence privileges.

Scope comes exclusively from the existing transaction-local
`app.tenant_id` and `app.branch_id` GUCs established by `RequireTenantTx` or
`BeginJobTenantTx`. Header creation also proves that `created_by` is an active
user mapped to that tenant and branch. Missing, malformed, or unauthorized
scope fails closed.

## Function contracts

- `create_inventory_import_staging` creates a server-state-controlled
  `pending`/`STAGING` header and returns its generated ID.
- `stage_inventory_import_row` atomically inserts or revalidates the durable
  `(import_id,row_number)` identity with row JSON, normalized hash, staging
  state, controlled validation error, and an expected-current-hash token for
  compare-and-swap revalidation.
- `update_inventory_import_progress` updates only bounded counters and the
  `processing`/`STAGING` state for the scoped header.
- `finalize_inventory_import_staging` derives totals from durable rows and
  changes a complete VALID/INVALID set to `validated`/`READY`.

The functions never open a transaction; the caller owns transaction boundaries.

## State transitions and idempotency

The staging writer accepts only `STAGED`, `VALID`, and `INVALID`. Existing rows
in those states may be restaged before commit. An identical payload/hash/state
is an idempotent no-op. A changed normalized interpretation replaces only the
pre-commit staging evidence when `p_expected_current_hash` exactly matches the
durable hash observed by the caller, and returns its header to
`processing`/`STAGING`. A stale or absent expected hash returns
`ROW_CONTENT_CONFLICT` without modifying either row or header. The same hash
paired with different row data is rejected as `HASH_CONFLICT`.
`COMMITTING`, `COMMITTED`, `FAILED`, and all legacy
non-staging states are not writable through this interface.

An advisory transaction lock on `(import_id,row_number)`, followed by row
locking, serializes concurrent attempts. Compare-and-swap then guarantees that
concurrent different payload/hash attempts have one winner and one controlled
conflict rather than last-writer-wins. Concurrent identical attempts converge
as `ROW_STAGED` plus `ROW_UNCHANGED`. The existing unique constraint remains the
durable identity authority. No duplicate row can be created.

## Compatibility and privilege boundaries

Existing headers, row data, hashes, canonical asset links, and statuses are not
backfilled or changed. `import_jobs` and `import_items` remain legacy-only and
receive no new function or table authority. Migration 029 changes no RLS policy,
canonical asset table, naming counter, or application file.

The normalized hash is calculated by trusted application normalization in B3B4.
Migration 029 validates its durable shape and persists it but does not derive it
from client input. Migration 027 continues to make hashes immutable once commit
begins.

## Validation matrix

The PostgreSQL 16.14 harness covers fresh and idempotent bootstrap, ledger 21,
authorized header and row staging, all three staging states, row data/hash/error
persistence, sequential compare-and-swap restaging, same/different-content
concurrency result codes, cross-scope denial for rows/progress/finalization,
missing and malformed tenant/branch denial, invalid counter denial, empty-import
finalization, PUBLIC denial, direct table and sequence denial, zero
canonical-domain deltas, preservation of a pre-029 COMMITTED row and its
canonical asset link, and full rollback under a deliberate migration failure.
The 027 and 028 regression harnesses remain authoritative and are rerun.

Accepted candidate checksums after the final review correction:

- migration 027: `72e973c30bb2267caf6198ad62830bd61ea32cdfc5a61578c8a7f24457566f59`
- migration 028: `cf1ab14bb213f85d569a84f174921b1cf436b9273d21800f89db2906bfb4f684`
- migration 029: `23ff4e63fa79b8e1b0a5d585ccaa05a9e9a1346896287a2aaf62b2e954bf71ec`
- canonical schema fingerprint through ledger 21:
  `7f9c40f48d18057d9241af75092d1e0822684703679f59d4ed161807d04bd8d3`

## B3B4 resume criteria

B3B4 may resume after review accepts migration 029. It must then route normal,
chunked, and AI parsing through these functions, share deterministic
normalization between preview/staging/future commit, and remove all direct
canonical asset writes. Migration 029 alone fixes zero bypasses; the MDF/IDF
import-create bypass remains among the 23 open items until parser containment.
