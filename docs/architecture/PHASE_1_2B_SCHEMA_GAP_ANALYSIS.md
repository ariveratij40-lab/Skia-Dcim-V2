# PHASE 1.2B — Canonical Physical Model V2 Schema Gap Analysis

Reference snapshot: `9b9c7a314796b86eb308c1f1bc9e280a0025400a`.

This document is a design artifact. It does not authorize schema, application, data, provisioning, or deployment changes.

## 1. Executive Summary

The current model can evolve safely through an additive-first sequence. Its strongest reusable elements are session-scoped Branch authority, tenant/branch columns, `assets` plus satellite tables, managed nomenclature, transactional counters, `TenantDB`, `RequireTenantTx`, and FORCE RLS. The blocking mismatch is structural rather than conceptual: `zones` can exist only below a Floor, while V2 requires Zone to be the functional physical authority directly below Branch or optionally below Building/Floor. MDF/IDF placement is coupled to `internal_areas`, and housing is represented only by `racks` even though Cabinet is required.

The recommended design makes `zones` explicitly tenant/branch scoped, adds nullable Building/Floor parents with a constraint that Floor implies its matching Building, and adds `locations.zone_id` while preserving `internal_area_id` temporarily. `internal_areas` becomes deprecated compatibility data, not a renamed V2 authority. `technical_rooms` is frozen as legacy. Existing `racks` should be generalized into housing by adding `housing_type = RACK | CABINET`; this preserves existing foreign keys and rack-layout behavior with substantially less migration risk than introducing `housing_units` immediately.

No architectural blocker requires a destructive first migration. The design is approved for implementation planning subject to explicit data-classification decisions and constraint-validation gates listed below.

## 2. Current AS-IS Physical Model

The current canonical path for managed MDF/IDF is:

`Tenant → Branch → buildings (Site) → internal_areas → locations → assets → mdf_idf`

The older, mostly unused hierarchy is:

`Tenant → buildings → floors → zones → technical_rooms → racks`

Important observations from the schema and code:

- `buildings` has `tenant_id`, `branch_id`, immutable canonical `code`, status, RLS and FORCE RLS.
- `floors` has `tenant_id` and mandatory `building_id`, but no direct `branch_id`; Branch isolation is derived by joining Building.
- `zones` has `tenant_id` and mandatory `floor_id`; it has no `branch_id`, `building_id`, canonical code, description, or `updated_at`.
- `technical_rooms` requires `zone_id`; `racks.technical_room_id` is nullable and legacy code does not use it as authority.
- `internal_areas` requires Site and Branch, may reference Floor/Zone, and requires Floor whenever Zone is present.
- `locations` is the placement registry. MDF/IDF rows require `internal_area_id`; managed asset placement is referenced by `assets.location_id`.
- `racks.mdf_idf_id` already models the required distribution parent but is nullable.
- `switches`, `patch_panels`, and `pdus` have nullable `rack_id`; UPS has no structural housing FK and rack assignment is written into `assets.specs`.
- Readiness derives Branch, Building/Site, Internal Area, MDF/IDF, Rack, and active per-type nomenclature from real data.
- The nomenclature trigger resolves Site/Area through `locations.internal_area_id`. MDF/IDF counters are Branch scoped; placement-dependent counters additionally use `placement_id`.

## 3. Target TO-BE Physical Model

```text
Tenant
└── Branch
    ├── Building? ── Floor?
    ├── Zone (required physical authority; Branch-scoped)
    │   ├── building_id?
    │   └── floor_id?
    └── MDF / IDF asset at a valid Zone
        └── Housing (RACK or CABINET)
            └── compatible passive/active equipment
```

A Zone always belongs directly to a Tenant and Branch. Building and Floor refine its physical position but are not mandatory. When `floor_id` exists, `building_id` must exist and must be the Floor's Building. `locations` remains placement, pointing to Zone rather than becoming the hierarchy itself.

## 4. Gap Matrix

| Component | AS-IS | TO-BE | Required Change | Migration Type | Risk | Compatibility Strategy |
|---|---|---|---|---|---|---|
| Branch | Session authority | Same | None | KEEP | Low | Preserve `sessions.branch_id` and GUC |
| Building | Mandatory in current MDF flow | Optional refinement | Stop requiring it for Zone/MDF | Behavioral | Medium | Keep existing rows/endpoints during transition |
| Floor | Mandatory parent of Zone | Optional refinement | Add direct Branch scope; keep Building relationship | Additive + constraint | Medium | Backfill scope from Building |
| Zone | Mandatory Floor child | Functional physical authority | Add Branch, optional Building/Floor, code/description/updated_at | Additive then relax | High | Backfill existing scope before validating |
| Internal Area | Current MDF physical authority | Deprecated compatibility | Stop creating new V2 dependencies | Deprecate later | Medium | Dual-read during migration |
| Technical Room | Legacy hierarchy node | Non-authoritative legacy | Freeze | FROZEN | Low | Read-only compatibility only |
| Location | MDF/IDF points to Internal Area | Placement points to Zone | Add `zone_id`; dual constraint | Additive | High | One-of legacy/V2 context during transition |
| MDF/IDF | Asset + satellite + Location | Same, Zone-backed | Resolver and constraints evolve | Compatibility | High | No renaming or identity changes |
| Rack | Housing specialization | RACK/CABINET housing | Add housing type and enforce MDF parent for managed rows | Additive | Medium | Default existing rows to RACK |
| Equipment | Mixed nullable rack links | Policy-driven housing | Enforce by AssetType policy | Additive then behavioral | High | Legacy rows remain unresolved |
| UPS | Rack stored in JSON | Structural housing FK | Add nullable `rack_id` | Additive | Medium | Read FK first, JSON legacy fallback temporarily |
| AssetType | Name/icon/naming flag | Classification + placement policy | Add controlled attributes | Additive reference data | Medium | Backfill explicit reviewed matrix |
| Nomenclature presets | Tenant rules seeded eagerly | System suggestions accepted explicitly | New system preset catalog | Additive | Medium | Existing tenant rules remain untouched |
| Readiness | Initial wizard model | Initial plus per-asset readiness | New derived contract | API evolution | Medium | Version/extend response without persisted boolean |

## 5. Proposed Schema Delta

| Table/domain | Decision | Proposed delta |
|---|---|---|
| `branches` | KEEP | No V2 column required. Preserve tenant-scoped immutable code and active status. |
| `buildings` | KEEP | Optional hierarchy node. Preserve `(id, tenant_id, branch_id)` identity and code. Do not require one for readiness universally. |
| `floors` | ALTER | Add `branch_id`, `updated_at`, composite identity `(id, tenant_id, branch_id, building_id)`, and composite FK to Building. Keep `building_id NOT NULL`: a Floor without a Building has no coherent meaning. |
| `zones` | ALTER | Add `branch_id NOT NULL` after backfill, `building_id NULL`, make `floor_id NULL`, add `code NOT NULL`, `description`, `updated_at`, and composite scope keys. |
| `internal_areas` | DEPRECATE | Preserve table, RLS and existing data. No destructive migration. Mark API/columns legacy after dual-read migration. |
| `technical_rooms` | FROZEN | Preserve schema/data only for compatibility; do not use as V2 authority or create new V2 dependencies. |
| `locations` | ALTER | Add nullable `zone_id` with `(zone_id, tenant_id, branch_id)` FK. Keep `internal_area_id` temporarily. Add transition constraint requiring exactly one valid physical authority for managed MDF/IDF only after data classification. |
| `asset_types` | ALTER | Add controlled `asset_class`, `placement_policy`, and eventually `managed`/reviewed nomenclature obligation. Prefer DB reference authority over scattered handler switches. |
| `assets` | KEEP | Keep `tenant_id`, `branch_id`, `location_id`, nomenclature identity and lifecycle. Strengthen type-policy enforcement after compatibility layer exists. |
| `mdf_idf` | KEEP | Preserve specialization. Enforce asset/type/tenant/branch consistency through composite constraints or trigger; physical authority remains the linked Asset Location. |
| `racks` | ALTER | Add `housing_type` default `RACK`; require valid same-tenant/branch `mdf_idf_id` for new managed housing. Preserve `technical_room_id` as legacy nullable. |
| housing/cabinet | ADD CAPABILITY | Represent Cabinet as a `racks` row with `housing_type='CABINET'`; API terminology becomes Housing while table remains stable initially. |
| `switches` | ALTER LATER | Existing `rack_id` becomes housing reference semantically; validate compatible type and branch. |
| `patch_panels` | ALTER LATER | Same as Switch; housing required for new managed rows. |
| `pdus` | ALTER LATER | Same; housing required unless a reviewed policy permits freestanding PDU. |
| `ups` | ALTER | Add `rack_id NULL` and optional rack-unit/height fields. Policy may permit Zone or Housing depending UPS form factor. |
| `naming_rules` | KEEP | Tenant accepted/custom rules only. Do not store unaccepted system suggestions here. Preserve active/no-fallback semantics. |
| nomenclature counters | KEEP | Preserve Branch counters for MDF/IDF and placement counters for placement-dependent assets. Revisit only if a future Housing-scoped rule is explicitly introduced. |

### Zone column decision

The requested columns are justified:

- `branch_id`: required for direct Branch → Zone, direct RLS, and composite scope validation.
- `building_id`: nullable; identifies Branch → Building → Zone without inventing a Floor.
- `floor_id`: nullable; when present it implies and must match `building_id`.
- `code`: required immutable canonical component for nomenclature and stable API references.
- `description`: optional operator context.
- `updated_at`: required for lifecycle/audit consistency.

## 6. Proposed FK / Constraint Model

Recommended identities and constraints:

```text
buildings UNIQUE(id, tenant_id, branch_id)
floors UNIQUE(id, tenant_id, branch_id, building_id)
floors (building_id,tenant_id,branch_id) -> buildings
zones UNIQUE(id, tenant_id, branch_id)
zones (building_id,tenant_id,branch_id) -> buildings
zones (floor_id,tenant_id,branch_id,building_id) -> floors
zones CHECK (floor_id IS NULL OR building_id IS NOT NULL)
zones UNIQUE(tenant_id,branch_id,code)
locations (zone_id,tenant_id,branch_id) -> zones
racks (mdf_idf_id,tenant_id,branch_id) -> mdf_idf composite identity
```

During transition, managed MDF/IDF Location accepts legacy `internal_area_id` or V2 `zone_id`, but never silently accepts neither. A later validated constraint makes V2 rows require `zone_id`; it must distinguish historical legacy rows explicitly rather than infer hierarchy without evidence. New APIs should reject simultaneous conflicting Area and Zone references.

Parent status cannot be guaranteed by a plain FK. Backend resolvers inside the request TenantTx must require active Branch/Zone/MDF/Housing. DB triggers may provide defense in depth, but should not duplicate complex lifecycle policy prematurely.

## 7. Proposed RLS Model

All new/altered physical tables retain ENABLE and FORCE RLS. Policies use direct `tenant_id` and `branch_id` equality against `current_setting('app.tenant_id', true)` and `app.branch_id`; V2 should avoid recursive policy joins where denormalized scope can be safely constrained.

- Add/backfill `branch_id` on Floors and Zones before replacing join-based policies.
- `USING` and `WITH CHECK` must both enforce Tenant and Branch.
- Composite FKs prevent cross-branch parent references even for privileged migration roles.
- Runtime remains non-owner, non-superuser, `NOBYPASSRLS`, with table-specific minimum grants.
- All mutations and critical reads continue through `RequireTenantTx` and the same `TenantDB` transaction.
- Validators must reject unexpected policies, grants, ownership, or missing FORCE RLS.

## 8. Housing Design Decision

### Option A — generalize `racks` (recommended)

Add `housing_type IN ('RACK','CABINET')`, default existing rows to `RACK`, and expose a Housing DTO/service. Existing `switches.rack_id`, `patch_panels.rack_id`, `pdus.rack_id`, `racks.mdf_idf_id`, nomenclature type RACK, and `rack_layout.go` continue to work. Cabinet-specific behavior can be gated without changing every FK immediately.

Risk: the table name remains narrower than the domain and some rack fields may be irrelevant to Cabinets. This is manageable through nullable/type-conditioned validation and later renaming only if justified.

### Option B — new `housing_units`

This is cleaner in isolation but requires dual identity, migration of Rack references, layout endpoints, counters, handlers, and every satellite FK. It creates a high-risk compatibility window and provides little immediate operational value.

Decision: Option A. Generalize `racks` additively; do not create a parallel housing authority in Phase 1.2C.

## 9. Asset Placement Policy

Persist classification and policy in `asset_types`, because they are cross-cutting security/domain rules used by API validation, readiness, UI and tests. Code may retain exhaustive enum handling, but it must not be the only authority.

| Type | Asset class | Placement policy | Nomenclature recommendation |
|---|---|---|---|
| MDF, IDF | PHYSICAL_CONTAINER | ZONE | Required |
| RACK, future CABINET | PHYSICAL_CONTAINER | MDF_IDF | Required |
| PATCH_PANEL, PDU | PASSIVE_INFRASTRUCTURE | HOUSING | Required |
| SWITCH, FIREWALL, SERVER | ACTIVE_EQUIPMENT | HOUSING | Required |
| UPS | ACTIVE_EQUIPMENT | FREE_PLACEMENT (ZONE or HOUSING, explicit mode) | Required |
| NODE | ENDPOINT | FREE_PLACEMENT | Required when managed inventory identity is issued |
| CCTV, AC_UNIT | ACTIVE_EQUIPMENT | ZONE or FREE_PLACEMENT by reviewed subtype | Recommended to become required for managed creation |
| BACKBONE | RELATIONSHIP | RELATIONSHIP_ONLY | Required for managed relationship identity |
| AP/future sensors | ENDPOINT | ZONE/FREE_PLACEMENT | Decide per subtype; never universal Housing |

The enums are:

- `asset_class`: `PHYSICAL_CONTAINER`, `PASSIVE_INFRASTRUCTURE`, `ACTIVE_EQUIPMENT`, `ENDPOINT`, `RELATIONSHIP`, `OTHER`.
- `placement_policy`: `BRANCH`, `ZONE`, `MDF_IDF`, `HOUSING`, `FREE_PLACEMENT`, `RELATIONSHIP_ONLY`.

`FREE_PLACEMENT` is not free text: it means one of a controlled set of valid structured placements selected by type/subtype policy.

## 10. Nomenclature Preset Architecture

### A. Catalog in code

Simple but difficult to audit/version independently and risks divergence across services.

### B. `system_naming_presets` (recommended)

A global, versioned reference table can store one current recommended preset per managed AssetType, prefix/separator/digits/include flags/custom defaults, status, version, and description. It is read-only to runtime tenants. Acceptance copies a preset into tenant-owned `naming_rules`.

### C. Extra columns in `naming_rules`

Rejected for suggestions: it mixes system recommendations with accepted tenant authority and recreates rules before consent.

Decision: add `system_naming_presets` as system reference data. Existing `naming_rules` remain authoritative only after tenant acceptance/customization. The existing migration 014 behavior that materializes rules for every existing tenant is legacy and must not be repeated for new V2 presets.

## 11. Bulk Nomenclature Acceptance Design

Conceptual endpoint: `POST /api/dcim/nomenclature/accept-recommended`.

- Runs under `RequireTenantTx`; Tenant comes only from session.
- Request may contain an allow-list of AssetType codes or `all=true`; never Tenant ID.
- Locks/selects active system presets and existing tenant rules.
- Inserts only missing rules using preset values.
- Never updates a `CUSTOMIZED` rule and never reactivates an intentionally inactive tenant rule without an explicit separate decision.
- Is idempotent through `(tenant_id, asset_type_code)` uniqueness and deterministic conflict handling.
- Records an audit event per created rule plus one operation summary in the same transaction.
- Any insertion/audit error rolls back the whole acceptance.
- Response distinguishes `created`, `already_configured`, `customized_preserved`, `inactive_preserved`, and `preset_unavailable`.

Rule provenance should be explicit (`origin = RECOMMENDED | CUSTOMIZED`, `preset_version` nullable, `accepted_at/by`) but must be designed so existing rules remain compatible.

## 12. Readiness V2 Design

No `infrastructure_ready` boolean is stored.

`INITIAL_ONBOARDING_READY` is derived for the current Branch from:

1. active authorized Branch;
2. at least one active Zone (Building/Floor optional);
3. active MDF or IDF with valid Zone placement;
4. required nomenclature coverage for the onboarding operation.

Housing remains optional for the minimal initial physical topology unless the selected onboarding goal requires housed equipment.

`ASSET_CREATION_READY(asset_type, placement)` is a separate resolver that returns:

- classification and placement policy;
- required parent type;
- resolved active Zone/MDF/Housing as applicable;
- active naming rule;
- allowed action or canonical blocking error.

Readiness V2 must be computed in one TenantTx from session Tenant/Branch. The UI consumes reasons and actions; it does not infer readiness from counts or stale local state.

## 13. API Error Contract

| Error | HTTP | Meaning |
|---|---:|---|
| `infrastructure_not_ready` | 422 | Required V2 infrastructure for the requested operation is absent |
| `invalid_physical_placement` | 422 | Reference is missing, malformed, inactive, or incompatible |
| `housing_required` | 422 | AssetType policy requires Housing but none was supplied |
| `nomenclature_required` | 422 | No active tenant rule exists |
| `invalid_housing` | 422 | Housing is inactive, wrong type, wrong MDF/IDF, or incompatible |
| `inactive_physical_parent` | 422 | A referenced Zone/MDF/Housing exists but is inactive |
| `cross_branch_physical_reference` | 404 preferred | Reference is outside session Branch; avoid confirming its existence |

Database/internal details are logged server-side and returned as generic 500 errors. Cross-tenant references are likewise invisible.

## 14. Backend Impact Matrix

| File | Required Phase 1.2D impact |
|---|---|
| `physical_locations.go` | Add Zone resolver/API; make Building/Floor optional; keep legacy Area endpoints during compatibility window |
| `infrastructure_readiness.go` | Replace Site/Area dependency with Zone authority; add creation-readiness resolver integration |
| `infraestructura.go` | MDF/IDF POST accepts Zone ID reference, resolves it in TenantTx, inserts Location/Asset/satellite atomically |
| `asset_placement.go` | Distinguish Zone physical context from Asset placement; keep Location as placement registry |
| `dcim_assets.go` | Enforce persisted AssetType placement policy and structured Housing references |
| `rack_layout.go` | Generalize to Housing; remove JSON-only UPS assignment after FK migration; enforce Branch as well as Tenant |
| `database_roles.go` / provisioning validators | Add exact minimum privileges for new system preset/altered tables; deny everything outside allow-list |
| `asset_nomenclature.go` and DB trigger | Resolve Zone code directly for V2, dual-read legacy Area, preserve counter and no-fallback behavior |

Additional debt: `rack_layout.go` currently validates many operations by Tenant only and performs multiple writes without an explicit service-level all-or-nothing contract beyond middleware behavior. V2 must verify Branch and compatible satellite type and ensure every operation remains in the same request transaction.

## 15. Frontend Impact Matrix

| File | Required impact |
|---|---|
| `InfrastructureReadinessWizard.tsx` | Show Zone as functional physical requirement; separate initial and type-specific readiness reasons |
| `useInfrastructureReadiness.ts` | Type the V2 derived contract and retain stale-response protection |
| `infrastructureReadinessContent.ts` | Explain optional Building/Floor and required Zone without Site/Internal Area ambiguity |
| `mdf-idf.tsx` | Branch → Zone selection; optional Building/Floor filtering; payload only canonical IDs |
| `racks.tsx` | Select valid MDF/IDF, choose RACK/CABINET housing type, never free-text parent |
| `patch-panels.tsx`, `switches.tsx` | Require valid Housing according to policy and send only Housing ID |
| UPS/PDU flows | UPS supports explicit Zone/Housing mode; PDU follows reviewed Housing policy |

All flows must clear child selections when Branch/parent changes and refetch authority after roundtrips.

## 16. Test Impact Matrix

| Area | Required regression coverage |
|---|---|
| Schema | Branch-only, Building-Zone, Building-Floor-Zone; invalid mixed parent scope; NOT VALID then VALIDATE sequence |
| RLS | direct tenant/branch isolation for Floors/Zones/Locations/Housing; no GUC denied/invisible |
| Physical API | active/inactive parents, cross-tenant/branch, optional levels, canonical immutable codes |
| MDF/IDF | Zone-required V2 creation; legacy Area reads; atomic Location+Asset+satellite+audit; rollback counter |
| Housing | Rack/Cabinet same MDF/IDF; wrong Branch/type denied; existing Rack compatibility |
| Equipment | Housing required matrix; UPS FK; AP/CCTV/AC exceptions; satellite failure rollback |
| Nomenclature | preset read, bulk accept idempotency, customized preservation, no fallback, concurrency/counters |
| Readiness | initial versus per-AssetType readiness, exact reasons/actions, no DB side effects |
| Frontend | optional Building/Floor, required Zone, selector invalidation, roundtrip, error handling, accessibility |

Existing coupled suites requiring evolution include `physical_locations_*`, `infrastructure_readiness_*`, `asset_nomenclature_*`, `mdf_idf_runtime_persistence_integration_test.go`, `infraestructura_tenantdb_test.go`, `asset_lifecycle_integration_test.go`, `branch_scope_all_integration_test.go`, `nomenclature_catalog_test.go`, and `frontend/tests/infrastructureReadinessState.test.ts`. New PostgreSQL 16 integration suites are required for V2 constraints, FORCE RLS, migration compatibility and rollback.

## 17. Migration Sequence

### PHASE 1.2C — schema additive

1. Inventory and classify legacy rows; abort on unexplained cross-scope data.
2. Add Branch scope to Floors/Zones, Zone metadata, nullable Location Zone, housing type, UPS Rack FK, AssetType enums, and system presets.
3. Backfill only evidence-backed scope from existing FKs.
4. Add composite indexes/FKs as `NOT VALID` where supported; validate after audit.
5. Add/replace direct FORCE RLS policies and exact grants.
6. Do not relax/drop old constraints until new data paths are proven.

### PHASE 1.2D — backend compatibility

Implement Zone/Housing resolvers and dual-read legacy/V2 placement. New writes use V2 only; legacy rows remain readable. Update nomenclature physical context and structured UPS mounting.

### PHASE 1.2E — guided onboarding

Change readiness and wizards to optional Building/Floor, required Zone, MDF/IDF, and conditional Housing. Preserve session Branch authority and roundtrip context.

### PHASE 1.2F — nomenclature onboarding

Introduce system presets, individual/bulk acceptance, provenance and audit. Do not overwrite customized rules.

### PHASE 1.2G — legacy cleanup

After measured zero legacy dependencies, stop writes to `internal_areas`/`technical_rooms`, validate V2-only constraints, archive compatibility APIs, and plan a separate destructive removal. Removal is not automatic or part of 1.2C.

## 18. Rollback Strategy

- Phase 1.2C is additive and deploys no behavior depending exclusively on new columns.
- Keep old constraints and columns until Phase 1.2D passes dual-read tests.
- Every backfill records counts and rejects ambiguous mappings; rollback clears only evidence-tagged new references, never deletes legacy rows.
- New constraints are introduced unvalidated, then validated independently; failed validation does not rewrite data.
- Feature behavior is gated so application rollback can return to legacy reads while new columns remain inert.
- System presets are reference data and tenant rules created by explicit acceptance are not deleted during application rollback.
- No counter is decremented and no issued asset code is rewritten.

## 19. Known Risks

- Existing rows may contain inconsistent denormalized Tenant/Branch scope that must be audited before composite FK validation.
- A Zone backfill is impossible for Internal Areas without evidence-backed Zone mapping; these must remain legacy, not guessed.
- Generalizing `racks` requires careful UI terminology and type-conditioned capacity fields.
- Existing nullable `rack_id` values permit managed housed assets without Housing until new-write enforcement is deployed.
- UPS JSON rack references may be malformed or stale and require a report before FK backfill.
- `rack_layout.go` silently ignores some query errors and uses generic JSON fallback for unknown types.
- AssetType policy changes can break imports and legacy creation paths unless introduced in audit/report mode first.
- Existing tenant naming rules seeded automatically are not equivalent to explicit V2 preset acceptance.
- Trigger and backend nomenclature builders can diverge unless one shared conformance matrix covers both.
- Direct RLS policy replacement must be ordered so no partially protected window exists.

## 20. Open Questions

1. Are freestanding UPS units allowed at Zone level, or must every managed UPS be housed?
2. Are floorless Zones allowed under a Building exactly as proposed, and can a Zone later move between parents once assets exist?
3. Should Zone codes become immutable after first dependent asset, or immutable from creation?
4. Which NODE subtypes require Housing versus direct Zone placement?
5. Are CCTV and AC_UNIT always managed assets requiring nomenclature, or can tenants retain non-managed records?
6. Does Cabinet require U-based layout, shelves, or only containment in the first release?
7. Should legacy Internal Areas be exposed read-only in V2 UI or hidden behind a remediation report?
8. Which role may accept all recommended nomenclature presets: admin only or admin plus super_admin?

None blocks additive schema planning; each must be resolved before its corresponding behavioral enforcement.

## 21. Final Recommendation

Proceed with an additive Phase 1.2C design centered on Branch-scoped Zone authority, optional Building/Floor refinement, dual Location references, generalized Rack/Cabinet housing, structured UPS mounting, persisted AssetType placement policy, and separate system naming presets. Do not rename `internal_areas` into Zones, infer Zone relationships, replace `locations`, introduce a parallel housing authority, or remove legacy structures in the first migration.

The implementation gate must require PostgreSQL 16 clean/idempotent bootstrap, legacy snapshot migration, exact composite constraints, FORCE RLS/minimum grants, cross-tenant/cross-branch negative tests, atomic rollback, and unchanged issued nomenclature identities.

## 22. Gate

`PHASE1_2B_SCHEMA_DESIGN=APPROVED_FOR_IMPLEMENTATION_PLANNING`
