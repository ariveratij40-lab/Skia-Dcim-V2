# Runtime authentication and session authority corrective specification

## Objective

Define and enforce the least PostgreSQL authority required by `skia_runtime` for
password login, tenant/branch context authorization, RBAC context resolution,
and session lifecycle operations. Database failures in authentication and
critical context selection must fail closed without being misreported as
ordinary invalid credentials or unauthorized context.

## Runtime table contract

| Table | Privileges | Runtime operation |
|---|---|---|
| `users` | `SELECT` | login and active-user/session identity |
| `user_tenants` | `SELECT` | tenant membership authorization |
| `tenants` | `SELECT` | tenant resolution and response |
| `user_branches` | `SELECT` | branch membership authorization |
| `branches` | `SELECT` | tenant-bound branch resolution |
| `sessions` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | create, validate, select context, logout |
| `user_roles` | `SELECT` | RBAC assignments |
| `roles` | `SELECT` | role names |
| `role_permissions` | `SELECT` | RBAC permission mapping |
| `permissions` | `SELECT` | permission codes |

No identity/RBAC mutation, `TRUNCATE`, sequence, persistent DDL, role
administration, `SUPERUSER`, `CREATEDB`, `CREATEROLE`, or `BYPASSRLS` authority
is included. The existing four DML grants on each of `assets`, `asset_logs`, and
`asset_relationships` are permitted only with canonical RLS/FORCE enabled; they
remain owned by the PHASE-005 RLS lifecycle and are not granted here.

## SessionStore reconciliation

The PostgreSQL store is aligned to the canonical schema: `sessions.id/token`,
BIGINT epoch expiry, no persisted `revoked` column, and direct joins over
`user_tenants`, `user_branches`, `branches`, `user_roles`, `roles`,
`role_permissions`, and `permissions`. No compatibility views or schema changes
are introduced.

## Error policy

- Missing user/session rows remain generic `401` responses.
- Database failures are logged server-side and return generic `500` responses.
- Tenant/branch authorization errors fail closed and never become an ambiguous
  unauthorized/forbidden result.
- SQL details are never returned to clients.

## Provisioning and rollback

The idempotent role artifact revokes all non-protected public-table grants from
`skia_runtime`, preserves PHASE-005 protected-table authority, then grants only
the contract above. Repository rollback consists of reverting the corrective
commits. Any future application or rollback of PostgreSQL grants is a separate
approved operational action; this specification authorizes no VPS, production,
deployment, merge, data, schema, or RLS mutation.

## Exclusions and residual risks

- Administrative identity mutations and password-reset writes are not added to
  this runtime authority. Those paths require a separately designed authority
  before they can operate under the exact restricted contract.
- Google OAuth provisioning remains a separate authority/atomicity debt.
- Public registration remains a separate product/security decision.
- PostgreSQL's default session-local `TEMP` capability inherited from `PUBLIC`
  is unchanged.
