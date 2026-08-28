# Phase 1.2D domain audit

Base: `b2db9ab201d4296ae02392b1d8b84b60b4343d23`. This is design evidence only.

## Findings

- Phase 023 supplies Branch-scoped Zones, optional Building/Floor, additive `locations.zone_id`, `racks.housing_type`, inert AssetType metadata and an empty preset catalog.
- Current operational placement is still `locations` with types MDF/IDF/WAREHOUSE. MDF/IDF creation resolves mandatory Building + Internal Area and writes `locations.internal_area_id`; it never writes `zone_id`.
- `mdf_idf` is a satellite of an `assets` row. Racks reference its satellite through `racks.mdf_idf_id`; MDF/IDF itself is not housing.
- Current readiness requires Branch, Site, Internal Area and MDF/IDF. Rack is optional. This is V1 onboarding readiness, not per-AssetType legality.
- `reserveManagedAsset` requires a `locations` placement for SWITCH, RACK, PATCH_PANEL, UPS, PDU and NODE. It does not consult `asset_types.placement_policy`.
- The hierarchy endpoint traverses Building→Floor→Zone→TechnicalRoom, while creation flows traverse Building→InternalArea→Location. These are parallel authorities.
- `rack_id` occurs in switch, patch-panel and PDU satellites; UPS and generic assets use `assets.specs.rack_id`. Cabinet is not exposed by handlers or UI.
- Naming preview builders are pure string formatting; sequence reservation occurs in `generateInternalCodeWithContext` during creation. A new V2 preview service must remain read-only.

## Invariant assessment

INV-PHY-001..007 are structurally supportable by 023. INV-PHY-008 is true in storage but blurred by `ensure-rack`. INV-PHY-009 exists only as a discriminator. INV-PHY-010..011 are not enforced because metadata is nullable/inert. INV-PHY-012 is not operational yet. INV-PHY-013 should remain compatibility-only. INV-PHY-014..015 are satisfied by canonical physical routes using `TenantIdentityFromContext`, `TenantDBFromContext` and `RequireTenantTx`; legacy `getInfraSession` remains a security debt outside these routes.

## Dependency classification

| Dependency | Current use | Class |
|---|---|---|
| `physical_locations.go` | Site/Internal Area creation and resolution | MUST MIGRATE TO ZONE |
| `infraestructura.go` MDF/IDF | writes/reads `internal_area_id` | DUAL-READ COMPATIBILITY |
| `infrastructure_readiness.go` | Site/Area authority | MUST MIGRATE TO ZONE |
| `MdfIdfWizard.tsx` | Site→Area flow | MUST MIGRATE TO ZONE |
| `locations.internal_area_id` | existing assets | LEGACY ONLY, retain |
| `internal_areas.floor_id/zone_id` | compatibility bridge | DUAL-READ COMPATIBILITY |
| hierarchy Technical Rooms | browsing only | LEGACY ONLY |
| free-text Location DTO fields | old generic catalog | SAFE TO REMOVE LATER after consumers migrate |

## MDF/IDF target

Canonical V2: an MDF/IDF asset and satellite are located by an active `locations` row whose `zone_id` resolves to the authenticated tenant/branch. No Rack is required. `racks.mdf_idf_id` remains an optional distribution-parent relationship for Housing created inside that MDF/IDF. Legacy rows with only `internal_area_id` remain readable.

Schema change is not required for the first V2 service/readiness implementation. Populating AssetType metadata and preset content is data governance and needs a separately authorized, idempotent operation.
