# ARCHITECT DECISION — PHASE-012 INVENTORY IMPORT TEST PANIC GATE

## Decision

**APPROVED FOR ROOT-CAUSE CORRECTION ON THE PHASE-012 CANDIDATE BRANCH ONLY.**

PR #6 remains `BLOCKED / DO NOT MERGE` until this gate is completed and all mandatory validation passes.

The currently observed blocker is the inherited panic in `TestHandleInventoryImportRoutes_DetailValid`, where execution reaches `ExtractSessionContextSecure` with a nil `*sql.DB`. This gate authorizes diagnosis and the minimum structurally correct fix. It does not authorize suppressing, skipping, weakening, or deleting the failing test.

## Required diagnosis

Before editing code, determine and document:

1. why this test reaches the secure session-context path with a nil database handle;
2. whether the nil originates from test setup, global DB coupling, handler construction, or a runtime path that can also occur outside tests;
3. the expected contract of `ExtractSessionContextSecure` and the relevant inventory-import handler;
4. whether existing neighboring tests establish the intended dependency-injection/test-fixture pattern;
5. whether the failure is test-only or exposes a legitimate production nil-safety defect.

No fix may be selected until this classification is explicit.

## Authorized correction classes

Use the narrowest class supported by evidence:

### A. Test fixture/setup defect

If production code requires a valid DB by contract and the test omitted the required dependency, correct the test setup using the repository's existing database/mock/test-fixture pattern. Do not add runtime bypasses merely to satisfy the test.

### B. Runtime dependency wiring defect

If the handler should receive a DB dependency but currently reaches an unsafe global/nil path, converge it to the established dependency wiring used elsewhere. Preserve authentication, tenant, branch and RLS semantics.

### C. Legitimate nil-safety defect

If nil can occur in a valid runtime failure mode, add an explicit fail-closed error path. It must return an appropriate error/HTTP status and must not authorize access, fabricate session context, or bypass database-backed validation.

## Explicitly forbidden

Do NOT:

- skip, rename, delete, quarantine or conditionally disable `TestHandleInventoryImportRoutes_DetailValid`;
- use `recover()` to hide the panic;
- replace secure session extraction with fake tenant/branch/user values;
- introduce an auth/RBAC/RLS bypass;
- make tests pass by setting arbitrary globals without following an existing test contract;
- change production data, PostgreSQL, Redis, RLS, Nginx, DNS or the dark deployment;
- merge PR #6 under this gate.

## Required validation

After the fix, all of the following are mandatory from a clean checkout of the updated PHASE-012 candidate:

1. the previously failing test passes repeatedly;
2. relevant inventory-import/auth/session tests pass;
3. `go test ./...` completes with zero panic and zero failing tests;
4. Go build passes;
5. frontend `npm ci`, TypeScript, internal-import resolution and production `next build` remain approved;
6. deterministic PostgreSQL 16 bootstrap remains approved with ledger 10;
7. canonical RLS validation remains approved;
8. no secrets are introduced;
9. `git diff --check` passes.

If any new unrelated failing test appears, document and stop `BLOCKED`; do not broaden the gate automatically.

## Candidate and dark-production relationship

The current dark deployment remains pinned to functional candidate `92eac07c3931c30d198b8842ee458820bcba18d6` and MUST NOT be rebuilt or redeployed during this test-correction gate.

If the fix changes runtime code rather than test-only code, the resulting candidate SHA is not considered production-equivalent until a later explicit dark-redeploy/revalidation gate. If the fix is strictly test-only and leaves runtime/frontend artifacts byte-identical, document that proof.

## PR #6 handling

After successful validation:

- commit and push the correction/evidence to `phase/012-main-promotion`;
- update PR #6 evidence/body to reflect the new exact head SHA and validation outcome;
- keep PR #6 as Draft / DO NOT MERGE until a separate MAIN MERGE GATE is issued;
- classify final result as either `READY FOR MAIN MERGE GATE` or `BLOCKED`.

## Production boundary

No production mutation or traffic activation is authorized by this decision.
