# PHASE-010 — Runtime Schema Gap Report

## Result

**BLOCKED — STRUCTURAL IMPORT CONTRACT REQUIRED**

Evidence origin is repository static analysis at the PHASE-010 lineage. No
STAGING or production query was executed.

## Proven gaps

The active backend references tables that have no deterministic, production-
safe creation path in the selected file migrations:

- `import_jobs`, `import_items` and `import_sessions`;
- `imported_assets`, `import_errors`, `import_warnings` and
  `inventory_imports_legacy`;
- `inventory_clear_logs`;
- embedded-only `capex_projects`, `capex_line_items` and `cert_evaluations`.

Some optional handlers also query `tickets`, `floor_plans`, `ups_pdus` and
create `ai_chat_history` dynamically. Their lifecycle must be explicitly
classified before claiming that every runtime-referenced table is versioned.

## Structural contradiction

No single minimal forward-only definition for `imported_assets` can be derived
without changing behavior:

1. `backend/migrations.go` documents the historical table as having no
   `branch_id` and makes `tenant_id` non-null.
2. `backend/import_db_helpers.go` inserts both `tenant_id` and `branch_id`.
3. tenant/branch-scoped query handlers require both fields.
4. legacy DCIM handlers insert rows without either tenant or branch context.

Making context nullable or inventing defaults would weaken multi-tenant
fail-closed behavior. Making it mandatory would leave active legacy write
handlers incompatible. Either choice changes runtime authorization/import
semantics and therefore exceeds this gate.

## Required architectural decision

Define which import pipeline is canonical and whether legacy unscoped handlers
are retired, adapted, or isolated. The decision must fix the authoritative
column set, nullability, tenant/branch FKs, ownership and lifecycle for every
table in that pipeline. Until then, a clean bootstrap cannot honestly satisfy
the current backend contract.
