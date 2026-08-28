# Phase 1.2D-A implementation report

Base: `b2db9ab201d4296ae02392b1d8b84b60b4343d23`.

Status: `IMPLEMENTED_LOCALLY_PENDING_ACCEPTANCE`. No commit or push was made. Core domain A/A2 introduced no schema or privilege change. The separately reviewed A3 candidate adds one authorized additive migration and one narrowly scoped EXECUTE contract; production remains unchanged.

## A3 additive security interface

- Migration: `migrations/024_system_naming_presets_secure_reader.sql`.
- Scope: additive secure read interface only.
- Function: `public.read_active_system_naming_presets(text[])`, SECURITY DEFINER, owned by `skia_migrator`, with fixed `search_path=pg_catalog, pg_temp` and no dynamic SQL.
- Privileges: PUBLIC EXECUTE revoked; `skia_runtime` receives EXECUTE only on the approved reader. Direct runtime SELECT and every runtime table write on `system_naming_presets` remain denied.
- Production: migration 024 has not been applied; no production schema or privilege was changed.

## Files changed/added

- Added `backend/physical_domain_v2.go` and focused tests.
- Added `backend/nomenclature_recommendations.go` and focused tests.
- Added this implementation report.
- Existing uncommitted Phase 1.2D audit/approval documents remain in `docs/phase1_2d/`.

## Services introduced (local candidate)

- Scoped canonical Zone resolution with optional Building/Floor.
- MDF/IDF distribution resolution with explicit legacy dual-read mode.
- Housing resolution over `racks`, exposing RACK/CABINET and validating its distribution chain.
- Central placement requirement evaluation.
- Exhaustive handling of the six persisted policies: BRANCH, ZONE, MDF_IDF, HOUSING, FREE_PLACEMENT and RELATIONSHIP_ONLY.
- FREE_PLACEMENT resolution limited to structured scoped Zone or Housing references.
- Relationship endpoint resolution with same-Tenant enforcement, active Branch membership for each endpoint and the repository-proven MDF/IDF allow-list.
- Physical-structure, initial-onboarding and per-AssetType readiness evaluations with deterministic reason codes.
- Pure nomenclature preview and transactional/idempotent application semantics over presets supplied by an authorized adapter.

## Invariants and compatibility

All resolver queries bind Tenant and Branch. Cross-scope/no-row results map to deterministic domain errors. Building/Floor remain optional. MDF/IDF is distinct from Housing. New code does not write InternalArea, TechnicalRoom or JSON placement data. Legacy MDF/IDF reads require an explicit compatibility flag. No handler was migrated.

Preview is pure and performs no SQL. Recommendation application inserts missing tenant rules, preserves identical/used/custom rules, produces deterministic conflicts and does not call counters or create assets. The source adapter for `system_naming_presets` was intentionally not implemented because runtime has no grant.

## Tests

Focused sqlmock tests cover optional/scoped Zones, parent consistency, legacy distribution behavior, RACK/CABINET Housing, all six placement policies, structured FREE_PLACEMENT, same/inter-Branch relationship authority, cross-Tenant/missing/type rejection, UPS spoof resistance, derived readiness reasons, preview purity, recommendation idempotency/conflicts and error/rollback surface.

Focused Phase 1.2D-A tests pass. `go vet ./...` passes. The full `go test ./...` suite has one failure: `TestGenerateInternalCodeUsesLockedSequence` compares the localized preview token `[SUCURSAL]` with the generated Branch code `TJ`. The identical failure reproduces from an independent archive of base `b2db9ab201d4296ae02392b1d8b84b60b4343d23`; it is pre-existing and was not weakened or modified.

## Reconciled contracts

Migration 023 is authoritative. `UNPLACED_ALLOWED` was removed from the canonical contract; Backbone uses `RELATIONSHIP_ONLY`. FREE_PLACEMENT is controlled structured placement, never free text. UPS defaults to ZONE when metadata is NULL, ignores request subtype strings, and honors a different requirement only when the persisted AssetType policy itself supplies it.

POLICY-1D-09 permits same-Tenant inter-Branch relationships only with authority over both endpoint Branches. The domain resolver checks membership independently. HTTP integration remains fail-closed under the normal single-Branch TenantTx unless an established server-authorized dual-Branch scope is selected; `backbone_links.branch_id` is not sufficient.

`system_naming_presets` remains directly inaccessible to `skia_runtime`. Phase 1.2D-A.3 adds a narrow SECURITY DEFINER projection owned by `skia_migrator`, grants runtime only EXECUTE, and implements the separated backend reader. No table SELECT or write grant was added.

## Exact remaining integration surface

1. Review the candidate services before migrating any HTTP handler.
2. Define/use an existing server-authorized dual-Branch transaction scope before enabling inter-Branch Backbone writes; until then HTTP must return a deterministic authority requirement.
3. Review the migration-024 preset reader and exact EXECUTE privilege contract before any deployment authorization.
