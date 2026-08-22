# PHASE-010 — Architect Decision: Main Promotion Gate

## Status

**APPROVED FOR PULL REQUEST / MAIN PROMOTION REVIEW**

PHASE-010 implementation at `ac6bb65f9ab88eec91e00bb6f73fc67e832dd4ec` has demonstrated a deterministic clean PostgreSQL 16 bootstrap, forward-only production-safe schema reconciliation, focused backend compatibility, and canonical RLS validation. No STAGING or production mutation occurred.

This gate authorizes review and promotion of PHASE-010 repository changes into `main`. It does not authorize production provisioning or deployment.

## Required source

- Head branch: `phase/010-production-foundation`
- Exact reviewed head at gate creation: `ac6bb65f9ab88eec91e00bb6f73fc67e832dd4ec`
- Target: `main`

If the head moves, the PR may remain open but merge authorization requires revalidation of the new exact SHA.

## Mandatory pre-merge checks

Before merge:

1. Reconfirm the branch contains migrations `017_clean_bootstrap_branch_invariant.sql` and `018_clean_bootstrap_runtime_schema.sql` without historical migration rewrites.
2. Reconfirm `ops/phase010/bootstrap.manifest` and its checksum ledger match the tested artifacts.
3. Reconfirm two clean PostgreSQL 16 bootstrap runs and repeat invocation remain documented as approved.
4. Reconfirm normalized schema hash remains `61bdcf58f437c5ab4d5c48ad48b14c9ba1af3a0439eb7a04f22da9d4817f3792`.
5. Reconfirm focused backend tests/build and canonical PHASE-005 RLS validation pass.
6. Preserve the inherited full-suite `TestHandleInventoryImportRoutes_DetailValid` nil-DB panic as a visible known issue; do not hide it to obtain merge approval.
7. Ensure no production secrets, DSNs, credentials, fixtures, or environment-specific live values enter the PR.
8. Ensure no STAGING/prod mutation is performed as part of PR preparation.

## Merge policy

A normal pull request to `main` is authorized. The PR description must clearly state:

- clean-production bootstrap purpose;
- canonical tenant/branch import contract;
- forward-only migrations 017/018;
- retirement/reconciliation of legacy unscoped import routes;
- local/ephemeral validation evidence;
- inherited full-suite failure;
- no STAGING or production execution.

Merge itself should occur only after final PR review confirms `main` has not developed conflicting schema/bootstrap changes. Ordinary merge commit is preferred to preserve phase lineage.

## Not authorized

This gate does NOT authorize:

- creation of `/opt/apps/skia/prod`;
- production Docker/PostgreSQL/Redis resources;
- production roles, grants, passwords, secrets, DNS, Nginx, TLS or traffic;
- deployment of application code;
- applying migrations 017/018 to STAGING;
- STAGING FK reconciliation;
- fixing the inherited nil-DB test outside a separate scoped correction.

## Next phase

After PHASE-010 changes are merged into `main` and the resulting exact main SHA is verified, a separate **PHASE-011 — Empty Production Provisioning Gate** may authorize creation of the isolated production foundation with no public traffic and no application acceptance declaration until its own gates pass.