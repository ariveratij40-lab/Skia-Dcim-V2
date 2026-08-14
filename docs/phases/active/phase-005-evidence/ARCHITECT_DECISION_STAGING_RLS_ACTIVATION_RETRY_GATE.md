# PHASE-005 — Architect Decision: STAGING RLS Activation Retry Gate

## Decision

APPROVED with strict fail-closed controls.

The canonical FK guard defect is considered locally resolved by commit `aa127cf58e42b3eaddd38d7550455ce06098f25b`. A single new STAGING activation attempt is authorized.

## Preconditions

Before any DDL, Codex must verify all of the following:

1. Branch `phase/005-rls-enforcement` is clean and contains at minimum commit `aa127cf58e42b3eaddd38d7550455ce06098f25b` and this decision.
2. STAGING backend is healthy and still running as restricted `skia_runtime`.
3. `skia_runtime` is LOGIN, NOSUPERUSER, NOBYPASSRLS, owns none of the protected tables, and has no privileged inheritance.
4. Runtime/migrator separation remains intact.
5. Fixture remains 3 tenants, 6 branches, 60 TEST assets.
6. Zero TEST sessions are outside `user_tenants` or `user_branches` mappings.
7. `assets`, `asset_logs`, `asset_relationships` still have `relrowsecurity=false` and `relforcerowsecurity=true`.
8. The three pre-activation policy hashes match the exact approved baseline.
9. The three required FKs match exact identity and semantics:
   - `asset_logs_asset_id_fkey`: `asset_logs.asset_id -> assets.id`, ON DELETE CASCADE;
   - `asset_relationships_source_asset_id_fkey`: `source_asset_id -> assets.id`, ON DELETE CASCADE;
   - `asset_relationships_target_asset_id_fkey`: `target_asset_id -> assets.id`, ON DELETE CASCADE;
   with MATCH SIMPLE, ON UPDATE NO ACTION, validated, not deferrable, not deferred.
10. Health internal/public is `200/200` immediately before activation.

If any precondition fails, STOP before DDL and publish evidence. Do not repair or relax guards under this gate.

## Authorized activation

Execute the canonical activation artifact exactly once:

`ops/phase005/activate_canonical_rls.sql`

using the explicit STAGING approval token required by the artifact and the existing authorized migrator identity.

Do not manually issue equivalent ALTER POLICY / ENABLE RLS statements outside the canonical artifact.

## Immediate post-activation verification

After successful activation, verify in this order:

1. `relrowsecurity=true` and `relforcerowsecurity=true` for all three protected tables.
2. Canonical policy names and normalized hashes exactly match the approved canonical hashes.
3. Backend still connects as `skia_runtime` and remains NOSUPERUSER/NOBYPASSRLS.
4. Health internal/public remains `200/200`.
5. No TEST session is outside tenant/branch mappings.
6. Direct DB probes as `skia_runtime`:
   - no tenant context => zero visible rows in all three protected tables;
   - Tenant A / A1 => only A1 assets/logs/relationships visible;
   - Tenant A / A2 => A1 data not visible;
   - Tenant A / scope-all => A1+A2 visible, Tenant B never visible;
   - out-of-scope log write denied;
   - relationship write denied if source or target is out of scope;
   - same-scope relationship write allowed only within authorized tenant/branch context.
7. HTTP application probes:
   - A-OPERATOR A1 => 200 and exactly 10 assets;
   - A-OPERATOR A2 => 403 and previous valid branch preserved;
   - A-MULTI A1/A2 => 200 and exactly 10 assets per branch;
   - B-ADMIN B1 => 200 and exactly 10 assets;
   - no cross-tenant or cross-branch leakage.
8. Execute one controlled contextual import/job probe that does not alter the 60 TEST assets and verify completion under the captured tenant/branch context.
9. Verify zero new invalid TEST sessions and backend remains healthy with zero unexpected restarts.

## Automatic rollback condition

If ANY critical post-activation control fails, Codex is authorized and required to execute exactly once:

`ops/phase005/rollback_canonical_rls.sql`

Then verify:

- `relrowsecurity=false` and `relforcerowsecurity=true` on all three tables;
- baseline policy names/hashes restored exactly;
- backend remains healthy as `skia_runtime`;
- fixture cardinalities unchanged;
- no role/grant/credential/schema/data changes occurred beyond the canonical policy/RLS rollback.

After rollback, STOP and publish failure evidence. Do not retry activation again under this gate.

## Success state

If all post-activation controls pass:

- leave canonical RLS ENABLED in STAGING;
- do not rollback;
- publish the activation evidence and exact hashes/state;
- STOP before CAMPAÑA B.

## Explicitly prohibited

This gate does NOT authorize:

- CAMPAÑA B;
- changes to fixture mappings or assets;
- schema/constraint/migration changes;
- role, grant, ownership or credential changes;
- frontend/Nginx/Redis/DNS changes;
- production changes;
- manual weakening of policies or guards;
- repeated activation attempts after a failed post-check.
