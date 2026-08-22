# PHASE-012 — Main Promotion Report

## Classification

**BLOCKED**

## Lineage and delta

The verified lineage is:

`main@8139fc4c -> functional candidate@92eac07c -> PHASE-011 evidence@a4541a8`

The functional candidate differs from main in 36 files: PHASE-011 operational
tooling/specification/evidence plus the bounded frontend closure. Net delta is
1676 insertions and 475 deletions. The final evidence commit changes only three
PHASE-011 evidence documents beyond the functional candidate.

## Clean validation

A detached clean worktree at exact candidate SHA was used.

- Go build with `-trimpath`: **APPROVED**.
- `go test ./...`: **FAILED**. `TestHandleInventoryImportRoutes_DetailValid`
  panicked because `ExtractSessionContextSecure` attempted to query through a
  nil `*sql.DB` from `handleInventoryImportRoutes`.
- `npm ci`: **APPROVED**.
- TypeScript `--noEmit`: **APPROVED**.
- Production Next.js build: **APPROVED**, 29 routes generated.
- Unresolved known internal imports: zero.
- PHASE-010 bootstrap on PostgreSQL 16: two convergent executions,
  `BOOTSTRAP_SCHEMA_OK`, ledger 10.
- PHASE-005 canonical RLS ephemeral matrix: **APPROVED**, including canonical
  hashes and negative guards.

The backend test failure is mandatory and cannot be corrected inside this
promotion-only gate. Main merge readiness is therefore not established.

The subsequent panic gate proved the original nil to be a test-setup defect
and corrected the affected detail test without runtime changes. That test now
passes 10/10, but the related rows test exposes the same inherited setup defect
and the route suite contains an authorization-contract discrepancy. The gate
therefore remains **BLOCKED** without broadening into runtime/RBAC wiring.

## Dark deployment identity

Read-only verification confirmed source pin
`92eac07c3931c30d198b8842ee458820bcba18d6`, matching backend/frontend image
tags. Image IDs remain `dea84b1186...84d11` and `3fb26c1409...f2022`;
containers are healthy with restart count zero and internal health 200. No host
port is published. No production resource was changed by PHASE-012.
