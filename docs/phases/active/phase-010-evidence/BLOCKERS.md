# PHASE-010 — Blockers

## P10-BLK-001 — Canonical import schema is not defined

- Origin: repository static analysis
- Status: **BLOCKED**
- Evidence: active handlers require mutually incompatible context/nullability
  behavior for `imported_assets`; several import tables have no versioned
  creation path.
- Risk: an inferred schema could permit contextless cross-tenant records or
  break active endpoints.
- Required action: architecture must select the canonical import pipeline and
  define its tenant/branch contract.

## P10-BLK-002 — `import_jobs.user_id` lifecycle is ambiguous

- Origin: repository evidence plus previously approved STAGING structural
  evidence
- Status: **BLOCKED**
- Evidence: duplicate contradictory FKs exist on a non-null column; repository
  behavior does not prove which deletion invariant is authoritative.
- Risk: loss of audit attribution, blocked user lifecycle, or unintended job
  deletion.
- Required action: explicit schema decision before a forward-only migration.

## Effect

PHASE-010 cannot be marked `READY FOR EMPTY-PRODUCTION PROVISIONING GATE`.
No STAGING or production action is required or authorized to document these
blockers.
