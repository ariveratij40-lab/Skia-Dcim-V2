# PHASE-006 — Architect Decision: Final Restricted Runtime Cutover Retry

## Decision

AUTHORIZED with strict scope.

The PHASE-006 deployable lineage now contains the restored branch-mapping enforcement from PHASE-004, and the exact invalid TEST session produced by the previous failed cutover has been removed. A single new restricted-runtime cutover attempt is authorized with RLS remaining disabled throughout.

## Preconditions

Before recreating the backend service, Codex must verify all of the following:

1. Branch: `phase/006-runtime-role-context`.
2. Commit containing the correction: `27be9b64c658afcbcc74b233c5d132069817e8d7` or a direct descendant containing only authorized evidence/gate commits.
3. Working tree clean.
4. Focused branch authorization tests and Go build already published as passing.
5. Existing protected runtime credential/configuration from PHASE-006 remains available externally without exposing values.
6. `skia_runtime` remains LOGIN, NOSUPERUSER, NOBYPASSRLS, no protected-table ownership, no privileged inheritance.
7. `MIGRATOR_DATABASE_URL` remains a separate migrator identity.
8. `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true`.
9. RLS remains disabled on `assets`, `asset_logs`, `asset_relationships` before cutover.
10. Fixture integrity remains valid: 3 tenants, 6 branches, 60 TEST assets.
11. Zero TEST sessions outside `user_tenants` / `user_branches` mappings before the first HTTP validation.
12. Preserve the currently active backend image/configuration for immediate rollback.

If any precondition fails, do not deploy.

## Authorized cutover

Codex may:

1. Build a clean backend release from the approved PHASE-006 lineage.
2. Recreate only `skia_api_staging` with:
   - runtime DB identity = `skia_runtime`;
   - migrator DB identity = separate migrator;
   - restricted runtime gate enabled.
3. Leave frontend, PostgreSQL container, Redis, pgAdmin, Nginx, DNS and all other services unchanged.
4. Keep RLS disabled for the entire gate.

## Mandatory validation order

After the backend reaches healthy state, execute the following in order and stop immediately on any critical failure:

1. Internal `/api/health` => HTTP 200.
2. Public `/api/health` => HTTP 200.
3. PostgreSQL read-only correlation confirms API connections use `skia_runtime`.
4. Runtime role remains NOSUPERUSER/NOBYPASSRLS/no ownership/no privileged inheritance.
5. Zero TEST sessions outside tenant/branch mappings.
6. A-OPERATOR login and select Tenant A.
7. A-OPERATOR select A1 => HTTP 200.
8. A-OPERATOR assets A1 => HTTP 200 and exactly the expected 10 A1 TEST assets, with no foreign aliases.
9. A-OPERATOR attempt A2 => HTTP 403.
10. PostgreSQL read-only correlation proves the A-OPERATOR session still has A1 after the denied A2 attempt.
11. A-MULTI select A1 => HTTP 200.
12. A-MULTI select A2 => HTTP 200.
13. Validate at least one Tenant B/C scoped read path with the expected TEST asset count and no foreign aliases.
14. Execute one approved import/job path that uses the PHASE-006 explicit `JobTenantContext`; verify completion or an expected safe failure without cross-tenant/branch mutation.
15. Final read-only session correlation: zero invalid tenant mappings, zero invalid branch mappings.
16. Final health 200/200 and backend restart count 0.
17. Confirm RLS remains disabled on all three target tables.

## Failure / rollback rule

On any of the following, stop immediately and restore only the previous backend release/configuration:

- unexpected HTTP success on an unauthorized tenant/branch operation;
- session context outside mappings;
- runtime identity not `skia_runtime`;
- health failure;
- protected runtime role becomes privileged;
- unexpected database migration/schema effect;
- import/job produces cross-tenant or cross-branch mutation;
- RLS state changes unexpectedly.

After rollback verify previous image/configuration, API identity `skia_user`, health 200/200 and RLS disabled.

## Success condition

PHASE-006 restricted-runtime cutover is APPROVED IN STAGING only if every mandatory validation above succeeds and the API remains running as `skia_runtime` after the gate.

On success, do NOT roll back. Publish the evidence and stop. A separate PHASE-005 decision is still required before enabling RLS or running CAMPAÑA B.

## Prohibited

This gate does NOT authorize:

- enabling/disabling/modifying RLS or policies;
- schema/constraint/migration changes beyond the backend's already approved startup behavior;
- PostgreSQL role/grant/ownership changes;
- changing the protected runtime credential unless it is unusable, in which case stop;
- broad session cleanup;
- CAMPAÑA B;
- frontend/Nginx/Redis/DNS changes;
- production deploy;
- merge to main.
