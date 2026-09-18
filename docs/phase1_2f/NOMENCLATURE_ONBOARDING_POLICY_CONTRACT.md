# Phase 1.2F-A — Nomenclature onboarding policy contract

Status: `PROPOSED_FOR_REVIEW`

Baseline: `658cfa35becaf75f851a27d44180fef20ea0f2ce`

This document is the normative, contract-first deliverable for Phase 1.2F-A.
It authorizes no schema, backend, frontend, deployment, or production change.
Implementation requires separately reviewed Phase 1.2F slices.

## 1. Architectural directive

SKIA builds and resolves authority in this order:

`Tenant -> Branch -> physical context -> MDF/IDF -> Housing/placement -> Solution -> Asset -> Nomenclature -> operation/audit`

Nomenclature describes canonical reality. It cannot create, infer, or replace
physical authority. A component included in a generated code must be resolved
from an existing canonical record inside the authenticated Tenant/Branch scope;
it is never accepted as authoritative free text from the client.

A system preset is a global, tenant-neutral recommendation. It does not issue
codes and is not operational authority. A tenant `naming_rules` row becomes the
operational authority only after an explicit acceptance or customization by an
authorized actor. No preset publication or update may silently modify a tenant
rule.

## 2. Authority hierarchy

| Concept | Canonical authority | Nomenclature use |
|---|---|---|
| Tenant | authenticated session and `tenants` | scope only; no client segment |
| Branch | session membership, `branches.id`, `branches.code` | Branch segment and counter scope |
| Building/Site | `buildings.id`, `buildings.code` | optional physical context |
| Floor | `floors.id`, canonical code | optional physical context |
| Zone | `zones.id`, `zones.code` | required by `ZONE` policies |
| Distribution | scoped MDF/IDF `locations` row and its `placement_code` | required by `MDF_IDF` policies |
| Housing | `assets.housing_rack_id` -> `racks.id`; the Housing asset's governed `internal_code` | required by `HOUSING` policies |
| Placement | `assets.location_id` -> scoped active `locations` row | only where the policy explicitly uses placement |
| Asset type | `asset_types.code` and `placement_policy` | represented by the preset prefix |
| Tenant rule | active, tenant-scoped `naming_rules` version | final code-generation authority |
| Sequence | transactional nomenclature counters | final segment; never client supplied |

`assets.location_id` and `assets.housing_rack_id` are different authorities.
Housing may determine physical containment while Location retains placement.
They must not both emit competing representations of the same concept in one
rule. TechnicalRoom and InternalArea are compatibility paths and are not new V2
segment authorities.

## 3. Existing primitives and compatibility boundary

- Migration 023 defines the versioned global `system_naming_presets` catalog,
  including V2 inclusion flags. It contains no production seed rows.
- Migration 024 defines the sole runtime reader,
  `read_active_system_naming_presets(text[])`. Runtime and PUBLIC retain no
  direct table access. Its current projection exposes only Branch and Placement
  inclusion, so Phase 1.2F-B must extend or version the secure projection before
  using other V2 fields.
- Migration 026 provides `rule_version`, `supersedes_rule_id`,
  `context_mode`, canonical Zone compatibility, linear lineage, and issued-rule
  immutability.
- Migration 033 provisions canonical MDF/IDF rules using Branch and Zone.
- `RequireTenantTx` and `TenantDB` provide the only accepted mutation boundary.
- `ReadActiveSystemNamingPresets`, `PreviewRecommendedCode`, and
  `ApplyRecommendedNomenclature` are reusable primitives but are not the full
  Phase 1.2F acceptance service. They lack complete V2 projection, durable
  provenance, actor-aware audit, and HTTP contracts.

Migration 014 tenant defaults and Migration 033 MDF/IDF rules are existing
tenant operational rules, not global presets. Phase 1.2F must preserve them and
must not classify them retroactively as accepted presets without evidence.

## 4. Policy 05 — CCTV and AC_UNIT

`POLICY_05=APPROVED_FOR_1_2F_A` with this interpretation:

- Existing `CCTV` remains the canonical camera asset type and participates in
  the initial catalog.
- Existing `AC_UNIT` means air-conditioning equipment. Prefix `AC` does not
  mean Access Control.
- Access-control doors, readers, panels/controllers, and NVR/video recorders
  are not canonical AssetTypes today. Phase 1.2F-A does not invent them.
- Access Control requires a separate taxonomy decision before any corresponding
  preset, handler, seed, or UX can exist.
- New managed CCTV and AC_UNIT identities require nomenclature. Legacy/import
  staging remains exempt until canonical promotion under its existing contract.

## 5. Policy 08 — acceptance authority

| Operation | Minimum authority |
|---|---|
| List active presets | authenticated tenant member |
| Preview a preset | authenticated tenant member |
| Accept one preset | tenant `admin` or `super_admin` |
| Bulk accept presets | tenant `admin` or `super_admin` |
| Customize a tenant rule | tenant `admin` or `super_admin` |
| Accept a newer preset version | tenant `admin` or `super_admin` |

Tenant, actor, and Branch authority come exclusively from the authenticated
request context. Clients cannot supply an authoritative `tenant_id`, actor, or
provenance value. All tenant mutations require `RequireTenantTx`, its injected
`TenantDB`, RLS/FORCE, and fail-closed authorization.

## 6. Segment precedence

The canonical V2 order is:

1. `prefix`
2. `branch`
3. `building` when enabled and resolved
4. `floor` when enabled and resolved
5. `zone` when enabled and resolved
6. `distribution` when enabled and resolved
7. exactly one of `housing` or generic `placement` when enabled
8. `custom_segment_1` when non-empty
9. `custom_segment_2` when non-empty
10. `sequence`

Rules:

- Prefix is required and represents AssetType identity; there is no duplicate
  AssetType segment.
- Branch is required in every initial version-1 preset.
- Physical segments are required only where the AssetType placement policy
  requires them. Building and Floor are optional context and are disabled in
  the initial catalog.
- Housing and Placement are mutually exclusive emitted concepts. Housing is
  used for `HOUSING`; Distribution is used for `MDF_IDF`; Zone is used for
  `ZONE`.
- `system/solution` is not a segment. No sufficiently uniform canonical
  Solution authority currently exists.
- Missing optional segments are omitted completely. They do not emit an empty
  token or adjacent separators.
- Canonical components are trimmed and normalized to uppercase. Values that
  are empty after normalization, contain the configured separator, or contain
  characters outside the approved component alphabet are rejected.
- The configured separator is emitted only between present components.
- Sequences are reserved transactionally through the existing counter model;
  `MAX()+1` is forbidden. Rollback does not consume a sequence, and committed
  identities are never recycled.
- Database uniqueness remains the final collision guard. A genuine collision
  fails closed and cannot be solved by client-supplied code.

## 7. Initial approved preset catalog

All entries are proposed as global, tenant-neutral version `1` presets. The
examples use illustrative canonical codes; clients never submit those literals
as authority. Custom segments are absent from every system preset and become a
tenant customization when explicitly added.

| preset_code | asset_type_code | version | prefix | required segments | optional segments | context_mode | sequence scope | digits | sep | example | physical authority source | compatibility constraints |
|---|---|---:|---|---|---|---|---|---:|---|---|---|---|
| `MDF_V1` | MDF | 1 | MDF | branch, zone, sequence | building, floor | `CANONICAL_ZONE` | rule+Branch | 3 | `-` | `MDF-TIJ-Z01-001` | `zones` through canonical MDF Location | Must coexist with Migration 033 rules; never replace an issued/custom rule |
| `IDF_V1` | IDF | 1 | IDF | branch, zone, sequence | building, floor | `CANONICAL_ZONE` | rule+Branch | 3 | `-` | `IDF-TIJ-Z01-001` | `zones` through canonical IDF Location | Same compatibility contract as MDF |
| `RACK_V1` | RACK | 1 | RK | branch, distribution, sequence | building, floor, zone | `CANONICAL_DISTRIBUTION` | rule+Branch+distribution Location | 3 | `-` | `RK-TIJ-MDF-TIJ-Z01-001-001` | canonical MDF/IDF Location selected by `racks.mdf_idf_id` | Requires a new supported context mode; cannot use TechnicalRoom |
| `SWITCH_V1` | SWITCH | 1 | SW | branch, housing, sequence | building, floor, zone, distribution | `CANONICAL_HOUSING` | rule+Branch | 4 | `-` | `SW-TIJ-RK-TIJ-MDF01-001-0001` | `assets.housing_rack_id` and Housing asset code | Housing segment and generic Placement cannot both emit |
| `UPS_V1` | UPS | 1 | UPS | branch, zone, sequence | building, floor | `CANONICAL_ZONE` | rule+Branch | 4 | `-` | `UPS-TIJ-Z01-0001` | Zone resolved from room placement | Initial policy is ZONE; a future authoritative mounted subtype needs a new preset version |
| `PDU_V1` | PDU | 1 | PDU | branch, housing, sequence | building, floor, zone, distribution | `CANONICAL_HOUSING` | rule+Branch | 4 | `-` | `PDU-TIJ-RK01-0001` | `assets.housing_rack_id` | Rack-mounted by canonical housing governance |
| `PATCH_PANEL_V1` | PATCH_PANEL | 1 | PP | branch, housing, sequence | building, floor, zone, distribution | `CANONICAL_HOUSING` | rule+Branch | 4 | `-` | `PP-TIJ-RK01-0001` | `assets.housing_rack_id` | Rack-mounted; no deprecated satellite `rack_id` authority |
| `NODE_V1` | NODE | 1 | ND | branch, zone, sequence | building, floor | `CANONICAL_ZONE` | rule+Branch | 4 | `-` | `ND-TIJ-Z01-0001` | canonical Zone | Connectivity fields are not placement or naming authority |
| `FIREWALL_V1` | FIREWALL | 1 | FW | branch, housing, sequence | building, floor, zone, distribution | `CANONICAL_HOUSING` | rule+Branch | 4 | `-` | `FW-TIJ-RK01-0001` | `assets.housing_rack_id` | Preset acceptance does not claim a specialized creation handler exists |
| `SERVER_V1` | SERVER | 1 | SRV | branch, housing, sequence | building, floor, zone, distribution | `CANONICAL_HOUSING` | rule+Branch | 4 | `-` | `SRV-TIJ-RK01-0001` | `assets.housing_rack_id` | Preset acceptance does not claim a specialized creation handler exists |
| `CCTV_V1` | CCTV | 1 | CAM | branch, zone, sequence | building, floor | `CANONICAL_ZONE` | rule+Branch | 4 | `-` | `CAM-TIJ-Z01-0001` | canonical Zone | CCTV means camera; no NVR or Access Control inference |
| `AC_UNIT_V1` | AC_UNIT | 1 | AC | branch, zone, sequence | building, floor | `CANONICAL_ZONE` | rule+Branch | 4 | `-` | `AC-TIJ-Z01-0001` | canonical Zone | AC means air-conditioning only |

### Catalog readiness classification

- `MDF_V1` and `IDF_V1` match an already enforced context and are
  `EXPRESSIBLE_WITH_EXISTING_RULE_MODEL`.
- The other ten presets map only to existing physical authorities but require
  the Phase 1.2F-B schema/projection/generator extension to express their V2
  segment flags atomically. They are `BLOCKED_FOR_SEED_UNTIL_1_2F_B`, not
  blocked by missing domain authority.
- No preset may be seeded until its fields can be read securely, copied into a
  tenant rule, validated by the database, and generated by the single canonical
  code engine without semantic loss.

## 8. Provenance contract

Every accepted or customized tenant rule must durably expose:

| Field | Contract |
|---|---|
| `source_type` | `PRESET`, `CUSTOM`, or `DERIVED_FROM_PRESET` |
| `source_preset_id` | required for PRESET/DERIVED; null for independent CUSTOM |
| `source_preset_version` | exact accepted version; required with preset ID |
| `accepted_by` | authenticated user that accepted the preset |
| `accepted_at` | authoritative database timestamp |
| `customized_after_acceptance` | true after explicit divergence from accepted preset |
| `rule_version` | existing tenant lineage version |
| `supersedes_rule_id` | existing predecessor relation when a successor is created |

The database must enforce coherent combinations. Provenance is operational
state, not merely an audit-log interpretation. Existing rules remain valid and
must be classified by an explicit compatibility strategy; they cannot be
silently attributed to a system preset.

## 9. Customization preservation

- Acceptance creates only a missing tenant rule or an explicitly accepted
  successor version.
- An equivalent accepted version is idempotent and reports
  `already_configured`.
- A customized rule reports `customized_preserved`; an intentionally inactive
  rule reports `inactive_preserved`.
- Structural comparison supplements, but never replaces, explicit provenance.
- A newer preset is an available recommendation. Adoption requires preview and
  explicit acceptance.
- Issued rule semantics and existing asset codes remain immutable.
- A derived/customized successor retains the original preset ID/version and
  sets `source_type=DERIVED_FROM_PRESET` plus
  `customized_after_acceptance=true`.

## 10. Bulk acceptance

`BULK_ATOMICITY=ALL_OR_NOTHING` and `MAX_BATCH=50`.

The client submits either a deduplicated explicit list of AssetType/preset
versions or `all_active=true`, never Tenant or actor identity. Deterministic
non-mutating results (`already_configured`, `customized_preserved`,
`inactive_preserved`, `preset_unavailable`) do not automatically fail the
operation. Any unexpected validation, database, authorization, provenance, or
audit failure rolls back every mutation and audit event.

One operation-summary audit event and one event per newly accepted rule are
written inside the same TenantTx. Preview and acceptance consume no asset
sequence.

## 11. Security boundary

- Preset listing and preview require an authenticated tenant member.
- Individual/bulk acceptance and customization require `admin` or
  `super_admin` within the authenticated Tenant.
- Tenant and actor always come from request context; Branch context may resolve
  examples but cannot expand Tenant authority.
- Handlers use only the injected TenantDB. Missing tenant identity or TenantDB
  fails closed.
- Runtime receives no direct privilege on `system_naming_presets`.
- The secure reader remains fixed-projection, allow-listed, SECURITY DEFINER,
  owned by `skia_migrator`, hardened with a fixed search path, and unavailable
  to PUBLIC.
- RLS/FORCE and restricted runtime role attributes remain unchanged.
- Acceptance, provenance, and audit are one transaction. A response is not
  released as success before commit.
- Bulk acceptance confers no authority unavailable to individual acceptance.

## 12. Explicit deferred taxonomy and scope

Deferred from the initial catalog:

- `ACCESS_DOOR`, `ACCESS_READER`, `ACCESS_CONTROLLER`: no canonical AssetType
  or approved placement/creation contract.
- `NVR` / `VIDEO_RECORDER`: no decision whether it is a SERVER subtype or a
  distinct AssetType.
- `AP`: no canonical AssetType.
- `BACKBONE`: relationship-only identity requires a dedicated endpoint-based
  nomenclature contract, not a normal placement preset.
- `TECHNICAL_ROOM`: frozen legacy compatibility concept, not V2 authority.
- `WAREHOUSE`: lifecycle/placement state, not an AssetType naming preset.

Also out of scope: asset creation redesign, counter redesign, renaming existing
assets, automatic rule overwrite/reactivation, deployment, production changes,
and optional housekeeping.

## 13. Contradiction audit

| Candidate issue | Resolution |
|---|---|
| Migration 023 has V2 flags but Migration 024 omits most of them | Known implementation gap; version/extend reader atomically in 1.2F-B |
| `naming_rules` lacks building/floor/distribution/housing flags | Known schema gap; do not seed affected presets before 1.2F-B |
| Existing generator supports legacy Site/Area, Zone, and Placement only | One engine must be extended; no second engine or fake custom segments |
| Migration 033 already created MDF/IDF rules | Preserve; acceptance must be idempotent/conflict-aware and cannot invent provenance |
| Migration 014 created CCTV/AC tenant rules | Preserve as legacy/custom-compatible tenant authority; do not treat them as system seeds |
| `AC` could be read as Access Control | Contract fixes it exclusively as AC_UNIT/air-conditioning |
| Housing and Location both exist | Emit only the policy-selected physical component; retain both persistence authorities for their distinct purposes |
| SERVER/FIREWALL/CCTV/AC_UNIT lack equivalent specialized handlers | Preset availability does not advertise creation readiness; readiness remains a separate backend contract |

No contradiction requires inventing a new physical authority. Ten catalog
entries are deliberately blocked from seed activation until the approved
existing authorities can be represented end-to-end.

## 14. Acceptance criteria for Phase 1.2F-B

Phase 1.2F-B may begin only after this contract is approved. Its schema/security
design must prove:

1. Additive provenance fields and constraints support PRESET, CUSTOM, and
   DERIVED_FROM_PRESET while preserving every existing rule.
2. Existing migrations 023, 024, 026, and 033 remain immutable.
3. A new migration seeds exactly the approved catalog and no deferred type.
4. Active preset uniqueness and version immutability remain enforced.
5. The secure reader exposes exactly the approved V2 fields without direct
   runtime table grants or PUBLIC execution.
6. `naming_rules`, the database enforcement trigger, backend DTOs, preview, and
   the single code generator share one segment order and context vocabulary.
7. Housing, Distribution, Zone, and Placement resolve only canonical scoped
   IDs/codes; custom segments cannot impersonate them.
8. Existing issued/custom/inactive rules are preserved, and unproven legacy
   rules receive no fabricated preset provenance.
9. Acceptance/audit writes can be performed with exact minimum privileges in a
   TenantTx; no broad runtime grant or BYPASSRLS is introduced.
10. PostgreSQL tests cover fresh and existing databases, RLS/FORCE, exact
    grants, invalid provenance, cross-tenant scope, sequence non-consumption,
    rollback, idempotency, and migration checksum protection.
11. Catalog examples generated by the final engine match this specification.
12. Rollback is additive-safe: application rollback may ignore new metadata,
    but accepted tenant rules and issued codes are never deleted or rewritten.

Phase 1.2F-B does not authorize HTTP endpoints, frontend implementation,
deployment, or production migration execution without their own gates.
