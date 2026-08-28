# Phase 1.2D-B3B — migration 025 placement-policy provisioning

Baseline: `2817fb8918d52eb0d1904387b199dd25124d6e46`

## Baseline and scope

Migration `migrations/025_asset_type_placement_policy_provisioning.sql`
provisions only the nullable `asset_types.placement_policy` metadata added by
migration 023. It contains no schema DDL, inserts, deletes, asset-class updates,
tenant data changes or application enforcement.

The apparent CABINET assignment in the conceptual review is not a fourteenth
AssetType. CABINET is `racks.housing_type='CABINET'` and inherits the RACK
container policy. `MDF_IDF_VIA_RACK_STORAGE` is therefore neither stored nor
added to the schema vocabulary. ACCESS_POINT is absent and is not created.

## Exact mapping

| AssetType | placement_policy |
|---|---|
| MDF | ZONE |
| IDF | ZONE |
| RACK | MDF_IDF |
| SWITCH | HOUSING |
| UPS | ZONE |
| PDU | HOUSING |
| PATCH_PANEL | HOUSING |
| NODE | ZONE |
| BACKBONE | RELATIONSHIP_ONLY |
| FIREWALL | HOUSING |
| SERVER | HOUSING |
| CCTV | ZONE |
| AC_UNIT | ZONE |

## Preconditions and drift protection

The migration identifies targets by their unique canonical `code`, not by a
surrogate ID. Before updating it fails if any of the 13 codes is missing or if
any target already contains a different non-null policy. It updates only exact
targets whose policy is null and then verifies every expected final value.
Because the canonical runner applies each artifact and its ledger entry inside
one transaction, any precondition or postcondition failure rolls back the
entire migration.

Unknown or future AssetTypes are outside the UPDATE relation and remain
untouched. Re-execution with the same final values is safe. Migration contents
become immutable through the existing SHA-256 bootstrap ledger.

## UP and DOWN behavior

UP assigns the 13 values above and no other column. The repository uses a
forward-only manifest and has no DOWN-migration convention, so this change does
not invent one. After V2 writes begin, clearing these policies would remove an
active authority; any correction must be a separately reviewed forward fix.

## Validation evidence

`ops/phase010/test_asset_type_placement_policy_provisioning.sh` ran against
PostgreSQL 16.14 and proved:

- clean canonical bootstrap through 025: PASS;
- second bootstrap invocation/idempotency: PASS;
- migration ledger: 17;
- expected targets/final values: 13/13;
- unexpected AssetTypes updated: 0;
- AssetTypes inserted/deleted: 0/0;
- ACCESS_POINT created: no;
- asset-class rows changed: 0;
- existing assets/locations/relationships changed: 0/0/0;
- a conflicting valid non-null policy: denied, with transaction rollback.

The legacy physical-model fixture/harness remains part of validation and now
expects the canonical 17-entry ledger. The schema fingerprint is unchanged
because migration 025 changes reference data only.

## Legacy compatibility and existing-data safety

Existing assets, locations, InternalArea data, TechnicalRoom data, naming
rules, counters and relationships are not read or written by migration 025.
Legacy reads remain compatible. New V2 writes through InternalArea and
TechnicalRoom remain prohibited by policy, but this migration does not enforce
that rule and does not normalize legacy placement.

## Security scope clarification

This migration fixes zero security bypasses. The 25 write-path findings remain
for later application enforcement. It adds no handler, readiness,
nomenclature, relationship, import, tenant or branch authority enforcement.
Its sole purpose is to provide the reviewed metadata prerequisite for those
later fail-closed gates.
