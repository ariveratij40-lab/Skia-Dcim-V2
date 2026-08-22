# PHASE-011 — Production Database Bootstrap Report

## Classification

**APPROVED BY PORTABLE HASH ADOPTION GATE**

- PostgreSQL digest: `postgres@sha256:890480b08124ce7f79960a9bb16fe39729aa302bd384bfd7c408fee6c8f7adb7`.
- `pg_dump`: PostgreSQL 16.14.
- `skia_migrator` and `skia_runtime`: non-superuser, non-CREATEDB,
  non-CREATEROLE and non-BYPASSRLS.
- Bootstrap invocations 1/2: approved and idempotent.
- Ledger rows: 10; tenants/users/assets: `0/0/0`.
- Expected hash: `61bdcf58f437c5ab4d5c48ad48b14c9ba1af3a0439eb7a04f22da9d4817f3792`.
- Observed hash: `d0d6e0541575a70bbca89ccb5786ac8f8144c34d1d5295c740c4db8a128ba827`.
- Adopted portable hash: `521e1146bb3613bf251f61e362cb92e18c47a322f1931381752c6ceb9c4017f3`.

The mismatch triggered the mandatory hard stop. The subsequent authorized
read-only diagnostic proved semantic equality and isolated pg_dump patch-version
sensitivity; see `SCHEMA_HASH_DIAGNOSTIC_REPORT.md`. Read-only metadata showed 58
public tables, 160 indexes and 225 constraints. RLS remained `false/false` with
zero policies because Stage D was not entered. The hash was not bypassed or
reinterpreted.

## Mandatory continuation recheck — 2026-08-22

- Production ledger remained exactly 10 rows; every `(path, sha256)` matched
  the manifest artifacts in `main@8139fc4c65c3cdacc9d7467285f3b3c4b977c7cb`.
- Tenants/users/assets remained `0/0/0`.
- `skia_migrator` and `skia_runtime` retained the required restricted global
  attributes.
- PostgreSQL and Redis were healthy, isolated and at restart count zero.
- All nine populated semantic fingerprint categories matched the approved
  reference exactly.
- The portable normalized schema hash matched the adopted value exactly.
- RLS remained in the expected production pre-Stage-D state: zero policies and
  `RLS/FORCE=false/false` on the three protected tables.

The Stage C continuation recheck is **APPROVED**. Stage D was then stopped by
the separate canonical activation prestate incompatibility recorded in
`PRODUCTION_RLS_RUNTIME_REPORT.md`.
