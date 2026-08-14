# PHASE-005 — Architect Decision: STAGING RLS Activation Gate

## Decision

AUTHORIZED with strict sequencing and rollback conditions.

The canonical PHASE-005 RLS artifact and rollback have been validated locally against PostgreSQL 16. PHASE-006 has already left STAGING operating successfully as restricted runtime `skia_runtime` with RLS still disabled. This gate authorizes enabling the canonical RLS policies in STAGING and performing only the immediate technical validation necessary to determine whether the activation is safe.

## Required baseline

Before any DDL:

1. API must still be healthy and effectively connected as `skia_runtime`.
2. `skia_runtime` must remain LOGIN, NOSUPERUSER, NOBYPASSRLS, without protected-table ownership or privileged inheritance.
3. Runtime and migrator identities must remain separate.
4. `assets`, `asset_logs`, `asset_relationships` must show `relrowsecurity=false` and `relforcerowsecurity=true`.
5. Existing policy names/hashes must exactly match the pre-activation snapshot accepted by `ops/phase005/activate_canonical_rls.sql`.
6. Fixture integrity must remain 3 tenants, 6 branches, 60 TEST assets and zero TEST sessions outside mappings.
7. Health internal/public must be HTTP 200.
8. Canonical activation and rollback files must match commit `05cc30798b163962428fe545201b5d9d09e245b1` or a descendant containing no unreviewed changes to those artifacts.

Any failed precondition stops the gate before DDL.

## Authorized activation

Execute the canonical activation artifact exactly once using the authorized migrator identity and the exact STAGING approval/environment guards expected by the script.

Do not manually reproduce, edit, concatenate, or selectively execute statements from the SQL file.

The activation may only:

- converge the three approved policies;
- enable RLS on `assets`, `asset_logs`, `asset_relationships`;
- preserve FORCE RLS;
- perform its built-in validation.

It must not modify functional data, roles, grants, ownership, credentials, schema columns/constraints, fixtures or application configuration.

## Immediate post-activation validation

Before CAMPAIGN B, execute the following ordered checks:

1. `relrowsecurity=true` and `relforcerowsecurity=true` on all three tables.
2. Canonical policy names and hashes match the approved artifact exactly.
3. API remains healthy, restart count unchanged except unavoidable container lifecycle already completed before this gate.
4. Effective API database identity remains `skia_runtime`.
5. `/api/health` internal/public => 200.
6. A-OPERATOR:
   - login/context valid;
   - A1 selectable;
   - A1 asset listing returns exactly 10 fixture assets;
   - A2 selection remains 403;
   - denied selection preserves A1.
7. A-MULTI:
   - A1 => 10 assets;
   - A2 => 10 assets.
8. B-ADMIN/B1 => 10 assets and no Tenant A/C rows.
9. Direct database probes as `skia_runtime`:
   - no tenant/branch context => zero rows from all three protected tables;
   - Tenant A/A1 context => only rows valid for A1;
   - Tenant A scope-all => both A branches and never Tenant B/C;
   - log or relationship outside authorized branch scope is not visible/writable.
10. Zero TEST sessions outside `user_tenants` or `user_branches`.
11. Fixture remains 60 TEST assets.

No broad functional campaign should proceed until these checks pass.

## Automatic rollback condition

If any critical validation above fails after activation, immediately execute `ops/phase005/rollback_canonical_rls.sql` using the authorized migrator identity, provided its own exact-state guards pass.

After rollback verify:

- `relrowsecurity=false`, `relforcerowsecurity=true` on all three tables;
- prior policy names/hashes restored;
- API still runs as `skia_runtime`;
- health internal/public 200;
- fixture and sessions unchanged except for normal TEST session activity;
- no roles/grants/data/schema changes.

If rollback itself cannot prove exact restoration, stop and classify as CRITICAL BLOCKER. Do not attempt ad-hoc SQL repair.

## Success condition

This gate is approved only if canonical activation succeeds and every immediate validation above passes. On success, leave RLS ENABLED in STAGING and stop.

Do not execute CAMPAIGN B under this gate. A separate decision will authorize CAMPAIGN B only after activation evidence is published.

## Prohibited

This gate does NOT authorize:

- production changes;
- frontend/Nginx/Redis changes;
- application code changes;
- schema/constraint/migration changes;
- role/grant/ownership/credential changes;
- fixture rollback or fixture mutation;
- CAMPAIGN B;
- manual policy edits outside the canonical artifact;
- disabling FORCE RLS;
- bypassing `skia_runtime` restrictions.

## Evidence and stop condition

Record baseline, activation result, exact policy/hash state, RLS flags, API identity, ordered validation matrix and any rollback result in a new PHASE-005 evidence report. Commit and push the evidence to `phase/005-rls-enforcement`, then STOP. A separate architectural gate is required for CAMPAIGN B.
