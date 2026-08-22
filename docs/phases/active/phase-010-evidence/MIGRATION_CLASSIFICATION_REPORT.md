# PHASE-010 — Migration Classification Report

## Scope and lineage

- Gate: `ARCHITECT_DECISION_BOOTSTRAP_RECONCILIATION_GATE.md`
- Application lineage: `main@ce19289e59bf25ece2cd208b92b399e31d8b2f17`
- Evidence origin: repository static analysis
- Result: **BLOCKED** before creation of a canonical bootstrap migration

This report reuses the completed PHASE-010 inventory. It does not replay the
earlier raw-bootstrap experiment.

## Classification

| Artifact | Classification | Production-bootstrap disposition |
|---|---|---|
| `migrations/001_init.sql` | production schema required | candidate; foundational schema |
| `migrations/002_seed.sql` | test/demo/validation data only | exclude; creates demo tenant, users and customer-like data |
| `migrations/003_rbac_validation_data.sql` | test/demo/validation data only | exclude; references non-existent `permissions.action` and fictitious actors |
| `migrations/004_dcim_inventory_schema.sql` | production schema required | candidate |
| `migrations/005_dcim_seed.sql` | superseded/duplicate/conflicting | exclude; mixes canonical asset types with tenant-specific demo inventory |
| `migrations/006_config_admin_schema.sql` | production schema required | candidate, schema statements only |
| `migrations/007_fix_password_hashes.sql` | historical compatibility only | exclude; mutates existing user password hashes |
| `migrations/009_add_unique_branches_constraint.sql` | production schema required | candidate; must be guarded by the runner/migration ledger |
| `migrations/010_create_inventory_imports_schema.sql` | production schema required | candidate for the `inventory_imports` pipeline |
| `migrations/011_password_reset_tokens.sql` | production schema required | candidate |
| `migrations/012_fix_imported_assets_tenant_type.sql` | historical compatibility only | exclude from empty bootstrap; assumes legacy tables/data and truncates data |
| `migrations/013_dcim_assets_phase1_expand.sql` | production schema required | candidate |
| `migrations/014_dcim_assets_phase1_seed.sql` | production reference/catalog seed required | candidate only for the 13 global asset types; tenant-loop produces no rows on an empty DB |
| `migrations/015_naming_rules_custom_segments.sql` | production schema required | candidate |
| `migrations/015_assets_rls.sql` | superseded/duplicate/conflicting | exclude; canonical RLS lifecycle is owned by `ops/phase005` |
| `migrations/016_assets_branch_scope_all.sql` | superseded/duplicate/conflicting | exclude; superseded by canonical PHASE-005 artifacts |
| `backend/migrations/010_enterprise_import_schema.sql` | unknown/blocking | depends on the import schema family whose canonical contract is unresolved |
| embedded `006_config_admin_schema` | superseded/duplicate/conflicting | overlaps file migration and contains tenant-dependent seed behavior |
| embedded `007_fix_password_hashes` | test/demo/validation data only | exclude; password mutation is not clean-bootstrap schema |
| embedded `008_fix_user_roles_schema` | historical compatibility only | exclude; repairs a schema variant not created by `001_init.sql` |
| embedded `009_capex_schema` | production schema required | requires a forward-only file migration or another explicit canonical path |
| embedded `011_password_reset_tokens` | superseded/duplicate/conflicting | overlaps `migrations/011_password_reset_tokens.sql` |
| embedded `012_fix_imported_assets_tenant_type` | historical compatibility only | exclude; destructive legacy-data reconciliation |
| embedded `013_racks_mdf_idf_id` | production schema required | requires canonical reconciliation with the existing rack expansion |
| embedded `014_cert_evaluations` | production schema required | requires a forward-only file migration or explicit manifest path |

## Decision

`003_rbac_validation_data.sql` is conclusively non-production and must remain
preserved but excluded. A final executable manifest cannot be approved until
the import schema decision in `IMPORT_JOBS_SCHEMA_DECISION.md` is resolved.
