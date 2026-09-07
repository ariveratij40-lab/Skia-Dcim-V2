# Phase 1.2D-B3B5 — Canonical inventory import commit

## Contract

`POST /api/import/inventory/{id}/commit` is the only active import endpoint
that creates canonical assets. It is `CREATE_ONLY`: it does not update, upsert,
merge or relocate an existing asset. The import identifier comes from the URL;
tenant, branch and user authority come exclusively from the authenticated
server session. Unknown and cross-scope identifiers share the same 404 result.

Normal uploads, chunk uploads and AI extraction converge on the secure staging
model. None may write canonical assets directly; committing remains an explicit
call to the canonical endpoint.

## Secure staging and hash authority

Runtime accesses staging only through the versioned functions:

- `list_import_rows_for_commit`
- `validate_import_row_for_commit`
- `claim_import_row_for_commit`
- `complete_import_row_commit`
- `fail_import_row_after_rollback`
- `recompute_inventory_import_state`

The coordinator obtains `normalized_row_hash` from the database enumeration
result. It recomputes the canonical payload hash and revalidates asset type and
Zone against current database state. A client-provided hash, preview status,
source internal code or location text is never authoritative.

## Row transaction

Each row owns one tenant/branch-scoped transaction. The transaction sets the
GUC context, revalidates, claims the row, invokes the shared `createMdfIdf`
service, reserves nomenclature, inserts `assets`, `locations`, `mdf_idf` and
`asset_logs`, then completes the row through the migration-030 six-argument
function. There is no nested transaction.

Any error rolls back the asset, location, subtype, log, row claim and counter.
Only after rollback does a separate scoped transaction call
`fail_import_row_after_rollback`, leaving `canonical_asset_id` null.

## Placement and nomenclature

MDF and IDF require a current canonical Zone. `zone_id`, `zone_code`, or both
matching identify the same server-resolved Zone. Missing, mismatched, stale,
cross-branch and cross-tenant Zones are rejected. There is no internal-area
fallback and no arbitrary location authority.

`internal_code` from the source remains metadata. The shared naming service
allocates the canonical technical code transactionally. B3B5B requires an
explicit physical identity for MDF/IDF; normalization-equivalent identities in
the same tenant, branch, Zone and type produce a controlled
`CANONICAL_CONFLICT`, never an update or upsert.

The shared MDF/IDF service intentionally creates one canonical `locations` row
per successful asset. Exact success delta is therefore `assets +1`,
`locations +1`, `mdf_idf +1`, `asset_logs +1`, counter `+1`.

## State, idempotency and concurrency

Only `VALID` rows are claimed. Completion accepts only `COMMITTING` with the
DB-authoritative hash. Committed rows are terminal. A second endpoint call
returns them as already committed and produces zero canonical or counter delta.
Concurrent calls for one row serialize at the secure claim and produce one
durable canonical result.

Aggregate states are database-authored by `recompute_inventory_import_state`:

- all committed: `COMPLETED`
- committed plus invalid/failed: `PARTIAL`
- all invalid/failed: `FAILED`
- unresolved states, including a stale `COMMITTING`: `READY`

B3B5 does not invent automatic recovery for stale `COMMITTING`; operational
recovery policy remains separate work.

The HTTP response contains `import_id`, aggregate `status`, `mode`, total,
committed, failed and already-committed row counts. Database details are logged
server-side and never returned to the client.

## Raw write-path audit

- Canonical commit: `import_commit.go` may create canonical MDF/IDF only via
  `createMdfIdf` from the `/commit` endpoint.
- Secure staging: `import_staging.go`, normal upload and chunk/AI extraction
  write only through migration-029 staging functions.
- Legacy compatibility: `import_db_helpers.go` and staging read handlers remain
  compatibility surfaces; they do not create canonical assets.
- Denied/dead: `duplicate_detector.go` contains legacy generic insert/update
  helpers but is not registered as an active import route. Direct staging table
  access by runtime is denied. `import_jobs`/`import_items` are legacy async
  bookkeeping and are not canonical asset authority.

The official bypass catalog remains 22. B3B5B closes no additional
authoritative matrix item; it does not claim that legacy/dead helper code has
been removed.

## Validation and remaining gaps

PostgreSQL 16.14 coverage includes MDF and IDF success, the full Zone matrix,
stale Zone, an asset type invalidated after staging, unknown type,
authoritative hash mismatch, forced rollback,
post-rollback failure persistence, second commit, same-row concurrency,
identical source rows, aggregate states and cross-scope invisibility. B1D, B2,
B2A, B3B4 and migrations 027–030 remain regression-covered.

Remaining work is frontend browser E2E for the explicit commit action and a
separate operational recovery policy for rows left `COMMITTING` after process
termination. The historical `TestGenerateInternalCodeUsesLockedSequence`
failure remains unrelated and unchanged.
