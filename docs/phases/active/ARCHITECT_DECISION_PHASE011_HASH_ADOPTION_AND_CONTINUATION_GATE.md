# ARCHITECT DECISION — PHASE-011 Portable Schema Hash Adoption & Continuation Gate

## Status

**APPROVED FOR PHASE-011 STAGES D–H WITH EXISTING HARD STOPS**

This decision resolves the Stage C hash blocker documented in commit `38120e1781f73b99403ea7424295ad8c9f9c8c63`.

## Basis

The authorized diagnostic proved:

- zero semantic schema differences between isolated production and exact ephemeral reproductions;
- exact 10-row bootstrap ledger and matching artifact checksums;
- the previous normalized pg_dump hash is patch-version sensitive between PostgreSQL 16.14 and 16.15;
- the portable normalizer produces the same hash across the tested matrix:
  `521e1146bb3613bf251f61e362cb92e18c47a322f1931381752c6ceb9c4017f3`;
- database owner variation does not alter the portable result.

Therefore the earlier mismatch is classified as `HASH_PROCEDURE_MISMATCH`, not semantic drift.

## Canonical PHASE-011 schema integrity procedure

For continuation of PHASE-011, schema identity MUST be established by both:

1. semantic inventory equality using `ops/phase011/schema_semantic_inventory.sql`; and
2. portable normalized schema SHA-256 using `ops/phase011/normalize_schema_dump.sh`.

The accepted portable hash for the already-provisioned Stage C schema is:

`521e1146bb3613bf251f61e362cb92e18c47a322f1931381752c6ceb9c4017f3`

The historical PHASE-010 hash `61bdcf58...` remains valid evidence for its original environment but is superseded as a cross-patch PostgreSQL portability guard. Do not rewrite historical evidence.

## Mandatory pre-continuation recheck

Before Stage D, Codex MUST verify read-only that:

- the isolated production bootstrap ledger remains exactly 10 entries and every `(path, sha256)` matches `main@8139fc4c65c3cdacc9d7467285f3b3c4b977c7cb`;
- tenant/user/asset counts remain zero unless explicitly created later by an authorized stage;
- `skia_migrator` and `skia_runtime` remain NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS;
- PostgreSQL and Redis remain healthy and isolated;
- semantic inventory remains equal to the approved reference;
- portable normalized hash equals exactly `521e1146bb3613bf251f61e362cb92e18c47a322f1931381752c6ceb9c4017f3`;
- RLS/policies remain in the expected pre-Stage-D state.

Any mismatch is a hard stop.

## Authorized continuation

If all prechecks approve, Codex may resume PHASE-011 from Stage D and proceed autonomously through the remaining stages already defined by `PHASE-011-EMPTY-PRODUCTION-PROVISIONING.md`, including:

- minimum required runtime grants and canonical RLS activation/verification;
- backup plus restore verification using the isolated production database and a non-production restore target;
- immutable backend/frontend build from the exact authorized `main` source;
- dark application deployment on loopback/internal endpoints only;
- health, runtime identity and non-destructive smoke validation;
- preparation of disabled Nginx/TLS configuration where the phase specification permits it.

## RLS requirements

RLS activation MUST use only the canonical PHASE-005 artifacts under their existing checksum guard/adaptation mechanism. After activation, verify:

- `assets`, `asset_logs`, `asset_relationships`: RLS/FORCE `true/true`;
- canonical policy hashes exact;
- runtime identity is `skia_runtime` and remains NOBYPASSRLS;
- direct PostgreSQL isolation probes and application smoke probes fail closed.

Any policy drift or unexpected access is a hard stop.

## Backup/restore requirements

Before application acceptance:

- create a production database backup/snapshot using the authorized empty/pre-traffic state;
- record only identifiers/checksums/metadata, never secrets;
- restore into an isolated non-production target;
- validate bootstrap ledger, semantic inventory and portable hash on the restored copy;
- do not proceed if restore verification fails.

## Dark deployment boundary

The application may run only on internal/loopback endpoints during PHASE-011. This decision does NOT authorize public traffic activation.

Explicitly prohibited:

- DNS changes;
- enabling public `skia.mx` routing;
- changing public Nginx routing to production;
- migrating real users/data into production;
- disabling or weakening RLS;
- reuse or disclosure of STAGING secrets;
- changes to STAGING;
- merge/rewrite of `main`.

## Final classification

At completion, PHASE-011 must end as one of:

- `READY FOR PRODUCTION TRAFFIC ACTIVATION GATE`, only if all Stages D–H pass and production remains dark; or
- `BLOCKED`, with exact evidence and no attempt to bypass the failing gate.

No public traffic activation is authorized by this decision.