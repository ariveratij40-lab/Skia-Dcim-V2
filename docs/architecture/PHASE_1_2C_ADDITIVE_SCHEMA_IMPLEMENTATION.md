# PHASE 1.2C — Additive Schema Implementation Evidence

Base: `9b9c7a314796b86eb308c1f1bc9e280a0025400a`.
Migration: `023_canonical_physical_model_v2_additive.sql`

## Scope implemented

- Zone V2: explicit Branch, optional Building/Floor, canonical code, description and update timestamp.
- Strong scoped Zone FKs and direct Tenant/Branch FORCE RLS.
- Nullable `locations.zone_id`; V1 `internal_area_id` remains unchanged and valid.
- `racks.housing_type` with `RACK` default and `RACK | CABINET` constraint.
- Nullable controlled `asset_types.asset_class` and `placement_policy`; no behavior or uncertain values enforced.
- Global versioned `system_naming_presets` catalog with one active version per AssetType.
- Bootstrap manifest and schema validators updated; the existing runtime exact-grant allow-list remains unchanged.
- Canonical schema fingerprint through 023 updated to `2ec0d71affe55b47b6410d994e2242d5a5f7e1831e2ccce633d5c4ea1cc7ae2d`; expected ledger is 15.

`NAMING_PRESET_SEEDS=NONE`. No V2 preset set has yet been normatively reviewed; the empty catalog is fail-closed and cannot become asset-creation authority. `SYSTEM_NAMING_PRESETS_PUBLIC_PRIVILEGES=NONE` and runtime access remains deferred.

## Constraints and indexes

Zone supports these valid shapes:

- Branch → Zone
- Branch → Building → Zone
- Branch → Building → Floor → Zone

Composite FKs prevent Tenant/Branch/Building/Floor mismatch. Floor implies Building. Zone code is unique inside Tenant/Branch. Location Zone references use `(zone_id,tenant_id,branch_id)` and `ON DELETE RESTRICT`. Existing Internal Area constraints are not changed.

Housing and AssetType checks reject unknown enum values while preserving V1 defaults/nullability. Preset uniqueness protects `(asset_type_code,preset_version)` and permits only one active recommendation per type.

## RLS and grants

| Role | Table | SELECT | INSERT | UPDATE | DELETE | Why |
|---|---|---:|---:|---:|---:|---|
| `skia_runtime` | `zones` | Yes | No | No | No | Existing V1/readiness read surface only; no V2 mutation handler exists |
| `skia_runtime` | `locations` | Yes | Yes | Yes | No | Existing canonical placement operations, unchanged |
| `skia_runtime` | `racks` | Yes | Yes | No | No | Existing specialized creation contract, unchanged |
| `skia_runtime` | `asset_types` | Yes | No | No | No | Global type catalog, unchanged |
| `skia_runtime` | `system_naming_presets` | No | No | No | No | Runtime access is deferred until application read path, backend allow-list and database grant contract can change atomically |
| `skia_migrator` | changed/new schema | Owner authority | Owner authority | Owner authority | Owner authority | Versioned migration and reference-data authority |
| `skia_onboarding` | all above | No | No | No | No | Identity onboarding does not require physical schema |
| `skia_bootstrap` | all above | No runtime grant | No runtime grant | No runtime grant | No runtime grant | Role provisioning orchestration only |

`system_naming_presets` is global and has no tenant RLS; PUBLIC and `skia_runtime` have no direct privileges. `SYSTEM_NAMING_PRESETS_RUNTIME_ACCESS=DEFERRED`: Phase 1.2C introduces schema capability only. A future Phase 1.2F may align the application read path, backend exact allow-list and database grant contract atomically. Zone remains ENABLE/FORCE RLS with direct session GUC Tenant/Branch checks in both `USING` and `WITH CHECK`. Runtime remains `NOBYPASSRLS` and receives no global privilege expansion.

## PostgreSQL 16.14 evidence

- Clean bootstrap: PASS.
- Second bootstrap invocation: PASS.
- Migration ledger: 15.
- Schema hash: `2ec0d71affe55b47b6410d994e2242d5a5f7e1831e2ccce633d5c4ea1cc7ae2d`.
- Structural validator covers all three Zone shapes, mismatched parent rejection, dual Location compatibility, Housing values, AssetType values and preset version/active uniqueness.
- Runtime exact-grant validator: PASS after canonical Phase 011 RLS activation in the isolated database.
- Zone RLS/FORCE: `true|true`.
- Restricted runtime Branch visibility and denied Zone writes: PASS.
- Independent post-022 V1 fixture migration captured and compared named before/after counts for `tenants`, `branches`, `buildings`, `internal_areas`, `locations`, `assets`, `mdf_idf` and `naming_rules`; every count remained `1`.
- The same fixture compared the stable primary IDs for all eight rows and preserved the relationships `buildings.branch_id`, `internal_areas.site_id`, `locations.internal_area_id`, `assets.location_id`, `mdf_idf.asset_id` and `assets.nomenclature_id`.
- The legacy Location retained its original `internal_area_id`; `zone_id` remained `NULL`. No synthetic Zone was created for the V1 fixture.
- Direct `skia_runtime` and PUBLIC `SELECT`, `INSERT`, `UPDATE` and `DELETE` checks against `system_naming_presets` are denied/asserted by the structural validator.
- `ops/phase010/test_physical_model_v2_legacy_migration.sh` reproduces this evidence from a clean PostgreSQL 16.14 container. Its versioned fixture and assertions live under `ops/phase010/fixtures/`; the harness applies 001–022 with the checksum ledger, then delegates 023 and its second idempotency pass to the canonical bootstrap runner.

## V1 compatibility

Existing MDF/IDF handlers remain unchanged and continue to write `locations.internal_area_id` with `zone_id = NULL`. Existing Rack inserts omit `housing_type` and resolve to `RACK`. Naming generation, normative trigger, `naming_rules`, both counter tables, readiness and frontend are unchanged.

## Atomicity and rollback

The bootstrap runner applies each manifest artifact using `psql -1` and records its checksum in the same transaction. Migration preflight/backfill/constraints/indexes/policy/table changes therefore roll back together on error. After commit, V1 can be redeployed without a down migration because all active application paths ignore the new capability.

No DELETE, TRUNCATE, reset, legacy-column removal or identity rewrite occurs.

## Known failures and remaining policies

The repository-wide known failure `TestGenerateInternalCodeUsesLockedSequence` is preexisting and outside this schema phase. The eight behavioral policies from the approved plan remain unresolved and unenforced, including UPS placement and Cabinet layout semantics.

## Gate

`PHASE1_2C_MIGRATION=READY_FOR_REVIEW`
