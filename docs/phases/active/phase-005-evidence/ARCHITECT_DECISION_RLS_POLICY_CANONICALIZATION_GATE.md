# PHASE-005 — Architect Decision: RLS Policy Canonicalization Gate

## Decision

AUTHORIZED for local implementation, validation and publication only.

PHASE-006 has completed the restricted-runtime cutover in STAGING. The backend now operates as `skia_runtime`, health is stable, tenant/branch enforcement is validated, contextual jobs operate correctly, and RLS remains disabled. PHASE-005 may therefore resume, but direct RLS activation is still premature because the existing policies for `asset_logs` and `asset_relationships` are tenant-only and do not yet implement the approved branch-scoped semantics.

## Authoritative inputs

- PHASE-005 baseline: `c47c2e4ba2165557da5d381952dee4cfac50a938`.
- PHASE-006 restricted-runtime evidence: `3a9aac33e4e479d0b98b54f7591645013aedc5d2`.
- Runtime identity in STAGING: `skia_runtime` restricted.
- RLS current state: `relrowsecurity=false`, `relforcerowsecurity=true` on `assets`, `asset_logs`, `asset_relationships`.
- Approved related-entity semantics from PHASE-006:
  - `asset_logs` are branch-scoped by the referenced asset;
  - `asset_relationships` are visible/writable only when both source and target assets are visible in the authorized tenant/branch context;
  - cross-branch relationships are denied to branch-scoped actors;
  - explicit `branch_scope_all=true` may authorize tenant-wide visibility, never cross-tenant visibility.

## Objective

Create one new canonical, transactional, idempotent RLS policy artifact and its rollback/verification tooling without modifying historical migrations. Prove locally that the policy definitions implement the approved semantics and fail closed before any STAGING activation is authorized.

## Authorized work

Codex may proceed autonomously to:

1. Re-read the effective STAGING policy definitions and record normalized hashes/expressions without changing PostgreSQL.
2. Create a new canonical SQL artifact under a new PHASE-005/ops path; do not rewrite `015`, `016` or historical convergence scripts.
3. Preserve the existing `assets` semantics unless a concrete defect is demonstrated:
   - tenant must equal `app.tenant_id`;
   - branch is visible when it equals `app.branch_id`, or when the row is branch-neutral according to the existing approved semantics, or when explicit `app.branch_scope_all=true` applies;
   - no context => no visibility/write for restricted runtime.
4. Replace/canonicalize `asset_logs` policy semantics so both `USING` and `WITH CHECK` require:
   - `asset_logs.tenant_id = app.tenant_id`;
   - the referenced asset exists in the same tenant;
   - that referenced asset is visible under the same branch/scope rules as `assets`.
5. Replace/canonicalize `asset_relationships` policy semantics so both `USING` and `WITH CHECK` require:
   - relationship tenant equals `app.tenant_id`;
   - source asset exists in the same tenant and is visible under current branch/scope;
   - target asset exists in the same tenant and is visible under current branch/scope;
   - a branch-scoped actor cannot create/read a relationship when either endpoint is outside scope.
6. Use `current_setting(..., true)` / equivalent fail-closed expressions that do not error when context is absent.
7. Keep policies targeted to the restricted runtime model and avoid introducing a privileged application bypass.
8. Produce an activation script that is transactional, idempotent, checks exact prerequisites/hashes and enables RLS only after policy definitions have converged.
9. Produce a rollback script that restores the exact pre-activation snapshot captured by the gate; rollback must be deterministic and must not alter application data, roles, grants, fixtures or credentials.
10. Add verification SQL/tests covering at minimum:
    - no tenant context => `assets`, `asset_logs`, `asset_relationships` fail closed;
    - Tenant A/A1 sees A1 assets and permitted related rows only;
    - A-OPERATOR cannot see A2 asset/log/relationship rows;
    - A-MULTI with A2 context sees A2 but not A1 unless context is switched;
    - explicit tenant-wide scope can see all branches in Tenant A but nothing in Tenant B/C;
    - log referencing an asset outside branch is denied;
    - relationship with either source or target outside branch is denied;
    - legitimate same-branch relationship is allowed;
    - cross-tenant rows are always denied;
    - writes are constrained by `WITH CHECK` as strongly as reads.
11. If an ephemeral/local PostgreSQL environment is available without changing STAGING, execute the policy tests there using a restricted role equivalent to `skia_runtime`. Otherwise, perform parser/static validation and mark runtime policy execution `BLOQUEADO` rather than approximating success.
12. Run formatting/static checks, `git diff --check`, secret scans, and publish evidence.
13. Commit and push the scoped artifacts/evidence to `phase/005-rls-enforcement`.

## Mandatory safety properties

The canonical artifact must abort before changes if any of these differ from the expected baseline:

- wrong database/environment;
- missing target tables or referenced columns;
- runtime role is superuser, BYPASSRLS or owner of protected tables;
- policy names/definitions differ from the recorded expected pre-state in a way not explicitly handled;
- RLS is already enabled unexpectedly;
- required grants are absent;
- fixture/data mutation would be required to make the policy pass.

No secret or DSN value may be written to evidence.

## Prohibited under this gate

This decision does NOT authorize:

- applying the activation SQL to STAGING;
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in STAGING;
- changing PostgreSQL roles, grants, ownership or credentials;
- schema/constraint/FK changes;
- application deploy/cutover;
- CAMPAÑA B;
- rollback of fixtures;
- modifying Nginx, Redis, frontend or production;
- weakening policies to preserve routes that lack proper context.

If the approved semantics cannot be implemented safely without schema/constraint changes, STOP and document the structural blocker.

## Acceptance criteria

The gate is complete only when:

1. One canonical new RLS artifact exists; historical migrations remain untouched.
2. Exact pre-state and normalized policy definitions are recorded.
3. `asset_logs` inherits branch visibility from its referenced asset.
4. `asset_relationships` requires visibility of both endpoints.
5. `USING` and `WITH CHECK` enforce equivalent tenant/branch boundaries.
6. Missing context fails closed.
7. Tenant-wide scope remains explicitly bounded to the current tenant.
8. Activation and rollback are transactional, idempotent and preconditioned.
9. Local/ephemeral tests pass, or execution is explicitly marked blocked if no safe runtime is available.
10. No STAGING RLS change occurred.

## Stop condition

After publishing the canonical policy/activation/rollback artifacts and validation evidence, STOP. A separate PHASE-005 decision is required before applying RLS to STAGING and before CAMPAÑA B.
