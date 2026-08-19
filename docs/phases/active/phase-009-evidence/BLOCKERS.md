# PHASE-009 — Blockers

| ID | Status | Evidence | Required resolution |
|---|---|---|---|
| P009-B01 | BLOCKED | Governance states no operational production exists; no authorized production host/path/channel | Explicitly identify production or authorize an empty-environment baseline in a separate gate |
| P009-B02 | BLOCKED | No active production SHA, image or digest can be established | Supply immutable current-release provenance and preserved rollback image |
| P009-B03 | BLOCKED | Production PostgreSQL version, schema ledger, FKs, data mappings, role/grants and RLS state are unknown | Authorized read-only production database audit |
| P009-B04 | BLOCKED | No production Compose/env/Nginx configuration exists; repository references missing production files | Separate reviewed production configuration phase with external secret references |
| P009-B05 | SECURITY FINDING | STAGING Compose contains versioned development/default sensitive values by type; values are redacted | Authorized secret/config remediation and rotation decision; do not reuse in production |
| P009-B06 | BLOCKED | Runtime/migrator separation and restricted gate are not represented in a production deployment config | Define and review fail-closed production runtime configuration |
| P009-B07 | BLOCKED | SQL files and embedded migrations coexist; production ledger/order is unknown | Produce an exact production migration reconciliation before deploy |
| P009-B08 | BLOCKED | Backup/snapshot and tested restore capability are unknown | Establish verified DB/uploads/config recovery evidence |
| P009-B09 | STRUCTURAL | Contradictory `import_jobs.user_id` FKs remain known debt; production applicability unknown | Read-only schema confirmation and separate corrective phase if present |

No blocker was bypassed or corrected. Detection of sensitive configuration did
not authorize reading external secrets, deletion, rotation or configuration
mutation.
