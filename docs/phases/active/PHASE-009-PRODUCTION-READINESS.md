# PHASE-009 — Production Readiness

## Baseline

- Authoritative `main`: `ce19289e59bf25ece2cd208b92b399e31d8b2f17`.
- PHASE-008 PR #4 merged successfully into `main`.
- STAGING remains the approved reference environment.
- Production deployment is NOT authorized by this phase specification.

## Objective

Prepare a fully auditable, fail-closed production promotion plan for SKIA without modifying production. PHASE-009 must establish the exact current production baseline, compare it against `main`, verify database/runtime/RLS prerequisites, define immutable release and rollback procedures, and produce an explicit go/no-go decision package for a later production-deploy gate.

## Autonomy

Codex may proceed autonomously through Etapas A–E, including read-only access to production infrastructure if already authorized by the existing SKIA operational channel, local analysis, documentation, commits and push on a PHASE-009 execution branch.

Stop immediately before any production write, deploy, container recreation, configuration mutation, database DDL/DML, role/grant/password change, RLS/policy mutation, DNS/Nginx change, or service restart.

## Etapa A — Production baseline, read-only

Capture and evidence, without exposing secrets:

1. production hostname/path/domain and active release identity;
2. backend/frontend container names, images, image digests, health and restart counts;
3. public and internal health status;
4. PostgreSQL version, database name, current runtime identity and role attributes;
5. migration/schema state relevant to `main@ce19289e...`;
6. RLS/FORCE flags and policy hashes for `assets`, `asset_logs`, `asset_relationships`;
7. current production counts sufficient to establish a non-destructive baseline;
8. Redis/Nginx status relevant to rollback, without changing them;
9. whether production currently uses separated runtime/migrator identities;
10. whether production checkout/release is immutable and traceable to a Git SHA.

No credentials, DSNs, session tokens or private keys may appear in evidence.

## Etapa B — Main versus production delta

Compare production's active backend/release against `main@ce19289e59bf25ece2cd208b92b399e31d8b2f17`.

Classify every meaningful delta as one of:

- runtime/security required for promotion;
- schema/migration required;
- deployment/configuration required;
- documentation-only;
- unrelated drift/blocker.

The comparison must specifically cover:

- runtime/migrator database separation;
- restricted runtime-role validation;
- tenant/branch transaction context;
- `handleSelectBranch` mapping enforcement;
- background/import job context;
- canonical PHASE-005 RLS artifacts;
- any production-only code or configuration drift.

If production contains unclassified or user-modified code that cannot be reconciled safely, stop.

## Etapa C — Production prerequisite validation

Read-only validation must determine whether production can support the approved security model without improvisation.

Required checks include:

- a restricted runtime PostgreSQL role exists or a provisioning plan can be defined without revealing a secret;
- migrator and runtime identities can be separated;
- required DML grants and ownership relationships are known;
- protected-table schema and the three target FK semantics match the canonical RLS guard expectations;
- canonical activation/verification/rollback SQL is applicable to the production schema;
- no incompatible tenant/branch data would make RLS activation unsafe;
- migration order is deterministic;
- rollback dependencies and previous backend image/release are available.

If a schema correction is required, do not design around it silently: declare a blocker requiring a separate corrective phase.

## Etapa D — Immutable deployment and rollback plan

Prepare, but do not execute, an exact production deployment procedure based on an immutable release from `main@ce19289e59bf25ece2cd208b92b399e31d8b2f17`.

The plan must include:

1. release path/image naming convention;
2. build provenance and digest capture;
3. pre-deploy backup/snapshot requirements appropriate to the production database;
4. runtime/migrator credential/configuration cutover sequence;
5. migration execution identity and order;
6. backend-only deployment order unless evidence proves other services must change;
7. RLS activation order only after restricted runtime is proven healthy;
8. smoke tests for health, authentication, tenant/branch isolation and a contextual background/import path;
9. exact rollback triggers;
10. rollback sequence for backend/configuration and RLS policies;
11. post-rollback verification;
12. explicit statement that no automatic production deployment is authorized.

Rollback must preserve the currently active production image/release until final acceptance.

## Etapa E — Readiness evidence and go/no-go package

Create evidence under:

`docs/phases/active/phase-009-evidence/`

At minimum:

- `PRODUCTION_BASELINE_REPORT.md`
- `MAIN_PRODUCTION_DELTA_REPORT.md`
- `PRODUCTION_PREREQUISITE_REPORT.md`
- `PRODUCTION_DEPLOYMENT_PLAN.md`
- `ROLLBACK_PLAN.md`
- `BLOCKERS.md`
- `PRODUCTION_READINESS_REPORT.md`

Final classification must be exactly one of:

- `READY FOR SEPARATE PRODUCTION DEPLOY GATE`
- `BLOCKED`

A READY classification does not itself authorize production deployment.

## Required stop conditions

Stop and publish evidence if any of the following occurs:

- production SHA/provenance cannot be established;
- production contains unexplained code drift;
- protected schema/FKs differ from canonical expectations;
- a restricted runtime identity cannot be safely provisioned;
- runtime/migrator separation requires unapproved architecture changes;
- production data reveals invalid tenant/branch mappings that would conflict with RLS;
- rollback image/release cannot be preserved;
- any step would require modifying production to complete the readiness assessment.

## Explicitly prohibited

PHASE-009 does not authorize:

- production deploy;
- merge or rewrite of `main`;
- production database writes;
- migrations or schema changes;
- PostgreSQL role/grant/password changes;
- RLS/policy activation or rollback;
- Docker/container recreation or restart;
- Nginx/DNS/Redis/frontend changes;
- secret extraction or versioning;
- destructive cleanup.

## Completion criterion

PHASE-009 is complete when the production state is independently documented, the exact delta to `main` is understood, prerequisites and rollback are demonstrated on paper/read-only evidence, and an explicit READY/BLOCKED decision is published without modifying production.
