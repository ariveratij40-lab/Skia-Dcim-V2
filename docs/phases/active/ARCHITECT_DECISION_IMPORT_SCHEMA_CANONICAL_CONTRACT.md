# ARCHITECT DECISION — PHASE-010 Canonical Import Schema Contract

## Status

**APPROVED FOR REPOSITORY IMPLEMENTATION AND EPHEMERAL POSTGRESQL VALIDATION**

This decision resolves the structural boundary recorded in `6c52c44c387883173abfe4e54b425739b506d708`. It does not authorize STAGING or production changes.

## 1. Canonical import direction

SKIA SHALL converge on tenant- and branch-scoped import operations. New or retained production write paths MUST NOT create imported inventory without an explicit tenant and branch context.

The modern scoped pipeline is authoritative for future production bootstrap. Legacy handlers that write `imported_assets` without tenant/branch context are **legacy incompatible paths** and MUST NOT define the production schema by weakening nullability or inventing default tenant/branch values.

Repository implementation MAY adapt those legacy handlers to require/pass explicit context, retire them if proven unreachable/superseded, or isolate them from the canonical production path. It MUST NOT preserve them by making tenant/branch context optional.

## 2. `imported_assets` invariant

For the canonical production contract:

- `tenant_id` is mandatory.
- `branch_id` is mandatory.
- Both values must be supplied from authenticated/authorized application context; no synthetic default tenant or branch is allowed.
- Tenant/branch integrity must fail closed. Where the existing schema permits a composite referential constraint consistent with the approved branch model, prefer a composite tenant/branch FK; otherwise document the exact equivalent enforcement used by the approved runtime/RLS model.
- Reads and writes must remain tenant/branch scoped.

Any active handler incompatible with this invariant is a code reconciliation task, not a reason to weaken the schema.

## 3. Canonical pipeline coexistence

`import_jobs`/`import_items` and `inventory_imports` MAY remain separate canonical workflows when they serve distinct import mechanisms. Their existence does not authorize duplicate or contradictory ownership semantics. The bootstrap report must document the purpose and lifecycle of each retained family and exclude obsolete/legacy tables from the production manifest when repository evidence proves they are superseded.

## 4. `import_jobs.user_id` lifecycle

`import_jobs.user_id` is mandatory historical attribution for a job while that job exists.

Canonical invariant:

- `user_id` remains `NOT NULL`.
- Exactly one FK to the user is permitted.
- Deleting a referenced user while retained import jobs exist is **RESTRICTED** (`ON DELETE RESTRICT`/equivalent `NO ACTION` behavior), preserving audit attribution.
- `SET NULL` is forbidden while `user_id` is mandatory.
- `CASCADE` deletion of jobs solely because a user is deleted is forbidden.
- User lifecycle procedures must explicitly resolve/retain attributable jobs before user deletion when necessary.

The contradictory duplicate FK observed in STAGING is technical debt. A future forward-only schema reconciliation may remove the contradictory constraint only under a separate STAGING gate. The clean production bootstrap MUST create only the canonical single restrictive FK.

## 5. `import_jobs` tenant/branch contract

Every canonical import job is scoped to exactly one tenant and one branch unless a separately approved tenant-wide import workflow is explicitly designed later.

- `tenant_id`: mandatory.
- `branch_id`: mandatory.
- `user_id`: mandatory.
- The creating user must be authorized for the selected tenant/branch at the application layer.
- Database referential integrity and canonical RLS must preserve tenant/branch isolation.

No role-name bypass or contextless import job is authorized by this decision.

## 6. Child lifecycle

For `import_items` and equivalent job-owned detail rows:

- child rows belong to exactly one parent job;
- deletion of a job may cascade to its purely subordinate detail/error/warning rows when those rows have no independent audit identity;
- tenant/branch context should be inherited from the parent where practical rather than independently nullable;
- cross-job or cross-tenant child references are forbidden.

Codex must document the exact FK order in the forward-only migration and prove it in PostgreSQL 16 ephemeral validation.

## 7. Bootstrap reconciliation authority

Codex is now authorized on `phase/010-production-foundation` to:

1. create forward-only migration(s) implementing the above canonical contract for runtime tables missing from the deterministic bootstrap;
2. reconcile active legacy import handlers so all retained writes satisfy mandatory tenant/branch context, or document and remove/disable superseded unreachable paths where repository evidence supports that action;
3. create a deterministic clean-bootstrap manifest/runner that excludes test/demo/historical repair artifacts already classified as non-production;
4. include embedded-only runtime schema requirements through explicit forward-only file migrations rather than relying on hidden runtime creation;
5. run the reconciled bootstrap twice against clean ephemeral PostgreSQL 16 instances;
6. validate build, focused tests, schema invariants, canonical PHASE-005 RLS artifacts, and deterministic/idempotent bootstrap behavior;
7. publish complete PHASE-010 evidence.

## 8. Fail-closed boundaries

Stop and report `BLOCKED` without STAGING/production access if implementation would require:

- nullable/default tenant or branch context for canonical imported inventory;
- weakening RLS or the restricted runtime model;
- rewriting historical migrations already applied;
- destructive reconciliation of existing STAGING data;
- inventing authorization semantics beyond this decision;
- changing global roles/grants or production infrastructure.

## 9. Explicitly not authorized

This decision does NOT authorize:

- STAGING schema/FK/data changes;
- production access or provisioning;
- production deploy;
- changes to live secrets;
- merge to `main`;
- activation/deactivation of RLS on an external environment.

## 10. Success criterion

PHASE-010 may advance to `READY FOR EMPTY-PRODUCTION PROVISIONING GATE` only when a clean PostgreSQL 16 database can be created deterministically from versioned production-safe artifacts, the retained backend contract is compatible with that schema, and tenant/branch isolation remains fail closed.