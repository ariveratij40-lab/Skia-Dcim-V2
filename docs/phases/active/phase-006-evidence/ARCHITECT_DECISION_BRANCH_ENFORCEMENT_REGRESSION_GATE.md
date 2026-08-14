# PHASE-006 — Architect Decision: Branch Enforcement Regression Gate

## Decision

AUTHORIZED with strict scope.

The restricted-runtime cutover exposed a critical regression: A-OPERATOR, mapped only to branch A1, received HTTP 200 when selecting A2 and the resulting session persisted A2 outside `user_branches`. This must be corrected before any further runtime cutover or RLS work.

## Objective

Determine why the PHASE-004 `handleSelectBranch` enforcement is absent or ineffective in the PHASE-006 deployable lineage, restore the previously approved fail-closed semantics, clean only the exact invalid TEST session created by the failed retry, and validate locally. Do not perform another STAGING cutover under this gate.

## Authorized work

Codex may proceed autonomously to:

1. Trace the exact ancestry/diff between the PHASE-004 approved implementation (`01efd5099758d8ad85fc4bcdf4720c5e23e59270`) and the current PHASE-006 deployable lineage.
2. Inspect `handleSelectBranch`, its tests, session update logic, tenant/branch mappings, and any refactor introduced by PHASE-006.
3. Determine whether the PHASE-004 fix was omitted from ancestry, overwritten, or semantically bypassed by later changes.
4. Implement the minimum correction required so branch selection requires an explicit `(user_id, tenant_id, branch_id)` mapping in `user_branches` and the session UPDATE remains guarded against races.
5. Preserve the previous valid branch context on denial.
6. Add or restore regression tests covering at minimum:
   - A-OPERATOR A1 => allowed;
   - A-OPERATOR A2 => denied;
   - denied selection does not mutate the existing valid context;
   - A-MULTI A1/A2 => allowed;
   - cross-tenant branch => denied;
   - no bypass based on role name;
   - behavior remains valid with restricted-runtime DB abstractions introduced by PHASE-006.
7. Run focused tests, Go formatting/build, static gates and `git diff --check`.
8. Document root cause and validation evidence.
9. Commit and push only the scoped code/tests/evidence to `phase/006-runtime-role-context`.

## Exact stale-session cleanup authorization

The failed retry created one TEST session for `phase002-a-operator@test.invalid` whose stored branch is outside that actor's `user_branches` mapping. Codex may remove that session only if a read-only precheck proves all of the following:

- actor email is exactly `phase002-a-operator@test.invalid`;
- session is a fixture/TEST session;
- stored tenant is Tenant A;
- stored branch is A2;
- A2 is not present in that actor's `user_branches`;
- exactly one row matches.

If and only if the count is exactly `1`, delete/revoke that exact session in an explicit transaction, verify affected rows = `1`, and verify zero remaining TEST sessions outside tenant/branch mappings. If count is `0` or greater than `1`, do not write and stop with evidence.

Do not expose session IDs or tokens in versioned evidence.

## Prohibited

This gate does NOT authorize:

- another STAGING backend cutover/deploy;
- enabling or modifying RLS/policies;
- schema/constraint/migration changes;
- grant, ownership or PostgreSQL role changes;
- changing runtime/migrator credentials;
- modifying fixture users/mappings/assets except the exact stale session cleanup above;
- frontend, Nginx, Redis or production changes;
- broad session deletion;
- weakening branch enforcement to make tests pass.

## Acceptance criteria

The gate is approved only when:

1. Root cause of the PHASE-004 enforcement regression is identified precisely.
2. The deployable PHASE-006 lineage contains explicit `user_branches` enforcement for `handleSelectBranch`.
3. Focused branch authorization regression tests pass.
4. Denied selection demonstrably preserves prior valid context.
5. A-MULTI remains able to select both mapped branches.
6. No role-name bypass is introduced.
7. Build/static checks pass; unrelated pre-existing suite failures remain explicitly documented.
8. The exact invalid TEST session is absent after the narrowly authorized cleanup, or cleanup safely aborts because its preconditions are not exact.
9. No STAGING deploy/cutover or RLS activation occurred.

## Stop condition

After publishing the correction and evidence, STOP. A separate architectural decision is required before another `skia_runtime` STAGING cutover.
