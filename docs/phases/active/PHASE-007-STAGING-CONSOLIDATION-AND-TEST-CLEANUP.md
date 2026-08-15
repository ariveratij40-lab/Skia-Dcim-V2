# PHASE-007 — STAGING consolidation and TEST cleanup

## Status

- Phase: `PHASE-007`.
- Environment: `STAGING` only.
- Objective: consolidate the approved PHASE-004/005/006 implementation lineage into one auditable integration branch, validate the consolidated state, remove PHASE-002 TEST fixtures by exact manifest, and leave STAGING healthy with restricted runtime and canonical RLS still enabled.
- Production: explicitly out of scope.
- Merge to `main`: explicitly out of scope.

## Approved technical baseline

The following outcomes are accepted inputs to this phase:

- PHASE-004 branch enforcement correction was validated in STAGING.
- PHASE-006 restricted runtime cutover is approved in STAGING; API runs as `skia_runtime`, NOSUPERUSER/NOBYPASSRLS.
- PHASE-005 canonical RLS is enabled in STAGING with `RLS/FORCE=true/true` on `assets`, `asset_logs`, and `asset_relationships`.
- CAMPAÑA B completed with `CAMPAIGN_EXECUTION_STATUS=COMPLETE`, exit `0`, no observed cross-tenant or cross-branch leakage.
- Canonical RLS hashes remain exact.
- The TEST fixture manifest SHA-256 recorded by PHASE-002 is `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`.

Reference evidence commits include:

- PHASE-004 correction/evidence: `01efd5099758d8ad85fc4bcdf4720c5e23e59270` and closure evidence lineage.
- PHASE-006 final restricted-runtime evidence: `3a9aac33e4e479d0b98b54f7591645013aedc5d2`.
- PHASE-005 canonical RLS implementation: `05cc30798b163962428fe545201b5d9d09e245b1` plus FK correction `aa127cf58e42b3eaddd38d7550455ce06098f25b`.
- PHASE-005 successful RLS activation evidence: `04fcbf2eec4d9dc959befc5b3b9e5f316dd5c3c5`.
- PHASE-005 completed CAMPAÑA B comparison: `584500a31d871eac943af55748a71e29dca63178`.
- PHASE-005 final closeout decision: `45e68b27435bcf9c1d241e177986a538a028f444`.

These SHAs are evidence anchors, not instructions to blindly cherry-pick. PHASE-007 must establish exact ancestry and file-level deltas before integrating anything.

## Autonomy rule

Codex may proceed autonomously through all stages below, including creating the execution branch, integrating approved changes, resolving non-semantic merge conflicts, running validations, committing, pushing, performing the exact TEST cleanup, and publishing evidence.

Stop and request a new architectural decision only if any of the following is required:

- production access or production deployment;
- merge to `main`;
- schema/constraint changes not already represented by approved PHASE-005 artifacts;
- modification/weakening of canonical RLS policies;
- role/grant/ownership changes;
- rotating or exposing credentials;
- deleting data that cannot be proven to belong to the exact PHASE-002 manifest;
- semantic conflict where two approved branches implement incompatible behavior;
- any unexpected leakage, health degradation, policy/hash drift, or runtime identity drift.

Routine Git operations, read-only STAGING inspection, exact-manifest fixture deletion, validation, commits and pushes inside the PHASE-007 branch do not require additional approval.

# Stage A — Consolidation inventory and lineage proof

Create execution branch:

`phase/007-staging-consolidation-cleanup`

Do not base the branch on a guessed 'latest' feature branch. First produce a read-only lineage report showing:

1. current tips of `phase/004-branch-context-enforcement`, `phase/005-rls-enforcement`, `phase/006-runtime-role-context`, and `phase/002-fixture-implementation`;
2. merge-base relationships among PHASE-004/005/006;
3. which approved functional code changes are already present in each lineage;
4. exact file-level differences relevant to:
   - branch authorization;
   - runtime/migrator DB separation;
   - tenant/branch transaction context;
   - background jobs/imports;
   - PHASE-005 RLS tooling;
5. whether PHASE-005 contains all approved PHASE-006 application code or is primarily a parallel tooling/evidence branch;
6. whether any approved change would be lost by selecting one branch as the integration base.

The lineage report must distinguish documentation-only commits from runtime-affecting commits.

## Stage A acceptance

A single deterministic integration strategy must be documented before mutations to the integration branch. Prefer ancestry-preserving merge/cherry-pick of approved commits rather than manual reconstruction. If semantic conflicts exist, stop.

# Stage B — Build the consolidated integration branch

After Stage A approves a deterministic strategy:

1. Create or reset only the PHASE-007 execution branch to the selected approved base.
2. Integrate only approved PHASE-004/005/006 functional changes and required operational tooling/evidence.
3. Do not merge historical experimental branches wholesale if they contain superseded or unrelated changes.
4. Resolve mechanical/documentation conflicts only when the intended final behavior is unambiguous from approved evidence.
5. Preserve canonical RLS tooling under `ops/phase005/`.
6. Preserve restricted-runtime protections and branch enforcement tests.
7. Preserve the known pre-existing full-suite panic as an explicitly tracked issue; do not hide it or opportunistically broaden scope.

## Required local validation

At minimum:

- Go formatting;
- focused PHASE-004 branch authorization tests;
- focused PHASE-006 runtime/context tests;
- build Go;
- PHASE-005 local RLS validation against PostgreSQL 16 ephemeral environment;
- PHASE-002 runner emission tests;
- `git diff --check`;
- secret scan limited to versioned changes;
- verify no unexpected migration/history rewrite.

If the complete Go suite still fails only on the documented pre-existing `TestHandleInventoryImportRoutes_DetailValid` / `db == nil` panic, record it as pre-existing. Any new failure blocks the phase.

Commit and push the consolidated integration branch when local validation passes.

# Stage C — STAGING validation of consolidated release

Before TEST cleanup, prove the integration branch represents the currently approved operational behavior.

Allowed actions:

- deploy only the consolidated backend to STAGING if and only if the built runtime differs from the currently active approved backend;
- if no runtime-affecting difference exists, do not redeploy merely for ceremony;
- do not modify frontend, Nginx, Redis, PostgreSQL roles/grants, or production.

Required controls:

- backend healthy, restart count `0`;
- internal/public health `200/200`;
- effective API identity `skia_runtime`;
- runtime remains NOSUPERUSER/NOBYPASSRLS;
- RLS/FORCE `true/true` on the three protected tables;
- canonical policy hashes exact;
- fixture remains exactly `3 tenants / 6 branches / 9 users / 60 assets / 60 logs / 6 relationships` before cleanup;
- invalid tenant mappings `0`;
- invalid branch mappings `0`;
- A-OPERATOR A1 allowed, A2 denied `403`, context preserved;
- A-MULTI A1/A2 allowed;
- B and C tenant reads remain isolated;
- one contextual job/import smoke test may be used only if it does not mutate TEST asset counts.

If a consolidated deploy is required and any critical control fails, rollback only the backend release/configuration to the immediately prior approved runtime. Do not change RLS to make the application pass.

# Stage D — Exact TEST fixture cleanup

TEST cleanup is authorized only after Stage C is fully approved.

## Preconditions

The external manifest must:

- exist outside Git;
- be a regular file, not a symlink;
- have mode `0600`;
- have exact SHA-256 `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`;
- contain only the expected PHASE-002 fixture aliases/IDs;
- contain no credentials/tokens.

Before deletion, read-only checks must prove the canonical fixture still matches the expected entities and that no manifest ID has been repurposed for non-TEST data.

## Cleanup scope

Use the approved exact-ID rollback tooling from PHASE-002. Deletions must be restricted to manifest IDs and dependency-safe order. Broad predicates such as `LIKE 'TEST-%'`, tenant-wide deletes, truncation, or inferred IDs are prohibited.

Sessions associated with fixture users may be deleted/revoked only as required for FK-safe cleanup and only when tied to those exact fixture users; no non-TEST sessions may be touched.

RLS must remain enabled throughout cleanup unless the approved rollback tooling necessarily uses the migrator/owner path; do not disable or weaken RLS as a convenience. Any privileged cleanup connection must be limited to the exact transaction and exact manifest IDs.

## Cleanup verification

After commit, prove exactly:

- fixture tenants remaining: `0`;
- fixture branches remaining: `0`;
- fixture users remaining: `0`;
- fixture roles remaining: `0`;
- fixture `user_tenants`, `user_branches`, `user_roles`, `role_permissions`: `0`;
- fixture assets: `0`;
- fixture asset_logs: `0`;
- fixture asset_relationships: `0`;
- fixture sessions: `0`;
- no manifest ID survives in any authorized table;
- no non-manifest rows were deleted (prove with pre/post aggregate counts outside fixture scope where feasible);
- RLS/FORCE remains `true/true`;
- canonical policy hashes remain exact;
- API remains `skia_runtime`;
- health remains `200/200` and backend healthy.

The manifest may be securely removed only after cleanup verification is complete and evidence records its checksum and zero survivors. Do not version the manifest.

# Stage E — Closeout evidence

Publish at minimum:

- `docs/phases/active/phase-007-evidence/CONSOLIDATION_LINEAGE_REPORT.md`;
- `docs/phases/active/phase-007-evidence/INTEGRATION_VALIDATION_REPORT.md`;
- `docs/phases/active/phase-007-evidence/STAGING_CONSOLIDATION_REPORT.md`;
- `docs/phases/active/phase-007-evidence/FIXTURE_CLEANUP_REPORT.md`;
- `docs/phases/active/phase-007-evidence/BLOCKERS.md`.

The final classification must explicitly state:

- whether the integration branch contains every approved runtime/security behavior from PHASE-004/005/006;
- whether STAGING is running that consolidated behavior;
- whether PHASE-002 fixtures were completely removed by exact manifest;
- whether `skia_runtime` and canonical RLS remain active and healthy;
- all residual known issues, especially the pre-existing Go test panic and any previously blocked ISO cases that remain structurally untestable.

## Final prohibitions

PHASE-007 does not authorize:

- merge to `main`;
- production deployment;
- deletion of feature branches;
- deletion of historical evidence;
- schema redesign;
- weakening/removal of RLS;
- privilege expansion;
- cleanup of non-TEST application data.

After publishing final PHASE-007 evidence, stop. Promotion/merge to the canonical mainline requires a separate decision.
