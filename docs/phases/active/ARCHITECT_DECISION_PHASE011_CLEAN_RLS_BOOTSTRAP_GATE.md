# ARCHITECT DECISION — PHASE-011 CLEAN PRODUCTION RLS BOOTSTRAP GATE

## Decision

**APPROVED FOR IMPLEMENTATION AND ONE CONTROLLED STAGE-D EXECUTION.**

The PHASE-005 canonical activation artifact is a convergence artifact for the historical STAGING pre-state. It MUST NOT be weakened, bypassed, or modified to accept a clean production database.

PHASE-011 requires a separate, versioned clean-bootstrap RLS artifact whose authorized pre-state is the deterministic empty-production bootstrap.

## Proven clean-production pre-state

Before any mutation, the executor MUST revalidate all of the following:

- production bootstrap ledger is exactly 10/10 and checksums match the approved source;
- portable schema hash is exactly `521e1146bb3613bf251f61e362cb92e18c47a322f1931381752c6ceb9c4017f3`;
- semantic inventory matches the approved PHASE-011 reference with zero semantic drift;
- tenants/users/assets are `0/0/0`;
- `skia_runtime` and `skia_migrator` are restricted and neither is SUPERUSER nor BYPASSRLS;
- `skia_runtime` owns none of the protected tables;
- `assets`, `asset_logs`, and `asset_relationships` have `RLS=false`, `FORCE=false`;
- there are zero policies on those three tables;
- the three protected FK identities/semantics required by the canonical PHASE-005 artifact match exactly;
- PostgreSQL and Redis production containers are healthy and isolated.

Any mismatch is a hard stop before DDL or grants.

## Authorized implementation

Create a new PHASE-011 artifact for clean-production activation. Do not alter historical PHASE-005 activation/rollback artifacts.

The new artifact may, in one explicit transaction:

1. acquire the same protected-table locks used by the canonical RLS procedure;
2. repeat the complete clean-prestate guard while locks are held;
3. grant only the minimum privileges required by the production runtime contract;
4. create directly the three **final canonical** policies:
   - `assets_tenant_branch_isolation`;
   - `asset_logs_tenant_branch_isolation`;
   - `asset_relationships_tenant_branch_isolation`;
5. use the exact final policy definitions and expected hashes already established by PHASE-005; no legacy policy may be created as an intermediate state;
6. enable and FORCE RLS on all three protected tables;
7. verify final policy count, exact policy hashes, `RLS/FORCE=true/true`, runtime role attributes/ownership, and exact grants before COMMIT;
8. abort and rollback the complete transaction on any mismatch.

The implementation MUST be idempotent only for the exact clean pre-state or the exact final canonical state. Any third state is BLOCKED.

## Required local/ephemeral validation before VPS execution

Before Stage D is attempted on the isolated production database, validate the new artifact against PostgreSQL 16 ephemeral environments for at least:

- exact clean pre-state -> canonical final state;
- second invocation -> no semantic change;
- missing/extra/unexpected policy -> blocked;
- wrong RLS/FORCE flags -> blocked;
- wrong protected FK semantics -> blocked;
- unsafe runtime role attributes or ownership -> blocked;
- incomplete/excess runtime grant baseline where relevant -> blocked;
- transaction failure -> complete rollback to the original pre-state.

Record exact final policy hashes and prove they equal the PHASE-005 canonical final hashes.

## Stage-D execution authorization

After all ephemeral tests pass, exactly **one** controlled Stage-D execution is authorized against the existing isolated empty production database.

Immediately afterward perform read-only verification of:

- RLS/FORCE state;
- exact policy names/hashes;
- grants;
- role attributes and protected-table ownership;
- zero production business data;
- ledger and semantic inventory;
- PostgreSQL/Redis health.

If Stage D fails or any postcheck differs, stop PHASE-011. Do not retry without another architectural decision.

## Continuation

If Stage D and all postchecks pass, Codex is authorized to continue PHASE-011 Stages E-H under the existing PHASE-011 constraints: backup/restore verification, immutable application build, dark deploy and internal smoke tests.

DNS changes, public traffic activation, production user creation/data loading, and any modification of STAGING remain prohibited.

Final classification must be either:

- `READY FOR PRODUCTION TRAFFIC ACTIVATION GATE`, or
- `BLOCKED`.
