# Phase 1.2D-B2A — MDF/IDF update and relocation remediation

## Scope and root cause

The generic `PUT /api/dcim/assets/{id}` path dynamically updated
`assets.asset_type_id` and `assets.location_id`. It selected policy from client
input rather than the persisted asset class, so an existing MDF/IDF could avoid
the canonical Zone authority. `PATCH` is not registered and returns 405.

This phase closes the operational generic update/relocation subpath only. The
inventory import helper remains a separately-accounted bypass and is unchanged.

## Mutation-path audit

| Path | Mutation | B2A disposition |
|---|---|---|
| Generic asset PUT | `assets.asset_type_id`, `assets.location_id`, metadata | Persisted type is resolved and locked; MDF/IDF identity and arbitrary location changes are denied; metadata remains available. |
| Generic asset PATCH | None | Method is not registered (405). |
| Location catalog PUT | Textual location metadata | Does not accept canonical `zone_id`, `internal_area_id`, or `branch_id`; unchanged. |
| Specialized MDF/IDF PUT | MDF/IDF metadata/subtype | Existing specialized contract; unchanged. |
| Import promotion/update | Direct asset update | Explicitly outside B2A; remains open. |

## Canonical authority

The current persisted `asset_types.code` determines whether MDF/IDF policy
applies. A client cannot escape it by requesting another type, and a generic
update cannot convert another asset into MDF/IDF. Client `tenant_id` and
`branch_id` are assertions only; mismatch is 403. The source asset is loaded
under the authenticated tenant and active session branch, so foreign source IDs
return 404 without an existence leak.

Relocation accepts `zone_id`, plus optional `site_id` and
`internal_area_id`. `ResolveCanonicalZone` proves the target belongs to the same
tenant and active branch. When both Zone and Internal Area are supplied,
`ResolvePhysicalLocationForZone` proves their exact relationship, including
Site when supplied. Cross-tenant and cross-branch targets fail closed. No
dual-branch authority is inferred.

Arbitrary `location_id`, Rack, Housing, Warehouse, legacy Internal Area, and
other location kinds are never accepted as relocation authority. Canonical
same-branch Zone relocation is supported. A legacy MDF/IDF remains readable and
supports metadata updates, but relocation returns
`legacy_relocation_not_supported`; it is never converted implicitly.

## Location ownership and transaction

B1D/B2 create a dedicated managed `locations` row whose `asset_id` equals the
MDF/IDF asset and whose ID is referenced by `assets.location_id`. B2A preserves
that identity and updates the owned row instead of creating a replacement.

One `RequireTenantTx` transaction covers:

1. persisted asset-type resolution and source lock;
2. MDF/IDF linkage and owned-location validation;
3. canonical target resolution under RLS/FORCE RLS;
4. update of the owned location;
5. one `asset_logs.location_change` record;
6. metadata update and middleware commit.

The lock targets `assets` and `locations`; the MDF/IDF satellite is validated
with SELECT and does not require an unnecessary UPDATE grant. Any handler error
produces an HTTP status >= 400 and `RequireTenantTx` rolls back all writes. A
forced audit failure proves that the location, asset, subtype, audit, and naming
counter snapshots remain unchanged.

## Nomenclature

Relocation does not rename an issued asset. `internal_code`,
`nomenclature_sequence`, asset ID, and the branch-scoped counter are unchanged.
The counter delta is zero; no sequence is consumed, reset, recycled, or reused.
A future rename/version workflow requires a separately approved contract.

## Executable evidence

`TestGenericMdfIdfUpdateRelocationPostgreSQL16` covers canonical MDF and IDF
same-branch relocation; tenant/branch assertions; source and target isolation;
arbitrary location rejection; both directions of forbidden type conversion;
dual-reference mismatch and unprovable references; legacy compatibility;
non-MDF/IDF metadata updates for Rack, Switch, and Server; immutable code and
counter; exactly one audit event; no writes on failures; and forced rollback.

The final acceptance matrix additionally executes IDF-to-Rack denial; separate
`location_id` rejection cases for a Rack/Housing reference, foreign tenant,
foreign branch, legacy Internal Area placement, and wrong placement type;
dual-reference cross-tenant and cross-branch denials; and metadata-only updates
for canonical Zone-backed MDF and IDF. Every denied case compares the complete
asset, owned location, MDF/IDF satellite identity, issued code, sequence,
counter, and audit snapshot. Metadata-only cases prove placement, code,
sequence, counter, and audit remain unchanged while the requested name changes.

The same PostgreSQL 16.14 run executes the B1D specialized and B2 generic
creation regression suite. No migration or grant expansion is required.

## Security accounting

- Matrix item 9 POST creation subpath: closed by B2.
- Matrix item 9 generic update/relocation subpath: closed by B2A.
- Matrix item 9: fully closed.
- B2A closes one full matrix item; 23 bypass items remain.
- MDF/IDF import bypass: remains, explicitly outside this phase.
