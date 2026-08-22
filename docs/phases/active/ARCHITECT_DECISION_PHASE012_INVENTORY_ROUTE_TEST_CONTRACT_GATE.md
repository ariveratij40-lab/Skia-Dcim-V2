# ARCHITECT DECISION — PHASE-012 INVENTORY ROUTE TEST CONTRACT GATE

## Decision

**APPROVED FOR TEST-CONTRACT CONVERGENCE ONLY.**

This decision resolves the two blockers recorded after the first inventory panic correction:

1. related inventory route tests still use the obsolete FakeSessionStore-only setup even though the current route resolves session/tenant/branch through the DB-backed `ExtractSessionContextSecure` path;
2. an inherited `NoPermission` test expects a 403 from a permission name (`inventory.import.read`) that is not part of the currently enforced runtime authorization contract for this route.

No runtime RBAC expansion is authorized by this gate.

## 1. Canonical authorization contract for these tests

For the inventory import detail/rows routes covered by the current suite, the canonical enforced contract is:

- valid authenticated session;
- valid tenant existence/context;
- explicit user-to-branch mapping for the selected tenant/branch;
- handler query constrained by tenant and branch where the runtime route does so;
- existing RLS/runtime protections remain unchanged.

The permission catalog is not to be invented as an enforcement layer inside PHASE-012. A test-only permission string that has no runtime reference MUST NOT force a new 403 behavior merely to preserve an inherited expectation.

This decision is consistent with the previously established architecture that catalog permissions may be normative while runtime enforcement is provided by session + tenant/branch mappings and scoped handlers unless a separate RBAC phase explicitly wires a permission into the route.

## 2. DB fixture convergence

Codex is authorized to update **all directly related inventory route tests** that still depend on the obsolete FakeSessionStore-only setup so they provide an explicit `database/sql` fixture matching the actual DB-backed route contract.

Requirements:

- use deterministic `sqlmock` or the already-established test DB mechanism;
- restore the global DB handle after each test;
- assert all SQL expectations;
- use the actual current identifier type of `inventory_imports.id` (INTEGER) rather than legacy UUID assumptions;
- do not modify production handler code merely to accommodate tests;
- do not bypass `ExtractSessionContextSecure`;
- do not fabricate tenant/branch/user context outside the same queries runtime uses.

## 3. Permission-contract discrepancy

The inherited test that asserts 403 solely because `inventory.import.read` is absent is **STALE UNDER THE CURRENT ROUTE CONTRACT** if repository inspection confirms that this permission name is not evaluated by the dispatcher/handler or another mandatory middleware on that route.

If that absence is confirmed, Codex MUST:

- rename/rewrite the test so it documents the actual approved behavior rather than a fictitious permission gate;
- preserve valid session + tenant + branch mapping in that case;
- explicitly document that permission-catalog absence alone does not alter this route today;
- retain or add negative tests proving that invalid session, unauthorized tenant, unauthorized branch, cross-tenant context and cross-branch context fail closed according to the current handler contract.

Codex MUST NOT add `inventory.import.read` enforcement to runtime code in this phase.

If inspection discovers an existing authoritative middleware/permission contract that the route is supposed to call but currently omits, stop `BLOCKED` and report that as a runtime authorization defect; do not infer the intended fix.

## 4. Scope of allowed changes

Allowed:

- `_test.go` files directly covering inventory import routes/session setup;
- test-only Go dependency metadata already introduced for `sqlmock`;
- PHASE-012 evidence documentation.

Runtime Go files are **not authorized to change** under this gate unless a separate blocking defect is discovered and another architectural decision is issued.

Frontend, migrations, RLS artifacts, bootstrap artifacts, production configuration and dark deployment are out of scope.

## 5. Required test matrix

At minimum, the directly related inventory route test group must demonstrate:

- Detail valid -> expected success;
- Rows valid -> expected success;
- missing/invalid session -> fail closed;
- invalid/nonexistent tenant -> fail closed;
- user not mapped to requested branch -> fail closed;
- cross-tenant request/context -> fail closed;
- cross-branch request/context -> fail closed;
- nonexistent import -> correct not-found behavior;
- malformed/non-integer import ID -> correct validation behavior;
- permission-catalog absence alone -> behavior matching the verified current runtime contract, with an explicit test name documenting that it is **not enforced** on this route.

Do not weaken assertions merely to make tests green.

## 6. Promotion gate rerun

If the related inventory test group passes, Codex MUST then execute the complete PHASE-012 validation set from a clean checkout at the resulting exact SHA:

- `go test ./...` — must complete with zero failures/panics;
- Go build;
- frontend `npm ci`;
- full TypeScript check;
- production Next.js build;
- unresolved internal import check = zero;
- deterministic PostgreSQL 16 bootstrap twice, ledger 10;
- canonical RLS validation matrix;
- secret scan/diff hygiene required by PHASE-012.

No validation may be claimed if not actually executed.

## 7. Dark-production identity consequence

Because this gate is intended to change only tests and documentation, the functional/runtime candidate deployed dark in production may remain `92eac07c3931c30d198b8842ee458820bcba18d6` **only if the final diff from that functional candidate contains no runtime/frontend/migration/ops behavior changes**.

Codex must prove this by an exact path/content classification. If any runtime-affecting file changes, dark-production equivalence is invalidated and a separate dark redeploy gate is required before main merge.

## 8. PR #6 behavior

PR #6 remains Draft / BLOCKED / DO NOT MERGE during execution.

Only if every required validation passes and the final delta is proven test/docs-only may Codex update the evidence and classification to:

`READY FOR MAIN MERGE GATE`

Do not mark ready-for-review and do not merge automatically.

## Hard stop

Stop `BLOCKED` if:

- an authoritative runtime permission contract is discovered but missing from the route;
- fixing tests requires runtime authorization changes;
- any cross-tenant or cross-branch negative test unexpectedly succeeds;
- `go test ./...` has any remaining failure or panic;
- any mandatory PHASE-012 validation fails;
- the final candidate contains unreviewed runtime behavior changes.
