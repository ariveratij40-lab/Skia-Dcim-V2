# PHASE-008 — STAGING equivalence report

## Result

Stage D: **APROBADO**. Origin: **STAGING VPS / POSTGRES STAGING / HTTP
STAGING**, read-only.

## Release equivalence

- Candidate backend tree:
  `061890fe8cfb7bb33edf998d9a2f69d7c4b1b417`.
- PHASE-007 approved backend tree: same exact tree.
- Active image: `skia-api:phase006-final-16e3ec6`.
- Active revision label:
  `16e3ec6725ff9eae26faee84b37d74add1b35c18`.
- PHASE-007 previously proved that revision's backend tree equals the same
  exact candidate tree. No deploy was required or performed.

The server checkout remains an older dirty operational tree (`main` at
`cc80606e744bf64e1534c4b6818d0ff2e29b5031`, 95 status lines). It was not
modified and is not the active release identity; the running immutable image
and revision label are the deployment evidence. This inherited checkout state
should remain operational debt, not be silently treated as candidate drift.

## Runtime and database controls

| Control | Observed |
|---|---|
| Runtime | `skia_runtime`, LOGIN, NOSUPERUSER, NOBYPASSRLS |
| Privileged memberships / target ownership | `0 / 0` |
| Target DML grants | exact 12 SELECT/INSERT/UPDATE/DELETE combinations |
| API runtime connections | `2` |
| RLS/FORCE | `true/true` on all three protected tables |
| Policy hashes | exact canonical hashes |
| Invalid tenant/branch mappings | `0/0` |
| Fixture markers | `0/0/0/0` |
| API/PostgreSQL/Redis | healthy |
| Backend restarts | `0` |
| Public health | HTTP `200` |

Canonical hashes remain:

- assets: `16283f38465792bdb7cba3cc265570cd`;
- asset_logs: `6f7ecd60e4d50630fc35fb5cc6184f7f`;
- asset_relationships: `6e7ce93697090bc0ce92e3984c779771`.

## Preserved non-TEST baseline

Final totals remain exactly `1/1/1/1/1/1/1/0/16/2/1/0/0` for tenants,
branches, users, roles, user-tenants, user-branches, user-roles,
role-permissions, sessions, assets, logs, relationships and import jobs.

The 11 recorded migration versions are unchanged during this audit. The known
contradictory `import_jobs.user_id` `NO ACTION`/`SET NULL` FKs on a NOT NULL
column remain present as documented debt; no schema, grant, role, policy or
data mutation was executed.
