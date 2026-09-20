# Phase 1.2F-B3a — Initial V2 preset catalog

## Authorized baseline and authority

Base: `ab1e730e12807c57f19a14dfefbefca0210522c2`.
Branch: `phase/1.2f-b3a-initial-preset-catalog`.
Predecessors: 1.2F-A, B1, B2a, B2b, B2c, B2c-HF1, B2d and B3 definition closed.
The Product Owner explicitly authorized versioning the previously ratified external
JSON with this specification; prior presence in main is not required.

Authority chain: 1.2F-A policy contract → explicit NULL metadata ratification →
B2d certified generation → [canonical JSON](../../phase1_2f/B3_DEFINITION_CATALOG_CANONICAL.json)
→ this specification → migration 040. The JSON is the exact 21-field machine-readable matrix,
not a new interpretation. SHA-256:
`2c32e4b53c3969e310d70feb2e6d56e6c54dd71d73c4b9f7c83b5863219cad45`.

## Catalog and serialization

12 presets: MDF_V1, IDF_V1, RACK_V1, SWITCH_V1, UPS_V1, PDU_V1,
PATCH_PANEL_V1, NODE_V1, FIREWALL_V1, SERVER_V1, CCTV_V1, AC_UNIT_V1.
Array of arrays, ASCII asset_type_code order, compact UTF-8 JSON, native
boolean/number/null values, exactly one final LF, no UUIDs/timestamps.
Field order:
preset_code, asset_type_code, preset_version, prefix, separator, include_branch,
include_building, include_floor, include_zone, include_distribution, include_housing,
include_placement, context_mode, sequence_scope, seq_digits, custom_segment_1,
custom_segment_1_label, custom_segment_2, custom_segment_2_label, description, active.

All rows: version 1, separator "-", include_branch=true, include_building=false,
include_floor=false, include_placement=false, active=true.
description, both custom segments and both labels are NULL; NULL is not empty string.
The referenced JSON fixes every type-specific prefix, flag, context, scope and digit.

## Implementation and tenant boundary

Only `migrations/040_nomenclature_v2_initial_preset_catalog.sql` is authorized.
Data-only, forward-only, one transaction under canonical bootstrap, catalog lock,
fail closed, ALL_12_OR_NOTHING. Exact existing rows permit deterministic no-op;
preset-code, type/version, active or metadata conflicts abort without UPDATE,
repair, deletion, normalization or reactivation. Existing structural immutability
is preserved; future structural policy changes require a new version.

SYSTEM PRESET = GLOBAL RECOMMENDATION.
TENANT NAMING RULE = TENANT OPERATIONAL AUTHORITY ONLY AFTER EXPLICIT B2c ACCEPTANCE.
Active means recommendation/preview/explicit acceptance eligibility, not acceptance.
Migration must not create/modify naming_rules, successors, assets, counters,
tenant audit or physical hierarchy. CATALOG_ACTIVATION_TENANT_MUTATIONS=ZERO.

No new grants, functions, SECURITY DEFINER, sequence grants or BYPASSRLS.
Runtime direct preset SELECT remains denied. V1 excludes all twelve; V2 active reader
returns all twelve; exact reader preserves FOUND_ACTIVE/FOUND_INACTIVE/NOT_FOUND.

## Validation and release

Required disposable PostgreSQL matrix:

- fresh and second canonical bootstrap, post-039 upgrade; ledger 32, 040 once;
- reconstruct actual seeded DB rows to the exact JSON contract and hash;
- independent preset-code, type/version, inactive-state, empty-description and
  empty-label conflicts: abort, no ledger, no partial seed, fixture unchanged;
- forced mid-insert failure: full rollback, no ledger, tenant state unchanged;
- exact-row no-op; publication immutability; V1/V2/exact readers and runtime security;
- pre/post snapshots of legacy/custom/preset/derived/inactive/issued rules,
  assets, both counter scopes, audit and physical hierarchy: all deltas zero;
- all twelve previews and all twelve B2c acceptances using actual seeded rows,
  lossless mapping, exact provenance/preset/version/actor snapshot and atomic audit;
- Zone, Distribution and Housing issuance/rollback with preview equality;
- disposable deactivation: hide active recommendation, exact FOUND_INACTIVE,
  reject new acceptance, preserve accepted rules/assets/provenance;
- B1/B2a/B2b/B2c/B2c-HF1/B2d regressions, bootstrap contracts,
  full Go tests, applicable race tests, vet, build and diff check.

Bootstrap order 039 → 040. Measure schema fingerprint; if unchanged preserve
`e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`.
Do not manufacture a hash for a data-only migration.

## Rollback and authorization limits

Minimum V2 application base: `ab1e730e12807c57f19a14dfefbefca0210522c2`.
Deployed release alignment is required in a separate gate. Historical pre-B2c/pre-B2a
read compatibility is partial; V2 writes incompatible. Neither is an authorized
rollback target after V2 acceptance. Failed migration rolls back entirely.
After committed publication, any deactivation is a separately authorized forward
operation; preserve referenced presets, accepted rules, issued assets and provenance.

Allowed: evidence, this active spec, 040, necessary bootstrap alignment, tests and
implementation evidence. No 041, acceptance/generator changes, HTTP, frontend,
VPS, production, deployment, B3b or B3c. Preserve 13 historical untracked files.
Only after the complete matrix passes: one scoped commit, push B3a, PR to main.
No merge. Technical review remains required.
