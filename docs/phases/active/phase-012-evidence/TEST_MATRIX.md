# PHASE-012 — Test Matrix

| Control | Origin | Result |
|---|---|---|
| Lineage/main merge-base | LOCAL | APPROVED |
| Complete candidate delta | LOCAL | APPROVED |
| Go build | CLEAN LOCAL | APPROVED |
| `go test ./...` | CLEAN LOCAL | FAILED |
| `npm ci` | CLEAN LOCAL | APPROVED |
| TypeScript | CLEAN LOCAL | APPROVED |
| Next.js production build | CLEAN LOCAL | APPROVED |
| Internal import resolution | CLEAN LOCAL | APPROVED |
| Bootstrap twice / ledger 10 | EPHEMERAL POSTGRES 16 | APPROVED |
| Canonical RLS matrix | EPHEMERAL POSTGRES 16 | APPROVED |
| Dark source/image identity | PRODUCTION VPS READ-ONLY | APPROVED |
| Main merge | NOT EXECUTED | BLOCKED |
| Production rebuild/redeploy | NOT EXECUTED | PROHIBITED |
| Inventory detail affected test, 10 repetitions | LOCAL | APPROVED |
| Related inventory route tests | LOCAL | FAILED (nil DB in `RowsValid`) |
| Gate rerun: full backend/frontend/bootstrap/RLS | NOT EXECUTED | BLOCKED by related test |
