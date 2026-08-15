# PHASE-007 — Fixture cleanup report

## Result

- Stage: D — exact TEST fixture cleanup.
- Final result: **APROBADO / COMMITTED** after the authorized type-safe retry.
- Fixture deleted: **yes**, 183 exact manifest IDs.
- Non-TEST data deleted: **no**.
- Manifest removed: **yes**, only after successful postchecks.
- RLS/policies/runtime changed: **no**.

The initial attempts below failed closed and changed no data. A later
architect-authorized type-safe retry completed the exact cleanup; the final
section and dedicated retry report contain the authoritative result.

## Manifest precheck

- exact SHA-256:
  `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`;
- one manifest match outside Git;
- regular file, non-symlink, mode `0600`;
- 183 rows, no session rows, no secret-like material;
- exact counts: tenants 3, branches 6, users 9, roles 3,
  `user_tenants` 9, `user_branches` 15, `user_roles` 9,
  `role_permissions` 3, assets 60, logs 60 and relationships 6;
- every one of the 183 IDs existed before cleanup;
- semantic alias/row mismatches: `0`;
- sessions tied to the nine exact fixture users: `22`.

The first read-only precheck design attempted `CREATE TEMP TABLE` after `BEGIN
READ ONLY`; PostgreSQL rejected it and no object/data was changed. It was
replaced by a single read-only CTE `VALUES` query, which approved all checks.

## Baseline totals

| Table | Total before | Exact fixture/manifest scope | Non-fixture baseline |
|---|---:|---:|---:|
| tenants | 4 | 3 | 1 |
| branches | 7 | 6 | 1 |
| users | 10 | 9 | 1 |
| roles | 4 | 3 | 1 |
| user_tenants | 10 | 9 | 1 |
| user_branches | 16 | 15 | 1 |
| user_roles | 10 | 9 | 1 |
| role_permissions | 3 | 3 | 0 |
| sessions | 38 | 22 by exact fixture users | 16 |
| assets | 62 | 60 | 2 |
| asset_logs | 61 | 60 | 1 |
| asset_relationships | 6 | 6 | 0 |

## Execution trace

Several transport guards stopped before `psql` and performed no DB operation:
an initial stdin routing error, broad manifest discovery exceeding the SSH
window, residual temporary-file guards and a local `diff`/regex false abort.
These were diagnosed without rerunning SQL transactions.

The canonical rollback SQL then reached `psql` once and failed before any
delete because `\copy ... FROM :'manifest_path'` does not expand the psql
variable. PostgreSQL closed the open transaction and rolled it back.

A one-line execution-only derivative changed `\copy` to server-side `COPY`.
It was validated in PostgreSQL 16 ephemeral with the manifest copy mode `0600`
and temporary ownership `postgres`. No guard, expected count, ID, delete order
or postcheck changed. The derivative was never added to Git and all local,
remote and container temporaries were removed.

The derived execution then:

1. verified SQL and manifest SHA-256;
2. loaded exactly 183 manifest rows;
3. approved the canonical manifest guard;
4. began exact-ID deletes;
5. failed while deleting a fixture user;
6. caused PostgreSQL to roll back the complete transaction.

## Structural blocker

`import_jobs.user_id` is `NOT NULL` and has two FKs to `users`:

| Constraint | Delete action |
|---|---|
| `fk_import_jobs_user` | `NO ACTION` |
| `import_jobs_user_id_fkey` | `SET NULL` |

Two `import_jobs` rows reference exact fixture users. The `SET NULL` action
violates the `NOT NULL` column before user deletion can complete. Those job
rows are not present in the authorized manifest and `import_jobs` is not an
authorized rollback table.

Deleting/reassigning those rows, adding them to scope, or changing the column
or either FK would require a new architectural decision. PHASE-007 therefore
stopped without retrying or weakening RLS.

## Postcheck after rollback

- all total and fixture counts exactly equal the baseline table above;
- fixture remains `3/6/9/60/60/6`;
- fixture mappings/roles/permissions/sessions remain intact;
- backend healthy, restart count `0`, internal/public health `200/200`;
- API has 2 connections as `skia_runtime`;
- RLS/FORCE remains `true/true` on all protected tables;
- canonical policy hashes remain exact;
- PHASE-007 container temporary files remaining: `0`.

At that historical checkpoint no cleanup success was claimed, and the external
manifest remained protected pending an authorized corrective gate.

## Authorized import-job dependency gate attempt

The subsequent architect gate authorized exact removal of the two proven TEST
`import_jobs`, their proven TEST-only dependencies, the exact fixture-user
sessions and one canonical manifest cleanup retry in a single transaction.
Read-only validation passed: exactly two empty TEST jobs were attributable to
the fixture actor; dependent counts were `0/0/0`; no non-fixture job was in
scope; fixture, runtime, RLS and policy-hash baselines were unchanged.

The single effective transaction loaded and validated all 183 manifest rows,
then failed in the added pre-delete attribution guard. The observed
`result_json.items` value is a JSON scalar, so `jsonb_array_length` raised a
type error. The error occurred before the first `DELETE`; PostgreSQL aborted
the transaction. Read-only postchecks reproduced every baseline total,
including both jobs and 38 sessions. No second attempt was made.

That historical gate result was **BLOCKED / TRANSACTION ABORTED** because the
execution guard was incompatible with the observed JSON representation. See
`IMPORT_JOB_DEPENDENCY_CLEANUP_REPORT.md`. The manifest remained protected at
that checkpoint.

## Final type-safe retry

The subsequent type-safe retry gate identified the exact observed value as
JSON `null`, validated the corrected predicate against all required positive
and negative cases, and authorized one final transaction. That transaction
committed successfully: exactly two TEST jobs and 22 fixture-user sessions
were deleted, followed by all 183 exact manifest rows in canonical FK order.

The pre-COMMIT canonical survivor guard and independent read-only postchecks
approved. Final non-fixture totals are exact, fixture entities/jobs/sessions
are zero, runtime/RLS/hashes/health are unchanged, and the verified external
manifest was removed. Final Stage D result: **APROBADO**. See
`TYPE_SAFE_IMPORT_JOB_GUARD_RETRY_REPORT.md`.
