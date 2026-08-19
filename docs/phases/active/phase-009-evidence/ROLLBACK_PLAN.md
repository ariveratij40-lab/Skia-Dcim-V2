# PHASE-009 — Production rollback plan

## Status

Planning only; **DO NOT EXECUTE**. Exact rollback cannot be approved until the
current production release, schema/RLS state and backup mechanisms are known.

## Future rollback triggers

- backend unhealthy or restart count increases unexpectedly;
- migration failure or schema ledger mismatch;
- authentication/session regression;
- tenant or branch leakage/fail-open behavior;
- runtime identity is privileged, shared with migrator or lacks required DML;
- RLS/FORCE or policy hash mismatch;
- contextual job/import failure that threatens isolation;
- data integrity/count drift or inability to complete acceptance probes.

## Future rollback sequence

1. Stop promotion and prevent further candidate traffic without deleting the
   preserved prior release.
2. If canonical RLS activation was the failing step and its exact pre-snapshot
   is proven, execute only `ops/phase005/rollback_canonical_rls.sql` with its
   required approvals and guards.
3. Restore the exact prior backend image digest and prior configuration
   revision; do not rebuild a historical image from source.
4. Restore database only when rollback analysis proves migrations/data changes
   are incompatible and the separately authorized restore procedure identifies
   the exact verified snapshot. Never improvise reverse DDL.
5. Restore uploads/config snapshots only if the failed release changed them and
   a verified dependency order exists.
6. Verify prior release SHA/digest, health, runtime identity, schema ledger,
   RLS/policy snapshot, authentication, tenant/branch isolation, data counts,
   Redis connectivity and HTTP status.
7. Record incident evidence and keep production blocked from another attempt
   until architectural review.

Required unresolved identifiers are `<PREVIOUS_IMAGE_AND_DIGEST>`,
`<PREVIOUS_CONFIG_REVISION>`, `<PRE_RLS_POLICY_SNAPSHOT>`,
`<PRE_DEPLOY_DB_SNAPSHOT>` and `<RESTORE_VERIFICATION>`. Their absence is a
blocker, not permission to substitute inferred values.
