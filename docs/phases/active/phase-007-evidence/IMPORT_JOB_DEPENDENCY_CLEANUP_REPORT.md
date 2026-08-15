# PHASE-007 — Import-job fixture dependency cleanup report

## Result

- Origin: **POSTGRES STAGING / STAGING VPS**.
- Gate: `ARCHITECT_DECISION_IMPORT_JOB_FIXTURE_DEPENDENCY_GATE.md`.
- Result: **FALLIDO / TRANSACCIÓN ABORTADA**.
- Deletes committed: **0**.
- Schema, FKs, RLS, roles and production changed: **no**.
- A second cleanup attempt under this gate: **not authorized and not run**.

## Mandatory read-only precheck

The protected external manifest was a regular non-symlink file at mode `0600`
and matched SHA-256
`6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`.
The fixture baseline remained exactly `3 tenants / 6 branches / 9 users / 60
assets / 60 logs / 6 relationships`; invalid mappings remained `0/0`.

Exactly two `import_jobs` rows belonged to the exact fixture actor and no job
belonged to a non-fixture actor. Both were empty completed CSV TEST jobs in
TEST tenant A / branch A1, with zero extracted, duplicate and warning items.
The exact job identities were validated by numeric ID, UUID, actor, tenant,
branch, file name and result metadata. Their authorized dependent-row counts
were exactly:

| Table | Rows |
|---|---:|
| `import_chunks` | 0 |
| `import_items` | 0 |
| `import_mappings` | 0 |

The API remained healthy under `skia_runtime` with `NOSUPERUSER` and
`NOBYPASSRLS`. RLS/FORCE remained `true/true`; canonical policy hashes matched.
No credential, session identifier or job payload is reproduced here.

## Single authorized execution

An execution-only SQL derivative retained the canonical manifest guards,
exact-ID delete order and one transaction. It used server-side `COPY` for the
protected manifest and added fail-closed guards for the two exact jobs, their
dependents, the 22 fixture-user sessions and final aggregate postconditions.
Its SHA-256 was
`1a25870e372a11b7e9ddcd5f3e032798c6bc94a168b5cad70b1c5a55e2bed70e`.
It was never added to Git.

The first connection command selected the nonexistent database role
`postgres`; PostgreSQL rejected authentication before any SQL or transaction.
A read-only diagnostic identified the configured owner role. The single
effective execution then:

1. began one transaction;
2. loaded exactly 183 protected manifest rows;
3. passed the canonical manifest guard;
4. failed in the new attribution guard because `result_json.items` is a JSON
   scalar in the observed rows and `jsonb_array_length` accepts only arrays;
5. aborted before the first `DELETE`.

No retry was made after this guard failure, as required by the gate.

## Rollback and postcheck

Post-failure read-only totals were unchanged:

`4/7/10/4/10/16/10/3/38/62/61/6/2` for tenants, branches, users, roles,
`user_tenants`, `user_branches`, `user_roles`, `role_permissions`, sessions,
assets, logs, relationships and `import_jobs`, respectively. The two exact
jobs remained and all three dependent counts remained zero. This proves that
neither TEST nor non-TEST data was deleted.

The API, PostgreSQL and Redis containers remained healthy, API restart count
remained zero, public health returned HTTP 200, and RLS/FORCE remained
`true/true`. The protected manifest remains external at mode `0600` because
cleanup did not complete.

## Required follow-up

The job-attribution guard must use a type-safe JSON predicate that accepts the
observed empty scalar representation without weakening the exact job identity
checks. A new architectural retry authorization is required before any further
write. The contradictory `import_jobs.user_id` FKs remain a separate schema
defect and were not changed.
