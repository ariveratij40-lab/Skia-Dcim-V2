# Phase 1.2D-A.1 — Blocker reconciliation

Baseline: `b2db9ab201d4296ae02392b1d8b84b60b4343d23`.

This is a contract audit only. It authorizes neither schema or privilege changes nor implementation changes. Migration 023 is the normative authority for persisted vocabulary.

`HISTORICAL_STATUS=BLOCKED_AT_RECONCILIATION_TIME`

The blocker statements below record the state when this audit was performed. They are retained as historical decision evidence and are not the current implementation status.

## Supersession by Phase 1.2D-A3

`CURRENT_STATUS=RESOLVED_BY_PHASE_1_2D_A3`

The historical `SYSTEM_NAMING_PRESETS_DATABASE_READER` blocker was subsequently resolved by the separately authorized Phase 1.2D-A3 candidate through `migrations/024_system_naming_presets_secure_reader.sql`. It introduces `public.read_active_system_naming_presets(text[])`: a SECURITY DEFINER function owned by `skia_migrator`, with fixed `search_path=pg_catalog, pg_temp`, no dynamic SQL, PUBLIC EXECUTE revoked and EXECUTE granted only to `skia_runtime`. Runtime retains no direct SELECT or table-write privilege on `system_naming_presets`.

Current evidence and deployment requirements are recorded in `docs/phase1_2d/PHASE_1_2D_A3_NAMING_PRESET_SECURITY_REPORT.md`. No production migration or privilege change occurred during the local implementation.

## 1. Exact database vocabulary

`migrations/023_canonical_physical_model_v2_additive.sql` installs and validates `asset_types_placement_policy_check`. A persisted value may be `NULL` or exactly one of:

`BRANCH`, `ZONE`, `MDF_IDF`, `HOUSING`, `FREE_PLACEMENT`, `RELATIONSHIP_ONLY`.

`UNPLACED_ALLOWED` is not accepted by the applied constraint. `NULL` means legacy/unclassified and must remain fail-closed for V2 creation; it does not mean unrestricted placement.

| Value | DB allowed | Domain used today | Persisted or derived | Current call sites | Intended semantics | Conflict |
|---|---:|---:|---|---|---|---|
| `BRANCH` | yes | design only | persisted | 023 constraint and architecture documents | Branch-scoped identity with no lower physical object required; Branch remains session-authorized | Candidate resolver does not handle it |
| `ZONE` | yes | yes | persisted, with an authorized subtype override possible | 023, policy documents, candidate resolver/tests | Requires an active canonical Zone in the request Tenant/Branch | none for the base case |
| `MDF_IDF` | yes | yes | persisted | 023, policy documents, candidate resolver/tests | Requires a scoped active MDF/IDF; its valid Zone is inherited/validated through the distribution chain | none |
| `HOUSING` | yes | yes | persisted, with an authorized subtype override possible | 023, policy documents, candidate resolver/tests | Requires scoped active Housing (`racks.housing_type=RACK|CABINET`) and its valid MDF/IDF/Zone chain | none |
| `FREE_PLACEMENT` | yes | architecture only | persisted policy; concrete selected mode is derived/validated | 023 and Phase 1.2B/1.2C architecture | Not free text and not absence of placement. Permits one of a controlled set of structured modes selected by authoritative type/subtype policy, currently exemplified by Zone or Housing | Candidate resolver does not handle it |
| `RELATIONSHIP_ONLY` | yes | architecture only | persisted | 023 and Phase 1.2B/1.2C architecture | The managed identity is a relationship whose scoped endpoints provide topology; it does not require a Zone/MDF-IDF/Housing row for the relationship itself | Candidate resolver does not handle it |
| `UNPLACED_ALLOWED` | no | local 1.2D prose and candidate only | invented domain constant | `PLACEMENT_POLICY_MATRIX.md`, candidate resolver | Used locally for Backbone as “valid scoped endpoints, no direct placement”; that meaning is already `RELATIONSHIP_ONLY` | conflicts with 023 and collapses relationship semantics into an ambiguous “unplaced” state |

## 2. Normative semantic mapping

`FREE_PLACEMENT` and `RELATIONSHIP_ONLY` are not synonyms. `FREE_PLACEMENT` still requires a valid structured placement selected from an authoritative allow-list. `RELATIONSHIP_ONLY` models an edge/link whose authoritative physical context comes from validated endpoints. Neither permits arbitrary strings or silently missing required references.

The persisted-policy contract for representative concepts is:

| Concept | Policy | Rationale / status |
|---|---|---|
| MDF, IDF | `ZONE` | Physical distribution container rooted in an active canonical Zone |
| Rack, Cabinet | `MDF_IDF` | Housing container stored in `racks`; requires the distribution chain |
| Switch, Server | `HOUSING` | Mounted active equipment |
| UPS | `ZONE` by default, `HOUSING` when authoritative subtype metadata requires mounting | The resolved policy must be deterministic; legacy JSON is not write authority. If a single catalog row must encode multiple controlled modes, `FREE_PLACEMENT` is the persisted vocabulary designed for that choice, but subtype metadata and persistence rules need explicit implementation approval |
| Access Point | `ZONE` or controlled `FREE_PLACEMENT`, pending a canonical AssetType/handler contract | Never assume Housing universally |
| Patch Panel | `HOUSING` | Mounted passive infrastructure |
| fiber/backbone | `RELATIONSHIP_ONLY` | Scoped endpoints are authoritative |
| passive cabling infrastructure | `RELATIONSHIP_ONLY` when represented as a link; otherwise policy must follow its eventual canonical AssetType | Do not manufacture a catalog row or conflate it with Patch Panel |

`UNPLACED_ALLOWED` decision: remove it from the 1.2D contract and candidate. For the only present call site, Backbone, replace it with the already-persisted `RELATIONSHIP_ONLY`. This is option A, not a database mapping layer: no distinct valid semantic represented by `UNPLACED_ALLOWED` was found. The replacement must occur only after contract approval.

## 3. `system_naming_presets` read authority

Migration 023 makes this a global, non-tenant-owned reference table, revokes PUBLIC, and intentionally gives `skia_runtime` no table privileges. The structural validator asserts the denial. `skia_migrator` owns schema/reference-data lifecycle; `skia_onboarding` has no need for this table. `RequireTenantTx` still remains mandatory for applying a recommendation to tenant-owned `naming_rules`, but its RLS GUCs neither authorize nor isolate the global preset catalog.

| Option | Security boundary | Least privilege | RLS impact | Pool impact | Operational complexity | Testability | Schema/privilege change | Recommendation |
|---|---|---|---|---|---|---|---|---|
| A. Direct `SELECT` to `skia_runtime` | Whole table readable by every runtime connection/query path | Read-only but broader than the required active/type allow-list | None; table is intentionally global | None; same pool/transaction | Low | High | Privilege contract change | Not recommended. It weakens the deliberately deployed invariant and makes every runtime SQL path a reader |
| B. `SECURITY DEFINER` function | Function signature and fixed SQL expose only approved columns/active rows/types | Strong when owned by a non-login owner, fixed `search_path`, no dynamic SQL, PUBLIC revoked, and runtime receives only `EXECUTE` | None on the global table; tenant RLS continues only for the subsequent `naming_rules` mutation | None; function can run on the same request transaction/connection | Medium; function, owner and exact grants need versioned lifecycle | High: positive allow-list plus denied direct table access and mutation tests | Schema plus function `EXECUTE` privilege change | Recommended database architecture if DB presets remain authoritative |
| C. Separate restricted reference role/adapter | Dedicated pool/credentials read the table outside TenantTx | Can be narrow, but adds a credential and cross-connection trust boundary | None | High: second pool; cannot make preset read and tenant acceptance one database transaction without redesign | High | Medium/high | Role, grant, secret/config and application architecture changes | Not recommended for this small global catalog |
| D. Compile/static presets | Application binary/source becomes preset authority | No database privilege | None | None | Low initially; duplicates the versioned DB authority and requires releases for catalog changes | High for code, weak for DB/catalog consistency | No DB change, but architectural authority change | Not recommended while 023 explicitly establishes the DB catalog |
| E. Migrator-mediated/runtime cache | Privileged job publishes a sanitized cache | Depends on new cache boundary | Depends on chosen store | Adds refresh/cache behavior | High | Medium | New operational authority and likely schema/config | No repository precedent justifies it; reject for this phase |

Recommended controlled subphase: option B. Add a narrowly shaped function such as “read active presets for an explicit AssetType allow-list”, with immutable column projection, a non-login owner, pinned `search_path`, PUBLIC revoked, exact `EXECUTE` for `skia_runtime`, and tests proving direct `SELECT`/all writes remain denied. The application adapter may invoke it through the same `TenantDB` transaction so recommendation lookup and tenant-rule insertion share one connection and rollback boundary. The function must not use tenant GUCs as authority for global rows. This recommendation requires explicit schema and privilege authorization; it is not implemented here.

Direct `SELECT` for `skia_runtime` is not recommended. `SYSTEM_NAMING_PRESETS_RUNTIME_ACCESS=DEFERRED` remains intact.

## 4. Current local candidate disposition

| Local change | Disposition | Finding / required action after approval |
|---|---|---|
| `backend/physical_domain_v2.go` | `MODIFY_AFTER_APPROVAL` | Keep scoped resolvers and derived readiness structure. Remove invented `UNPLACED_ALLOWED`; exhaustively implement all normative persisted values or fail closed by an explicitly approved contract. Do not treat UPS code/subtype hard-coding as a substitute for authoritative metadata. Preserve `TenantDB` throughout |
| `backend/physical_domain_v2_test.go` | `MODIFY_AFTER_APPROVAL` | Keep scope/legacy/Housing/readiness coverage; add exact coverage for `BRANCH`, `FREE_PLACEMENT`, `RELATIONSHIP_ONLY`, NULL and unknown values after semantics are approved |
| `backend/nomenclature_recommendations.go` | `KEEP` for the pure/apply boundary; `BLOCKED_ADAPTER` for preset loading | It correctly accepts presets from a separate adapter and does not bypass the DB denial. Application to tenant `naming_rules` remains through `TenantDB`. The future loader is blocked pending option-B authorization |
| `backend/nomenclature_recommendations_test.go` | `KEEP` | Pure preview, idempotency/conflict and transaction-error surface remain useful; future function-adapter security/integration tests are separate and blocked |
| `docs/phase1_2d/PLACEMENT_POLICY_MATRIX.md` | `MODIFY_AFTER_APPROVAL` | Replace Backbone `UNPLACED_ALLOWED` with `RELATIONSHIP_ONLY` and enumerate the full 023 vocabulary rather than a smaller invented minimum |
| `docs/phase1_2d/PHASE_1_2D_A_IMPLEMENTATION_REPORT.md` | `MODIFY_AFTER_APPROVAL` | Replace the open vocabulary question with the approved reconciliation and keep preset adapter blocked until its controlled subphase |
| Other pre-existing local 1.2D audit/contract/policy documents | `KEEP`, except any occurrence contradicted by this reconciliation must be corrected after approval | No schema or privilege implementation is authorized by this audit |
| Future `system_naming_presets` DB adapter | `BLOCKED_ADAPTER` | Requires separately authorized SECURITY DEFINER schema/function and exact EXECUTE-contract work |

No current file should be removed wholesale. The candidate did invent a persisted spelling and its resolver is incomplete against the DB enum. It did not weaken Tenant/Branch predicates in the physical resolvers, did not create another transaction architecture, and correctly separated pure nomenclature/application logic from the blocked global-catalog adapter. `TenantDB` is preserved, but HTTP wiring under `RequireTenantTx` is not yet present and therefore cannot yet be claimed as operationally enforced.

## 5. Exact unblock decisions

1. Approve removal of `UNPLACED_ALLOWED` and use `RELATIONSHIP_ONLY` for Backbone/link identity.
2. Approve exhaustive semantics for all six persisted values, including whether/how `FREE_PLACEMENT` resolves its controlled concrete mode from authoritative metadata.
3. Authorize a separate schema/privilege subphase for the narrowly scoped SECURITY DEFINER preset reader, or explicitly choose another authority.
4. Only then modify the candidate, add adapter/integration security tests, wire handlers under `RequireTenantTx`, and run the complete gate.

No migration, grant, application implementation, commit, push, PR or deployment was performed by this reconciliation.
