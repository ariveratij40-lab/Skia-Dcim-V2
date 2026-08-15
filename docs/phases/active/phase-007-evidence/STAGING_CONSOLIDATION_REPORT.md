# PHASE-007 — STAGING consolidation report

## Release equivalence

- Consolidated branch backend tree:
  `061890fe8cfb7bb33edf998d9a2f69d7c4b1b417`.
- Active approved revision: `16e3ec6725ff9eae26faee84b37d74add1b35c18`.
- Active backend tree:
  `061890fe8cfb7bb33edf998d9a2f69d7c4b1b417`.
- Runtime-affecting difference: **false**.
- Deploy required/executed: **false / false**.

The consolidated integration branch represents the exact backend already
running in STAGING. A ceremonial redeploy was correctly skipped.

## STAGING controls before cleanup

| Control | Result |
|---|---|
| Backend image | `skia-api:phase006-final-16e3ec6` |
| Backend revision label | `16e3ec6725ff9eae26faee84b37d74add1b35c18` |
| Container health / restarts | healthy / `0` |
| Internal/public health | `200/200` |
| Effective API identity | 2 connections as `skia_runtime` |
| Runtime attributes | LOGIN, NOSUPERUSER, NOBYPASSRLS |
| RLS/FORCE | `true/true` on all three protected tables |
| Canonical policy hashes | exact |
| Fixture | `3/6/9/60/60/6` |
| Invalid tenant/branch mappings | `0/0` |
| Manifest | one exact match, regular, non-symlink, mode `0600`, approved SHA-256 |

Canonical hashes remained:

- `assets`: `16283f38465792bdb7cba3cc265570cd`;
- `asset_logs`: `6f7ecd60e4d50630fc35fb5cc6184f7f`;
- `asset_relationships`: `6e7ce93697090bc0ce92e3984c779771`.

## Functional controls

| Actor/control | HTTP/content result |
|---|---|
| A-OPERATOR A1 | `200`, exactly 10 A1 assets, zero foreign TEST aliases |
| A-OPERATOR A2 | `403`; subsequent list remained A1 with 10/0 foreign |
| A-MULTI A1 | `200`, exactly 10 A1 assets, zero foreign TEST aliases |
| A-MULTI A2 | `200`, exactly 10 A2 assets, zero foreign TEST aliases |
| B-ADMIN B1 | `200`, exactly 10 B1 assets, zero foreign TEST aliases |
| C-ADMIN C2 | `200`, exactly 10 C2 assets, zero foreign TEST aliases |

The first combined harness stopped after B-ADMIN login without emitting which
next assertion failed; its cleanup trap logged out the sessions it had created.
A targeted B/C diagnostic then emitted every HTTP code and content count, and
both actors approved. No leak or persistent functional failure was observed.
The diagnostic used no response bodies as evidence and logged out its own
sessions.

The optional job/import smoke test was not needed because the active backend
tree is identical to the already approved runtime and all mandatory functional
controls passed without mutating TEST asset counts.

## Stage C conclusion

Stage C is **APPROVED**. STAGING is already running the consolidated backend
behavior, remains healthy under restricted runtime and canonical RLS, and the
fixture is exact and eligible for manifest-bound cleanup.
