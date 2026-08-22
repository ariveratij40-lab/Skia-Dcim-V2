# PHASE-010 — Architect Decision: Clean Bootstrap Reconciliation Gate

## Decision

AUTHORIZED with strict pre-production scope.

The first empty PostgreSQL 16 bootstrap exposed two structural blockers that must be reconciled before any production foundation can be considered executable:

1. `migrations/003_rbac_validation_data.sql` expects the non-existent RBAC column `permissions.action` and is test/demo validation data rather than a production schema requirement.
2. Active runtime tables such as `import_jobs` are not represented by a deterministic versioned clean-bootstrap migration path.

This gate authorizes repository-only reconciliation and ephemeral PostgreSQL validation. It does not authorize STAGING or production mutation.

## Objectives

Produce a deterministic, auditable clean-database bootstrap contract for the exact `main@ce19289e59bf25ece2cd208b92b399e31d8b2f17` application lineage, without silently replaying historical test/demo data or relying on an already-evolved STAGING database.

## Authorized work

Codex may proceed autonomously to:

1. Inventory every SQL file under `migrations/` and every embedded Go migration/bootstrap path.
2. Classify each artifact as exactly one of:
   - production schema required;
   - production reference/catalog seed required;
   - historical compatibility only;
   - test/demo/validation data only;
   - superseded/duplicate/conflicting;
   - unknown/blocking.
3. Trace the actual runtime schema requirements for all tables referenced by the current backend, including at minimum `import_jobs` and its dependent tables.
4. Prove which required tables/columns/indexes/FKs are created by versioned migrations and which currently exist only because of historical/manual evolution.
5. Remove `003_rbac_validation_data.sql` from the production bootstrap path if and only if static inspection proves it is exclusively test/demo/validation data. Preserve the file/history; do not delete or rewrite historical evidence merely to make bootstrap pass.
6. Create a production bootstrap manifest/runner that explicitly selects the approved schema migrations and production-safe seeds in deterministic order.
7. If current runtime-required schema objects have no versioned migration, create the minimum new forward-only migration(s) needed to reproduce the current approved runtime schema on an empty PostgreSQL 16 database.
8. New migration(s) must reflect the approved current schema contract; they must not redesign unrelated schema or widen privileges.
9. Resolve the known `import_jobs.user_id` contradictory FK problem for a clean database only if the exact intended invariant can be established from runtime behavior and current approved data model. The clean schema must not intentionally create contradictory `NO ACTION` and `SET NULL` FKs on a `NOT NULL` column.
10. Validate from a completely empty PostgreSQL 16 instance at least twice for determinism/idempotence where applicable.
11. After bootstrap, compare the resulting required schema contract against the approved STAGING schema using non-secret structural evidence already available or read-only checks if separately authorized by the existing STAGING scope.
12. Run backend build, focused tests, migration/static checks and canonical PHASE-005 RLS local validation against the bootstrapped schema.
13. Publish evidence, commit and push only scoped PHASE-010 repository changes.

## Migration design rules

- Never modify an already-applied historical migration solely to change production history.
- Prefer a new forward-only migration for missing current runtime schema.
- Production bootstrap may use an explicit manifest that excludes test/demo validation SQL.
- Seeds included in production bootstrap must be necessary reference/catalog data, deterministic and non-secret.
- No fixture users, tenants, branches, sessions, assets or TEST credentials may be created.
- No production bootstrap step may depend on STAGING data values or IDs unless they are canonical application constants documented in source.
- Bootstrap must fail closed on unexpected schema state, duplicate migration identifiers or incompatible prerequisites.

## Required evidence

Publish at minimum under `docs/phases/active/phase-010-evidence/`:

- `MIGRATION_CLASSIFICATION_REPORT.md`
- `RUNTIME_SCHEMA_GAP_REPORT.md`
- `CLEAN_BOOTSTRAP_MANIFEST.md`
- `CLEAN_BOOTSTRAP_VALIDATION_REPORT.md`
- `IMPORT_JOBS_SCHEMA_DECISION.md`
- update `BLOCKERS.md` and `MIGRATION_BOOTSTRAP_REPORT.md` when those files exist.

## Acceptance criteria

This gate is approved only if:

1. A fresh PostgreSQL 16 database can be bootstrapped deterministically from repository artifacts.
2. `003_rbac_validation_data.sql` is either excluded with proof that it is non-production data, or corrected through a separately justified production-safe path without inventing a missing `permissions.action` contract.
3. Every runtime-required table referenced by the current backend has a versioned creation path.
4. `import_jobs` and its dependencies are reproducible without contradictory FK semantics.
5. Backend build/focused tests and canonical RLS local validation pass against the resulting schema.
6. No STAGING, production, live secret, role/grant, DNS, Nginx or Docker production mutation occurred.
7. Residual unknowns are explicitly BLOCKED rather than inferred.

## Hard stop

STOP and request architectural review if reconciliation would require:

- destructive migration of existing STAGING data;
- changing runtime authorization semantics;
- broad redesign of RBAC or import architecture;
- production or STAGING credential/role/grant changes;
- deletion/rewrite of historical migrations already relied upon by deployed environments;
- any production infrastructure mutation.

When execution tooling becomes available again, continue PHASE-010 from this gate. Do not restart prior completed investigation unnecessarily.