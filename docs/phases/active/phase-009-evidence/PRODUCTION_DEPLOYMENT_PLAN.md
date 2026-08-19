# PHASE-009 — Immutable production deployment plan

## Status and authority

Etapa D planning artifact only. **DO NOT EXECUTE**. Production deployment,
configuration, role, database, RLS, Docker, Nginx, DNS and service mutations
remain unauthorized.

This plan is fail-closed and cannot become executable until every placeholder
below is resolved by a separate production-deploy gate from read-only evidence.

## Immutable inputs required by the future gate

- source: `main@ce19289e59bf25ece2cd208b92b399e31d8b2f17`;
- release image: `<AUTHORIZED_REGISTRY>/skia-api:ce19289e59bf25ece2cd208b92b399e31d8b2f17`;
- captured image digest: `<CANDIDATE_DIGEST>`;
- exact production host/path/orchestrator: `<PRODUCTION_TARGET>`;
- current preserved image/digest: `<PREVIOUS_IMAGE_AND_DIGEST>`;
- database snapshot identifier: `<PRE_DEPLOY_DB_SNAPSHOT>`;
- uploads/config backup identifiers: `<PRE_DEPLOY_VOLUME_CONFIG_SNAPSHOTS>`;
- external secret references only: `<RUNTIME_SECRET_REF>` and
  `<MIGRATOR_SECRET_REF>`; never values in Git or logs.

## Future authorized sequence

1. Re-run the complete read-only production baseline and approve every blocker.
2. Build only from the exact main SHA in a controlled builder; record builder,
   source SHA, dependency lock state, image digest and SBOM/provenance output.
3. Preserve the active image/digest and configuration revision; verify they can
   be pulled/started without rebuilding.
4. Create and verify an immutable, encrypted PostgreSQL backup/snapshot plus
   uploads/config backups. Record restore test or provider verification.
5. Provision external runtime/migrator credentials under a separately approved
   role/grant gate; verify identities differ without printing secrets.
6. Run migrations once using only the migrator identity and the approved,
   deterministic migration inventory. Stop on any ledger/schema mismatch.
7. Deploy backend only by exact candidate digest while retaining the previous
   container/image. Do not change frontend, Redis, Nginx or DNS unless new
   evidence and gate explicitly require it.
8. Start with restricted runtime enforcement enabled; validate role identity,
   health, migrations, logs and zero unexpected restarts.
9. Run non-destructive authentication, tenant/branch, branch-denial and
   contextual background/import smoke tests with authorized production-safe
   actors/data.
10. Activate canonical RLS only after runtime validation and a second locked
    precheck; execute the exact canonical artifact, then verify hashes,
    RLS/FORCE and isolation.
11. Hold acceptance while preserving rollback assets; record final SHA/digests,
    tests, results and approver.

## Mandatory stop gates

Stop before mutation on unknown provenance, backup failure, schema/FK drift,
invalid mappings, role/grant drift, secret-reference failure, migration ledger
ambiguity, health degradation, restart, unexpected HTTP behavior, RLS hash
drift or inability to preserve the previous release.

There is no automatic deployment step. This document does not authorize any
production command.
