# PHASE-010 — Clean Bootstrap Manifest

## Status

**NOT EXECUTABLE / BLOCKED**

The deterministic prefix that can be considered for an empty database is:

1. `migrations/001_init.sql`
2. `migrations/004_dcim_inventory_schema.sql`
3. schema-only contract from `migrations/006_config_admin_schema.sql`
4. `migrations/009_add_unique_branches_constraint.sql`
5. `migrations/010_create_inventory_imports_schema.sql`
6. `migrations/011_password_reset_tokens.sql`
7. `migrations/013_dcim_assets_phase1_expand.sql`
8. global asset-type reference portion of
   `migrations/014_dcim_assets_phase1_seed.sql`
9. `migrations/015_naming_rules_custom_segments.sql`

This list is deliberately documentation, not a runner. It excludes demo/test
data, password repair, legacy truncation and superseded RLS scripts. It cannot
be promoted to executable form until new forward-only migrations cover the
runtime gaps without inventing import or authorization semantics.

Canonical RLS activation remains a separate post-schema operation owned by
`ops/phase005`; it is not part of an empty schema bootstrap.
