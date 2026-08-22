# PHASE-011 — Production Database Bootstrap Report

## Classification

**FAILED CRITICAL HASH GUARD / BLOCKED**

- PostgreSQL digest: `postgres@sha256:890480b08124ce7f79960a9bb16fe39729aa302bd384bfd7c408fee6c8f7adb7`.
- `pg_dump`: PostgreSQL 16.14.
- `skia_migrator` and `skia_runtime`: non-superuser, non-CREATEDB,
  non-CREATEROLE and non-BYPASSRLS.
- Bootstrap invocations 1/2: approved and idempotent.
- Ledger rows: 10; tenants/users/assets: `0/0/0`.
- Expected hash: `61bdcf58f437c5ab4d5c48ad48b14c9ba1af3a0439eb7a04f22da9d4817f3792`.
- Observed hash: `d0d6e0541575a70bbca89ccb5786ac8f8144c34d1d5295c740c4db8a128ba827`.

The mismatch triggered the mandatory hard stop. Read-only metadata showed 58
public tables, 160 indexes and 225 constraints. RLS remained `false/false` with
zero policies because Stage D was not entered. The hash was not bypassed or
reinterpreted.
