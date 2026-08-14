# PHASE-003 — Architectural Decision: Runtime Role-Name Trace

## Decision

Etapa B is **approved as an architectural proposal**, but Etapa C remains **NOT AUTHORIZED**.

The evidence establishes that `dcim:view` is `NO ENFORCED` at runtime and must not be treated as an effective authorization control merely because it exists in seed/catalog data.

Before approving any RBAC write or unblocking PHASE-002 fixture preparation, one final read-only question must be resolved:

> Does the runtime branch/tenant authorization behavior depend on role names such as `admin`, `operator`, `viewer`, or any equivalent role-name check, bypass, or special case?

## Required read-only trace

Codex must trace the canonical repository and, when necessary, correlate read-only staging evidence for:

- comparisons against role names (`admin`, `operator`, `viewer`, case variants, constants/enums);
- admin/superadmin bypasses;
- role-dependent tenant selection;
- role-dependent branch selection;
- role-dependent asset filtering;
- role-dependent session/context construction;
- any handler or middleware where role identity changes effective scope even when `role_permissions` is not consulted.

Search must cover backend and frontend, but only backend/runtime checks count as enforcement.

## Required classification

For every relevant route used by PHASE-002 classify the effective controls among:

- `SESSION`
- `TENANT_MAPPING`
- `BRANCH_MAPPING`
- `ROLE_NAME`
- `RBAC_PERMISSION`
- `HANDLER_FILTER`
- `RLS`

State explicitly whether `ROLE_NAME` is:

- `ENFORCED`
- `NOT ENFORCED`
- `PARTIALLY ENFORCED`

and cite the exact code paths/functions in evidence.

## Consequence for test profiles

Until the trace is complete:

- `TEST-ADMIN`, `TEST-OPERATOR`, and `TEST-MULTI-BRANCH` remain proposed only.
- `{dcim:view}` remains a **normative catalog proposal**, not an effective runtime control.
- No role/permission rows may be written.
- PHASE-002 remains blocked for fixture preparation.

If role names are **NOT ENFORCED**, the preferred PHASE-002 test model is to exercise the actual current controls (session + tenant/branch mappings + handler filters) while preserving a separate normative RBAC catalog definition for future governance.

If role names are **ENFORCED or PARTIALLY ENFORCED**, the fixture design must model that behavior exactly and must not assign names that accidentally create broader scope or bypasses.

## Evidence update

Update only PHASE-003 evidence, preserving prior evidence. The final Etapa B evidence must distinguish:

1. **Effective current authorization baseline** — what the running application actually enforces.
2. **Normative RBAC catalog baseline** — the proposed permission/role model for governance.

## Authorization

Authorized now:

- local/static code inspection;
- read-only correlation with staging when needed;
- evidence updates.

Not authorized:

- Etapa C;
- INSERT/UPDATE/DELETE/DDL;
- role creation/modification;
- permission assignment;
- RLS changes;
- PHASE-002 fixture creation;
- deploy.
