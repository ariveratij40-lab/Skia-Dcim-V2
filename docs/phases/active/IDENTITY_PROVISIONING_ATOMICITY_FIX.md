# Identity provisioning atomicity corrective specification

## Objective

Make password-based tenant registration atomic and consistent with the existing
tenant and branch authorization model, and make the session cookie transport
policy deterministic across production and local development.

## Scope

- Wrap all mandatory `/api/auth/register` provisioning writes in one SQL
  transaction.
- Create the initial `user_branches` authorization mapping.
- Fail closed on database errors and expose only generic internal-error text.
- Preserve the existing email-conflict response and Argon2id password format.
- Derive the login session cookie `Secure` attribute from explicit application
  environment configuration.
- Add focused tests for success, rollback, login context, cookie policy, and
  existing tenant/branch authorization boundaries.

## Exclusions

- No schema, migration, RLS, database-role, infrastructure, VPS, deployment,
  DNS, TLS, or production-data changes.
- No change to whether public self-registration is a supported product policy.
- No merge to `main` or modification of PHASE-013.

## Invariants and acceptance criteria

Registration commits only after tenant, user, initial branch, `user_tenants`,
`user_branches`, tenant-local admin role, and `user_roles` have all succeeded.
Any failure rolls the transaction back. A subsequent login must resolve the
single authorized tenant and its authorized branch into the new session.
Cross-tenant and unmapped-branch selection must remain denied.

`APP_ENV=production` must always produce a `Secure` session cookie. Explicit
`SESSION_COOKIE_SECURE` configuration is accepted outside production for
deterministic local/test behavior; malformed values fail closed.

## Rollback

The correction has no schema or data migration. Repository rollback consists of
reverting the corrective commits. In-flight registration failures are rolled
back by PostgreSQL before an HTTP error is returned. No environment rollback or
production action is authorized by this specification.

## Residual product-policy decision

The repository currently exposes registration without authentication and the
frontend links directly to it. No invitation, feature flag, CRM, or documented
tenant-creation authority was found. This correction must not invent or change
that policy; public tenant creation requires a separate Product Owner/security
decision before general availability.
