# Phase 1.2D security audit

## Canonical operations

`/api/dcim/sites`, `/api/dcim/internal-areas`, `/api/dcim/readiness`, `/api/dcim/placements`, `/api/infra/mdf-idf` and `/api/infra/racks` are wrapped by `RequireTenantTx`. Handlers obtain TenantDB and Tenant/Branch identity from context. Submitted Site, Area, Zone, Location and Housing IDs are references only and must be resolved against that scope.

| Operation | Session | Authority | Tx/RLS | Mutation role |
|---|---|---|---|---|
| readiness/tree/list | required | session Tenant/Branch | TenantTx/FORCE | authenticated member |
| create Zone/Housing | required | session Tenant/Branch | single TenantTx | admin/super_admin |
| resolve placement/create asset | required | session Tenant/Branch | single TenantTx | existing asset permission + type policy |
| list/apply presets | required | session Tenant | TenantTx for writes | admin/super_admin |
| preview naming | required | session scope | read-only TenantDB | member allowed to create type |

## Client-authority findings

- `HandlePlacements` accepts `branch_id` as a compatibility query but explicitly rejects any value different from session Branch. Keep only as a filter assertion; it is not authority.
- Physical request bodies accept `site_id`, `floor_id`, `zone_id`, `internal_area_id`, `placement_id`, `mdf_idf_id` and future `housing_id`. These are injectable references and require scoped resolution; current Site/Area and placement resolvers do this.
- `getInfraSession` uses the global pool, auto-selects the first Tenant/Branch, can update the session, and can create a default Branch. Its callers are CAPEX/certification, not canonical V2 routes. It violates the desired explicit session-authority model and is a reported legacy risk, not fixed here.
- Generic response DTOs expose `tenant_id`/`branch_id`; exposure is not authority. No canonical physical write should decode these fields.
- Rack GET filters tenant but omits explicit Branch; FORCE RLS supplies Branch isolation today. Add explicit Branch predicates as defense in depth in the implementation phase.

Canonical physical client Tenant authority findings: 0 accepted authority paths. Client Branch authority findings: 1 rejected compatibility parameter and 0 accepted authority paths. Legacy session-authority findings: 1 helper with four non-V2 call sites.

## Required negative tests

Cross-tenant/cross-branch Zone, Location, MDF/IDF and Housing IDs; body/query Tenant/Branch spoofing; missing TenantDB; runtime direct preset SELECT; owner-bypass false; rollback after satellite/audit failure.

## POLICY-1D-09 relationship authority

Backbone endpoint IDs are references, never authority. Resolve each endpoint as an active MDF/IDF in the authenticated Tenant, determine its Branch from the asset row, and prove active `user_branches` membership for the authenticated user. Same-Tenant inter-Branch links require membership over both Branches. Cross-Tenant links are always rejected. The single `backbone_links.branch_id` column is not endpoint authorization evidence. HTTP integration under a single-Branch TenantTx must fail closed until an established dual-Branch transaction scope can expose both authorized endpoints under FORCE RLS.
