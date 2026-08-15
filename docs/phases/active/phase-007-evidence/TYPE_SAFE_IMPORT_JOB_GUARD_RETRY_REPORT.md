# PHASE-007 — Type-safe import-job guard retry report

## Result

- Gate: `ARCHITECT_DECISION_TYPE_SAFE_IMPORT_JOB_GUARD_RETRY_GATE.md`.
- Origin: **LOCAL STATIC / POSTGRES STAGING / STAGING VPS**.
- Cleanup transaction: **APROBADO / COMMITTED**.
- Authorized retries consumed: **one**; no additional retry executed.
- Schema, FKs, RLS, roles, `main` and production changed: **no**.

## Type-safe correction and validation

Read-only inspection proved that `result_json.items` is exactly JSON `null` in
both approved empty TEST jobs. The corrected predicate branches on
`jsonb_typeof` before any array function:

- array: accepts only length zero;
- JSON null scalar: accepts only the exact observed JSON null representation;
- every other scalar, object, SQL NULL/missing value or non-empty array:
  rejects fail-closed.

Static local inspection proved a single guarded `jsonb_array_length` call, one
transaction, one commit, one exact job delete, nine explicit fixture-user IDs,
canonical child-to-parent manifest order and no pattern-based delete.
PostgreSQL 16 read-only cases all matched expectations:

| Case | Expected | Result |
|---|---|---|
| empty array | accept | APROBADO |
| exact observed JSON null | accept | APROBADO |
| non-empty array | reject | APROBADO |
| unexpected numeric scalar | reject | APROBADO |
| unexpected string scalar | reject | APROBADO |
| object | reject | APROBADO |
| SQL NULL/missing | reject | APROBADO |

## Final precheck

- Manifest: regular, non-symlink, mode `0600`, 183 rows, exact SHA-256
  `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`.
- Entity counts in manifest: exact approved counts; same checksum proves the
  previously approved zero semantic alias/ID mismatches.
- Fixture: `3/6/9/60/60/6`; invalid tenant/branch mappings: `0/0`.
- Exact approved jobs: `2`; jobs outside exact actor/context: `0` selected.
- Exact dependencies: chunks/items/mappings `0/0/0`.
- Runtime: `skia_runtime`, LOGIN, NOSUPERUSER, NOBYPASSRLS.
- RLS/FORCE: `true/true`; all three canonical policy hashes exact.
- API, PostgreSQL and Redis: healthy; public health HTTP 200.

## Single cleanup transaction

The execution-only SQL had SHA-256
`aaa485cd2e0dc715c51df5941b95e95323c8357c2a18a9b5e53ed2d68e568d24`
and was not versioned. It loaded and validated 183 manifest rows, revalidated
both jobs with the type-safe predicate, proved zero dependencies, deleted
exactly two jobs and 22 exact fixture-user sessions, then performed canonical
manifest deletion in FK-safe order.

Delete results from the canonical manifest scope were: sessions `0`,
relationships `6`, logs `60`, role permissions `3`, user roles `9`, user
branches `15`, user tenants `9`, assets `60`, roles `3`, users `9`, branches
`6`, tenants `3`. The canonical exact-ID survivor guard passed before COMMIT.
The aggregate guard ran immediately after COMMIT and passed; the same totals
were then independently revalidated in a read-only transaction. No body,
credential, token, cookie or session identifier was recorded.

## Required postconditions

Final totals exactly match the recorded non-fixture baseline:

| Entity | Remaining |
|---|---:|
| tenants / branches / users / roles | `1 / 1 / 1 / 1` |
| user_tenants / user_branches / user_roles | `1 / 1 / 1` |
| role_permissions | `0` |
| sessions | `16` |
| assets / asset_logs / asset_relationships | `2 / 1 / 0` |
| import_jobs | `0` |

The two exact jobs, their dependencies and fixture-user sessions are zero.
Invalid mappings remain `0/0`. API connections remain under `skia_runtime`;
RLS/FORCE and hashes are unchanged; API/PostgreSQL/Redis remain healthy,
backend restarts remain zero and public health is HTTP 200.

After successful verification, the exact external manifest was removed. No
manifest content or secret was versioned.

## Conclusion

Stage D is **APROBADO**. The PHASE-002 fixture and the two authorized TEST job
artifacts were removed exactly without changing non-TEST baseline data. The
contradictory `import_jobs.user_id` FK design remains technical debt for a
separate schema phase; this cleanup did not modify it.
