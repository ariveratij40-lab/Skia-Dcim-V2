# PHASE-010 — Runtime Schema Gap Report

## Result

**RESOLVED FOR EMPTY-DATABASE BOOTSTRAP**

The gap below was the input to
`ARCHITECT_DECISION_IMPORT_SCHEMA_CANONICAL_CONTRACT.md`. Forward-only
migrations 017/018 now implement the approved contract; unscoped legacy route
registrations were retired rather than weakening tenant/branch nullability.

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

Optional dashboard queries for `tickets`, `floor_plans` and `ups_pdus` retain
their documented optional behavior. `ai_chat_history` now has an explicit
versioned creation path.

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

## Resolution

The approved decision selected mandatory scoped imports, restrictive user
attribution and scoped child lifecycles. Migrations 017/018 and the handler
changes implement that choice without rewriting historical migrations.
