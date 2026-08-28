# Phase 1.2D-B2 — Generic MDF/IDF creation remediation

## Previous bypass

`POST /api/dcim/assets` resolved an AssetType using the global pool and then
implemented its own MDF/IDF write path. It accepted an arbitrary `location_id`,
generated naming without canonical Zone context, inserted `assets` and
`mdf_idf` directly, and treated an `asset_logs` failure as non-fatal. Session
resolution also retained a legacy branch fallback. This was independent of the
B1D authority used by `POST /api/infra/mdf-idf`.

## Selected architecture

Both routes now call `createMdfIdf`, the single application service for MDF/IDF
creation. It owns assertion validation, canonical/legacy request-mode
discrimination, Zone and optional InternalArea resolution, exact
`CANONICAL_ZONE` naming readiness, counter reservation, location creation,
asset creation, subtype creation, location finalization, and audit insertion.
It receives only the request-scoped `TenantDB`; it cannot start or commit a
second transaction.

The generic POST is now wrapped by `RequireTenantTx`. AssetType is resolved by
ID inside that transaction, so the database catalog—not a client type string—
selects the protected MDF/IDF path. Non-MDF/IDF types continue through the
existing polymorphic logic in the same request transaction.

## Authority and placement

- Tenant authority: authenticated server session only. `tenant_id` is an
  optional assertion; mismatch is 403.
- Branch authority: selected session branch plus authorized membership.
  `branch_id` is an optional assertion; mismatch is 403.
- MDF and IDF canonical placement is Zone. `zone_id` is mandatory on the
  generic route.
- Generic `location_id` and `technical_room_id` cannot satisfy MDF/IDF
  placement and are rejected.
- Zone resolution is scoped to the authenticated tenant and branch and does
  not reveal cross-scope existence.
- An optional `internal_area_id` must be provably attached to the same Zone;
  no Zone is inferred from InternalArea.
- Explicit legacy InternalArea-only compatibility remains available only on
  the specialized B1D endpoint.

## Naming and atomicity

Canonical creation requires exactly one active `CANONICAL_ZONE` rule for the
server-resolved AssetType. Zero or multiple compatible rules fail closed with
`NAMING_RULE_ZONE_CONTEXT_REQUIRED`; there is no legacy-rule fallback and no
rule mutation.

One `RequireTenantTx` covers Zone validation, rule/counter locking, location,
asset, `mdf_idf`, location finalization, and audit. Any HTTP failure causes the
middleware to roll back all writes, including the reserved sequence. The
response is buffered until commit succeeds.

## Compatibility and tests

The generic success response retains `id`, `internal_code`, `nomenclature_id`,
`status`, and `satellite_id`. Database errors and cross-scope details are not
returned to clients.

PostgreSQL integration coverage exercises generic MDF and IDF success with
exact location, asset, subtype, counter, and audit deltas; missing Zone;
tenant/branch spoofing; cross-tenant and cross-branch Zone references; real
wrong-tenant, wrong-branch, WAREHOUSE and legacy `location_id` references;
structural AssetType spoofing; dual-reference mismatch; zero/legacy-only
naming; canonical prevention of multiple active rules; and representative
RACK, SWITCH and SERVER generic creation. Every rejected case compares
locations, assets, subtypes, counters, and audit rows before and after.

## Remaining bypasses and accounting

- `MATRIX_ITEM_9_POST_CREATION_SUBPATH=CLOSED`: generic MDF/IDF
  `POST /api/dcim/assets` now uses the canonical authority.
- `MATRIX_ITEM_9_UPDATE_RELOCATION_SUBPATH=OPEN`: generic PUT/PATCH can still
  mutate placement or AssetType without the canonical MDF/IDF command.
- `MATRIX_ITEM_9_ACTUALLY_CLOSED=NO`.
- `PARTIAL_BYPASS_REMEDIATIONS_BY_B2=1`.
- `PARTIAL_REMEDIATION=ITEM_9_POST_CREATION`.
- `BYPASSES_FIXED_BY_B2=0_CONFIRMED_FULL_MATRIX_ITEMS`.
- `BYPASSES_REMAINING_AFTER_B2=24`.
- MDF/IDF import remains out of scope.

The next dedicated phase is **B2A — generic MDF/IDF update-relocation
authority remediation**. It must govern changes to `asset_type_id`,
`location_id`, `zone_id`, and branch/location movement without being combined
with the separate import remediation.

No migration, schema, frontend, RLS, privilege, import, update, Backbone, VPS,
deployment, or production change is part of B2.
