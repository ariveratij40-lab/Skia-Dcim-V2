# PHASE-007 — Architect Decision: Import Job Fixture Dependency Gate

## Decision

AUTHORIZED with narrow scope.

PHASE-007 exact fixture cleanup is blocked because two `import_jobs` rows reference PHASE-002 fixture users while `import_jobs.user_id` is `NOT NULL` and two existing foreign keys impose contradictory delete behavior (`NO ACTION` and `SET NULL`). The prior cleanup transaction rolled back completely and no TEST or non-TEST data was removed.

This gate authorizes removal of only the exact TEST `import_jobs` rows that are provably attributable to the PHASE-002/PHASE-005/PHASE-006 test campaigns, followed by one retry of the exact fixture cleanup. It does not authorize schema/FK correction.

## Rationale

The two `import_jobs` rows are campaign-generated operational TEST artifacts and are not business baseline data. They block deletion of their fixture users. Altering the schema solely to remove temporary fixtures would mix cleanup with a production data-model decision. Therefore cleanup and schema remediation are separated:

1. remove only exact campaign-owned `import_jobs` rows under strict evidence;
2. complete exact fixture cleanup;
3. preserve the duplicate/contradictory FK condition as a separate schema defect for a future corrective phase.

## Mandatory read-only precheck

Before any write, Codex must prove all of the following:

- manifest exists externally, is regular/non-symlink, mode `0600`, and SHA-256 equals exactly `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`;
- fixture baseline remains exactly `3 tenants / 6 branches / 9 users / 60 assets / 60 logs / 6 relationships`;
- mappings outside authorization remain `0/0`;
- exactly two `import_jobs` rows reference the nine exact fixture user IDs;
- no `import_jobs` row belonging to a non-fixture user is selected;
- each selected job is attributable to an authorized TEST campaign/job execution by tenant/branch/user and TEST timing/type/metadata available in the row;
- selected jobs contain no business payload requiring preservation;
- all dependent rows referencing those exact two job IDs are enumerated before deletion;
- no unknown or non-TEST dependency exists;
- backend is healthy, API runtime is `skia_runtime`, RLS/FORCE is `true/true`, and canonical policy hashes are exact.

If the selected `import_jobs` count is anything other than exactly `2`, if attribution is ambiguous, or if an unknown/non-TEST dependent row exists, STOP without writes.

## Authorized cleanup transaction

If and only if the precheck passes, execute one explicit transaction that:

1. Deletes only dependent rows whose FK/job identity points to the exact two authorized TEST `import_jobs` IDs, if such dependent rows exist and are proven TEST-only.
2. Deletes exactly the two authorized TEST `import_jobs` rows.
3. Deletes sessions belonging to the nine exact fixture users as already contemplated by the PHASE-002 cleanup semantics; no session token or ID may be emitted in evidence.
4. Executes the canonical exact-ID fixture cleanup using only the protected manifest IDs and FK-safe order.
5. Performs all mandatory postchecks before `COMMIT` where feasible; otherwise aborts and rolls back.

The cleanup must fail closed on unexpected row counts. Every delete outside the original manifest must use exact IDs resolved during the read-only precheck and must have an expected exact count.

## Required postconditions

After successful commit:

- PHASE-002 fixture counts are zero across all manifest entities;
- exact fixture users, tenants, branches, roles, mappings, assets, logs and relationships are absent;
- sessions for exact fixture users are zero;
- the two authorized TEST `import_jobs` rows and any exact TEST-only dependents are absent;
- non-fixture baseline remains unchanged: tenant/user/branch/assets/log counts must equal the previously recorded non-fixture baseline unless a read-only precheck demonstrates an independently expected change and this gate does not authorize modifying it;
- no non-TEST `import_jobs` row was deleted or modified;
- API remains `skia_runtime` NOSUPERUSER/NOBYPASSRLS;
- RLS/FORCE remains `true/true` with exact canonical hashes;
- health internal/public remains `200/200`, backend healthy, zero unexpected restarts.

## Manifest disposition

Do not delete the external manifest until the successful cleanup and all postchecks are completed and evidence is published. After verified completion it may be securely removed together with external TEST credentials/context files. Do not version any secret, token, password, cookie, session ID or manifest contents.

## Schema defect handling

Do NOT alter either `import_jobs` FK, column nullability, schema or migration under this gate. The contradictory `NO ACTION` / `SET NULL` constraints on a `NOT NULL` column must remain documented as a separate data-model defect for a future schema-correction phase.

## Prohibited

This gate does not authorize:

- deleting any non-TEST or ambiguously attributed job/data;
- broad deletes by email pattern, tenant pattern or date range;
- changing `import_jobs.user_id` nullability;
- dropping/adding/modifying FKs or schema;
- modifying RLS/policies, roles, grants, credentials or ownership;
- deploy/restart unless required solely by an operational health recovery unrelated to cleanup, in which case STOP for a new decision;
- merge to `main` or production changes.

## Evidence and autonomy

Codex may execute this gate autonomously, including read-only prechecks, exact cleanup transaction, validation, documentation, commit and push on `phase/007-staging-consolidation-cleanup`.

Publish/update at minimum:

- `FIXTURE_CLEANUP_REPORT.md`;
- `BLOCKERS.md`;
- a dedicated `IMPORT_JOB_DEPENDENCY_CLEANUP_REPORT.md`;
- final PHASE-007 closeout evidence if all acceptance criteria pass.

If any guard fails, publish the failure without attempting a second destructive cleanup under this gate.

## Stop condition

After one successful exact cleanup and evidence publication, STOP. PHASE-007 may then be classified complete for consolidation/cleanup, while the contradictory `import_jobs` FK design remains an explicit residual schema defect for a separate future phase.
