# Phase 1.2D policy approval

Status: `APPROVED_FOR_IMPLEMENTATION_PLANNING`.

## Final decisions

1. **POLICY-1D-01 — APPROVED_WITH_CHANGES.** UPS defaults to ZONE. Authoritative AssetType/subtype metadata may require HOUSING for mounted equipment. Backend policy resolution is authoritative; legacy `assets.specs` is read-only compatibility.
2. **POLICY-1D-02 — APPROVED.** Every new V2 MDF/IDF write requires canonical Zone and writes `locations.zone_id`. Existing `internal_area_id` rows remain dual-read and are never inferred/backfilled on read.
3. **POLICY-1D-03 — APPROVED.** ZONE has no implicit distribution requirement; MDF_IDF requires a scoped distribution point; HOUSING requires scoped Housing and its distribution chain. Handlers cannot invent policy.
4. **POLICY-1D-04 — APPROVED.** Domain term Housing; types RACK/CABINET; persistence remains `racks`. V2 exposes `housing_id/type`; legacy `rack_id` remains.
5. **POLICY-1D-05 — APPROVED_WITH_CHANGES.** Reject operational creation when prerequisites fail; never auto-create parents. Generic Draft/inactive creation is deferred unless an existing safe workflow is separately proven. Return deterministic reason codes.
6. **POLICY-1D-06 — APPROVED_WITH_CHANGES.** Apply-all is transactional/idempotent, creates missing rules, preserves issued/custom rules, reports conflicts, permits later customization and never consumes sequences.
7. **POLICY-1D-07 — APPROVED_WITH_CHANGES.** Derive PHYSICAL_STRUCTURE_READINESS, INITIAL_ONBOARDING_READINESS and ASSET_TYPE_CREATION_READINESS separately. Persist none as generic booleans.
8. **POLICY-1D-08 — APPROVED.** TechnicalRoom is frozen for V2 and legacy-readable. InternalArea rows/reads remain during transition but new V2 writes and selectors use Zone. No destructive removal.
9. **POLICY-1D-09 — APPROVED.** RELATIONSHIP_ONLY endpoints may share a Branch or span Branches of the same Tenant only when the authenticated user has active authority over every endpoint Branch. Cross-Tenant links are forbidden. Endpoint authority is resolved independently; `backbone_links.branch_id` and client Branch fields are insufficient.

## Resulting invariants

- Branch is mandatory session authority; Building/Floor are optional; Zone is V2 placement authority.
- MDF/IDF is distribution space, not Housing. Housing is RACK/CABINET.
- Asset prerequisites are controlled by centralized metadata/policy resolution.
- Preview never reserves; only final asset creation consumes a sequence.
- System presets are recommendations; tenant `naming_rules` remain effective authority.

## Readiness definitions

- `PHYSICAL_STRUCTURE_READINESS`: authorized Branch plus a usable Zone.
- `INITIAL_ONBOARDING_READINESS`: physical structure plus the minimum selected configuration for normal V2 use, without irrelevant telecom hierarchy.
- `ASSET_TYPE_CREATION_READINESS`: type-specific Zone/MDF-IDF/Housing/naming/catalog prerequisites and deterministic blockers.

## Compatibility constraints

Preserve existing InternalArea, TechnicalRoom and `rack_id` reads; preserve all legacy rows; do not infer Zone; do not introduce generic Draft; do not create a second authority in JSON; no destructive migration.

## Security invariants

Tenant and Branch derive from authenticated session/membership. All tenant writes use TenantTx/RequireTenantTx. Every Zone, distribution and Housing ID is resolved within session scope under RLS/FORCE. Client Tenant/Branch values never authorize access. Cross-tenant/branch injection is fail-closed.

## Implementation gate

`PHASE_1_2D_POLICY_STATUS=APPROVED`

`SCHEMA_CHANGE_REQUIRED=NO_FOR_APPROVED_CORE_CONTRACT`

`DESTRUCTIVE_CHANGE_REQUIRED=NO`

`IMPLEMENTATION_READY=YES_FOR_CONTROLLED_IMPLEMENTATION_PLAN`

Implementation still requires a separately authorized coding scope, exact endpoint selection, reviewed AssetType metadata values and the atomic preset read-path/grant change. These are execution controls, not unresolved domain policies.
