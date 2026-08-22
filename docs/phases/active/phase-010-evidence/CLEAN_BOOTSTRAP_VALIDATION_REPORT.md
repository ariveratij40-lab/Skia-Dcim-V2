# PHASE-010 — Clean Bootstrap Validation Report

## Result

**BLOCKED BEFORE EXECUTION OF A RECONCILED BOOTSTRAP**

The earlier isolated PostgreSQL 16 run already established that raw lexical
replay stops in `003_rbac_validation_data.sql` on missing
`permissions.action`. That experiment was not repeated.

The reconciliation gate requires a new canonical forward-only schema for the
missing runtime tables before two clean PostgreSQL 16 validations can be
meaningful. Static reconciliation found incompatible active contracts for the
import family, documented in `RUNTIME_SCHEMA_GAP_REPORT.md`. Creating a
permissive placeholder schema merely to run PostgreSQL would not validate the
approved application contract.

Accordingly:

| Control | Result |
|---|---|
| Raw bootstrap failure reproduced | NOT EXECUTED (previous evidence reused) |
| Reconciled manifest run 1 | BLOCKED |
| Reconciled manifest run 2 | BLOCKED |
| Idempotence/determinism | BLOCKED |
| Backend tests against reconciled schema | BLOCKED |
| Canonical PHASE-005 RLS validation against reconciled schema | BLOCKED |
| STAGING comparison | NOT EXECUTED / not required to establish this blocker |

No PostgreSQL container was started in this gate continuation because there is
no architecture-approved reconciled SQL to execute.
