# Phase 1.2D-B1C — migration 026 implementation

Baseline: `dea32a7684a61f3580b877e571eaf6c6338e7e67`

Migration: `migrations/026_zone_naming_context_compatibility.sql`

## Implemented database contract

Migration 026 atomically adds Zone-only MDF/IDF capability and the tenant-rule
schema needed for explicit legacy versus Zone nomenclature. It does not create
or activate a V2 rule and does not change application handlers.

The old `managed_location_requires_internal_area` constraint is replaced by
`managed_location_requires_physical_authority`, which accepts an MDF/IDF with
either canonical `zone_id` or compatibility `internal_area_id` and rejects a
new row with neither. It is intentionally `NOT VALID`: new writes are enforced
without invalidating or rewriting historical rows.

`trg_location_dual_reference_consistency` is a constraint trigger declared
`DEFERRABLE INITIALLY IMMEDIATE`. It fails early by default while allowing a
transaction to defer validation explicitly. A dual MDF/IDF reference succeeds
only when the scoped InternalArea has the same non-null Zone. Mismatch and
unprovable linkage raise SQLSTATE 23514.

## Naming-rule evolution

The existing table receives only the four approved columns:

- `rule_version integer NOT NULL DEFAULT 1`;
- `supersedes_rule_id uuid NULL` with scoped self-FK;
- `context_mode varchar NOT NULL DEFAULT 'LEGACY_INTERNAL_AREA'`;
- `include_zone boolean NOT NULL DEFAULT false`.

Version and context CHECK constraints, one-version uniqueness, one-active-rule
partial uniqueness and linear-successor uniqueness enforce deterministic rule
identity. A lineage trigger requires an exact same-tenant/type parent and the
next consecutive version.

Existing rules are exposed as version 1 legacy context with `include_zone=false`.
There is no explicit row UPDATE and no successor creation; issued semantics,
active state and custom fields remain unchanged. The normative-history trigger
now treats placement/site/area/context/Zone selectors as immutable after issue.

## Dual-mode nomenclature trigger

`enforce_asset_nomenclature()` remains invoker-security PL/pgSQL:

- `LEGACY_INTERNAL_AREA` retains the exact Location → InternalArea → Building
  path from migration 022;
- `CANONICAL_ZONE` requires Location → active scoped Zone and uses stable
  `zones.code`; there is no fallback to InternalArea;
- tenant and branch are always matched to the asset being validated;
- optional Site in Zone mode is resolved only through the Zone's Building FK;
- existing identity immutability and final-code checks remain in force.

Application sequence reservation, branch/placement counters and preview code
are not modified. Migration 026 performs no counter writes, resets or copies.
Future successor activation must continue from the maximum persisted rule,
asset, branch-counter and placement-counter high-water authority.

## Noninterference and security

Migration 026 does not update assets, codes, Locations, MDF/IDF satellites,
InternalAreas, TechnicalRooms, counters, system presets or relationships. It
does not change RLS, FORCE RLS, grants, roles, TenantTx or the migration-024
secure preset reader. No SECURITY DEFINER object is introduced.

The current application remains compatible because every existing rule stays
active in legacy mode and InternalArea-only MDF/IDF writes remain valid. Zone
mode remains dormant until a later handler/admin acceptance gate creates and
activates a V2 version.

## Bootstrap and PostgreSQL 16.14 evidence

- manifest order: 025 then 026;
- expected ledger: 18;
- schema SHA-256: `1f910989f71070cfc7055daa1d3063d47723f07f3b0c3ea49c6d4172472757d9`;
- fresh bootstrap: PASS;
- second bootstrap: PASS;
- legacy InternalArea MDF/IDF: PASS;
- Zone-only MDF/IDF: PASS;
- matching dual reference: PASS;
- mismatch/unprovable/neither: DENIED;
- cross-tenant/cross-branch Zone: DENIED;
- legacy code semantics: PASS;
- canonical `zones.code` semantics: PASS;
- Zone-to-InternalArea fallback: DENIED;
- version/successor integrity: PASS;
- legacy fixture, RLS isolation and runtime preset-reader denial: PASS.

The metadata backfill test contains one legacy naming rule. Its visible version
metadata becomes `1/LEGACY_INTERNAL_AREA/false`; explicit UPDATE rows are zero,
and its ID, counter, code and structural fields remain unchanged.

## Rollback

The repository is forward-only and no DOWN migration is introduced. Before a
Zone-only row or V2 identifier exists, application rollback remains compatible
because legacy behavior is preserved. After the first V2 Zone identifier is
issued, removing this capability is unsafe and `FORWARD_FIX_PREFERRED` applies.
