# PHASE-005 canonical RLS tooling

This directory contains the only canonical PHASE-005 policy artifact. It does
not replace or rewrite migrations `015`, `016` or historical convergence SQL.

- `activate_canonical_rls.sql`: exact-prestate guarded policy convergence and
  RLS activation. Its FK guard identifies the three required constraints by
  source table/name, source and target columns, referenced table, validation,
  deferrability and update/delete semantics; unrelated FKs are ignored. It
  requires a future explicit STAGING approval token.
- `rollback_canonical_rls.sql`: restores the exact 2026-08-14 snapshot and
  disables RLS, preserving FORCE, data, roles, grants and credentials.
- `verify_canonical_rls.sql`: read-only state and normalized-hash report.
- `run_local_validation.sh`: tests activation, semantics, idempotence and
  rollback in an isolated PostgreSQL 16 container with no network.
- `tests/`: minimal ephemeral schema and behavioral assertions.

No script reads or contains a DSN or credential. The local runner requires an
already-present `postgres:16-alpine` image and
`PHASE005_LOCAL_TEST_APPROVAL=PHASE005_EPHEMERAL_POSTGRES_APPROVED`. It creates
an isolated disposable container and removes it on exit.

These files are **not authorized for STAGING execution by the canonicalization
gate**. A separate PHASE-005 gate must approve activation and its exact command.
