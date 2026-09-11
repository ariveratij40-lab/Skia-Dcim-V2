# Phase 1.2E-A2B — Canonical housing backend write paths

A2B makes backend writes consume the relational authorities introduced by
Migration 034. Client UUIDs are resolved inside the request `TenantTx`; tenant
and branch always come from the authenticated session.

## Write contract

- Rack requires a scoped MDF/IDF satellite. Its location is inherited from the
  distribution asset and it is persisted with `mount_mode=NONE`.
- Patch Panel, Switch, and PDU require a scoped Rack. Their canonical housing
  is `assets.housing_rack_id`, their location is inherited from that Rack, and
  their mount mode is `RACK_MOUNTED`.
- UPS requires an explicit `RACK_MOUNTED` or `ROOM_MOUNTED` mode. Rack mode
  resolves housing and inherits location; room mode forbids housing and
  resolves an active scoped location.

The specialized endpoints, generic asset endpoint, ensure-Rack path, and Rack
layout use the same resolvers. No new write uses `switches.rack_id`,
`patch_panels.rack_id`, `pdus.rack_id`, or `assets.specs.rack_id`. Satellite
`rack_unit` remains positional metadata only.

## Updates and relocation

A2B does not implement descendant cascade relocation. Physical mutations on
canonical Rack/equipment assets fail closed with
`409 CANONICAL_RELOCATION_CONFLICT`. Rack layout may assign canonical housing
inside its existing request transaction, but cannot silently detach an asset
whose type requires Rack housing.

## Atomicity and security

Base asset, nomenclature counter, canonical housing, satellite, and audit log
share the `TenantTx` owned by `RequireTenantTx`. Audit failure is fatal. Any
error therefore produces zero durable delta. Scoped resolver misses return the
same not-found result for absent, cross-tenant, and cross-branch identifiers.

Migration 034 is unchanged, no Migration 035 is introduced, and no frontend,
RLS, role, grant, or deployment change belongs to A2B.
