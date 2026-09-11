# Phase 1.2E-A2D — Canonical relocation

A2D introduces an explicit relocation workflow over the physical authorities established by Migration 034. Relocation is not restored inside generic asset editors; it is a dedicated operation with one authenticated tenant/branch transaction.

## Contract

- MDF/IDF relocation keeps the asset and dedicated `locations` identity and moves that location to a canonical Zone. Optional internal area remains compatibility metadata validated against the Zone.
- Rack relocation requires a canonical MDF/IDF satellite. The Rack receives the parent distribution location and all assets canonically housed in that Rack receive the same `location_id` before commit.
- Patch Panel, Switch, and PDU relocation requires a canonical Rack and persists `housing_rack_id`, inherited `location_id`, and `RACK_MOUNTED`.
- UPS relocation explicitly selects `RACK_MOUNTED` or `ROOM_MOUNTED`. Rack mode resolves canonical housing; room mode forbids Rack housing and resolves a scoped active location.

## Atomicity and isolation

`/api/dcim/relocations` is wrapped by `RequireTenantTx`. Asset source and destination are resolved with tenant and branch from the authenticated session, never from client-supplied scope identifiers. The same request transaction owns graph changes and `asset_logs`; any handler error or commit-time deferred containment failure rolls the complete operation back.

Migration 034 deferred triggers remain the final graph invariant. A2D does not weaken, disable, or bypass those constraints.

## Audit

Each explicit relocation writes `location_change` audit evidence with before/after canonical authority. Rack relocation also records descendant location changes caused by the parent move.

## Frontend

`/infraestructura/reubicaciones` is the dedicated UI. Source and destination options come only from the active branch. Ordinary Rack, Patch Panel, Switch, UPS/PDU and MDF/IDF editors remain non-relocating.

## Boundary

- Migration 034 is unchanged.
- Migration 035 is not introduced.
- Deprecated `switches.rack_id`, `patch_panels.rack_id`, `pdus.rack_id`, and `assets.specs.rack_id` are neither written nor removed.
- No RLS, role, grant, VPS, deployment, or production change belongs to A2D.
