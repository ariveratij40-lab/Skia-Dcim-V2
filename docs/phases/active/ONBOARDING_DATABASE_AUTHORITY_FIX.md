# Dedicated onboarding database authority corrective specification

## Objective

Provision password-based tenants and their first administrator through a
dedicated, least-privilege PostgreSQL identity instead of the restricted runtime
or schema migrator identities.

## Architecture and scope

- `DATABASE_URL` remains the `skia_runtime` pool used by normal handlers.
- `MIGRATOR_DATABASE_URL` remains the `skia_migrator` pool used for migrations.
- `ONBOARDING_DATABASE_URL` becomes the `skia_onboarding` pool used only by the
  register handler dependency.
- Restricted mode requires three distinct DSNs and fails closed if any is
  missing, duplicated, unreachable, or fails its security gate.
- The existing atomic registration transaction and tenant/branch authorization
  invariants remain unchanged.
- The production Compose template and role-provisioning artifacts accept an
  onboarding password variable but contain no credential value.

## PostgreSQL authority

`skia_onboarding` is `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
NOBYPASSRLS`. It receives `CONNECT` on `skia_prod`, `USAGE` on `public`, and
only these table privileges:

| Table | Privileges | Provisioning need |
|---|---|---|
| `users` | `SELECT`, `INSERT` | email conflict check and user creation |
| `tenants` | `INSERT` | tenant creation |
| `branches` | `INSERT` | initial branch creation |
| `user_tenants` | `INSERT` | tenant membership |
| `user_branches` | `INSERT` | branch authorization |
| `roles` | `SELECT`, `INSERT` | create or recover the tenant admin role |
| `user_roles` | `INSERT` | role assignment |

It receives no `UPDATE`, `DELETE`, `TRUNCATE`, sequence, persistent-schema DDL,
role-management, migration-ledger, asset, ticket, or infrastructure table
privileges. PostgreSQL's default `PUBLIC` grant may permit session-local
temporary objects; it does not grant access to application data or persistent
schema creation.

## RLS decision

The seven identity tables above do not have RLS enabled in the canonical
schema. Canonical RLS applies only to `assets`, `asset_logs`, and
`asset_relationships`, on which onboarding receives no table privileges.
Therefore no RLS exception or `BYPASSRLS` is necessary or allowed.

## Rollback

Repository rollback consists of reverting the corrective commits. Before a
future environment rollout, operators must provision the new secret, apply the
idempotent role artifact, and only then start the new backend. Operational
rollback would restore the prior backend configuration and revoke/drop the
onboarding role only under a separately approved environment procedure. This
specification authorizes no VPS, production, deploy, role, grant, or data
mutation.

## Exclusions and residual decisions

- No deployment, VPS access, production mutation, merge, RLS/schema migration,
  PHASE-013 modification, or real secret provisioning.
- Public registration remains a separate Product Owner/security decision.
- Google OAuth provisioning remains a separate non-atomic authority debt.
