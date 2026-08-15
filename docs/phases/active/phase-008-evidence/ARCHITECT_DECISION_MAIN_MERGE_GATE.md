# PHASE-008 — Architect Decision: Exact MAIN Merge Gate

## Decision

**AUTHORIZED FOR EXACT MERGE TO `main`, subject to immutable preconditions.**

This gate authorizes merging PR #4 only for the exact candidate and exact base reviewed below. It does not authorize production deployment or any post-merge infrastructure change.

## Reviewed state

- Repository: `ariveratij40-lab/Skia-Dcim-V2`
- Pull request: `#4` — `PHASE-008: promote approved STAGING runtime and security candidate`
- Candidate branch: `phase/008-main-promotion-candidate`
- Exact authorized head SHA: `33edf7c4d8cd6e3314187c9758c53c393c7659ee`
- Exact authorized `main` base SHA: `5b4f01e028508b1045aef1ecbb386947d627aac3`
- GitHub mergeability at architectural review: `mergeable=true`
- Draft status at architectural review: `true`
- Changed files reviewed: `31`
- Candidate contains the approved restricted runtime/migrator separation, tenant/branch context enforcement, PHASE-004 branch-selection fail-closed correction, PHASE-005 canonical RLS tooling and PHASE-008 evidence.

## Architectural review findings

The final review confirmed:

1. `main` had not moved from the audited base SHA.
2. PR #4 head exactly matched the published candidate SHA.
3. The branch-selection change requires explicit `(user_id, tenant_id, branch_id)` membership and repeats authorization inside the session update, preserving fail-closed semantics under races.
4. Runtime and migrator database identities are separated; the restricted runtime gate rejects superuser, BYPASSRLS, protected-table ownership and inherited privileged roles.
5. Tenant-context transaction abstractions are propagated through the protected runtime paths and background/import job paths included in the approved candidate.
6. Canonical RLS activation remains fail-closed, guarded by exact schema/FK/runtime/policy preconditions, verifies policy hashes before enabling RLS, and has a canonical rollback artifact.
7. PHASE-008 local validation, PostgreSQL 16 ephemeral RLS validation and STAGING equivalence were already approved and published.
8. No new GitHub Actions workflow result exists for this candidate; absence of CI is not treated as an additional approval signal.
9. Known residual issues remain visible and are not merge blockers for this scoped promotion:
   - contradictory `NO ACTION` / `SET NULL` FKs on NOT NULL `import_jobs.user_id`;
   - inherited nil-DB panic in `TestHandleInventoryImportRoutes_DetailValid`;
   - previously documented structurally unavailable ISO observations.

## Mandatory pre-merge guards

Immediately before merge, the executor MUST re-read PR #4 and `main` and verify all of the following:

- PR #4 is still open.
- PR #4 head SHA is exactly `33edf7c4d8cd6e3314187c9758c53c393c7659ee`.
- `main` is still exactly `5b4f01e028508b1045aef1ecbb386947d627aac3`.
- GitHub still reports the PR mergeable.
- No additional commit has been added to the candidate branch.
- No conflict-resolution commit, rebase, force-push or branch rewrite occurred.

If any value differs, **STOP**. This authorization is void and a new architectural review is required.

## Authorized merge operation

If and only if every guard above passes:

1. Mark PR #4 ready for review if GitHub requires leaving draft state before merge.
2. Merge PR #4 into `main` using an ordinary GitHub merge commit (`merge` method), preserving the candidate history.
3. Pin the merge to the expected head SHA `33edf7c4d8cd6e3314187c9758c53c393c7659ee` so GitHub rejects the operation if the head moved.
4. Record the resulting merge SHA.

No squash or rebase merge is authorized under this gate because the reviewed candidate history and lineage should remain explicit.

## Mandatory post-merge validation

After merge, perform only repository-level validation:

- confirm PR #4 reports merged;
- confirm `main` points to the returned merge SHA;
- confirm the exact candidate SHA is an ancestor/parent of the merge result as expected;
- confirm no unexpected extra commit was introduced between the reviewed base and merge;
- publish PHASE-008 merge evidence on a non-`main` evidence branch if documentation updates are needed.

## Explicitly prohibited

This gate does **not** authorize:

- production deployment;
- STAGING redeploy;
- VPS changes;
- database/schema/FK/grant/role changes;
- RLS changes;
- credential changes;
- Docker/Nginx/Redis changes;
- modifying `main` beyond the exact PR #4 merge;
- deleting branches;
- tagging or creating a production release.

## Stop condition

After the exact merge and repository-level post-merge verification, STOP. Production promotion requires a separate architectural phase/gate.
