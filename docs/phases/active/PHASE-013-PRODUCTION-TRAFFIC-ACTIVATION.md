# PHASE-013 — Production Traffic Activation Gate

## Status

**AUTHORIZED FOR CONTROLLED TRAFFIC ACTIVATION PRECHECKS AND SINGLE CUTOVER ATTEMPT.**

Baseline: `main@c50bdcba69c5d77ddf72d129742832cdf24e9ac2`.

Dark production functional candidate remains `92eac07c3931c30d198b8842ee458820bcba18d6`, previously validated byte-identical at Go runtime to the post-test main candidate. Production application containers are healthy and not publicly exposed. PostgreSQL/Redis are isolated, production data is empty, and canonical RLS is enabled.

This phase controls the first public production traffic activation for SKIA.

## Non-negotiable boundaries

- Do not modify STAGING.
- Do not change PostgreSQL schema, data, roles, grants, RLS policies or secrets.
- Do not rebuild or redeploy application containers unless a precheck proves the deployed image/source identity no longer matches the approved candidate.
- Do not create production users or seed business/demo data.
- Do not change DNS until all local/server-side prechecks pass.
- No second activation attempt is authorized after an actual cutover mutation; any failure after cutover requires rollback and a new gate.

## Stage A — Final lineage and dark-production identity

Read-only verify:

1. GitHub `main` is exactly `c50bdcba69c5d77ddf72d129742832cdf24e9ac2`.
2. Production backend/frontend containers correspond to the approved dark functional candidate `92eac07c3931c30d198b8842ee458820bcba18d6` or an explicitly proven byte/content-identical artifact.
3. Backend/frontend containers are healthy with restart count 0.
4. Internal backend health returns 200.
5. Unauthenticated protected route returns 401/403 as expected.
6. Runtime database identity is `skia_runtime`, NOSUPERUSER, NOBYPASSRLS.
7. Production business data remains empty (`tenants/users/assets = 0/0/0`).
8. Canonical policy names/hashes, 12 target grants and `RLS/FORCE=true/true` remain exact.
9. PostgreSQL and Redis are healthy.

Any mismatch => `BLOCKED` before traffic changes.

## Stage B — Public edge inventory and TLS readiness

Read-only inspect effective Nginx, DNS and TLS state for the intended production hostname.

Required outputs:

- exact intended production hostname;
- current DNS A/AAAA/CNAME resolution;
- whether DNS already points to the VPS;
- exact Nginx server blocks that would answer the hostname;
- active certificate subject/SAN, issuer and expiration if a certificate already exists;
- whether ACME/certbot or another approved certificate mechanism is present;
- exact backend/frontend upstream targets;
- proof that no STAGING hostname/upstream would be overwritten or restarted unnecessarily.

If the hostname, certificate path, DNS authority, or Nginx ownership is ambiguous => `BLOCKED`.

## Stage C — Rollback plan and configuration validation

Before changing traffic:

1. Preserve a timestamped copy/hash of the current effective Nginx configuration files that will be changed.
2. Record the exact current DNS state if DNS mutation is required.
3. Prepare the exact rollback commands/configuration, but do not execute them.
4. Validate candidate Nginx configuration with `nginx -t` or equivalent before reload.
5. Confirm the dark stack remains reachable internally while the public route is still disabled.
6. Confirm no database rollback is required for this phase because no DB mutation is authorized.

## Stage D — Controlled public-route activation

Exactly one cutover attempt is authorized after Stages A-C approve.

Preferred order:

1. Enable the reviewed production Nginx/TLS server block against the already-running dark backend/frontend.
2. Validate config successfully.
3. Reload Nginx gracefully; do not restart unrelated services.
4. If DNS does not already resolve the hostname to this VPS and DNS mutation is within the available authorized mechanism, change only the necessary production DNS record(s). Preserve prior values for rollback.
5. Do not alter STAGING records or routes.

If DNS cannot be changed through an explicitly available authorized mechanism, stop after server-side readiness and classify `READY FOR DNS ACTIVATION` rather than inventing access or credentials.

## Stage E — Immediate public smoke/security checks

As soon as the route becomes externally reachable, verify at minimum:

- HTTPS succeeds with valid hostname/certificate chain;
- HTTP redirects to HTTPS if HTTP is exposed;
- public `/api/health` returns 200;
- unauthenticated protected API remains 401/403;
- frontend root/login shell returns expected successful status without server error;
- backend and frontend remain healthy, restart count 0;
- no FATAL/PANIC in fresh logs;
- runtime remains `skia_runtime`;
- RLS/policies/hashes remain exact;
- production data counts remain 0/0/0;
- STAGING health and route remain unaffected.

## Stage F — Rollback trigger

Rollback public traffic immediately if any of the following occurs after cutover:

- invalid TLS/certificate hostname;
- backend/frontend public health failure;
- unexpected 5xx on required smoke routes;
- container unhealthy/restart loop;
- authentication boundary regression;
- RLS/runtime identity drift;
- accidental STAGING impact;
- unexpected public listener/database exposure.

Rollback scope is Nginx/DNS traffic only. Do not roll back PostgreSQL/RLS/application images unless a new architectural decision explicitly authorizes it.

After rollback, validate dark production and STAGING health and publish `ROLLED BACK / BLOCKED`.

## Stage G — Evidence and classification

Publish evidence under `docs/phases/active/phase-013-evidence/` including:

- `PRODUCTION_TRAFFIC_PREFLIGHT_REPORT.md`
- `NGINX_TLS_DNS_REPORT.md`
- `TRAFFIC_ACTIVATION_REPORT.md`
- `POST_ACTIVATION_SMOKE_REPORT.md`
- `ROLLBACK_REPORT.md` if rollback occurs
- `BLOCKERS.md`

Final classification must be exactly one of:

- `PRODUCTION TRAFFIC ACTIVATED — APPROVED`
- `READY FOR DNS ACTIVATION`
- `ROLLED BACK / BLOCKED`
- `BLOCKED BEFORE CUTOVER`

## npm audit debt

The inherited `npm audit` finding (1 moderate, 6 high) remains recorded technical/security debt. It does not authorize package upgrades inside this traffic gate. If any finding is shown to be remotely exploitable in the deployed production path during preflight, stop with `BLOCKED BEFORE CUTOVER` and create a dedicated remediation gate.
