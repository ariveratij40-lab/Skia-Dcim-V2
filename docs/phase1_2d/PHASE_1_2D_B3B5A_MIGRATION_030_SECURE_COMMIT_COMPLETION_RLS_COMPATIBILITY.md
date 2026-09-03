# Phase 1.2D-B3B5A — Secure commit completion RLS compatibility

## Root cause

`complete_import_row_commit` was a `SECURITY DEFINER` function owned by
`skia_migrator`. Its asset-existence check selected `assets` while that table
has `FORCE ROW LEVEL SECURITY` and its canonical policy is scoped to
`skia_runtime`. PostgreSQL therefore evaluated the asset read as the effective
definer, not as the runtime caller, and returned `NOT_FOUND_OR_UNAUTHORIZED`
even though the asset had just been created in the caller-owned transaction.

The failure correctly rolled back the asset, subtype, audit log and naming
counter, but prevented a valid staged row from reaching `COMMITTED`.

## Security decision

Migration 030 preserves `ENABLE/FORCE ROW LEVEL SECURITY` and the existing
tenant/branch policies. It does not grant `BYPASSRLS`, broaden a policy to
`PUBLIC`, grant staging tables directly to runtime, grant sequences, add broad
privileges to the migrator, or remove `SECURITY DEFINER`.

The rejected alternatives would have expanded normal runtime or migration
authority merely to support one completion proof.

## Refined completion contract

The function is versioned from five to six arguments:

```text
complete_import_row_commit(
  import_id,
  row_id,
  tenant_id,
  branch_id,
  expected_normalized_row_hash,
  canonical_asset_id
)
```

It remains owned by `skia_migrator`, is `SECURITY DEFINER`, fixes
`search_path=pg_catalog, pg_temp`, schema-qualifies application objects,
revokes `PUBLIC` execution and grants only the exact signature to
`skia_runtime`.

Completion locks the exact staged row and import scope. Only `COMMITTING` with
the DB-authoritative normalized hash may transition to `COMMITTED`. Wrong
tenant, branch or import is indistinguishable from absence. Other and terminal
states cannot be rewritten.

## Asset-link scope authority

The completion function no longer selects `assets`. Migration 030 establishes
the database authority with:

```text
assets UNIQUE (id, tenant_id, branch_id)
inventory_import_rows
  (canonical_asset_id, tenant_id, branch_id)
  REFERENCES assets (id, tenant_id, branch_id)
```

This composite foreign key rejects nonexistent, cross-tenant and cross-branch
asset links without weakening RLS or trusting client-provided asset scope.

## Transaction and rollback model

The application remains the owner of one tenant-scoped transaction. It claims
the row, creates the canonical asset, MDF/IDF subtype, audit log and naming
state, then invokes completion using the same transaction. The composite FK is
checked against those same uncommitted writes. A failure before completion or
at completion rolls back every canonical write and the naming increment. The
separate post-rollback failure function records the staged-row error safely.

## Validation

PostgreSQL 16.14 validation covers:

- clean bootstrap and idempotent second bootstrap, ledger count 22;
- exact owner, definer, hardened search path and EXECUTE allow-list;
- no direct runtime staging privileges or sequence grants;
- `COMMITTING` to `COMMITTED` and denial of other/terminal states;
- authoritative hash mismatch and tenant/branch/import mismatch denial;
- nonexistent, cross-tenant and cross-branch asset-link rejection;
- FORCE RLS preservation on assets, logs, relationships, MDF/IDF and locations;
- atomic success, forced rollback, durable failure reporting, second-commit
  idempotency and same-row concurrency serialization;
- regressions for migrations 027, 028 and 029 and the B1D/B2/B2A/B3B4 paths.

The post-030 canonical schema fingerprint is
`e7d943b9445bb6e48c0d9218dedf18e2ba98999fa964fbfb4dbaafbba622df01`.

## Remaining B3B5 work

Migration 030 removes the RLS compatibility blocker only. Final B3B5 review
must still account for the complete application coordinator diff, its HTTP
contract and all focused/full Go validation before any commit authorization.
