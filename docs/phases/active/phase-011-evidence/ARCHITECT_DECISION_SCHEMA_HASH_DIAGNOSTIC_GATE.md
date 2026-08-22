# ARCHITECT DECISION — PHASE-011 Schema Hash Diagnostic Gate

## Status

**AUTHORIZED FOR READ-ONLY DIAGNOSTIC AND EPHEMERAL REPRODUCTION ONLY**

This gate addresses the Stage C hash mismatch recorded at `da4651dbfbbf11579a86e737bdd9036d2070069b`. It does not authorize bypassing or replacing the expected hash without proof.

## Facts already established

- Production foundation is isolated under `/opt/apps/skia/prod`.
- PostgreSQL 16 and Redis 7 are healthy and non-public.
- `skia_migrator` and `skia_runtime` exist with restricted global attributes.
- The canonical bootstrap manifest applied twice with 10 ledger rows and zero fixture/business data.
- Expected normalized schema hash: `61bdcf58f437c5ab4d5c48ad48b14c9ba1af3a0439eb7a04f22da9d4817f3792`.
- Observed production normalized schema hash: `d0d6e0541575a70bbca89ccb5786ac8f8144c34d1d5295c740c4db8a128ba827`.
- No grants, RLS, application deploy, backup/restore, Nginx/TLS or DNS changes followed the mismatch.

## Objective

Determine whether the mismatch is:

1. a true semantic schema drift;
2. an environmental/non-semantic difference in dump normalization (owners, ACLs, comments, extension metadata, ordering, session settings, generated identifiers, etc.);
3. a mismatch between the PHASE-010 hash procedure and the PHASE-011 procedure;
4. or a different canonical source/manifest than expected.

No conclusion may be inferred solely from successful bootstrap execution.

## Authorized diagnostic work

Codex may autonomously:

1. Reproduce the exact `main@8139fc4c65c3cdacc9d7467285f3b3c4b977c7cb` bootstrap in a disposable PostgreSQL 16 environment using the same image family/version as production where practical.
2. Capture read-only schema-only representations from both the isolated production database and the ephemeral reference database.
3. Normalize both representations with one single, versioned diagnostic script before comparison.
4. Compare structure by semantic categories, at minimum:
   - tables and columns, data types, nullability and defaults;
   - primary/unique/check/foreign-key constraints including actions;
   - indexes and expressions;
   - sequences/identity/generated columns;
   - extensions required by schema;
   - functions/triggers if present;
   - RLS enable/force flags and policies (expected currently absent/off in Stage C);
   - bootstrap ledger paths and checksums.
5. Produce a machine-readable or text diff that clearly separates semantic differences from ownership/ACL/order/metadata-only differences.
6. Verify the exact bootstrap manifest and SHA-256 of every manifest artifact against `main@8139fc4c65c3cdacc9d7467285f3b3c4b977c7cb`.
7. Recompute both the old PHASE-010 normalization hash and the unified diagnostic hash to identify whether the hashing procedure itself is non-portable.
8. Publish diagnostic evidence and, if necessary, a repository-only correction to the hash/normalization tool. Any such correction must be validated against at least two clean ephemeral PostgreSQL 16 databases before it may become authoritative.

## Decision rules

### Case A — Semantic schema equality proven

If all semantic categories are exactly equal and the only differences are proven non-semantic dump metadata, Codex may propose a corrected portable normalization procedure and a new canonical hash. It MUST NOT continue Stage D–H in the same run unless that corrected procedure is versioned, independently reproduced on two clean ephemeral databases, and the production database matches it exactly.

### Case B — Semantic schema difference found

Stop `BLOCKED`. Do not modify production schema. Document every differing object and identify whether the cause is bootstrap artifact drift, PostgreSQL/environment behavior, or provisioning procedure.

### Case C — Procedure mismatch only

If the exact same database produces different hashes solely because PHASE-010 and PHASE-011 used different normalization procedures, correct the repository tool only, reproduce twice ephemerally, then require a separate continuation decision before Stage D.

## Prohibited

This gate does NOT authorize:

- modifying any production table, index, FK, sequence, function or extension;
- changing roles, grants, passwords, RLS or policies;
- deleting/recreating the production database or volumes;
- applying migration SQL again beyond read-only ledger verification;
- building/deploying backend or frontend;
- backup/restore execution;
- Nginx, TLS, DNS or traffic changes;
- changes to STAGING;
- weakening, ignoring or manually overriding the hash guard.

## Required evidence

Publish at minimum:

- `SCHEMA_HASH_DIAGNOSTIC_REPORT.md`
- `SCHEMA_SEMANTIC_DIFF_REPORT.md`
- exact PostgreSQL/pg_dump versions used;
- manifest/checksum verification;
- old and unified normalization hashes for ephemeral reference and production;
- final classification: `SEMANTIC_EQUALITY_PROVEN`, `SEMANTIC_DRIFT`, or `HASH_PROCEDURE_MISMATCH`.

Stop after publication. A separate gate will decide whether PHASE-011 may enter Stage D.