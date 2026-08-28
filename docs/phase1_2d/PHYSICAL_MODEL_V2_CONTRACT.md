# Physical Model V2 contract

## Vocabulary and authority

`Tenant → Branch → [Building → [Floor →]] Zone → MDF/IDF → Housing (RACK|CABINET) → equipment`.

- Branch is mandatory and comes from the authenticated session.
- Building and Floor are optional context, never onboarding gates by themselves.
- Zone is active, tenant/branch scoped and canonical for V2 placement.
- MDF/IDF is a distribution point/space represented by `assets + mdf_idf + locations`; it is not a Rack.
- Housing is the domain name for rows currently stored in `racks`; `housing_type` distinguishes RACK/CABINET.
- `locations.zone_id` is authoritative for V2. `internal_area_id` is accepted only for legacy dual-read.
- New V2 MDF/IDF writes require Zone and write `locations.zone_id`; reads never infer and persist Zone for legacy rows.
- TechnicalRoom is frozen for new V2 workflows. InternalArea remains legacy/dual-read and is not offered as the canonical V2 selector.

## Resolution contracts

`ResolveZone(tenantTx, tenant, branch, zoneID)` returns a canonical Zone plus optional Building/Floor labels and rejects inactive, cross-tenant or cross-branch identifiers.

`ResolvePhysicalPlacement` resolves a Location and returns provenance `V2_ZONE` or `LEGACY_INTERNAL_AREA`. New V2 writes require `V2_ZONE`; legacy reads accept both.

`ResolveHousing` resolves the physical `racks` row, its asset, `housing_type`, Branch and optional MDF/IDF parent. APIs expose `housing_id`/`housing_type`; `rack_id` remains a compatibility alias during transition.

## Creation order

Within one request TenantTx: resolve session scope → resolve Zone/placement → resolve optional MDF/IDF/Housing required by policy → preview nomenclature without mutation → reserve sequence → insert asset → insert satellite/relationships → audit → middleware commit. Any error rolls back all steps and the sequence.

## Placement policies

The complete persisted vocabulary is `BRANCH`, `ZONE`, `MDF_IDF`, `HOUSING`, `FREE_PLACEMENT`, `RELATIONSHIP_ONLY`. `FREE_PLACEMENT` selects only among supported structured targets using authoritative metadata. `RELATIONSHIP_ONLY` requires independently resolved endpoints; it is not an unplaced asset. `UNPLACED_ALLOWED` is not canonical.

For Backbone, the safely proven endpoint set is MDF/IDF. Same-Branch endpoints require membership in that Branch. Inter-Branch endpoints are allowed only inside the same Tenant and only when `user_branches` proves authority over both active Branches. `backbone_links.branch_id` remains legacy relationship context and cannot authorize either endpoint. A normal single-Branch `RequireTenantTx` cannot by itself prove or expose a second Branch under FORCE RLS; HTTP integration must use an already-authorized dual-Branch mechanism or return a deterministic authority requirement, never client Branch fields.

## Compatibility

No removal of InternalArea, TechnicalRoom or `rack_id`. Existing Location rows are never inferred/backfilled without evidence. V1 handlers remain functional until switched to the shared resolvers.
