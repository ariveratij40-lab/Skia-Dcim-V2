# Phase 1.2F-B1 — Nomenclature V2 foundation

Migration 036 is an additive, fail-closed foundation. It does not activate
Nomenclature Onboarding, expose HTTP acceptance, change frontend behavior, or
seed any of the twelve approved production presets.

## Contracts introduced

- Tenant rules retain their existing lineage and gain durable provenance.
  Existing rules are classified as `LEGACY_UNATTRIBUTED`; no preset origin is
  inferred for Migration 014 or Migration 033 data.
- `PRESET` and `DERIVED_FROM_PRESET` rules reference the exact global preset
  ID, version, and AssetType. Actor deletion clears only the live user FK; the
  immutable actor snapshot remains historical evidence.
- Existing `LEGACY_INTERNAL_AREA` and `CANONICAL_ZONE` rules remain valid.
  `CANONICAL_DISTRIBUTION` and `CANONICAL_HOUSING` are schema capabilities only
  until B2 supplies the single canonical application generator.
- Sequence scope is explicit (`BRANCH`, `PLACEMENT`, or `DISTRIBUTION`) and
  uses existing counters. Migration 036 creates no counter table, resets no
  counter, and consumes no sequence.
- Housing and generic Placement cannot both be emitted by one policy.
- A published preset version is structurally immutable. Controlled activation,
  deactivation, and descriptive metadata changes remain possible.

## Reader and privilege boundary

The V1 reader retains its signature and exposes only rows whose semantics fit
its Branch/Placement projection. The new
`read_active_system_naming_presets_v2(text[])` reader exposes the fixed V2
projection. Both are `SECURITY DEFINER`, owned by `skia_migrator`, have a fixed
safe search path, deny PUBLIC/onboarding, and grant runtime only `EXECUTE`.
Runtime receives no direct catalog table or sequence grant and retains
`NOBYPASSRLS`.

## Deliberate B2 boundary

B1 does not add an audit writer because no acceptance mutation exists yet.
B2 must introduce acceptance and its narrow audit event in the same TenantTx,
along with the canonical generator support required for Distribution and
Housing. Until then the approved twelve-row catalog remains unseeded.
