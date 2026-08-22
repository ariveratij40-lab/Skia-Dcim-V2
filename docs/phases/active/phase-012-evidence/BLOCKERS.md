# PHASE-012 — Blockers

## P12-BLK-001 — Related inventory route fixtures remain incompatible

- Status: **BLOCKED**
- Corrected test: `TestHandleInventoryImportRoutes_DetailValid` passes 10/10
  with an exact SQL fixture and integer import ID.
- Observed next: `TestHandleInventoryImportRoutes_RowsValid` reaches the same
  DB-backed session path with a nil database handle.
- Additional contract mismatch: the inherited permission test expects 403,
  while the current dispatcher does not evaluate the declared permission.
- Risk: the mandatory backend suite is not green; promotion cannot claim a
  stable baseline.
- Required resolution: an architectural decision must define whether all route
  tests receive DB fixtures or the dispatcher converges on the established
  injected session/RBAC contract. PHASE-012 must then rerun in full.

## Final classification

**BLOCKED**
