# PHASE 1.2E — A2F Legacy Authority Cleanup

## Base

- Canonical base: `927eb3479a34b81077aaca45712739fa8493c584`
- Branch: `phase/1.2e-a2f-legacy-authority-cleanup`
- Predecessor gate: A2E PASS

## Objective

Remove the deprecated Rack storage authorities after A2E proved that they have zero runtime authority, zero meaningful production values, zero canonical divergence, and zero PostgreSQL view/function dependencies.

## Migration 035

`migrations/035_remove_legacy_rack_authorities.sql`

### Removed storage authorities

- `switches.rack_id`
- `patch_panels.rack_id`
- `pdus.rack_id`
- residual `assets.specs['rack_id']` metadata key

### Preserved canonical/compatibility contracts

- `assets.housing_rack_id` remains the canonical Rack housing authority.
- `rack_unit` remains untouched.
- `racks.id` remains untouched.
- JSON/API/DTO compatibility names such as `rack_id` and frontend `rackId` remain untouched when they represent canonical `racks.id` or `assets.housing_rack_id`.

## Fail-closed preflight

Migration 035 checks each legacy satellite column, when present, before any mutation. If any non-null legacy value has reappeared, the migration raises SQLSTATE `23514` and aborts.

The preflight is conditional on column existence so the migration is safe for already-clean bootstrap/test databases.

## Validation gate before merge

Migration 035 must be exercised against PostgreSQL in an explicit transaction and rolled back during validation. Required evidence:

- migration executes successfully from the current schema;
- after the migration, all three satellite `rack_id` columns are absent;
- `assets.specs` contains no `rack_id` key;
- `assets.housing_rack_id` still exists;
- `rack_unit` still exists on applicable satellite tables;
- canonical housing tests remain PASS;
- transaction ends with `ROLLBACK` during validation;
- no production deployment or persistent schema change occurs during review.

## Production boundary

A2F preparation and validation do not authorize production execution. Production application requires a separate explicit deployment gate after merge and release review.
