# PHASE-007 — Architect Decision: Type-safe Import Job Guard Retry Gate

## Decision

AUTHORIZED with strict scope.

The prior cleanup retry failed closed before the first DELETE because the attribution guard assumed `result_json.items` was an array and called `jsonb_array_length` on an observed scalar JSON value. No data was deleted and the entire transaction rolled back.

This gate authorizes only a type-safe guard correction plus one new cleanup retry. It does not authorize schema/FK changes.

## Objective

Preserve the exact identity and attribution guarantees for the two already-approved TEST `import_jobs`, make the JSON predicate type-safe for the observed representation, and execute one final exact cleanup transaction that removes only:

- the two already-approved TEST `import_jobs`;
- their already-approved TEST-only dependencies, if exact precheck counts remain the previously proven values;
- sessions belonging to the nine exact fixture users;
- the 183 manifest rows through the canonical exact-ID cleanup order.

## Mandatory read-only precheck

Before any write, Codex must verify all of the following and stop if any value differs:

1. Manifest is the exact protected external file, regular, non-symlink, mode `0600`.
2. Manifest SHA-256 is exactly:
   `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`.
3. Manifest contains exactly 183 rows with the previously approved entity counts and zero semantic alias/ID mismatches.
4. Fixture remains exactly `3/6/9/60/60/6` for tenants/branches/users/assets/logs/relationships.
5. Invalid tenant/branch mappings remain `0/0`.
6. Exactly two `import_jobs` belong to the exact previously validated fixture actor/context and no non-fixture actor/job is included.
7. Their dependent-row counts remain exactly:
   - `import_chunks = 0`;
   - `import_items = 0`;
   - `import_mappings = 0`.
8. Runtime remains `skia_runtime`, NOSUPERUSER, NOBYPASSRLS.
9. RLS/FORCE remains `true/true` on the protected tables and canonical policy hashes are exact.
10. API/PostgreSQL/Redis health checks remain healthy before execution.

## Type-safe JSON guard requirement

The correction must NOT weaken the two-job identity checks. It may only replace the unsafe `jsonb_array_length` assumption with a type-safe predicate.

The guard must explicitly branch on `jsonb_typeof(...)` before using any array-specific function. It must accept only the already-observed empty/no-item semantic representation for the two approved TEST jobs and reject unexpected object/array/scalar values that would imply non-empty or ambiguous job content.

Acceptable implementation patterns include a `CASE` expression or equivalent predicate that:

- calls `jsonb_array_length` only when `jsonb_typeof(...) = 'array'`;
- treats an empty array as zero items;
- permits the exact observed scalar representation only if it semantically represents the already-proven empty TEST result;
- fails closed for every other JSON type/value.

The exact observed scalar value may be inspected read-only and incorporated into the guard, but must not be printed into versioned evidence if it contains sensitive or excessive payload content.

## Local validation before STAGING write

Before the retry, Codex must validate the corrected predicate locally or in an ephemeral PostgreSQL 16 environment against at least:

- empty array => accepted;
- exact observed empty scalar representation => accepted;
- non-empty array => rejected;
- unexpected scalar => rejected;
- object => rejected;
- null/missing value => handled explicitly and fail-closed unless it exactly matches the previously approved empty-job semantics.

The validation must prove that array functions are never called on non-array JSON values.

## Authorized execution

If and only if every precheck and local validation passes, Codex may execute one cleanup transaction in STAGING.

The transaction must:

1. load and validate the exact 183-row manifest;
2. revalidate the exact two TEST `import_jobs` and their zero dependents;
3. validate the corrected type-safe JSON attribution guard;
4. delete only the two exact TEST `import_jobs`;
5. delete sessions belonging only to the nine exact fixture users;
6. execute the canonical exact-ID fixture delete order from the manifest;
7. run exact postconditions before COMMIT;
8. COMMIT only if every postcondition passes.

Any SQL error, count mismatch, unexpected JSON value, dependency drift, health degradation or postcondition failure must cause full rollback and immediate stop. No second retry is authorized under this gate.

## Required postconditions

After successful COMMIT, read-only verification must prove:

- the two exact TEST `import_jobs` are absent;
- no non-TEST `import_jobs` were removed;
- fixture-user sessions are absent;
- all 183 manifest IDs are absent from the authorized fixture tables;
- tenants/branches/users/roles/mappings/assets/logs/relationships return to their exact non-fixture baseline counts documented by PHASE-007;
- non-fixture baseline data remains unchanged;
- invalid tenant/branch mappings remain `0/0`;
- runtime remains `skia_runtime`, NOSUPERUSER, NOBYPASSRLS;
- RLS/FORCE remains `true/true` and canonical hashes remain exact;
- API/PostgreSQL/Redis remain healthy and public/internal health checks pass.

Only after all postconditions pass may the protected external manifest be securely removed. If the transaction rolls back or postchecks fail, the manifest must remain protected externally.

## Prohibited

This gate does NOT authorize:

- modifying `import_jobs.user_id` nullability;
- dropping, changing or adding either contradictory FK;
- schema/migration changes;
- RLS/policy changes;
- role/grant/credential changes;
- deleting any non-TEST job or dependency;
- broad cleanup by tenant/email/pattern instead of exact identity;
- merge to `main`;
- production deployment or cleanup;
- a second retry after any effective transaction failure.

## Evidence and publication

Codex may autonomously update PHASE-007 evidence, commit and push the result to `phase/007-staging-consolidation-cleanup`.

If cleanup succeeds, classify Stage D as APPROVED and PHASE-007 as ready for final closeout, while preserving the contradictory `import_jobs` FK design as separate technical debt.

If cleanup fails, publish the exact blocking condition without inferring success and stop.
