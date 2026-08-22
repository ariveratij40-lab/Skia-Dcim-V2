# PHASE-010 — Main Promotion Revalidation Report

## Scope

- Target: `main@ce19289e59bf25ece2cd208b92b399e31d8b2f17`
- Revalidated implementation tree: `ec2c13a72c9f28efd2ca63df7674d6950821f0eb`
- Gate-reviewed implementation commit: `ac6bb65f9ab88eec91e00bb6f73fc67e832dd4ec`
- Difference after the reviewed implementation: architectural gate evidence
  only; no bootstrap, migration or application contract change.
- Environment: LOCAL and PostgreSQL 16 ephemeral only.

## Mandatory checks

| Check | Result |
|---|---|
| Only forward migrations 017/018 added; historical migrations unchanged | APPROVED |
| Manifest entries exist and SHA-256 ledger is enforced | APPROVED |
| Empty PostgreSQL 16 bootstrap run 1 + repeat invocation | APPROVED; ledger 10 |
| Empty PostgreSQL 16 bootstrap run 2 + repeat invocation | APPROVED; ledger 10 |
| Normalized schema hash, both runs | `61bdcf58f437c5ab4d5c48ad48b14c9ba1af3a0439eb7a04f22da9d4817f3792` |
| Backend build | APPROVED, exit 0 |
| Focused import tests | APPROVED, exit 0 |
| Canonical PHASE-005 RLS local validation | APPROVED |
| Full backend suite | FAILED, inherited known issue retained visibly |

The full-suite failure is the already documented nil-DB panic in
`TestHandleInventoryImportRoutes_DetailValid`. It was neither fixed outside
scope nor hidden to obtain promotion approval.

## Security and environment boundary

No production secret, DSN, credential, fixture or live environment value was
introduced. No STAGING or production access, migration, deploy or mutation
occurred.

The evidence commit itself changes documentation only. Mandatory contract
checks are repeated after that commit and before PR creation; the final PR head
SHA is recorded in the PR description and remote verification output.
