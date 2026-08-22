# PHASE-010 — Import Jobs Schema Decision

## Status

**DECISION REQUIRED — NOT INFERRED**

## Established facts

- The upload handler always supplies `tenant_id`, `branch_id` and `user_id`
  when creating `import_jobs`.
- PHASE-008 recorded two FKs from `import_jobs.user_id` with contradictory
  `NO ACTION` and `SET NULL` behavior while the column is `NOT NULL`.
- The repository contains only a reduced integration-test definition, not a
  versioned production definition.
- The `inventory_imports` pipeline uses `created_by ... ON DELETE RESTRICT` and
  a separate nullable `user_id`, but that does not prove that `import_jobs`
  must use the same lifecycle.

## Why reconciliation stopped

Choosing `RESTRICT`, `CASCADE`, nullable `SET NULL`, or retention without an FK
changes user-deletion and audit semantics. The gate permits resolution only if
the exact intended invariant is established. Repository evidence establishes
that the duplicate constraints are wrong, but does not establish which one is
authoritative.

## Decision requested

Architecture must specify:

1. whether `import_jobs.user_id` is mandatory historical attribution;
2. the behavior when its user is removed;
3. whether tenant/branch integrity uses composite FKs;
4. the lifecycle and FK order for `import_items` and related records;
5. whether `import_jobs` and `inventory_imports` remain separate canonical
   pipelines.

No schema migration was created and no existing migration was rewritten.
