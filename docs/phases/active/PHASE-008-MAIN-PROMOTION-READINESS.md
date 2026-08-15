# PHASE-008 — MAIN Promotion Readiness

## Objective

Prepare the approved STAGING security/runtime lineage for a possible future promotion to `main` without merging, deploying to production, or changing production state in this phase.

PHASE-008 is a promotion-readiness and release-governance phase. It must prove that the consolidated code/evidence lineage is complete, reproducible and suitable for review before any merge to `main` is authorized.

## Authoritative input state

The phase starts from the completed PHASE-007 lineage and its final architectural approval.

Required STAGING state to preserve during PHASE-008:

- backend runtime identity: `skia_runtime`;
- runtime role: LOGIN, NOSUPERUSER, NOBYPASSRLS;
- canonical RLS/FORCE: `true/true` on `assets`, `asset_logs`, `asset_relationships`;
- canonical policy hashes: exact and without drift;
- PHASE-002 fixture: fully removed;
- non-TEST baseline preserved;
- API/PostgreSQL/Redis healthy;
- no production action.

Known residual technical debt remains explicitly out of scope unless separately authorized:

- contradictory `NO ACTION` / `SET NULL` FKs on NOT NULL `import_jobs.user_id`;
- inherited full-suite panic in `TestHandleInventoryImportRoutes_DetailValid`;
- previously documented structurally unavailable ISO observations.

## Stage A — Lineage and repository audit

Read-only/local Git operations are authorized.

Produce an exact graph showing how the approved PHASE-004, PHASE-005, PHASE-006 and PHASE-007 changes are represented in the current consolidation branch.

Must establish:

1. current `main` SHA;
2. current PHASE-007 consolidation SHA;
3. merge-base with `main`;
4. commits unique to the consolidation lineage;
5. files changed versus `main`;
6. whether any unrelated commits/files are present;
7. whether approved runtime/security changes are missing or duplicated;
8. whether documentation-only phase commits can be separated from runtime-relevant changes for review purposes without rewriting published history.

No history rewrite, force push, rebase onto `main`, merge into `main` or squash is authorized.

## Stage B — Promotion candidate branch

If Stage A proves the lineage is coherent, Codex may create a dedicated promotion candidate branch based on the approved consolidated lineage.

Recommended name:

`phase/008-main-promotion-candidate`

This branch may contain only:

- the approved consolidated runtime/security code;
- canonical RLS operational artifacts and rollback artifacts;
- required deployment/runtime configuration templates that contain no secrets;
- the minimum documentation/evidence needed to explain the promotion.

Do not silently discard existing published phase history. If a clean promotion candidate requires cherry-picking or reconstruction, document the exact mapping from source commits to candidate commits and prove tree equivalence for runtime-relevant files.

## Stage C — Local release validation

Run the strongest available non-production validation before a PR is opened.

Required where applicable:

- focused PHASE-004 branch authorization tests;
- focused PHASE-006 runtime/context tests;
- PHASE-005 RLS artifact tests against PostgreSQL 16 ephemeral;
- runner emission tests;
- Go build;
- `gofmt` check limited to files changed by the candidate;
- `git diff --check`;
- secret/credential scan of changed files;
- static verification that no TEST fixture IDs, credentials, manifest contents or temporary artifacts are present;
- static verification that production endpoints/secrets were not introduced.

The known pre-existing full-suite panic must remain visible. Do not fix unrelated defects merely to obtain a green full suite.

## Stage D — STAGING release equivalence audit

Read-only access to STAGING is authorized.

Prove that the candidate runtime/security tree is equivalent to the behavior already approved in STAGING.

At minimum verify:

- active backend source/release SHA or an exact tree-equivalence proof;
- runtime identity remains `skia_runtime`;
- RLS/FORCE remains `true/true` and policy hashes are exact;
- health internal/public remains HTTP 200;
- no fixture TEST data remains;
- non-TEST baseline counts remain consistent with PHASE-007 closeout;
- zero tenant/branch mapping anomalies;
- Docker restart count remains stable;
- no unexpected schema, grant, role or policy drift.

PHASE-008 must not redeploy STAGING unless a separate gate explicitly authorizes it. This stage is equivalence/readiness verification, not another functional campaign.

## Stage E — Pull request preparation

If Stages A–D approve, Codex may open a **draft pull request** from the promotion candidate to `main`.

The PR must include:

- exact candidate SHA;
- source phase SHAs and lineage mapping;
- summary of approved security/runtime changes;
- STAGING validation state;
- explicit residual known issues;
- rollback/recovery references;
- explicit statement that production has not been touched;
- explicit statement that merging the PR is NOT authorized by PHASE-008.

Opening the draft PR is authorized. Merging, auto-merge, closing/reopening for bypass purposes, changing branch protections or force-updating `main` are prohibited.

## Required evidence

Create/update under:

`docs/phases/active/phase-008-evidence/`

At minimum:

- `PROMOTION_LINEAGE_REPORT.md`
- `CANDIDATE_CONTENT_REPORT.md`
- `RELEASE_VALIDATION_REPORT.md`
- `STAGING_EQUIVALENCE_REPORT.md`
- `MAIN_PROMOTION_READINESS_REPORT.md`
- `BLOCKERS.md`

## Acceptance criteria

PHASE-008 is ready for architectural closeout only if:

1. candidate lineage is explicit and reproducible;
2. no unrelated runtime changes are included;
3. required local validation approves, with pre-existing defects separately documented;
4. candidate and approved STAGING runtime/security behavior are equivalent;
5. RLS and restricted runtime remain healthy in STAGING;
6. fixture cleanup remains complete;
7. no secrets or temporary artifacts are versioned;
8. a draft PR to `main` is opened with full evidence;
9. `main` remains unchanged;
10. production remains unchanged.

## Autonomous authority and stop conditions

Codex is authorized to proceed autonomously through Stages A–E, including Git reads, candidate branch creation, local validation, evidence commits/pushes and opening a draft PR.

Stop immediately and do not merge if any of the following occurs:

- candidate runtime tree cannot be proven equivalent to the approved lineage;
- unapproved runtime changes appear;
- STAGING RLS/runtime identity has drifted;
- fixture TEST data reappears;
- secret material is discovered in candidate changes;
- a required change would touch schema, grants, roles, production, branch protection or `main` directly;
- promotion would require hiding or silently fixing an unrelated known defect.

A separate architectural decision is mandatory before merging anything into `main` or deploying production.
