# PHASE-009 — Production prerequisite report

## Result

Etapa C: **BLOQUEADA** for production applicability; local artifact validation
is **APROBADA**.

## Proven locally from `main`

- `main` contains fail-closed runtime/migrator separation and rejects missing
  or identical DSNs when restricted mode is enabled.
- Canonical RLS activation, verification and rollback SQL is present.
- PostgreSQL 16 ephemeral validation completed with
  `PHASE005_LOCAL_VALIDATION=APPROVED`.
- Missing/incorrect target FKs, policy drift, activation idempotence and
  rollback idempotence were exercised successfully.
- Canonical policy hashes produced by the artifacts are exact.

## Unproven production prerequisites

- existence and attributes of a restricted runtime role;
- separate migrator identity and external secret references;
- exact DML grants, memberships and protected-table ownership;
- protected-table columns and the three canonical FK identities/semantics;
- production migration ledger and deterministic reconciliation of SQL files
  versus embedded backend migrations;
- tenant/branch mapping integrity and RLS-safe production data;
- existing policy/RLS state and drift;
- prior immutable backend image, configuration revision and database backup
  mechanism.

The repository does not contain a production Compose/env/Nginx definition. Its
STAGING Compose does not supply `MIGRATOR_DATABASE_URL` or enable the restricted
runtime gate. It also contains versioned development/default sensitive
configuration by type (Redis password, JWT secret and OAuth secret/default),
reported here without values. Detection does not authorize removal or rotation,
but these values must never be promoted as production secrets.

The contradictory `import_jobs.user_id` FK semantics remain known schema debt.
Production schema must be inspected before deciding whether a separate
corrective phase is mandatory; PHASE-009 does not alter or design around it.
