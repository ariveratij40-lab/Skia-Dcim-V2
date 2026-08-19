# PHASE-008 — Local release validation report

## Result

Stage C: **APROBADO WITH VISIBLE PRE-EXISTING SUITE FAILURE**.

| Validation | Result |
|---|---|
| Go runtime | `go1.26.5 darwin/arm64` |
| Focused branch/runtime/context/job/inventory tests | APROBADO, exit `0` |
| Backend build with `-trimpath` | APROBADO, exit `0`; artifact removed outside Git |
| PostgreSQL 16 ephemeral RLS suite | `PHASE005_LOCAL_VALIDATION=APPROVED` |
| RLS negative FK/drift cases | APROBADO |
| RLS activation/rollback idempotence | APROBADO |
| Runner emission tests | NO APLICA; runner intentionally excluded |
| `gofmt -l` on candidate Go changes | APROBADO, no output |
| Shell syntax for RLS validator | APROBADO |
| `git diff --check` | APROBADO |
| High-confidence secret scan | APROBADO |
| TEST fixture ID/manifest scan | APROBADO |
| Production endpoint scan | APROBADO |
| Runtime/security tree equality to PHASE-007 | APROBADO |

The PostgreSQL suite ran in a disposable `postgres:16-alpine` container with
network disabled and removed the container after completion. It did not access
STAGING.

## Complete Go suite

`go test ./... -count=1` exits `1` at the known inherited
`TestHandleInventoryImportRoutes_DetailValid` panic: a nil `*sql.DB` reaches
`ExtractSessionContextSecure`. The same failure was recorded by PHASE-007. It
is visible, unchanged and not corrected outside scope. All focused tests and
the build pass.

The initial focused test command was blocked before compilation by sandbox
access to the macOS Go cache. Re-execution with cache access approved; this was
an execution-environment issue, not a test failure.

Existing `backend/Dockerfile.bak` and `frontend/Dockerfile.bak` are inherited
from `main` and are not changed or included as candidate additions.
