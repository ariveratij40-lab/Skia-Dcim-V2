# SKIA Canonical Asset Creation Flow

Status: canonical architecture approved; Wizard Phase 1 implementation contract proposed. No functional implementation is authorized by this document.

Original audit baseline: `e220cdccd8a7d9f0187279f9c4bf8c16094a8a26` (merge of PR23). Reconciled baseline: `765d197ad4c6afd623d754533807c32aeeb03917` (merge of PR24).

## 1. Executive Summary

SKIA already has most of the primitives needed for a canonical asset-creation flow, but they do not yet form one fully consistent domain model. The strongest current authority chain is:

`authenticated tenant/branch → Site (buildings) → Internal Area → placement (locations) → assets → type-specific satellite`

For MDF/IDF, the current implementation is materially coherent: a request-scoped `TenantTx` resolves Site and Internal Area, creates a typed `locations` row, reserves a branch-scoped sequence, inserts `assets`, `mdf_idf`, updates the placement, writes `asset_logs`, and commits or rolls back the whole operation. For installable assets, `locations` provides a required MDF/IDF/WAREHOUSE placement and the sequence is placement-scoped.

The main architectural gaps are below the MDF/IDF level. Rack has both `racks.mdf_idf_id` and the base asset's `location_id`, plus an older optional `technical_room_id`. Patch Panel, Switch and PDU expose optional rack FKs; UPS has no rack FK; Node uses an optional logical switch connection; Backbone uses endpoint assets rather than a placement. SERVER, FIREWALL, CCTV and AC_UNIT exist in the type catalog but lack equivalent specialized managed flows. These gaps allow the frontend concept of containment to differ from persisted authority.

The recommended canonical hierarchy is:

`Tenant → Branch → Site → [Floor] → [Zone] → Internal Area → MDF/IDF placement → [Rack] → Infrastructure/Equipment`

Floor and Zone are optional refinements, not mandatory gates. `buildings` remains the current Site authority despite its legacy name. `locations` remains the placement authority, not another generic physical level. `technical_rooms` is preserved for compatibility but is frozen as a non-authoritative legacy path until a later consolidation phase. WAREHOUSE remains an asset placement/lifecycle concept and must never be confused with an Internal Area named “Almacén”.

The onboarding should be a data-derived readiness orchestrator. It opens existing creation wizards, rechecks persisted state after each successful operation, and never stores duplicate `can_create_*` flags. A minimal ready branch needs an active Site, an active Internal Area, and an active MDF or IDF placement. Rack and later layers remain optional until the user selects a use case that requires them.

`assets.status` and `assets.inventory_status` are separate dimensions in the current schema. `status` is operational record state; `inventory_status` is acquisition/inventory lifecycle. MDF/IDF currently leave `inventory_status` NULL because `reserveManagedAsset` does not insert it. This is schema-valid but semantically underspecified. The recommendation is to define per-asset-type lifecycle defaults centrally, with `installed` as a candidate for newly commissioned MDF/IDF only after product approval—not to silently add it during this audit.

Recommendation: **GO for Wizard Phase 1 implementation review using the current schema; NO-GO for implementing the complete hierarchy as one change.**

## 2. Current State

### Organizational and security authority

- `tenants` is the organizational root.
- `branches` is the organizational and operational scope below a tenant. Migration 022 adds an immutable canonical `branches.code`.
- `user_tenants` and `user_branches` authorize selectable context.
- `sessions.tenant_id` and `sessions.branch_id` are the request authority.
- `RequireTenantTx` resolves the session, opens one SQL transaction, sets `app.tenant_id` and `app.branch_id`, injects that same `TenantDB`, and owns commit/rollback.
- `RequireTenantTxScoped` additionally supports the explicitly authorized all-branch role scope. Ordinary asset creation should remain branch-scoped.

### Physical and asset authority

- `buildings` is exposed by `/api/dcim/sites` and is therefore the current Site authority. The table name is legacy vocabulary.
- `floors`, `zones`, and `technical_rooms` form an older detailed hierarchy.
- `internal_areas` belongs to one Site and optionally one Floor and Zone. It is the current canonical Area authority for MDF/IDF.
- `locations` began as free-form branch locations and was later expanded into typed placements: `MDF`, `IDF`, or `WAREHOUSE`, with `placement_code`, `status`, optional `asset_id`, and optional `internal_area_id`.
- `assets` is the canonical base record. Specialized tables extend it by `asset_id`.
- MDF/IDF creation produces both an asset and a placement. Warehouse is a placement without an asset.

### Current MDF/IDF transaction

`POST /api/infra/mdf-idf` currently performs, inside one `TenantTx`:

1. Resolve Site + Internal Area using server-side tenant and branch.
2. Insert a provisional typed `locations` placement.
3. Resolve asset type.
4. Lock the active naming rule.
5. Lock/update `nomenclature_branch_counters`.
6. Resolve Branch, Site and Area canonical codes.
7. Insert `assets` with `location_id` pointing to the new placement.
8. Insert `mdf_idf`.
9. Update the placement with `placement_code=internal_code` and `asset_id`.
10. Insert `asset_logs(event_type='created')`.
11. Let middleware commit; any non-2xx response causes rollback.

This is the reference atomic pattern for future canonical flows.

## 3. Current Physical Hierarchy

| Concept | Current authority | Links | Current API/UI | Classification |
|---|---|---|---|---|
| Tenant | `tenants` | root | auth/admin | organizational |
| Branch / Sucursal | `branches` | `tenant_id`; user authorization through `user_branches` | `/api/auth/select-branch` | organizational + request scope |
| Site / Campus | `buildings` | `(tenant_id, branch_id)` | `/api/dcim/sites`; MDF wizard | physical site |
| Building | Same `buildings` row | no separate Site parent | `/api/dcim/hierarchy` calls it Building; `/api/dcim/sites` calls it Site | vocabulary ambiguity |
| Floor | `floors` | `building_id` | hierarchy API; no canonical onboarding flow | optional physical refinement |
| Zone | `zones` | `floor_id` | hierarchy API; no canonical onboarding flow | optional physical refinement |
| Internal Area | `internal_areas` | Site required; Floor/Zone optional | `/api/dcim/internal-areas`; MDF wizard | canonical internal physical area |
| Technical Room | `technical_rooms` | Zone required | hierarchy API; `racks.technical_room_id` optional | competing legacy container |
| Placement | `locations` | branch; optional Internal Area and asset | `/api/dcim/placements`, location catalogs | installation/storage authority |
| MDF/IDF | `assets` + `mdf_idf` + linked `locations` | Site/Area resolved through placement | `/api/infra/mdf-idf`; `MdfIdfWizard` | active asset + placement container |
| Warehouse | `locations` only | branch; no required Internal Area | `/api/dcim/placements` | storage placement, not Internal Area |
| Rack | `assets` + `racks` | placement through `assets.location_id`; optional `mdf_idf_id`; optional `technical_room_id` | `/api/infra/racks`; `RackWizard`; ensure-rack | physical container asset |
| Patch Panel | `assets` + `patch_panels` | placement required by managed flow; `rack_id` optional | specialized handler/wizard | passive infrastructure |
| Switch | `assets` + `switches` | placement required; `rack_id` optional | specialized handler/wizard | equipment |
| UPS | `assets` + `ups` | placement required; no rack FK | specialized handler/wizard | equipment/power |
| PDU | `assets` + `pdus` | placement required; `rack_id` optional | combined UPS/PDU handler/wizard | equipment/power |
| Node | `assets` + `nodes` | placement required; optional `connected_switch_id` | specialized handler/wizard | endpoint/logical network object |
| Backbone | `assets` + `backbone_links` | optional origin/destination asset FKs | specialized handler/wizard | logical/physical link |
| Server | `asset_types` + generic `assets` only | generic optional location; no specialized satellite | catalog only | future equipment flow |
| AP | no `AP` asset type | represented informally as `NODE`/WiFi or plan annotation | Node/Plans UI | unresolved domain type |
| Firewall/CCTV/AC | `asset_types` + generic `assets` only | no specialized managed flow | catalogs/mock UI | future equipment flows |
| Asset relationship | `asset_relationships` | source/target assets | no complete canonical creation UX | logical graph |

## 4. Problems / Ambiguities

1. **Site and Building are the same persisted entity.** Renaming the table is unnecessary now, but product language must consistently expose it as “Site” until a real Campus→Building split is approved.
2. **Two physical sub-hierarchies overlap.** `Floor→Zone→technical_rooms` predates `Site→Internal Area`; Internal Area can optionally reference Floor/Zone, while Rack can separately reference Technical Room.
3. **Rack containment has three signals.** `assets.location_id`, `racks.mdf_idf_id`, and `racks.technical_room_id` can disagree. Only the first is required by the modern managed flow.
4. **Optional rack FKs do not enforce the proposed equipment hierarchy.** Patch Panel, Switch and PDU may persist without Rack; UPS cannot reference one; Node's switch link is connectivity, not physical containment.
5. **Backbone is not a normal installed asset.** It represents a relationship between endpoints and should not inherit a single-placement rule without a dedicated decision.
6. **Generic and specialized asset creation overlap.** `/api/dcim/assets` can create many types while specialized handlers implement richer satellites and validation. The canonical entry point per type is not explicit.
7. **MdfIdfWizard contains residual legacy location concepts.** Site/Internal Area are the actual submitted authority, while older free-form/catalog-location state and presentation fields remain in the component.
8. **Frontend labels are not always persisted authority.** Fields such as building/floor/zone, descriptive placement names, rack summaries, and status labels may be presentational or discarded.
9. **`inventory_status` is nullable and has no managed default.** Current MDF/IDF creation writes only operational `status`.
10. **Default rules were originally branch-based.** Migration 022 turns MDF/IDF rules into Site/Area-aware rules, but old rule rows and previews require compatibility scrutiny.
11. **The historical unit test is narrower than the new domain.** `TestGenerateInternalCodeUsesLockedSequence` asserts a branch-scoped SWITCH code with custom segments. It remains valid evidence for that rule shape, but it does not test Site/Area or placement scopes and must not be treated as the universal format.
12. **AP is not a canonical asset type.** It appears as Node service/UI terminology and plan annotations.
13. **Legacy imported assets are staging.** They must not be counted as canonical readiness until promoted to `assets` with validated relationships.

## 5. Canonical Hierarchy Proposal

Recommended hierarchy:

```text
Tenant
└── Branch (authorized session scope)
    └── Site (current table: buildings)
        ├── Floor [optional]
        │   └── Zone [optional]
        └── Internal Area
            └── MDF / IDF placement
                ├── Rack [optional for the MDF/IDF itself]
                │   ├── Patch Panel
                │   ├── Switch
                │   ├── PDU
                │   ├── UPS [policy decision]
                │   ├── Server [future]
                │   └── Firewall/other equipment [future]
                ├── Backbone endpoint
                └── Nodes/cabling connectivity
```

Canonical interpretations:

- Site is a physical facility/campus boundary inside a Branch.
- Building is currently not a second level. `buildings` stores Site. A future Campus→Building requirement needs a new model, not UI aliases.
- Floor and Zone are optional refinements. They must never be fabricated to satisfy a wizard.
- Internal Area is a registered subspace of a Site. An Internal Area named “Almacén” is physical geography.
- MDF/IDF is both an asset and a placement container.
- WAREHOUSE is an asset placement indicating stored/non-operational equipment; it is not a physical hierarchy node equivalent to Internal Area.
- Rack is the preferred physical parent for rack-mountable equipment, but enforcing it requires schema/handler work described below.
- Backbone is an endpoint-to-endpoint link. Nodes combine physical termination and logical connectivity and need later refinement if outlet/cable models are introduced.

## 6. Entity Dependency Matrix

Legend: **Yes** is enforced or recommended as canonical; **No** means not applicable; **Optional** is valid; **Decision** requires approval. “Current gap” marks a proposed rule not fully enforced today.

| Entity | Parent required | Location required | Can exist without Rack | Naming rule | Inventory status | Tenant/Branch scoped |
|---|---|---:|---:|---|---|---:|
| Site | Branch | No | Yes | stable Site `code`, not asset naming | N/A | Yes |
| Building | **Decision:** currently same as Site | No | Yes | no independent contract | N/A | Yes |
| Internal Area | Site; Floor/Zone optional | Site is physical parent | Yes | stable Area `code` | N/A | Yes |
| MDF | Site + Internal Area | own typed placement | Yes | branch-scoped MDF rule | currently NULL; recommend explicit policy | Yes |
| IDF | Site + Internal Area | own typed placement | Yes | branch-scoped IDF rule | currently NULL; recommend explicit policy | Yes |
| Rack | MDF/IDF placement (**current gap:** `mdf_idf_id` optional) | Yes | N/A (it is Rack) | placement-scoped RACK rule today | currently request/NULL; policy required | Yes |
| Patch Panel | placement; Rack recommended/likely required | Yes | **Decision:** currently yes | placement-scoped PATCH_PANEL | currently request/NULL | Yes |
| Backbone | origin + destination MDF/IDF assets | not a single placement | Yes | dedicated link rule required | **Decision:** often N/A/installed | Yes |
| Node | placement; connectivity optional | Yes | Yes for outlets/endpoints | placement-scoped NODE | currently request/NULL | Yes |
| Switch | placement; Rack recommended/likely required | Yes | **Decision:** currently yes | placement-scoped SWITCH | currently request/NULL | Yes |
| UPS | placement; Rack optional by real-world form factor | Yes | Yes | placement-scoped UPS | currently request/NULL | Yes |
| Server | Rack recommended/likely required | **Current gap:** generic only | **Decision** | catalog rule exists but managed contract incomplete | generic request/NULL | base asset yes |
| AP | future first-class AP asset type | physical area, not necessarily Rack | Yes | future AP rule | future policy | not independently modeled today |

Additional entities:

| Entity | Recommended dependency |
|---|---|
| PDU | placement required; Rack required for rack PDU, separate subtype needed for floor PDU |
| Firewall | same decision class as Switch/Server; specialized flow absent |
| CCTV | physical Site/Area/Node placement likely more relevant than MDF placement; specialized flow absent |
| AC Unit | Site/Area or technical-room placement; not necessarily MDF/Rack; specialized flow absent |
| Warehouse placement | Branch required; physical Site/Area association is a future decision; forces asset `status=inactive` today |

## 7. Asset Creation Rules

### Common rules for every canonical asset

- Tenant and Branch come only from the authenticated session context.
- Backend must use the `TenantDB` injected by `RequireTenantTx` for every protected read/write.
- Asset type must be resolved server-side from the canonical catalog.
- Manual `internal_code` is rejected for managed types.
- Active naming rule and required physical references are resolved before sequence reservation.
- Sequence reservation, base asset, satellite, placement updates and audit log must share one transaction.
- Any failure returns non-2xx and rolls back all writes and counters.
- Frontend submits identifiers, not canonical codes/names as authority.

### Container creation

| Entity | Must exist first | Required fields/derived fields | Blocking conditions |
|---|---|---|---|
| Site | active Branch + authorized admin | user supplies immutable code, name; tenant/branch derived | no branch, invalid/duplicate code, inactive/unauthorized context |
| Internal Area | active Site in current Branch | code/name; optional valid Floor/Zone; scope derived | cross-branch Site, inactive parent, Zone without Floor |
| MDF/IDF | active Site + active Internal Area + active naming rule | type/name + IDs; Branch/Site/Area codes and sequence derived | missing/inactive/cross-scope parent, no rule, duplicate/transaction failure |
| Warehouse | active Branch | generated canonical placement code and name | no branch, invalid type; Site/Area requirement is not defined today |

### Installed asset creation

- Rack: must use an active MDF/IDF placement. Canonical implementation should also persist a matching non-null `racks.mdf_idf_id`; do not rely only on the base location FK.
- Patch Panel: require active placement now; decide whether Rack becomes mandatory before enforcing it.
- Switch: require active placement now; decide whether Rack becomes mandatory. Rack unit requires Rack.
- UPS: active MDF/IDF/WAREHOUSE placement is valid; Warehouse forces inactive. Rack is optional pending form-factor policy.
- PDU: active placement required; Rack requirement depends on PDU subtype and needs explicit modeling.
- Node: active placement required today; future outlet/cable topology should not overload `connected_switch_id` as physical placement.
- Backbone: require valid origin and destination assets in the same tenant/allowed branch scope, distinct endpoints, and compatible MDF/IDF types. Do not force a single placement.
- Server/Firewall/CCTV/AC/AP: no canonical managed creation should be advertised until placement compatibility and satellite strategy are approved.

## 8. Onboarding Wizard Architecture

The Wizard de Inicio is an orchestrator plus readiness API, not another asset editor.

Recommended components:

1. `GET /api/dcim/readiness` under `RequireTenantTx` returns derived counts, statuses, blockers and allowed next actions for the active Branch.
2. A frontend `InfrastructureReadinessWizard` renders the state machine and opens existing flows.
3. Existing `MdfIdfWizard`, Rack wizard and later managed wizards remain the only editors for their entities.
4. Each successful child flow returns an identifier, closes, refreshes readiness from the backend, and marks the step complete from persisted data.
5. No stored `onboarding_complete` or `can_create_*` flags are needed initially.

Readiness response concept:

```json
{
  "branch_id": "derived-from-session",
  "steps": [
    {"key":"branch","state":"complete","count":1},
    {"key":"site","state":"complete","count":1},
    {"key":"internal_area","state":"complete","count":2},
    {"key":"distribution","state":"complete","count":2},
    {"key":"rack","state":"optional","count":0},
    {"key":"passive","state":"optional","count":0},
    {"key":"equipment","state":"available","count":0}
  ]
}
```

States:

- `complete`: persisted active evidence satisfies the step.
- `pending`: user can act now.
- `blocked`: an explicit prior dependency is missing.
- `optional`: not required for current basic readiness.
- `available`: dependency satisfied; asset-specific wizard may begin.

## 9. Wizard UX Flow

Suggested user language:

> Antes de registrar equipos, SKIA necesita saber en qué sucursal y espacio físico se instalarán.

Each card answers:

`Dónde estoy → Qué estoy creando → De qué depende → Qué habilita después`

Flow:

1. Organization: read-only confirmation.
2. Branch: select an authorized active Branch; if none, direct to authorized Branch administration.
3. Site: list or create Site.
4. Internal Area: list or create within selected Site; Floor/Zone are optional details.
5. MDF/IDF: open existing `MdfIdfWizard`; return and refresh.
6. Rack: explain “Un Rack se instala dentro de un MDF o IDF”; optional until rack-mount assets are chosen.
7. Passive infrastructure: Patch Panel/Backbone/Nodes, each gated by its real dependencies.
8. Equipment: show only managed supported types and why unavailable types are deferred.
9. Ready: link to Dashboard, Inventory and the relevant domain pages.

Automatic display:

- Show after login when the active Branch has no active Site, Internal Area, or MDF/IDF placement.
- Do not repeatedly force it after minimal readiness is reached.
- Provide “Configuración de infraestructura” in navigation so it can always be reopened.
- Allow dismiss for the current session, but do not turn dismissal into readiness.
- Existing tenants are evaluated from their actual data; unresolved legacy records produce an advisory state, not automatic inference.
- Each Branch has independent readiness. Switching Branch refreshes the checklist.

## 10. Readiness Model

Derive readiness in one transaction from active, branch-scoped data:

| Capability | Derived requirement |
|---|---|
| `can_create_site` | authenticated active Branch + management permission |
| `can_create_internal_area` | at least one active Site + management permission |
| `can_create_mdf_idf` | active Site + active Internal Area + active MDF/IDF naming rule |
| `can_create_rack` | active MDF/IDF placement + active RACK naming rule |
| `can_create_patch_panel` | active placement + PATCH_PANEL rule; add Rack if policy approved |
| `can_create_switch` | active placement + SWITCH rule; add Rack if policy approved |
| `can_create_ups` | active placement + UPS rule |
| `can_create_pdu` | active placement + PDU rule; subtype/Rack decision pending |
| `can_create_node` | active placement + NODE rule |
| `can_create_backbone` | at least two compatible MDF/IDF endpoints + BACKBONE rule |

Counts must be based on canonical tables, active state, tenant/branch scope, and non-decommissioned assets. Imported staging records do not satisfy readiness.

## 11. Canonical Naming Analysis

### Current origin of the observed codes

For `MDF-PRI-BAJANET-E2-01` and `MDF-PRI-BAJANET-PROD-02`, the current execution path is:

`MdfIdfWizard → POST /api/infra/mdf-idf → ResolvePhysicalLocation → reserveManagedAsset → generateInternalCodeWithContext → naming_rules + nomenclature_branch_counters → assets.internal_code`

Segment authority:

| Segment | Source |
|---|---|
| `MDF` | `naming_rules.prefix` for asset type MDF |
| `PRI` | immutable `branches.code` resolved in backend |
| `BAJANET` | immutable `buildings.code` resolved via Site ID |
| `E2` / `PROD` | immutable `internal_areas.code` resolved via Internal Area ID |
| `01` / `02` | branch-scoped `nomenclature_branch_counters.last_seq`, padded by `seq_digits` |

The frontend preview uses the same rule fields and canonical codes loaded from the APIs, but it is illustrative. Backend generation plus the database trigger are final authority.

### Preview divergence risks

- Preview reads `naming_rules.last_seq`, while MDF/IDF allocation is actually owned by `nomenclature_branch_counters`; next-number display can be stale under concurrency or across branches.
- Preview cannot reserve a number. It should display a pattern or “siguiente aproximado”, never promise the final code.
- `MdfIdfWizard` retains legacy code suggestions and location state alongside the new canonical Site/Area flow.
- Custom segments are persisted rule literals, while Site/Area/Placement are derived references. UI must keep them visually distinct.

### `TestGenerateInternalCodeUsesLockedSequence`

The test expects `SW-TJ-EDGE-CORE-0042` for a rule with Branch plus two custom segments and a branch counter. Its historical expectation is compatible with that exact non-placement rule. The apparent divergence is scope evolution: current installable SWITCH rules may opt into placement counters and MDF/IDF rules may opt into Site/Area. The test should later be renamed or supplemented to state its rule shape; it must not be changed during this audit.

## 12. Recommended Naming Contract

Recommended default for MDF/IDF:

`[TYPE_PREFIX]-[BRANCH_CODE]-[SITE_CODE]-[INTERNAL_AREA_CODE]-[SEQUENCE]`

Example: `MDF-TJ-PARQUE-PROD-001`.

Contract:

- All components are stable canonical codes, never display names or client text.
- `internal_code`, `nomenclature_id`, and `nomenclature_sequence` are immutable after issuance.
- Renaming a Branch/Site/Area changes its display name, not its immutable code.
- Moving an existing asset does not silently rewrite `internal_code`. Movement is recorded in placement/lifecycle history; renumbering requires a separately audited re-identification operation.
- Sequence scope for MDF/IDF is `(nomenclature_id, branch_id)` through `nomenclature_branch_counters`.
- Sequence scope for placement-dependent installable assets is `(nomenclature_id, branch_id, placement_id)` through `nomenclature_counters`.
- Tenant is implicit through rule ownership and RLS; uniqueness remains enforced with tenant/branch code constraints and nomenclature indexes.
- Default sequence width should be three digits for human infrastructure codes unless capacity analysis requires four. Existing rule width remains unchanged.
- Maximum practical code length should be governed by the existing `assets.internal_code VARCHAR(100)`. Recommended configured components should target ≤64 characters; backend must reject a generated code exceeding storage limits with a domain error.
- Custom segments are optional immutable rule literals for concepts not yet derived. They must not impersonate Rack, Site, Area, port count or other modeled references.

Backward compatibility: keep `MDF-PRI-BAJANET-E2-01` and `MDF-PRI-BAJANET-PROD-02` unchanged. New/changed formats require rule versioning for future assets, not mass rename.

## 13. `inventory_status` Analysis

Current schema evidence:

- `assets.status` is non-null with values `active`, `inactive`, `maintenance`, `decommissioned`, `unknown` and default `active`.
- `assets.inventory_status` is nullable with values `planned`, `ordered`, `received`, `inventory`, `installed`, `retired`.
- Generic asset POST and PUT accept `inventory_status`.
- Managed `reserveManagedAsset` inserts `status` but omits `inventory_status`, producing NULL for MDF/IDF and specialized assets.
- Decommissioning atomically sets `status='decommissioned'` and `inventory_status='retired'`.
- Warehouse placement forces `status='inactive'`; it does not currently set `inventory_status='inventory'`.
- Catalog API exposes inventory lifecycle values, but reporting/filtering is primarily based on operational `status`.

Therefore they are separate dimensions:

| Dimension | Meaning | Examples |
|---|---|---|
| `status` | operational/record availability | active, maintenance, decommissioned |
| `inventory_status` | procurement and physical inventory lifecycle | planned, received, installed, retired |

Recommended contract, pending human approval:

- A managed creation policy, not each wizard, assigns the initial inventory lifecycle.
- MDF/IDF created as commissioned infrastructure: candidate `installed`.
- Asset created into WAREHOUSE: candidate `inventory` plus operational `inactive`.
- Planned/project flows: `planned` or `ordered`; they should not masquerade as installed creation.
- Decommissioning remains `decommissioned` + `retired`.
- Existing NULL values remain compatible and are reported as `unspecified`; no blind backfill.
- Decide whether NULL remains allowed for legacy only, then enforce defaults at the service layer before considering a future constraint migration.

## 14. Multi-Tenant Security Requirements

- Never accept tenant identity from request payload/query.
- Branch changes occur only through authorized `user_branches` and session selection.
- Every readiness and creation endpoint uses `RequireTenantTx` unless a formally approved all-branch read needs `RequireTenantTxScoped`.
- Every handler must fail closed when `TenantDBFromContext` or `TenantIdentityFromContext` is missing.
- Parent resolution repeats tenant, branch, active-state and type checks in backend.
- Composite FKs should enforce tenant/branch agreement where relationships become mandatory.
- RLS and FORCE RLS remain enabled on physical hierarchy, placement, counters and canonical asset tables.
- Runtime receives only SQL privileges required by real operations. New readiness should be read-only and must not expand grants casually.
- Cross-tenant identifiers should be invisible; cross-branch identifiers should be invisible/rejected even if UUIDs are known.
- Child creation and readiness counts must never rely on frontend-filtered lists.
- Audit writes are part of the same transaction; audit failure rolls back the operation.

## 15. Existing Wizard Integration

- `MdfIdfWizard` remains the MDF/IDF editor. The onboarding supplies return context, opens it, awaits success, and refreshes readiness.
- `AssetPlacementStep` and `AssetPlacementSelector` remain the placement-first gate for Rack, Switch, Patch Panel, UPS/PDU and Node.
- `NomenclatureCodeField` remains a preview/availability component; it is never code authority.
- Roundtrip context is limited to `return_to`, intended asset type, and an authorized Branch hint. The session selection remains authority.
- After returning, the orchestrator reloads Site/Area/placement/readiness data and selects a new entity only if it is visible in the active context.
- Existing edit-only or legacy modal code in the MDF page should not become a second create authority.
- Child wizards return persisted IDs and server responses, not optimistic synthetic records.

## 16. Backward Compatibility

- Never rename existing `assets.internal_code` values automatically.
- Never infer Site, Area, MDF/IDF or Rack relationships solely from code substrings or display text.
- Keep untyped legacy `locations` outside the valid placement list.
- Classify missing relationships as `legacy_unresolved_*` in reports/readiness.
- Existing MDF/IDF codes remain valid historical identities even if a later rule version changes formatting.
- Existing NULL `inventory_status` remains readable as unspecified.
- Maintain aliases/API fields only at boundaries; do not let legacy `building`, `floor`, `zone`, `location` strings override canonical IDs.
- A future naming-rule version should have an effective boundary and preserve the original `nomenclature_id` association.

## 17. Required Backend Changes

Proposed future work, not implemented here:

1. Add a branch-scoped readiness query/endpoint with explicit reason codes.
2. Centralize initial `status`/`inventory_status` policy per creation mode and asset type.
3. Define one canonical creation route per asset type; restrict generic POST from bypassing specialized invariants.
4. Reconcile Rack containment: validate placement type MDF/IDF and persist consistent `racks.mdf_idf_id`; decide fate of `technical_room_id`.
5. If Rack becomes mandatory for an asset type, validate Rack belongs to the same placement/tenant/branch and add compatible constraints.
6. Add dedicated Backbone endpoint rules for origin/destination rather than generic placement semantics.
7. Define specialized flows or explicitly unsupported errors for SERVER, FIREWALL, CCTV, AC_UNIT and AP.
8. Emit domain-specific 409/422 errors for readiness blockers and invalid parent relationships.
9. Return persisted lifecycle and hierarchy context in creation responses.
10. Add naming-rule versioning before structural mutation of issued formats.

## 18. Required Frontend Changes

Proposed future work:

1. Add `InfrastructureReadinessWizard` and a persistent navigation entry.
2. Add a client for the derived readiness endpoint; do not calculate authority solely in React.
3. Orchestrate existing wizards with safe return context and refresh-on-success.
4. Remove or clearly quarantine legacy free-text/catalog location state from `MdfIdfWizard` creation.
5. Present naming as a non-reserved pattern until submit returns the final code.
6. Show `inventory_status` separately from operational status, with plain-language explanations.
7. Hide unsupported equipment creation actions rather than collecting data that cannot be persisted canonically.
8. Present unresolved legacy records as remediation, not as completed readiness.
9. Ensure every non-2xx child operation remains open with an actionable error and cannot mark a step complete.

## 19. Database Impact

No database change is made in this phase.

Likely future migration topics, only after decisions:

- Composite constraints tying `racks.mdf_idf_id` to tenant/branch and matching placement.
- Potential non-null Rack FK for selected rack-mountable satellites.
- Lifecycle default/backfill strategy, if NULL is eventually restricted.
- Naming-rule version/effective-date model.
- First-class AP type, persistence and connectivity contract.
- Removal/deprecation strategy for `technical_rooms` links or a formal mapping to Internal Area.
- Campus→Building split only if the product truly needs both levels.

No existing applied migration should be edited.

## 20. Tests Required

### Database/integration

- Readiness states for empty, partially configured and ready branches.
- Cross-tenant/cross-branch parents invisible and rejected.
- Site/Area inactive parents block MDF/IDF.
- MDF/IDF atomic chain including placement, counter, base, satellite and audit.
- Rack placement and `mdf_idf_id` consistency.
- Required/optional Rack matrices per approved type.
- Backbone endpoint type/scope/distinctness.
- Sequence concurrency and rollback for branch- and placement-scoped counters.
- Preview pattern versus persisted code components, without promising a reserved sequence.
- Naming identity immutable across display-name and placement changes.
- Lifecycle default matrix and Warehouse behavior.
- Legacy NULL lifecycle and unresolved placement remain readable.
- RLS/FORCE and exact runtime privilege validator.
- Readiness uses canonical tables only, excluding import staging.

### Backend/unit

- Reason-code evaluation for every readiness capability.
- Fail-closed missing TenantDB/identity.
- Generic route cannot bypass specialized type invariants.
- `TestGenerateInternalCodeUsesLockedSequence` remains unchanged and gains separate Site/Area and placement-context tests.

### Frontend

- Automatic onboarding display and session dismissal.
- Reopen from navigation.
- Multi-Branch refresh and no stale selections.
- Child wizard success/failure roundtrip.
- Non-2xx never marks readiness complete.
- Existing tenant and unresolved legacy presentation.
- Accessibility, focus return, responsive layout and dark/light themes.

## 21. Risks

- Enforcing Rack immediately could invalidate legitimate floor-standing UPS/PDU and existing records.
- Treating `buildings` as both Site and Building may constrain future campus modeling; splitting prematurely would add unnecessary hierarchy.
- Existing redundant Rack references can drift until reconciled.
- A default inventory lifecycle chosen without business approval could distort inventory/accounting reports.
- Readiness based only on counts could report false completion if relationships are invalid; queries must validate graph integrity.
- Existing frontend mock/static data can make incomplete backend flows appear supported.
- Naming previews can become stale under concurrency.
- Legacy records cannot be safely inferred from codes or text.
- `technical_rooms` and Internal Areas may represent different real-world concepts for some tenants; deprecation needs data discovery.
- Adding broad runtime grants for readiness would violate least privilege.

## 22. Recommended Implementation Phases

1. **Wizard Phase 1 readiness backend:** read-only derived endpoint, reason codes and security tests.
2. **Wizard Phase 1 onboarding shell:** orchestrator UI using existing Site/Area/MDF flows; no new asset logic.
3. **MDF wizard cleanup:** remove legacy location ambiguity and make preview explicitly non-reserving.
4. **Rack integrity:** reconcile placement, `mdf_idf_id`, `technical_room_id` and constraints; model installation modality centrally.
5. **Rack-mounted equipment:** enforce Rack only for asset modalities that require it.
6. **Passive topology:** formalize Backbone and Node/outlet/cabling semantics.
7. **Lifecycle:** central defaults, UI/reporting and legacy remediation strategy.
8. **Naming versioning:** support future structural changes without renaming history.
9. **Additional equipment:** specialized SERVER/FIREWALL/CCTV/AC flows and first-class AP type.

Each phase requires PostgreSQL 16 integration tests, RLS/FORCE verification, negative privilege tests, frontend compilation and no production action without separate authorization.

## 23. Go / No-Go Recommendation

### Approved architectural decisions

- **ADR-001 — Site authority:** `buildings` is the canonical Site authority. Campus and Building are not separate levels in this phase. UI says “Sitio”; persistence continues to say `buildings`.
- **ADR-002 — Physical hierarchy:** `Tenant → Branch → Site → [Floor] → [Zone] → Internal Area → MDF/IDF → [Rack depending on modality] → Infrastructure/Equipment`. Floor and Zone are optional refinements.
- **ADR-003 — Conditional Rack:** Rack is not universal. Rack requirement derives from a centrally modeled physical installation modality, not scattered type exceptions. Wall, ceiling, floor, outdoor and future placements remain representable.
- **ADR-004 — Technical rooms:** preserve `technical_rooms` for compatibility, but do not expand it or make it a second MDF/IDF authority. Consolidation is future work.
- **ADR-005 — Lifecycle dimensions:** keep `status` and `inventory_status` separate. Do not assign a universal inventory default or backfill existing NULL values.
- **ADR-006 — Access Point:** AP will become a first-class asset type in a later phase; it is not implemented by this contract.
- **ADR-007 — Backbone:** model Backbone primarily as a physical relationship between Endpoint A and Endpoint B, not an ordinary single-location asset. Redesign is deferred.
- **ADR-008 — Naming:** target `[TYPE]-[BRANCH]-[SITE]-[AREA]-[SEQUENCE]` using stable codes. `internal_code` is stable and auditable; moves or display-name changes do not rename it. Historical codes remain unchanged.
- **ADR-009 — Wizard:** Wizard de Inicio is an orchestrator and readiness view. Completion comes only from persisted backend evidence after the real child flow commits.

### Future architectural work

- Define the installation-modality catalog and the exact Rack-required matrix.
- Define the initial `inventory_status` policy by asset type and creation mode.
- Consolidate or map `technical_rooms` after real data analysis.
- Introduce Campus→Building only if future requirements demonstrate it.
- Add AP type, specialized persistence, connectivity and lifecycle.
- Redesign Backbone endpoints and inventoriable/certification attributes.
- Version naming rules and govern structural changes after identities have been issued.
- Decide whether Warehouse placements must reference Site/Internal Area.

### Remaining decisions requiring approval before their own future phases

1. Exact modality vocabulary and which modalities require Rack.
2. Initial lifecycle value per asset type/mode, including Warehouse intake.
3. Final consolidation strategy for `technical_rooms`.
4. Warehouse physical hierarchy requirement.
5. Formal naming-rule versioning and exceptional re-identification procedure.

These decisions do not block Wizard Phase 1 because that phase ends at Rack readiness and does not enforce Rack containment, assign lifecycle defaults, redesign Backbone, create AP, or migrate hierarchy data.

## 24. Wizard Phase 1 Contract

### Scope

Phase 1 covers only:

`active Branch → Site → Internal Area → MDF/IDF → Rack readiness`

It teaches the minimum physical model needed to begin, recognizes existing tenants without migration, and delegates every mutation to existing canonical handlers. It does not create Rack integrity rules, equipment, lifecycle defaults or persisted onboarding state.

### Basic readiness definition

A Branch is **basically ready** when all four required steps are complete:

1. the authenticated session has one active authorized Branch selected;
2. the Branch contains at least one active Site;
3. the Branch contains at least one active Internal Area linked to an active Site;
4. the Branch contains at least one active, non-decommissioned MDF or IDF whose placement and physical hierarchy are internally consistent.

Rack is not part of `required_total`. Once MDF/IDF is complete, Rack becomes `available`; after the first valid Rack it becomes `complete`, but basic progress remains 4/4 either way.

## 25. Readiness API Proposal

The repository convention groups canonical DCIM endpoints under `/api/dcim`, so the proposed route is:

`GET /api/dcim/readiness`

Registration must use `RequireTenantTx(db, handler)`. No tenant or Branch parameter is accepted; both come from the resolved session context.

Proposed response:

```json
{
  "tenant_id": "derived-and-optionally-omitted-from-public-response",
  "branch": {
    "id": "uuid",
    "code": "TIJ",
    "name": "Tijuana"
  },
  "ready": true,
  "progress": {
    "required_complete": 4,
    "required_total": 4
  },
  "steps": [
    {
      "key": "branch",
      "status": "complete",
      "required": true,
      "count": 1,
      "reason": "active_authorized_branch",
      "action": null
    },
    {
      "key": "site",
      "status": "complete",
      "required": true,
      "count": 1,
      "reason": "active_site_exists",
      "action": {"kind":"open","target":"site_create"}
    },
    {
      "key": "internal_area",
      "status": "complete",
      "required": true,
      "count": 2,
      "reason": "active_area_with_active_site_exists",
      "action": {"kind":"open","target":"internal_area_create"}
    },
    {
      "key": "mdf_idf",
      "status": "complete",
      "required": true,
      "count": 2,
      "reason": "valid_distribution_placement_exists",
      "action": {"kind":"open","target":"mdf_idf_create"}
    },
    {
      "key": "rack",
      "status": "available",
      "required": false,
      "count": 0,
      "reason": "distribution_parent_available",
      "action": {"kind":"open","target":"rack_create"}
    }
  ]
}
```

The frontend should not receive or construct URLs supplied by arbitrary data. `action.target` is a closed enum mapped locally to known flows. `tenant_id` is useful in internal tests/logging but may be omitted from the public JSON to reduce unnecessary identity exposure.

### Query semantics

- Site count: active `buildings` in the current tenant/Branch.
- Internal Area count: active `internal_areas` joined to active `buildings` in the same tenant/Branch.
- MDF/IDF count: strictly `status='active'`, non-retired `assets` joined to `asset_types`, `mdf_idf`, and active typed `locations`, where the placement's Internal Area and Site are active and scope-consistent. Inactive, maintenance, unknown, decommissioned or retired assets do not satisfy readiness.
- Rack count: strictly active, non-retired Rack assets in the current tenant/Branch that have a valid MDF/IDF parent under the current transitional model. Active legacy Racks with an incomplete relationship are reported as unresolved; inactive, maintenance, unknown, decommissioned and retired Racks are excluded rather than classified as unresolved.
- All counts are computed in the same request `TenantTx` and are returned as one consistent snapshot.

## 26. Wizard State Machine and Gates

### Exact state semantics

| State | Meaning | May affect required progress? |
|---|---|---:|
| `complete` | Persisted, active and relationship-valid data satisfies the step. | Yes |
| `pending` | A required step is unsatisfied and its prerequisites exist, so the user can act now. | Yes, incomplete |
| `blocked` | The step cannot be completed because a required predecessor is not complete. | Yes if required; otherwise informational |
| `available` | An optional/non-basic step can be performed now because its prerequisites exist. | No |
| `optional` | The step is not required for basic readiness and is not currently being promoted as the next action. | No |

The same step must not be both `pending` and `available`. Required actionable steps use `pending`; optional actionable steps use `available`.

### Deterministic state transitions

| Data state | Branch | Site | Internal Area | MDF/IDF | Rack |
|---|---|---|---|---|---|
| active Branch, no Site | complete | pending | blocked | blocked | blocked |
| Site, no Area | complete | complete | pending | blocked | blocked |
| Area, no MDF/IDF | complete | complete | complete | pending | blocked |
| MDF/IDF, no Rack | complete | complete | complete | complete | available |
| valid Rack exists | complete | complete | complete | complete | complete |

### Action gates

| Action | Required parent | Backend validation | Frontend gate | Readiness effect |
|---|---|---|---|---|
| Create Site | active authorized Branch | session tenant/Branch, active Branch, mutation RBAC, code validity | show only when Branch context resolves | Site becomes complete after persisted refresh |
| Create Internal Area | active Site | Site belongs to current tenant/Branch and is active; optional Floor/Zone consistency | require selected Site | Area becomes complete after persisted refresh |
| Create MDF/IDF | active Site + active Internal Area + naming rule | `ResolvePhysicalLocation`, TenantTx, active/scope checks, atomic placement/asset/satellite/log/counter | require selected Site/Area; open `MdfIdfWizard` | MDF/IDF becomes complete only after committed row is visible |
| Create Rack | active MDF/IDF placement + naming rule | current placement validation; target integrity refactor remains future | enable when MDF/IDF count > 0 | Rack changes available→complete after valid persisted refresh |

## 27. Wizard Phase 1 UX

The shell is one compact readiness panel, not a long multi-screen wizard:

```text
CONFIGURE SU INFRAESTRUCTURA
Sucursal: Tijuana

SKIA necesita conocer su estructura física antes de registrar equipos.

✓ Sucursal
✓ Sitio                 1 registrado
✓ Área interna          2 registradas
✓ MDF / IDF             2 registrados

○ Rack
  Ya puede registrar su primer Rack.
  [Crear Rack]

Progreso básico: 4/4
```

Each row explains what exists, what is missing, why it is needed, and what it enables. For example: “Un área interna identifica el espacio del sitio donde se ubicará el MDF o IDF.”

### Automatic display and navigation

- Automatically offer the wizard after authenticated context resolution when the active Branch lacks Site, Internal Area or MDF/IDF readiness.
- Do not block the rest of SKIA. The user can close it.
- Add a stable “Configuración de infraestructura” entry under the existing management/infrastructure navigation, rather than creating a second dashboard.
- Reopening always fetches current readiness.
- For Phase 1, dismissal lasts only for the browser session (`sessionStorage`) if product wants “not now”. It is a UX preference, not architectural readiness and is never sent as authority.
- A future cross-device dismissal preference may be persisted separately only after explicit product/privacy approval.
- Switching Branch clears cached readiness and child selections, waits for `/api/auth/select-branch`, then fetches readiness under the new session context.

### Child wizard integration

For MDF/IDF:

1. Open existing `MdfIdfWizard`.
2. Let it call the existing `POST /api/infra/mdf-idf` flow.
3. Await a 2xx response and its persisted identifier.
4. Close child wizard according to its current success contract.
5. Invalidate and refetch `/api/dcim/readiness`.
6. Mark complete only if the refreshed backend response says complete.

A 4xx/5xx keeps the child flow open, presents its error, does not mutate local readiness, and does not advance progress.

### Naming education

The MDF/IDF action displays:

```text
Código SKIA: se generará automáticamente
Vista previa: MDF-TJ-PARQUE-PROD-###
```

The UI must say that preview is not a reservation. The definitive sequence is allocated only inside the request transaction and returned by the backend.

The Wizard does not set or conceal `inventory_status`; NULL remains visible to later lifecycle/reporting work as unspecified.

## 28. Rack Authority: Current, Target, Transition

### Current

- `assets.location_id` is required by the modern managed RACK flow and points to an MDF/IDF/WAREHOUSE placement.
- `racks.mdf_idf_id` exists and is used by list/count/ensure-rack paths, but ordinary `POST /api/infra/racks` does not populate it.
- `racks.technical_room_id` is an older optional FK and is not the modern placement authority.
- These fields can disagree; therefore a Rack count based only on the satellite row may overstate canonical readiness.

### Target

- Base `assets.location_id` identifies the canonical placement.
- For MDF/IDF placement, `racks.mdf_idf_id` is a consistent direct containment reference derived/resolved by backend, never an unrelated client authority.
- `technical_room_id` remains compatibility-only pending consolidation.
- Rack requirement for child equipment is derived from an explicit installation modality contract.

### Transition

Phase 1 does not refactor or migrate Rack. Its readiness query counts only provably consistent Racks and may return `unresolved_count` for legacy rows. The later Rack-integrity phase must audit data, choose constraints, update both Rack creation paths, add cross-scope tests, and only then enforce new non-null or composite relationships.

## 29. Wizard Phase 1 Implementation Plan

No files are created or modified by this plan. Probable future touch points are listed for estimation.

### A. Backend readiness read-model

- Add a focused handler/service, likely `backend/infrastructure_readiness.go`.
- Register `GET /api/dcim/readiness` in `backend/main.go` through `RequireTenantTx`.
- Use only `TenantDBFromContext` and `TenantIdentityFromContext`.
- Execute branch, Site, Area, MDF/IDF and Rack consistency queries in the request transaction.
- Return closed enums, counts, reasons and safe action identifiers.

### B. Backend tests

- Add unit tests likely in `backend/infrastructure_readiness_test.go`.
- Add PostgreSQL 16 integration tests likely in `backend/infrastructure_readiness_integration_test.go`.
- Reuse session/TenantTx fixtures from tenant middleware, physical location and MDF persistence tests.

### C. Frontend readiness client

- Add a typed hook such as `frontend/hooks/useInfrastructureReadiness.ts`.
- Fetch only after authenticated Branch context exists.
- Expose loading, data, refresh and error without optimistic completion.

### D. Wizard shell

- Add a compact component such as `frontend/components/InfrastructureReadinessWizard.tsx`.
- Render state/reason/count and map closed action targets to known local callbacks.
- Meet focus, Escape, scroll, responsive and dark/light requirements.

### E. Existing wizard integration

- Integrate the shell at the current authenticated layout level, probably `frontend/components/AppLayout.tsx`, without duplicating `MdfIdfWizard` logic.
- Reuse `frontend/components/MdfIdfWizard.tsx` and the existing MDF/IDF page callback.
- Refetch readiness only after child success; failures preserve state.

### F. Branch switching behavior

- Coordinate with `/api/auth/select-branch` and existing selector/session flow.
- Cancel/ignore stale requests, clear child context, then refetch.
- Never append arbitrary `branch_id` to readiness or mutation URLs.

### G. Error handling

- 401: return to authentication.
- 403: no authorized Branch/readiness access; show safe empty state.
- 409: Branch selection required; direct to selector.
- 422 from child creation: show domain reason and leave readiness unchanged.
- 500: generic retry state; log details server-side only.

### H. Security tests

- Exact TenantTx identity/GUC consistency.
- Cross-tenant and cross-branch invisibility.
- Missing context fails closed.
- Readiness is read-only and does not require new mutation grants.
- Runtime role remains without DDL, TRUNCATE, BYPASSRLS or unrelated table access.

### I. Regression tests

- Existing MDF/IDF success, rollback and frontend non-2xx behavior remain intact.
- Existing Branch selection behavior remains intact.
- Existing tenants are recognized without seed or onboarding migration.
- Nomenclature preview remains non-authoritative.
- No changes to lifecycle defaults or historical codes.

### J. Manual QA

- Empty Branch through MDF completion.
- Close/reopen and session dismissal.
- Multi-Branch switching with different readiness.
- Child cancel, 422 and 500.
- Successful MDF/IDF refresh.
- Rack available CTA.
- Browser back/forward, responsive, keyboard/focus and dark/light.

## 30. Wizard Phase 1 Test Plan and Migration Assessment

### Implemented contract

Phase 1 implements `GET /api/dcim/readiness` under `RequireTenantTx` and derives every count from the authenticated Tenant and active Branch in the request transaction. Required actionable steps (Site, Internal Area and MDF/IDF) use `pending`; only the optional actionable Rack step uses `available`. The frontend consumes that read model through a typed hook; a Branch change invalidates the prior payload immediately, and a request identity prevents a late response from replacing the current Branch. Successful Branch, Site, Internal Area and MDF/IDF mutations invalidate and refetch readiness. No completion state or wizard progress is persisted in the browser or database. Rack readiness remains optional and conservative: inconsistent active legacy relationships are reported but never inferred or repaired, while inactive assets are excluded. `site_create`, `internal_area_create` and `mdf_idf_create` intentionally enter the existing `MdfIdfWizard`, which orchestrates Site and Internal Area creation inline rather than pretending they are independent flows. The Rack CTA is intentionally labelled `Ir a Racks` because Phase 1 navigates to the existing Rack page and does not perform the deferred deep Rack refactor.

### Required behavior matrix

| Scenario | Expected result |
|---|---|
| Tenant A requests readiness | no Tenant B counts or identifiers |
| Branch A active, Branch B configured | Branch A does not inherit Branch B readiness |
| no Site | Site pending; Area/MDF/Rack blocked |
| Site, no Area | Site complete; Area pending; MDF/Rack blocked |
| Area, no MDF | Area complete; MDF pending; Rack blocked |
| MDF exists, no Rack | MDF complete; Rack available; progress 4/4 |
| valid Rack exists | Rack complete; progress still 4/4 |
| MDF POST fails | readiness unchanged after refetch |
| MDF POST commits | readiness changes only after persisted refetch |
| Branch changes | old request/context discarded; readiness recalculated |
| existing configured tenant | complete state derived without onboarding migration |
| malformed/cross-scope relationships | not counted; fail closed/unresolved reported |
| cross-tenant/cross-branch under RLS | invisible and rejected |

### Validation expected during implementation

- `go test ./...`
- `go vet ./...`
- PostgreSQL 16 ephemeral integration suite.
- RLS/FORCE and runtime-grant validation.
- `npm ci`
- `npx tsc --noEmit`
- `npm run build`
- frontend component tests/static review for state transitions.
- `git diff --check`.

### Migration assessment

**DATABASE MIGRATION = NONE for Wizard Phase 1.**

The current schema can derive active Branch, Site, Internal Area, MDF/IDF placement and conservative Rack readiness. Phase 1 does not persist progress, assign lifecycle defaults, add AP, redesign Backbone, change Rack constraints, or consolidate `technical_rooms`. Any later enforcement discovered during Rack refactoring must be proposed as a separate migration and separately approved.

## 31. Wizard Phase 1.1 — Nomenclature and Contextual Help

### Executable authority audit

- `naming_rules` is the format authority, scoped by `(tenant_id, asset_type_code)`. A rule is configured for an asset type only when that exact rule exists and `active=true`.
- MDF and IDF use `nomenclature_branch_counters`, scoped by `(nomenclature_id, branch_id)`. Placement-dependent installable assets use `nomenclature_counters`, scoped additionally by `placement_id`.
- `generateInternalCodeWithContext` creates a missing counter row, locks the applicable counter with `SELECT ... FOR UPDATE`, increments it and inserts the managed asset inside the same request `TenantTx`. A rollback therefore rolls back the counter and asset together.
- The database trigger validates the emitted code against the selected rule and canonical Branch/Site/Area/Placement references. `assets.internal_code`, `nomenclature_id` and `nomenclature_sequence` preserve the issued identity.
- There is no fallback when an active rule is absent: managed creation returns `422 nomenclature_required`. Existing `internal_code` values are not evidence that a current rule is configured.
- Managed coverage currently includes MDF, IDF, Rack, Switch, UPS, PDU, Patch Panel, Node and Backbone. The catalog may contain additional future/configurable types, but readiness Phase 1.1 reports only the MDF/IDF capability relevant to its flow.
- Readiness nomenclature is `configured` only when active MDF and IDF rules are both visible for the session tenant. A partial or absent pair is `unavailable`; the payload lists configured and unavailable asset types. It is tenant-scoped configuration with a Branch-specific preview because Branch is an optional rule component and the real counter is Branch-scoped.
- The educational example is derived from the active rule: prefix, separator, enabled canonical components, custom rule literals and sequence width. Site/Area remain placeholders because readiness does not choose one of potentially several valid records. `#` represents width only and never reads, predicts or reserves the next counter.

Nomenclature remains `required=false` in the read model and does not change the physical readiness baseline (`required_total=4`). This does not weaken the creation gate: `reserveManagedAsset` still fails closed without the exact active rule for the selected MDF or IDF type.

### Educational interpretation

| Concept | SKIA interpretation | Purpose |
|---|---|---|
| Branch | authorized active session Branch | tenant/Branch isolation and operational scope |
| Site | canonical `buildings` record | physical property or facility |
| Internal Area | active area under an active Site | precise physical context within the Site |
| Nomenclature | active `naming_rules` pair for MDF/IDF | consistent technical identity; preview is not a reservation |
| MDF/IDF | managed distribution asset with canonical physical placement | distribution parent for infrastructure |
| Rack | valid Rack related to MDF/IDF | optional physical organization depending on modality |

Contextual help uses keyboard-native `details/summary` inside the existing accessible dialog. The former standalone nomenclature notice is removed to avoid duplicating the new Nomenclature step.

**DATABASE MIGRATION = NONE for Wizard Phase 1.1.** The existing rule, counter, RLS and transaction contracts are sufficient.

## Evidence inspected

Primary schema and migrations:

- `migrations/001_init.sql`
- `migrations/004_dcim_inventory_schema.sql`
- `migrations/013_dcim_assets_phase1_expand.sql`
- `migrations/014_dcim_assets_phase1_seed.sql`
- `migrations/018_clean_bootstrap_runtime_schema.sql`
- `migrations/019_asset_nomenclature_enforcement.sql`
- `migrations/020_nomenclature_normative_catalog.sql`
- `migrations/021_asset_placement_authority.sql`
- `migrations/022_physical_location_hierarchy.sql`

Backend authority and flows:

- `backend/main.go`
- `backend/tenant_middleware.go`
- `backend/tenant_context.go`
- `backend/role_scope.go`
- `backend/physical_locations.go`
- `backend/asset_placement.go`
- `backend/asset_nomenclature.go`
- `backend/dcim_assets.go`
- `backend/infraestructura.go`

Frontend flows:

- `frontend/components/MdfIdfWizard.tsx`
- `frontend/components/AssetPlacementSelector.tsx`
- `frontend/components/AssetPlacementStep.tsx`
- `frontend/components/NomenclatureCodeField.tsx`
- `frontend/components/RackWizard.tsx`
- `frontend/components/SwitchWizard.tsx`
- `frontend/components/PatchPanelWizard.tsx`
- `frontend/components/UpsPduWizard.tsx`
- `frontend/components/NodeWizard.tsx`
- `frontend/pages/infraestructura/mdf-idf.tsx`
- `frontend/pages/infraestructura/catalogs/nomenclaturas.tsx`

Tests and existing architecture evidence:

- `backend/asset_nomenclature_test.go`
- `backend/asset_nomenclature_integration_test.go`
- `backend/physical_locations_integration_test.go`
- `backend/mdf_idf_runtime_persistence_integration_test.go`
- `backend/asset_lifecycle_integration_test.go`
- `backend/tenant_middleware_integration_test.go`
- `docs/phases/active/ASSET_PLACEMENT_AUTHORITY.md`
- `docs/phases/active/NOMENCLATURE_NORMATIVE_CATALOG.md`
