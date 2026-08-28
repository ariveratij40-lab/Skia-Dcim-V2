# Phase 1.2D-A.3 — Naming preset secure-reader report

Baseline: `b2db9ab201d4296ae02392b1d8b84b60b4343d23`.

## Existing authority and threat model

Migration 023 created global `system_naming_presets` with: `id`, `asset_type_code`, `preset_version`, `prefix`, `separator`, `include_branch`, `include_building`, `include_floor`, `include_zone`, `include_distribution`, `include_housing`, `include_placement`, `seq_digits`, two custom segment values and labels, `description`, `active`, `created_at`, and `updated_at`. Constraints cover the primary key, AssetType FK, positive version, nonblank prefix, sequence digits 2–6, and uniqueness of `(asset_type_code,preset_version)`. Partial unique index `uq_system_naming_presets_active_type` permits one active version per type.

The table has no tenant RLS because it is global reference data. PUBLIC is revoked and `skia_runtime` has no table grant. The threat is turning a recommendation lookup into general table visibility, SQL injection, mutable catalog access, tenant-write authority, or sequence consumption.

## Migration and function

Migration `024_system_naming_presets_secure_reader.sql` adds only:

`public.read_active_system_naming_presets(text[])`

It returns exactly: `asset_type_code`, `preset_version`, `prefix`, `separator`, `include_branch`, `include_placement`, `seq_digits`. These are the fields consumed by `SystemPreset`; it never returns a table row type or `SELECT *`.

The function is SQL, STABLE, PARALLEL SAFE and SECURITY DEFINER. It has fixed `search_path=pg_catalog, pg_temp`, schema-qualifies the protected table, uses no dynamic SQL and accepts only values in the fixed migration-014 AssetType allow-list. Any invalid element makes the entire request return zero rows. Only active rows matching the requested normalized types are returned in deterministic type/version order.

Owner is explicitly `skia_migrator`, the established database/schema owner used by the canonical bootstrap. It is not runtime and is provisioned NOSUPERUSER, NOBYPASSRLS, NOCREATEDB and NOCREATEROLE. PUBLIC and `skia_onboarding` EXECUTE are revoked. Only `skia_runtime` receives EXECUTE. Runtime direct SELECT and every table write remain denied.

## Backend adapter and apply-all

`ReadActiveSystemNamingPresets` validates and deduplicates AssetType codes before SQL, then calls only the secure function. It is separate from `PreviewRecommendedCode` and `ApplyRecommendedNomenclature`; no application SQL directly reads the protected table.

Preset reading creates no tenant authority. Applying returned presets still requires the caller's authenticated `TenantDB` transaction and tenant ID. Missing rules are created; equivalent rules remain unchanged; used/custom rules produce deterministic conflicts. Preview/read never touch naming counters, branch counters, rules, assets or sequences. Any application error remains visible to `RequireTenantTx`, which owns commit/rollback.

## Validation evidence

`ops/phase010/test_system_naming_preset_secure_reader.sh` builds PostgreSQL 16.14 from the canonical manifest twice, provisions roles, activates canonical RLS, seeds active/inactive catalog fixtures with the migrator and proves:

- owner, SECURITY DEFINER and fixed search path;
- exact output and deterministic repeat;
- inactive and invalid/injection-like requests return no rows;
- runtime direct SELECT/INSERT/UPDATE/DELETE are denied;
- PUBLIC-derived onboarding execution is denied;
- runtime EXECUTE succeeds while direct table SELECT remains false;
- preset, naming-rule, asset and all counter totals are unchanged by reads;
- the runtime exact-role validator passes.

Canonical post-024 evidence: ledger `16`; schema fingerprint `292287ecf0a6b31129ba5218343eccaa626dce8cbb87d0a611c82f77806775c7`.

Focused adapter/pure-service tests cover success, empty input, invalid/injection input before SQL, database error, adapter-to-apply integration, idempotency, used/custom conflicts and rollback surface. The full Go suite retains only the independently reproduced baseline failure `TestGenerateInternalCodeUsesLockedSequence`.

## Deployment and rollback considerations

Deployment requires a separately authorized canonical bootstrap of migration 024 followed by role provisioning, RLS activation and both validators. No VPS or production action occurred here. Rollback is not required for application safety: absence of the function fails the adapter closed. If an explicitly authorized rollback is ever required, revoke runtime EXECUTE before dropping the function; no table or tenant data needs reversal.
