# PHASE-012 — Test Matrix

| Control | Origin | Result |
|---|---|---|
| Lineage/main merge-base | LOCAL | APPROVED |
| Complete candidate delta | LOCAL | APPROVED |
| Go build | CLEAN LOCAL | APPROVED |
| `go test ./...` | CLEAN LOCAL | APPROVED |
| `npm ci` | CLEAN LOCAL | APPROVED |
| TypeScript | CLEAN LOCAL | APPROVED |
| Next.js production build | CLEAN LOCAL | APPROVED |
| Internal import resolution | CLEAN LOCAL | APPROVED |
| Bootstrap twice / ledger 10 | EPHEMERAL POSTGRES 16 | APPROVED |
| Canonical RLS matrix | EPHEMERAL POSTGRES 16 | APPROVED |
| Dark source/image identity | PRODUCTION VPS READ-ONLY | APPROVED |
| Main merge | NOT EXECUTED | PENDING MAIN MERGE GATE |
| Production rebuild/redeploy | NOT EXECUTED | PROHIBITED |
| Inventory detail affected test, 10 repetitions | LOCAL | APPROVED |
| Related inventory route matrix, 10 repetitions | LOCAL | APPROVED |
| Missing/invalid session and invalid tenant | LOCAL | APPROVED / fail closed |
| Unauthorized/cross-tenant/cross-branch | LOCAL | APPROVED / fail closed |
| Nonexistent import and malformed INTEGER ID | LOCAL | APPROVED |
| Permission-catalog absence under current route contract | LOCAL | APPROVED / documented current behavior |
| Internal unresolved imports (`TS2307`) | CLEAN LOCAL | 0 |
| Gate rerun: backend/frontend/bootstrap/RLS | CLEAN LOCAL / EPHEMERAL PG16 | APPROVED |
| Runtime binary equivalence vs dark candidate | CLEAN LOCAL | APPROVED / byte-identical |
