# Canonical schema fingerprint through migration 022

The executable authority for the canonical PostgreSQL schema fingerprint is
the assertion in `ops/phase011/run_database_bootstrap.sh`.

For PostgreSQL 16.14, a clean canonical bootstrap through migration 022 must
produce this SHA-256 value:

```text
3fb3a458ba6297307d506e9b233847cb58c6691aedeeb1423ce8283d747e4ebb
```

The hash is calculated from `pg_dump --schema-only --no-owner
--no-privileges`, removing the generated `\restrict` and `\unrestrict`
lines before applying SHA-256.

The previous constant was calculated before the canonical post-022 schema
reached its final form. The mismatch was reproduced on two independently
bootstrapped databases using PostgreSQL 16.14, both with 14 migration-ledger
entries and identical fingerprints. It was therefore a stale versioned
constant, not operational schema drift.

This correction changes only the expected fingerprint. It does not modify the
schema, migrations, data, RLS policies, or functional grants.
