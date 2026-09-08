# Phase 1.2D B3B5C-A1 — Canonical physical hierarchy provisioning

## Contract

The product term **Site** maps to the existing `buildings` table. No parallel
`sites` table is introduced. The canonical hierarchy is:

`Tenant -> Branch -> Site -> Floor -> Zone -> Internal Area -> MDF/IDF`.

Tenant and Branch are server-session authority. Browser requests never supply
either identifier as authority. All resolution and writes use the request's
single `TenantTx`, with existing RLS and FORCE RLS policies.

## Migration 032

Migration 032 is additive. It introduces `floors.code` plus an explicit
`hierarchy_governed` marker on Floors, Zones, and Internal Areas. Existing
incomplete rows remain `false`; no Floor, Zone, or Internal Area is inferred or
backfilled from names or codes.

Governed rows must contain their complete canonical graph. Governance cannot be
downgraded, and parent scope/code fields of governed rows are immutable. Deferred
constraint triggers prevent an incomplete new shell from surviving transaction
completion while allowing an atomic graph to be assembled inside one transaction.
Composite foreign keys bind Building to Branch/Tenant, Floor to Building/Tenant,
Zone to Branch/Building/Floor, and Internal Area to Site/Floor/Zone.

## API and browser flow

- `GET|POST /api/dcim/sites`
- `GET|POST /api/dcim/floors?site_id=...`
- `GET|POST /api/dcim/zones?site_id=...&floor_id=...`
- `GET|POST /api/dcim/internal-areas?site_id=...`

POST Floor accepts `site_id`, `code`, `name`, and optional `floor_number`.
POST Zone accepts `site_id`, `floor_id`, `code`, and `name`. POST Internal Area
requires `site_id`, `floor_id`, `zone_id`, `code`, and `name`. Codes are
normalized and validated server-side. Duplicate canonical codes return 409;
invalid or cross-scope parents return 422 without making the client authoritative.

`MdfIdfWizard` now selects or creates Site, Floor, Zone, then Internal Area.
Changing a parent clears every descendant. Internal Areas are filtered to the
selected Zone, and MDF/IDF save remains disabled until a canonical `zone_id` and
compatible Internal Area are selected.

## Minimum privilege

`skia_runtime` receives only `INSERT` in addition to its prior `SELECT` on
`floors` and `zones`. It receives no UPDATE, DELETE, TRUNCATE, DDL, sequence,
role, or RLS-bypass authority. Existing Internal Area privileges are unchanged.

## Validation

The PostgreSQL 16.14 harness creates a fresh database, runs bootstrap twice,
reapplies provisioning, verifies ledger 24, exact runtime grants, RLS/FORCE,
canonical success cases, cross-scope and incomplete-row failures, governance
downgrade failures, and transactional rollback of migration 032. The canonical
schema fingerprint through 032 is
`60792d2369485275cb3d75679d26e006af6292f2fbe70d48e76dcc71e17fd463`
after canonical production RLS activation.

Legacy rows remain readable and unchanged. Their remediation is a separate,
evidence-driven operation; this phase never guesses physical hierarchy.

The HF1 acceptance matrix adds independently named negative cases for every
Floor, Zone, and Internal Area parent/scope mismatch. Real concurrent PostgreSQL
transactions also prove one winner, one controlled uniqueness conflict, one
durable row, and zero loser-side artifacts for duplicate Floor and Zone codes.
The migration 026 regression loads its explicitly historical MDF/IDF fixture in
the pre-031 chronology; normal trigger enforcement remains active for every
compatibility assertion.
