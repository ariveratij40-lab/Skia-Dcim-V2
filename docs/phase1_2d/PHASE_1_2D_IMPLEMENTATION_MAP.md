# Phase 1.2D implementation map

## Modify

| File | Reason |
|---|---|
| `backend/main.go` | register only approved V2 routes with RequireTenantTx |
| `backend/physical_locations.go` | add Zone resolver/list/create; make Site/Floor optional context |
| `backend/asset_placement.go` | return Zone and legacy provenance; enforce policy-specific resolution |
| `backend/infrastructure_readiness.go` | derive physical-structure, initial-onboarding and per-AssetType readiness separately; stop universal Site/Area/MDF gates |
| `backend/infraestructura.go` | MDF/IDF V2 Zone write; Housing vocabulary; explicit Branch predicates |
| `backend/dcim_assets.go` | delegate create validation to domain service; additive Housing DTO |
| `backend/rack_layout.go` | resolve Housing rather than assume Rack; retain rack aliases |
| `backend/database_roles.go` and Phase011 SQL | only when preset read path is authorized; change exact allow-list/grant/test atomically |
| relevant frontend selectors/wizards | consume Zone/Housing/readiness contracts after backend approval |

## Add

- `backend/physical_domain.go`: Zone, Location provenance, Distribution and Housing resolvers.
- `backend/placement_policy.go`: controlled values and per-type legality.
- `backend/readiness_v2.go`: pure derived service and DTO.
- `backend/nomenclature_presets.go`: repository/service for list/apply/preview, only after security decision.
- focused unit and PostgreSQL integration tests for each service and HTTP contract.

## Keep

`tenant_tx.go`/RequireTenantTx, transactional nomenclature allocator, `naming_rules`, counters, lifecycle/audit behavior, migration 023, InternalArea and TechnicalRoom storage, specialized V1 routes during compatibility.

## Deprecate later

`getInfraSession`, InternalArea as creation authority, free-text Location fields, universal `rack_id` vocabulary, JSON `specs.rack_id`, and old hierarchy DTO. Removal requires consumer inventory and separate migration authority.

No Phase 1.2D implementation should duplicate policy logic in HTTP handlers; handlers decode, authorize, invoke one domain operation and map typed errors.

Approved scope does not add a generic Draft workflow. Missing prerequisites reject operational creation with deterministic reason codes. AssetType metadata values and any preset read grant must be reviewed as explicit implementation inputs.
