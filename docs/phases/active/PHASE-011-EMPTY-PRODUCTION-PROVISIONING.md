# PHASE-011 — Empty Production Provisioning

## Status

**AUTHORIZED FOR CONTROLLED PROVISIONING OF AN EMPTY PRODUCTION ENVIRONMENT.**

This phase is the first phase that may create isolated production infrastructure on the VPS. It still does **not** authorize production traffic, DNS cutover, user onboarding, or general availability.

## Baseline

- Authoritative source: `main@8139fc4c65c3cdacc9d7467285f3b3c4b977c7cb`.
- PHASE-010 production bootstrap: merged and authoritative in `main`.
- Production domain target: `skia.mx`.
- Current operating environment: STAGING remains authoritative for existing service traffic.
- Production operational baseline before this phase: none.

## Objective

Create an isolated, empty, auditable production foundation on the VPS, bootstrap its PostgreSQL schema from the deterministic PHASE-010 artifacts, establish restricted runtime/migrator identities, validate backup/restore readiness, deploy the application without public traffic, and stop before any DNS/traffic activation.

## Stage A — VPS production preflight (read-only)

Before any mutation, record:

- hostname, operator identity and exact VPS time;
- free disk/memory and Docker availability;
- current `/opt/apps/skia` tree;
- all current SKIA containers, images, networks and published ports;
- STAGING container/image/release state;
- Nginx configuration ownership and current `skia.iamet.mx`/`skia.mx` handling;
- current listeners/port conflicts;
- confirmation that `/opt/apps/skia/prod` and planned production resources do not already contain unknown state.

If unexpected production-like state already exists, stop before mutation.

## Stage B — Production topology and secrets

Create only isolated production resources under `/opt/apps/skia/prod` (or a documented equivalent if the preflight proves a conflict).

Production must have:

- independent PostgreSQL 16 database/container/volume;
- independent Redis 7 container/volume;
- independent Docker network;
- backend and frontend production service definitions;
- no reuse of STAGING DB, Redis namespace, volumes, sessions or secret values;
- no public PostgreSQL/Redis exposure;
- backend only exposed to the local reverse-proxy boundary unless an explicit internal validation port is required;
- frontend/backend image/release provenance pinned to exact source and captured digest.

### Secrets

Create new production-only secrets outside Git. Never print them in evidence.

Minimum independent credentials:

- PostgreSQL bootstrap/admin credential;
- `skia_migrator` credential;
- `skia_runtime` credential;
- Redis password;
- JWT/session secret;
- OAuth/client secrets only if the production configuration actually requires them.

Files containing secret values must be external to Git, mode `0600`, and referenced by the production Compose/configuration contract.

Do not reuse known STAGING/default credentials.

## Stage C — Database roles and clean bootstrap

Provision a new empty production database.

Required identity model:

- migrator identity: permitted to execute the approved bootstrap/migration lifecycle;
- runtime identity: `LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, no protected-table ownership, minimum DML only;
- runtime and migrator DSNs must differ;
- `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true`.

Execute the exact PHASE-010 deterministic bootstrap from `main@8139fc4c...` using the migrator identity or the minimum bootstrap identity required by the artifacts.

Mandatory validations:

- manifest/checksum verification;
- clean bootstrap success;
- second invocation converges/idempotent;
- normalized schema hash equals `61bdcf58f437c5ab4d5c48ad48b14c9ba1af3a0439eb7a04f22da9d4817f3792` before environment-specific grants/RLS differences;
- `import_jobs.user_id` has exactly one restrictive FK;
- tenant/branch composite integrity is present;
- no test/demo fixtures were created.

## Stage D — Canonical RLS and restricted runtime

After schema/bootstrap prerequisites approve:

1. grant only the required runtime DML privileges;
2. execute canonical PHASE-005 RLS activation using the authorized migration identity;
3. verify RLS/FORCE `true/true` and exact canonical policy hashes;
4. validate direct PostgreSQL probes under `skia_runtime` with and without tenant/branch context;
5. prove runtime cannot bypass RLS and cannot perform schema/migration DDL.

Stop and rollback only the failed step if a critical invariant fails. Do not weaken grants or RLS to make a test pass.

## Stage E — Backup/restore proof

Before application deployment, create the first production database backup/snapshot reference and prove restore capability into a separate disposable validation target.

Evidence must record identifiers/checksums/metadata only, never secret values.

Required:

- backup/snapshot successfully created;
- restore to a non-production validation target succeeds;
- restored schema/hash/ledger match expected production-empty state;
- documented rollback semantics for the first release.

If backup or restore cannot be proven, stop before application deploy.

## Stage F — Application deploy without public traffic

Build or use immutable backend/frontend artifacts from exact `main@8139fc4c65c3cdacc9d7467285f3b3c4b977c7cb` and record image digests.

Deploy production backend/frontend containers against production-only PostgreSQL/Redis.

Required backend configuration includes:

- runtime `DATABASE_URL` using `skia_runtime`;
- separate `MIGRATOR_DATABASE_URL` using `skia_migrator`;
- restricted runtime enforcement enabled;
- production-mode secret requirements fail closed;
- no test fixture/bootstrap flags.

Validation before any public routing:

- containers healthy, restart count 0;
- backend effective DB identity = `skia_runtime`;
- internal health HTTP 200;
- frontend internal health/render check passes;
- no startup migration drift;
- RLS remains enabled/canonical;
- database remains empty of TEST/demo tenants/users/assets;
- logs contain no FATAL/PANIC or secret disclosure.

## Stage G — Nginx/TLS dark configuration

Prepare the production Nginx/TLS configuration for `skia.mx` only if this can be done without directing normal public traffic to the new application.

Allowed approaches include a disabled site, local-only/explicit validation route, or other dark-launch configuration that does not change public DNS behavior.

Do not modify authoritative public DNS in PHASE-011.

If TLS issuance inherently requires a DNS/public-routing mutation not already safe/authorized, document the blocker and stop before that mutation.

## Stage H — Final evidence and classification

Publish at minimum:

- `VPS_PRODUCTION_PREFLIGHT_REPORT.md`
- `PRODUCTION_TOPOLOGY_PROVISIONING_REPORT.md`
- `PRODUCTION_SECRET_PROVISIONING_REPORT.md` (redacted metadata only)
- `PRODUCTION_DATABASE_BOOTSTRAP_REPORT.md`
- `PRODUCTION_RLS_RUNTIME_REPORT.md`
- `PRODUCTION_BACKUP_RESTORE_REPORT.md`
- `PRODUCTION_DARK_DEPLOY_REPORT.md`
- `PRODUCTION_NGINX_TLS_REPORT.md`
- `BLOCKERS.md`

Final classification:

- `READY FOR PRODUCTION TRAFFIC ACTIVATION GATE`, or
- `BLOCKED`.

## Autonomous authorization

Codex may execute PHASE-011 autonomously within this exact scope, including required VPS writes, Docker resource creation, production-only PostgreSQL/Redis provisioning, new production-only credentials, deterministic bootstrap, grants, canonical RLS activation, backup/restore validation, dark backend/frontend deploy and dark Nginx/TLS preparation.

Routine operations inside this approved sequence do not require repeated user confirmation.

## Hard stops

Stop immediately and preserve evidence if:

- unexpected pre-existing production state is found;
- any action would modify STAGING data/containers/configuration;
- a production secret would need to be printed/versioned;
- bootstrap/schema hash differs unexpectedly;
- runtime is SUPERUSER/BYPASSRLS or owns protected tables;
- RLS/policy hashes differ from canonical state;
- backup/restore cannot be proven;
- backend/frontend health fails or restart count grows unexpectedly;
- public DNS or general traffic must change to continue;
- implementation requires changing `main`, historical migrations or architecture outside the approved PHASE-010 contract.

## Explicitly prohibited

PHASE-011 does NOT authorize:

- public DNS cutover to `skia.mx`;
- production traffic/general availability;
- onboarding real users/customers;
- copying STAGING production-like data into the new database;
- reusing STAGING secrets;
- weakening RLS/grants;
- modifying STAGING services except read-only observation;
- changes to `main`;
- deployment from any SHA other than `8139fc4c65c3cdacc9d7467285f3b3c4b977c7cb`.

A separate PHASE-012 or architectural traffic-activation gate is required after PHASE-011 succeeds.