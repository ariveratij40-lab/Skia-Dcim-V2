# PHASE-010 — Production Foundation & Secure Configuration

## Status

AUTHORIZED FOR DESIGN / REPOSITORY PREPARATION ONLY.

This phase resolves PHASE-009 blockers required to create a production environment safely. It does not authorize production deployment or production mutation.

## Baseline

- Authoritative source: `main@ce19289e59bf25ece2cd208b92b399e31d8b2f17`.
- PHASE-009 evidence: `c2f86e0e5b37f903ef3bf7e704ea0d00533e6d4f`.
- Current operational environment: STAGING only.
- Production operational baseline: none.
- Future production domain: `skia.mx`.

## Objectives

1. Define a new-empty production environment rather than infer a nonexistent legacy production state.
2. Create production-specific Compose/configuration artifacts without embedding secrets.
3. Define runtime/migrator separation and restricted-runtime fail-closed configuration.
4. Define immutable release/image provenance and rollback structure.
5. Reconcile migration execution order for a clean production database.
6. Define backup/restore prerequisites before first production write.
7. Remediate versioned development/default sensitive configuration so it is not reused as production configuration.
8. Produce an executable-ready production bootstrap plan that still requires a separate deployment gate.

## Stage A — Production topology contract

Document the proposed production topology:

- application path under `/opt/apps/skia/prod` or another explicitly justified isolated production path;
- backend, frontend, PostgreSQL, Redis and optional admin services;
- internal-only database/Redis exposure unless explicitly required;
- production domain `skia.mx` and Nginx/TLS boundary;
- independent production volumes/networks/configuration;
- no reuse of STAGING database, Redis namespace, session secrets or containers.

No VPS directory, Docker resource, DNS record or Nginx config may be created in Stage A.

## Stage B — Repository production configuration

Create reviewed templates/artifacts only:

- production Compose definition;
- production environment example containing variable names/placeholders only;
- production Nginx template if repository ownership of that config is appropriate;
- release/deployment wrapper or documented command sequence pinned to immutable source/image digest;
- external secret-reference contract.

### Mandatory runtime settings

Production backend must support and require:

- `DATABASE_URL` => restricted runtime identity;
- `MIGRATOR_DATABASE_URL` => separate migrator identity;
- `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true`;
- external secret values only; no production secret value in Git;
- no development/default password or OAuth/JWT fallback accepted when production mode is enabled.

## Stage C — Sensitive default remediation

Inspect versioned configuration for sensitive development/default values reported by PHASE-009.

Authorized repository changes:

- replace sensitive defaults with fail-closed environment requirements where safe;
- remove hard-coded development credentials from deployment artifacts that could be promoted accidentally;
- retain explicit local-development examples only in clearly local/test artifacts and mark them non-production;
- add static checks preventing known secret/default patterns from entering production configuration.

Do NOT rotate live STAGING credentials in this stage. If removing a repository default would break STAGING without a coordinated external secret change, document the dependency and stop before changing that live behavior.

Never print or version actual secrets discovered during inspection.

## Stage D — Clean-production migration reconciliation

Build an exact migration/bootstrap inventory for an empty production PostgreSQL database.

Requirements:

- identify SQL migration files and embedded Go migrations;
- determine deterministic order and ownership;
- identify duplicates/conflicts and migrations that assume pre-existing objects;
- prove the bootstrap sequence in ephemeral PostgreSQL 16;
- confirm canonical RLS activation occurs only after schema/runtime prerequisites are ready;
- document the known contradictory `import_jobs.user_id` FK debt and determine whether it would be created on a clean bootstrap.

If a clean empty-database bootstrap cannot be proven without schema changes, stop and classify the exact blocker. Do not silently repair schema in this phase unless a separately documented minimal repository migration is required and remains strictly pre-production/local; any such schema change must be called out for architectural review before use.

## Stage E — Backup/restore and first-release contract

Because there is no existing production release, rollback for the first deployment is not a conventional previous-version rollback.

Define:

- pre-first-write PostgreSQL snapshot/backup procedure;
- encrypted backup location/reference requirements;
- upload/config backup procedures if applicable;
- restore verification procedure in a non-production target;
- release image/digest retention policy;
- first-release rollback semantics: stop traffic/remove candidate and restore the verified pre-write empty/snapshot state if database changes occurred;
- post-deployment acceptance gates before production is declared operational.

No production backup is executed in PHASE-010 because production does not yet exist.

## Stage F — Readiness evidence

Publish at minimum:

- `PRODUCTION_TOPOLOGY_REPORT.md`
- `PRODUCTION_CONFIG_REPORT.md`
- `SECRET_DEFAULT_REMEDIATION_REPORT.md`
- `MIGRATION_BOOTSTRAP_REPORT.md`
- `BACKUP_RESTORE_CONTRACT.md`
- `PRODUCTION_BOOTSTRAP_PLAN.md`
- `BLOCKERS.md`

Final classification must be one of:

- `READY FOR EMPTY-PRODUCTION PROVISIONING GATE`
- `BLOCKED`

## Autonomous authorization

Codex may autonomously during PHASE-010:

- inspect repository history and configuration;
- create/edit repository production templates, validation tooling and documentation;
- run local/ephemeral Docker/PostgreSQL validation;
- run builds/tests/static scans;
- commit and push scoped PHASE-010 changes to a dedicated execution branch;
- publish evidence.

## Hard stop / prohibited without new gate

PHASE-010 does NOT authorize:

- SSH or writes to a production host;
- creation of `/opt/apps/skia/prod`;
- Docker production containers/volumes/networks;
- production PostgreSQL/Redis creation or writes;
- production role/grant/password creation;
- DNS/Nginx/TLS changes;
- deployment to `skia.mx`;
- modification of `main`;
- production secret provisioning;
- live STAGING secret rotation or disruptive STAGING changes.

Stop if repository preparation would require any of the above.

## Acceptance criteria

PHASE-010 is ready to close only when:

1. Production topology is explicit and isolated from STAGING.
2. Production Compose/env/config templates contain no secret values/default credentials.
3. Runtime/migrator identities and fail-closed restricted runtime configuration are represented.
4. Clean PostgreSQL 16 bootstrap/migration order is proven or its exact blocker documented.
5. Canonical RLS activation/verification/rollback remains validated.
6. Backup/restore and first-release rollback semantics are explicit.
7. No production or `main` mutation occurred.
8. Evidence identifies all residual blockers without inferring missing infrastructure.

A separate PHASE-011 or architectural gate is required to provision an empty production environment.