# PHASE 1.2C — Additive Schema Implementation Plan

## Phase 1.2C final review amendment

This amendment supersedes two provisional assumptions later in this plan; it
does not rewrite the architectural exploration that produced them.

1. **Runtime preset access is deferred.** Phase 1.2C creates
   `system_naming_presets` as schema capability only. The final contract is
   `SYSTEM_NAMING_PRESETS_RUNTIME_GRANT=NONE`,
   `SYSTEM_NAMING_PRESETS_PUBLIC_PRIVILEGES=NONE`, and
   `SYSTEM_NAMING_PRESETS_RUNTIME_ACCESS=DEFERRED`. The table is not in the
   backend exact runtime allow-list. Phase 1.2F, or the phase that implements
   preset consumption, must introduce the application read path, backend
   allow-list change, direct database grant, and security tests atomically.
2. **Preset seeding is deferred.** `NAMING_PRESET_SEEDS=NONE` for Phase 1.2C.
   Preset content is product behavior and remains deferred to the
   nomenclature-onboarding phase. References below to reviewed seed records or
   runtime `SELECT` describe the superseded provisional plan, not the final
   Phase 1.2C implementation contract.

Canonical reference: `9b9c7a314796b86eb308c1f1bc9e280a0025400a`.

Planning artifact only. No SQL, migration, application, data, runtime, or deployment change is authorized by this document.

## 1. Executive Summary

Phase 1.2C can be implemented as one transactional, forward-compatible migration. It introduces direct Branch-scoped Zone authority without requiring Building or Floor; adds a nullable V2 Zone reference to `locations`; generalizes `racks` with a `RACK | CABINET` discriminator; reserves nullable AssetType classification metadata; and creates a global, non-tenant naming-preset catalog. Existing V1 columns, constraints, APIs, data and behavior remain valid.

The only relaxation needed is `zones.floor_id DROP NOT NULL`, performed after existing Zone rows are deterministically backfilled with Branch and Building scope. No legacy reference is deleted or rewritten. Existing MDF/IDF creation through `locations.internal_area_id` continues immediately after migration. New columns remain ignorable by V1 until Phase 1.2D implements dual-read/V2-write behavior.

## 2. Phase 1.2B Accepted Decisions

- Schema strategy: additive first with dual-read compatibility.
- Physical authority: Branch-scoped Zone with optional Building and Floor.
- `locations` remains placement; hierarchy is not duplicated into it.
- `internal_areas` is `LEGACY_COMPATIBILITY`, preserved during migration.
- `technical_rooms` is frozen legacy, not V2 authority.
- Housing uses generalized `racks`; no `housing_units` table.
- System naming presets are separate from tenant-owned `naming_rules`.
- Readiness remains derived and is implemented after the schema phase.

## 3. V1 Compatibility Requirement

Hard requirement: the application at the reference SHA must operate unchanged immediately after migration.

- Existing queries tolerate additive columns and tables.
- `locations.internal_area_id` and its MDF/IDF requirement remain intact.
- Existing Zone/Floor/Building rows preserve their identifiers and relationships.
- `racks.housing_type` defaults existing and V1-created rows to `RACK`.
- Nullable AssetType metadata does not affect existing handlers.
- Global presets are not consulted by V1 and cannot authorize creation.
- No naming rule, counter, asset identity, code or sequence changes.

`FORWARD_COMPATIBLE_WITH_V1=YES`.

## 4. Additive Schema Overview

| TABLE | ACTION | COLUMN/CONSTRAINT | NULLABILITY | DEFAULT | BACKFILL | V1 COMPATIBLE | RLS IMPACT | RISK |
|---|---|---|---|---|---|---|---|---|
| `buildings` | KEEP | Existing `UNIQUE(id,tenant_id,branch_id)` | n/a | n/a | None | Yes | None | Low |
| `floors` | KEEP/INDEX | Existing/ensure `UNIQUE(id,tenant_id,building_id)` | n/a | n/a | None | Yes | None | Low |
| `zones` | ADD | `branch_id UUID` | Initially NULL, then NOT NULL | None | From Floor→Building | Yes | Direct Branch policy later in same migration | Medium |
| `zones` | ADD | `building_id UUID` | Initially NULL | None | From `floors.building_id` | Yes | None | Medium |
| `zones` | ALTER | `floor_id` nullable | NULL allowed | None | Existing preserved | Yes | Existing reads unaffected | Medium |
| `zones` | ADD | `code VARCHAR(30)` | Initially NULL, then NOT NULL | None | Deterministic normalized name + suffix | Yes | None | Medium |
| `zones` | ADD | `description TEXT` | NULL | None | None | Yes | None | Low |
| `zones` | ADD | `updated_at TIMESTAMPTZ` | NOT NULL | `NOW()` | Existing rows receive migration timestamp | Yes | None | Low |
| `zones` | ADD | scoped Building/Floor FKs and parent CHECK | See constraints | n/a | Scope already backfilled | Yes | Defense in depth | Medium |
| `locations` | ADD | `zone_id UUID` | NULL | None | None in 1.2C | Yes | Existing policy already Branch-scoped | Medium |
| `locations` | ADD | scoped Zone FK `NOT VALID`, then validate | NULL allowed | n/a | None | Yes | Defense in depth | Low |
| `racks` | ADD | `housing_type VARCHAR(10)` | NOT NULL | `RACK` | Existing rows `RACK` | Yes | Existing policy/grants remain | Low |
| `racks` | ADD | `housing_type` CHECK | n/a | n/a | n/a | Yes | None | Low |
| `asset_types` | ADD | `asset_class VARCHAR(32)` | NULL | None | Only indisputable values or defer | Yes | Global catalog | Medium |
| `asset_types` | ADD | `placement_policy VARCHAR(32)` | NULL | None | Defer policy-dependent values | Yes | Global catalog | Medium |
| `asset_types` | ADD | enum-like CHECKs permitting NULL | n/a | n/a | n/a | Yes | None | Low |
| `system_naming_presets` | ADD TABLE | Global versioned preset catalog | Defined below | Defined below | Seed reviewed defaults | Yes | No tenant RLS | Medium |
| `naming_rules` | KEEP | Future V2 include fields designed, not added in 1.2C | n/a | n/a | None | Yes | None | Low |
| counters | KEEP | No change | n/a | n/a | None | Yes | None | Low |

## 5. zones V2 Design

Target columns:

```text
id UUID PK                         preserved
tenant_id UUID NOT NULL           preserved
branch_id UUID NOT NULL           new
building_id UUID NULL             new
floor_id UUID NULL                existing, relaxed
code VARCHAR(30) NOT NULL         new
name VARCHAR(100) NOT NULL        preserved
description TEXT NULL             new
status VARCHAR(20) NOT NULL       preserved active/inactive
created_at TIMESTAMPTZ NOT NULL   preserved
updated_at TIMESTAMPTZ NOT NULL   new
```

Target invariants:

1. `(branch_id, tenant_id)` references the same Tenant's Branch using the available Branch composite identity.
2. `(building_id, tenant_id, branch_id)` references `buildings(id,tenant_id,branch_id)` when Building exists.
3. `(floor_id, tenant_id, building_id)` references `floors(id,tenant_id,building_id)` when Floor exists.
4. `floor_id IS NULL OR building_id IS NOT NULL`.
5. Building is optional; Floor is optional.
6. `UNIQUE(tenant_id,branch_id,code)`.
7. `code` is nonblank and normalized to the same stable `[A-Z0-9]+(-[A-Z0-9]+)*` family used by Branch/Site codes.
8. `UNIQUE(id,tenant_id,branch_id)` supports scoped Location FKs.

Valid shapes are `(branch)`, `(branch,building)`, and `(branch,building,floor)`. There is no valid `(branch,floor)` shape.

Existing Zones are backfilled by joining `zones.floor_id → floors.building_id → buildings.branch_id`. Migration aborts before DDL completion if any row lacks an unambiguous chain or crosses Tenant scope. Existing codes are generated deterministically from normalized name within Tenant/Branch, with stable ordinal suffix by `created_at,id`; this does not infer a physical parent.

RLS remains enabled and forced. The join-derived policy is replaced transactionally only after `branch_id` is populated and constrained, with direct Tenant/Branch `USING` and `WITH CHECK` expressions.

## 6. buildings Compatibility

`buildings` remains unchanged. It already has `tenant_id`, `branch_id`, canonical `code`, `(id,tenant_id,branch_id)` uniqueness, status and FORCE RLS. No Building is synthesized and readiness must not treat Building as mandatory in Phase 1.2E.

The existing composite unique index is the target of Zone's optional scoped Building FK. No additional data backfill is required.

## 7. floors Compatibility

Recommendation: do **not** add `branch_id` to Floors.

Floor is always a Building child, so Branch is already determined by the Building. Strong Zone integrity is achieved by two constraints: Zone's Building belongs to its Tenant/Branch, and Zone's Floor belongs to that exact Tenant/Building. Adding `floors.branch_id` would create a second mutable truth requiring synchronization without enabling a valid topology unavailable through composite FKs.

Ensure a unique identity on `(id,tenant_id,building_id)` for the Zone Floor FK. Preserve `building_id NOT NULL`; optional Floor means a Zone may omit Floor, not that a Floor may omit Building. Existing join-based Floor RLS remains correct.

## 8. internal_areas Legacy Strategy

Classification: `LEGACY_COMPATIBILITY`.

Phase 1.2C does not alter its columns, constraints, RLS, grants, rows or API. Existing `locations.internal_area_id`, MDF/IDF handlers, trigger resolution, readiness and tests continue unchanged. Phase 1.2D introduces dual-read and V2-only new writes; only a later audited cleanup phase may stop legacy writes. No Area is automatically converted to a Zone because the current data does not prove that semantic equivalence.

## 9. locations Dual Placement Strategy

Add only `zone_id UUID NULL` plus a scoped FK:

```text
(zone_id,tenant_id,branch_id)
  REFERENCES zones(id,tenant_id,branch_id)
  ON DELETE RESTRICT
```

Do not duplicate Building or Floor because Zone is the normalized hierarchy authority.

Transition states:

- V1 legacy: `internal_area_id != NULL`, `zone_id = NULL`.
- V2: `zone_id != NULL`, normally `internal_area_id = NULL`.
- Compatibility bridge: both may temporarily be populated only when the backend has independently resolved both as same Tenant/Branch; neither value derives authority from the other.
- Warehouse/other legacy placement may have neither physical reference when its existing semantics permit it.

Phase 1.2C adds no CHECK linking these columns because it would either reject valid existing placement types or encode application policy before V2 behavior exists. Phase 1.2D makes new MDF/IDF writes Zone-backed. A later validated constraint can require V2 physical authority for managed physical types after legacy rows are explicitly classified.

## 10. Rack/Cabinet Housing Design

Minimal 1.2C delta:

```text
racks.housing_type VARCHAR(10) NOT NULL DEFAULT 'RACK'
CHECK (housing_type IN ('RACK','CABINET'))
```

Existing rows and V1 inserts become `RACK`; Cabinet shares `mdf_idf_id`, `total_u`, dimensions, asset identity and rack-layout infrastructure. `total_u` remains usable for Cabinets that support U mounting; type-specific validation may interpret it later.

Do not add `mounting_type` in 1.2C. Current UI concepts (`2 Postes`, `4 Postes`, `Abierto`, `Cerrado`, `Wall-mount`, `Gabinete`) mix frame construction, enclosure and mounting. Persisting another enum now would duplicate an unresolved taxonomy. Phase 1.2D must define a single controlled form-factor model before storing it. `housing_type` answers only the accepted Rack-versus-Cabinet authority question.

No new Housing table, ID, FK rewrite, or rack-layout fork is introduced.

## 11. asset_types Metadata Design

Add nullable controlled columns:

```text
asset_class VARCHAR(32) NULL
placement_policy VARCHAR(32) NULL
```

CHECK values:

- Asset class: `PHYSICAL_CONTAINER`, `PASSIVE_INFRASTRUCTURE`, `ACTIVE_EQUIPMENT`, `ENDPOINT`, `RELATIONSHIP`, `OTHER`.
- Placement policy: `BRANCH`, `ZONE`, `MDF_IDF`, `HOUSING`, `FREE_PLACEMENT`, `RELATIONSHIP_ONLY`.

Do not add `requires_housing`; it is redundant with `placement_policy='HOUSING'`. Null means `LEGACY_UNCLASSIFIED`, not unrestricted. V1 ignores both fields. Phase 1.2C may backfill only decisions not dependent on open policies (MDF/IDF, RACK, PATCH_PANEL, SWITCH, BACKBONE); remaining values stay NULL until reviewed. Enforcement begins only in Phase 1.2D after a complete matrix and validators exist.

## 12. system_naming_presets Design

Global reference table, not tenant-owned:

```text
id UUID PRIMARY KEY
asset_type_code VARCHAR(50) NOT NULL REFERENCES asset_types(code) ON DELETE RESTRICT
preset_version INTEGER NOT NULL CHECK (preset_version > 0)
prefix VARCHAR(20) NOT NULL
separator VARCHAR(5) NOT NULL DEFAULT '-'
include_branch BOOLEAN NOT NULL DEFAULT TRUE
include_building BOOLEAN NOT NULL DEFAULT FALSE
include_floor BOOLEAN NOT NULL DEFAULT FALSE
include_zone BOOLEAN NOT NULL DEFAULT FALSE
include_distribution BOOLEAN NOT NULL DEFAULT FALSE
include_housing BOOLEAN NOT NULL DEFAULT FALSE
include_placement BOOLEAN NOT NULL DEFAULT FALSE
seq_digits SMALLINT NOT NULL CHECK (seq_digits BETWEEN 2 AND 6)
custom_segment_1/2 VARCHAR(50) NULL
custom_segment_1/2_label VARCHAR(100) NULL
description TEXT NULL
active BOOLEAN NOT NULL DEFAULT TRUE
created_at/updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
UNIQUE(asset_type_code,preset_version)
```

A partial unique index permits at most one active preset per AssetType. Version rows are immutable after publication except controlled deactivation; replacement creates a higher version. Presets contain no Tenant, acceptance state, `last_seq`, counter or generated code.

This is a global system catalog: do not apply tenant RLS. Revoke PUBLIC privileges. The provisional design gave `skia_runtime` SELECT for a future TenantTx display/acceptance handler; the final-review amendment above supersedes that grant and defers all runtime access and seed content. `skia_onboarding` receives no access. Presets never become asset-creation authority: only accepted tenant `naming_rules` do.

## 13. naming_rules Compatibility

Preserve all legacy fields and semantics. Future V2 fields are conceptually:

`include_building`, `include_floor`, `include_zone`, `include_distribution`, `include_housing`.

They are **not added in Phase 1.2C**. Adding dormant writable flags before the backend generator and `enforce_naming_rule_normative_history` understand them would create unprotected competing semantics. Phase 1.2F must add the fields, update API/trigger/backend generation atomically, and define precedence:

- Legacy accepted rules continue using `include_site`, `include_internal_area`, and `include_placement`.
- New V2 accepted rules use the new conceptual segments.
- A rule version cannot mix contradictory legacy and V2 physical segments.
- Both paths feed the same ordered segment builder; there is no second engine.
- Issued rules remain immutable after sequence use and existing assets are never renamed.

## 14. Nomenclature Counter Compatibility

No change. `nomenclature_branch_counters` remains correct for MDF/IDF Branch-scoped sequences. `nomenclature_counters.placement_id` continues referencing `locations`, which remains placement authority and can itself point to a V2 Zone. Therefore Zone support does not require a counter redesign, new scope or `MAX()+1`.

## 15. UPS Placement Debt

Defer UPS normalization. Adding `ups.rack_id` is mechanically simple but the open policy still permits Zone-level versus Housing placement depending on form factor. A premature FK would not remove the JSON truth source and would expand migration scope.

Phase 1.2D should audit `assets.specs.rack_id`, define precedence, add a structured nullable housing reference in a dedicated migration, backfill only valid same-Branch references, and remove JSON writes after dual-read validation. Phase 1.2C creates no common polymorphic placement relation.

## 16. RLS and Database Role Matrix

| Object | RLS/FORCE | Policy | `skia_runtime` | `skia_migrator` | `skia_onboarding` | Bootstrap assumption |
|---|---|---|---|---|---|---|
| `zones` | ENABLE + FORCE preserved | Direct Tenant+Branch after backfill | Existing operational SELECT/INSERT/UPDATE only if current allow-list already requires it; no expansion without handler proof | DDL/backfill/validation | None | Migrator applies migration in transaction |
| `locations` | ENABLE + FORCE preserved | Existing direct Tenant+Branch | Existing SELECT/INSERT/UPDATE; no DELETE added | Migration authority | None | New column/FK covered by existing policy |
| `racks` | ENABLE + FORCE preserved | Existing Tenant+Branch | Preserve exact current grants | Migration authority | None | Default makes V1 inserts valid |
| `asset_types` | Global catalog | No tenant RLS | Preserve SELECT only | Reference-data authority | Existing access only | Nullable metadata is inert |
| `naming_rules` | ENABLE + FORCE unchanged | Tenant isolation | Preserve exact current SELECT/INSERT/UPDATE | Migration authority | None | No 1.2C delta |
| `system_naming_presets` | No tenant RLS | Global immutable catalog | None in 1.2C; provisional SELECT superseded | Owner/schema authority; no seeds in 1.2C | None | Revoke PUBLIC; validator asserts exact grants |

No runtime DDL, TRUNCATE, role creation, ownership, BYPASSRLS or superuser capability. New or replacement policies are installed in the same migration transaction; there is no unprotected intermediate committed state. Tenant/Branch always comes from session GUCs established by `RequireTenantTx`, never request payload authority.

## 17. Existing Data Compatibility

Known rows remain unchanged:

- 1 Tenant and 1 Branch: no mutation.
- 1 Building: reused by current flows; no synthetic Building.
- 2 Internal Areas: preserved byte-for-byte.
- 2 Locations: retain `internal_area_id`; `zone_id` remains NULL.
- 2 MDF assets and 2 `mdf_idf` rows: identities, codes, nomenclature and placement remain unchanged.
- 0 Racks: default is still verified for future V1 inserts.
- 2 naming rules: unchanged; no preset is treated as acceptance.

If Floors/Zones exist in another environment, their Branch/Building backfill is evidence-derived from mandatory current FKs. Any orphan or cross-Tenant chain aborts migration. There is zero deletion, truncation, reset, inferred Internal Area→Zone mapping, or sequence mutation.

## 18. Proposed Constraint Matrix

| Constraint | Timing | Validation behavior |
|---|---|---|
| Zone Branch/Tenant FK | After Branch backfill | Add NOT VALID, validate, then set Branch NOT NULL |
| Zone Building scoped FK | After Building backfill | Add NOT VALID; NULL accepted |
| Zone Floor scoped FK | After Building backfill | Add NOT VALID; NULL accepted |
| Zone Floor implies Building | After backfill | CHECK NOT VALID then validate |
| Zone code nonblank/format | After deterministic code backfill | CHECK NOT VALID then validate; set NOT NULL |
| Zone status | Existing | Preserve |
| Location scoped Zone FK | After Zone identity index | Add NOT VALID then validate; all current NULL rows pass |
| Housing type enum | At column creation | Existing rows default RACK and pass |
| AssetType class/policy enums | At column creation | Checks permit NULL |
| Preset version/digits/uniqueness | Table creation | Immediate; table is new |

No 1.2C constraint requires MDF/IDF `zone_id`, Housing parent non-null, complete AssetType policy, or legacy-column removal.

## 19. Proposed Index Matrix

| Object | Index | Purpose |
|---|---|---|
| `buildings` | Existing `UNIQUE(id,tenant_id,branch_id)` | Scoped Zone Building FK |
| `floors` | Ensure `UNIQUE(id,tenant_id,building_id)` | Scoped Zone Floor FK |
| `zones` | `UNIQUE(id,tenant_id,branch_id)` | Scoped Location FK |
| `zones` | `UNIQUE(tenant_id,branch_id,code)` | Canonical Branch-local code |
| `zones` | `(tenant_id,branch_id,status)` | RLS-scoped active listing |
| `zones` | `(building_id)` and `(floor_id)` partial/nonunique as planner requires | Parent traversal |
| `locations` | `(tenant_id,branch_id,zone_id)` where Zone nonnull | Zone placements |
| `racks` | `(tenant_id,branch_id,housing_type)` | Housing listing/filter |
| presets | `UNIQUE(asset_type_code,preset_version)` | Version identity |
| presets | Partial `UNIQUE(asset_type_code) WHERE active` | Single active recommendation |

Use `CREATE INDEX` inside the controlled transaction for atomic rollback. Because expected catalogs are small, avoid `CONCURRENTLY`, which cannot run inside that transaction; preflight production size/lock budget before execution authorization.

## 20. Migration Atomicity Plan

One migration is preferred because the dependency graph is bounded and PostgreSQL DDL is transactional. Exact future order:

1. Fail-closed preflight: server/version, expected prior ledger, table/constraint shapes, no orphan current Zone chain, no unexpected duplicate future Zone codes.
2. Acquire explicit locks in deterministic parent-to-child order: `buildings`, `floors`, `zones`, `locations`, `racks`, `asset_types`, `naming_rules` as needed.
3. Ensure supporting Building/Floor composite unique indexes.
4. Add nullable Zone columns (`branch_id`, `building_id`, `code`, description, updated timestamp) while retaining current Floor constraint.
5. Backfill Zone Building and Branch strictly from Floor→Building; generate deterministic codes.
6. Add Zone composite indexes and scoped FKs/CHECKs as NOT VALID.
7. Validate the scoped constraints; only then set Branch/code NOT NULL and relax Floor NOT NULL.
8. Add nullable `locations.zone_id`, its index and scoped FK NOT VALID; validate (current NULL rows pass).
9. Add `racks.housing_type` with default/check and explicitly verify all rows classify RACK.
10. Add nullable AssetType metadata and enum checks.
11. Create the `system_naming_presets` schema capability. The provisional seed action is superseded by the final-review amendment; no rows are seeded in 1.2C.
12. Replace Zone policy with direct Tenant/Branch `USING` and `WITH CHECK`; preserve FORCE RLS elsewhere.
13. Revoke PUBLIC and apply exact role grants; do not widen existing tenant-table privileges.
14. Run in-transaction verification: row counts, legacy references, constraint validity, RLS/FORCE, role attributes/grants, unchanged counters and issued codes.
15. Record migration ledger and commit once. Any failure rolls back all DDL, backfills, policies, grants and ledger changes.

Before execution, set bounded `lock_timeout` and `statement_timeout`. If table size exceeds the approved lock window, split only index construction into an explicitly governed preparatory operation; do not silently weaken atomicity.

## 21. Forward Compatibility With Current Application

`FORWARD_COMPATIBLE_WITH_V1=YES`.

V1 does not name the new columns in INSERT lists, accepts the Housing default, continues to use Internal Areas, and ignores presets/AssetType metadata. Existing triggers and counters are unchanged. Relaxing Zone Floor nullability cannot invalidate a V1 write that still supplies Floor. No new NOT NULL requirement is placed on V1-created Location, Rack, Asset or naming-rule rows.

## 22. Rollback Plan

Transaction failure before commit requires no manual rollback. After commit, the safest operational rollback is application rollback to V1 while leaving inert additive schema in place.

A destructive down migration is not the default because Phase 1.2D may have populated V2 columns. If removal is explicitly authorized before any V2 write, it must first prove zero nonnull `locations.zone_id`, zero Cabinet rows, zero nonnull AssetType metadata relied upon, and no accepted workflow depending on presets. Preset rows can be deactivated but tenant rules created later by explicit acceptance are never deleted. Issued asset codes and counters never roll back or decrement.

## 23. Open Behavioral Policies

### POLICY-01 — UPS placement

- Question: Are freestanding UPS units allowed at Zone level, or must every managed UPS be housed?
- Why it matters: determines UPS policy and structural FK enforcement.
- Earliest required phase: 1.2D UPS normalization.
- Blocks 1.2C: No; UPS schema normalization is deferred.
- Recommended default: controlled `FREE_PLACEMENT` allowing explicit Zone or Housing mode.
- Alternative: Housing required.
- Risk: ambiguous JSON/FK authority if decided late.

### POLICY-02 — Zone parent movement

- Question: Are floorless Building Zones allowed, and may a used Zone move between parents?
- Why it matters: controls update immutability.
- Earliest required phase: 1.2D Zone mutation API.
- Blocks 1.2C: No; floorless Building Zone is structurally supported.
- Recommended default: allow floorless Building Zone; freeze parent scope after first dependent Location.
- Alternative: parent immutable from creation.
- Risk: moving a used Zone can disconnect issued nomenclature from physical history.

### POLICY-03 — Zone code immutability

- Question: Is code immutable at creation or after first dependent asset?
- Why it matters: code can enter technical identity.
- Earliest required phase: 1.2D API/trigger.
- Blocks 1.2C: No; migration creates stable codes but no mutation endpoint.
- Recommended default: immutable from creation.
- Alternative: mutable until first dependency.
- Risk: renaming may invalidate previews/audit expectations.

### POLICY-04 — NODE subtype placement

- Question: Which NODE subtypes require Housing versus direct Zone placement?
- Why it matters: NODE spans endpoints, servers, APs and cameras in legacy semantics.
- Earliest required phase: 1.2D AssetType/subtype policy enforcement.
- Blocks 1.2C: No; NODE metadata may remain NULL.
- Recommended default: subtype-specific controlled policy; no universal Housing.
- Alternative: split NODE into distinct AssetTypes first.
- Risk: overgeneralization rejects valid field devices.

### POLICY-05 — CCTV/AC nomenclature

- Question: Must CCTV and AC_UNIT always be managed/nomenclature-required?
- Why it matters: changes creation gate and imports.
- Earliest required phase: 1.2F nomenclature onboarding.
- Blocks 1.2C: No.
- Recommended default: required for new managed creation, legacy/import staging exempt until promotion.
- Alternative: tenant-selectable unmanaged records.
- Risk: silent duplicate identities if optional indefinitely.

### POLICY-06 — Cabinet layout semantics

- Question: Does Cabinet use U layout, shelves, or containment only?
- Why it matters: determines capacity and layout validation.
- Earliest required phase: 1.2D Housing API/UI.
- Blocks 1.2C: No; discriminator and existing nullable dimensions suffice.
- Recommended default: U-capable Cabinet uses existing layout; non-U Cabinet is containment-only with no slot assignments.
- Alternative: require U capacity for all Cabinets.
- Risk: fake capacity values if one model is forced universally.

### POLICY-07 — Legacy Internal Area visibility

- Question: Should legacy Areas remain read-only visible or be hidden behind remediation?
- Why it matters: operator continuity and migration UX.
- Earliest required phase: 1.2E guided onboarding.
- Blocks 1.2C: No.
- Recommended default: read-only compatibility badge plus remediation report.
- Alternative: hide from new UI while retaining API reads.
- Risk: hidden unresolved placement becomes difficult to support.

### POLICY-08 — Preset acceptance role

- Question: May admin and super_admin accept all presets, or only a narrower authority?
- Why it matters: bulk operation creates tenant normative authority.
- Earliest required phase: 1.2F endpoint.
- Blocks 1.2C: No; preset table is read-only to runtime.
- Recommended default: tenant admin and super_admin with audit.
- Alternative: super_admin only.
- Risk: overly broad role can alter future technical identity policy.

`OPEN_POLICY_COUNT=8`; none blocks the additive schema.

## 24. Exact Phase 1.2C Implementation Scope

The future implementation may contain exactly:

1. One next-numbered additive migration and manifest/ledger registration.
2. Zone Branch/Building/code/metadata columns, nullable Floor, scoped indexes/FKs/checks and direct RLS policy.
3. Nullable `locations.zone_id` with scoped FK/index.
4. `racks.housing_type` discriminator/default/check.
5. Nullable AssetType class/policy columns and checks.
6. Global `system_naming_presets` schema, reviewed seed versions, exact grants and validator coverage.
7. Bootstrap/role/RLS/schema-fingerprint validator updates required solely by these objects.
8. PostgreSQL 16 clean/idempotent, existing-data, RLS/grant and rollback tests.

## 25. Explicit Out-of-Scope

- Backend/frontend behavior, endpoints, readiness or wizard changes.
- V2 writes, dual-read implementation or legacy remediation.
- Internal Area/Technical Room removal or rename.
- `housing_units`, Rack FK rewrites, Cabinet UI or mounting taxonomy.
- UPS JSON normalization.
- `naming_rules` V2 include fields, preset acceptance, bulk endpoint or counter changes.
- AssetType policy enforcement or final resolution of the eight policies.
- Data reset, production execution, deploy, VPS access, PHASE-013 changes.

## 26. Risks

- Lock duration for Zone/index changes must be measured before authorized production execution.
- Deterministic Zone-code collisions require suffixing and evidence output.
- Unexpected orphan/cross-Tenant Zone chains must abort; they cannot be repaired implicitly.
- Direct Zone RLS must not be committed before Branch backfill and constraints validate.
- Nullable policy metadata must be treated as unclassified, never permissive.
- The global preset catalog must not accidentally become an asset-creation fallback.
- Adding presets requires bootstrap fingerprint/manifest updates without changing individual historical migration hashes.
- A future engine update must extend normative-history protection at the same time as V2 naming flags.

## 27. Gate

- `V1_APPLICATION_COMPATIBLE=PASS`
- `EXISTING_DATA_COMPATIBLE=PASS`
- `NO_DESTRUCTIVE_SCHEMA=PASS`
- `NO_DATA_RESET=PASS`
- `TENANT_SCOPE_MODEL=PASS`
- `BRANCH_SCOPE_MODEL=PASS`
- `ZONE_MODEL=PASS`
- `HOUSING_MODEL=PASS`
- `NOMENCLATURE_COMPATIBILITY=PASS`
- `RLS_PLAN=PASS`
- `ROLLBACK_PLAN=PASS`

`PHASE1_2C_PLAN=APPROVED_FOR_MIGRATION_IMPLEMENTATION`
