# PHASE-007 — Blockers and closeout classification

## Blocking issue

| ID | Status | Evidence | Required decision |
|---|---|---|---|
| P007-B01 | AUTHORIZED SCOPE / RESIDUAL SCHEMA DEFECT | The exact two TEST jobs were authorized for cleanup; contradictory `NO ACTION` / `SET NULL` FKs on NOT NULL `user_id` remain unchanged | Address the schema defect only in a separately approved corrective phase |
| P007-B02 | BLOCKED | The one authorized effective cleanup transaction aborted before deletes because the exact attribution guard called `jsonb_array_length` on an observed JSON scalar | Approve a type-safe guard correction and one new cleanup retry |

The import-job gate authorized the exact rows without authorizing schema
changes. Its single effective transaction failed closed before the first
delete. No retry is authorized by this evidence alone.

## Final classification

| Required conclusion | Result |
|---|---|
| Integration branch contains approved PHASE-004/005/006 runtime/security behavior | **YES** |
| STAGING runs the consolidated backend behavior | **YES** — backend tree exact; no redeploy required |
| PHASE-002 fixtures completely removed by exact manifest | **NO / BLOCKED** — transaction rolled back |
| `skia_runtime` remains active/restricted | **YES** |
| Canonical RLS remains active and healthy | **YES** — RLS/FORCE true/true, hashes exact |
| Health | **YES** — backend healthy, restart 0, HTTP 200/200 |

## Residual known issues

- Pre-existing complete-suite panic:
  `TestHandleInventoryImportRoutes_DetailValid` reaches a nil `*sql.DB` in
  `ExtractSessionContextSecure`. Focused PHASE-004/006 tests and build pass;
  the panic was not hidden or corrected outside scope.
- `gofmt -l` reports 15 inherited backend files; PHASE-007 changed zero backend
  files and did not perform an unrelated formatting rewrite.
- ISO-011/012 relationship endpoint assertions remain structurally blocked
  where no read-only endpoint exists.
- ISO-013/014 actors without context and ISO-016 natural expiry remain
  structurally unobservable under the existing fixture/runner design.
- P007-B02 prevents fixture cleanup and therefore prevents full PHASE-007
  completion. P007-B01 remains a residual schema defect but was not modified.

## Stop condition

Stages A, B and C are approved. Stage D is blocked at an explicit structural
boundary; Stage E evidence is published with no false completion claim. No
merge to `main`, production deployment, RLS weakening, privilege expansion or
non-manifest data cleanup was performed.
