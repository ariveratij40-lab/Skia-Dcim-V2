# Phase 1.2E-A2A — Canonical infrastructure housing governance

Migration 034 establishes database authority for placement, physical housing,
backbone endpoints, and scoped non-containment relationships. It deliberately
does not implement the backend or frontend transition.

## Authorities

- `assets.location_id` remains placement authority.
- `racks.mdf_idf_id` is mandatory and scoped by tenant and branch.
- `assets.housing_rack_id` is the canonical equipment housing authority.
- `assets.mount_mode` distinguishes `NONE`, `RACK_MOUNTED`, and
  `ROOM_MOUNTED`.
- `backbone_links` is the sole MDF-to-IDF backbone authority.

Patch Panels, Switches, and PDUs must be rack-mounted. UPS supports either a
matching Rack or a room placement, never both. MDF, IDF, and Rack cannot be
housed in a Rack. Deferred database validation permits atomic construction of
the base asset and its satellite while rejecting incomplete final graphs.

Backbone is directed MDF-to-IDF. Endpoints are mandatory, scoped, distinct,
and accompanied by a normalized circuit discriminator. Parallel circuits need
different circuit codes. Generic relationships are limited to
`CONNECTED_TO`, `UPLINK_TO`, `TERMINATES_ON`, `POWERED_BY`, and `SERVES`.

## Relocation

Placement is deliberately persisted for queryability. Any relocation of an
MDF/IDF, Rack, or housed asset must update the complete dependent graph inside
one coordinated transaction. Migration 034 rejects a commit that leaves a Rack
or equipment asset with placement different from its parent.

## Deprecated authority

`switches.rack_id`, `patch_panels.rack_id`, `pdus.rack_id`, and
`assets.specs.rack_id` are deprecated and are not canonical. They are not
dropped in 034. A possible migration 035 may remove the columns only after A2B
and A2C prove zero legacy readers, writers, and values.

## Operational boundary

Current infrastructure data is test-only. The authorized rollout is a targeted
non-production delete and canonical reseed before migration application. No
permanent legacy bypass or `NOT VALID` containment constraint is introduced.
RLS and FORCE RLS policies remain unchanged. Table and sequence grants remain
unchanged. Runtime receives only `EXECUTE` on the narrowly scoped housing
assertion invoked by the deferred trigger; `PUBLIC` execution is revoked and
the restricted role attributes remain unchanged.
