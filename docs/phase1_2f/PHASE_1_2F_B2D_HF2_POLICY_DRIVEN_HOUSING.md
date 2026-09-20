# B2d-HF2 — policy-driven operational Housing

Base `7bc42600cb87494dccca50cba26f17352331ca9a`, branch
`phase/1.2f-b2d-integrated-validation`. Local validation only, 2026-09-20.
No publication, migration, frontend, HTTP feature, VPS or deployment.
Original B2D-001/HF1 and B2D-002 reports remain intact.

## Before fix

`/tmp/skia-hf2-before.log`: disposable PostgreSQL 16.14, runtime role,
exact FIREWALL_V1 acceptance and valid preview
`FW-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001`, followed by generic POST HTTP 500,
`invalid_physical_scope`. Full rules/assets/audits and both counter snapshots
are unchanged after rollback. This reproduces B2D-002, not a harness failure.

## Gate and authority audit

The old generic gate was RACK/PATCH_PANEL/SWITCH/PDU/UPS. It reflected the
Migration 034 mounting/satellite contract: Rack needs Distribution;
Switch/PDU/Panel require Rack; UPS permits explicit room/rack mounting.
It was incorrectly also limiting which types could supply nomenclature Housing.

`validateCanonicalNomenclaturePolicy` already enforces CANONICAL_HOUSING with
include_housing, without include_placement/internal_area. Distribution requires
include_distribution; Zone requires include_zone; legacy disallows V2 segments.
Sequence scope validation remains unchanged. No new policy/schema is defined.

New `resolveNomenclatureHousing` consumes that validated policy and delegates
to `ResolveHousing`: scoped active Rack, canonical Rack asset/type and coherent
Distribution/Location ancestry. It checks supplied placement/distribution/mount
assertions. It never dispatches on asset type. Its returned state supplies both
generator context and persisted mount_mode/housing_rack_id/location_id.

Generic createAsset locks the effective policy before physical resolution and
uses the new resolver unconditionally. Non-Housing policies continue through
the existing physical mounting compatibility resolver; unknown physical types
retain their prior non-mounted behavior. These compatibility constraints are
not a nomenclature allowlist and were not removed from the database.

`reserveManagedAsset` uses the same helper, so direct/domain callers cannot
generate Housing while persisting an unresolved/null Housing reference.
The existing pre-sequence placement-required rejection is preserved.
The later generator policy read remains in the same transaction with the rule
lock held; no competing policy can replace it between resolution and issuance.

Other production type gates remain intentionally scoped:

- `ResolveCanonicalHousing` and specialized handlers: physical mounting and
  typed satellite rules from 034, not preset eligibility.
- installableAssetTypes: six legacy installable Placement requirements.
- createMdfIdf: MDF/IDF Zone, physical identity and satellite authority.
- generic update and canonical relocation: existing type-specific relocation
  boundaries; not redesigned by this create-path hotfix.
- generic satellite insertion and rack layout: typed storage/representation.
- import staging aliases: normalization, not Housing authority.

Canonical import commit calls createMdfIdf -> reserveManagedAsset; it does not
offer a FIREWALL/SERVER import writer. No such feature is claimed or added.
Retired asynchronous canonical writers remain contained. Specialized issuance
also reaches reserveManagedAsset and the common canonical engine.

## Focused evidence

The existing ordered basic writer test is reused as HF2 representatives only;
this is **not** a resumption of full B2d stress, upgrade or adversarial matrices.
Admin only prepares disposable fixtures; acceptance, preview and issuance use
skia_runtime with authenticated TenantTx. First and second issuance COMMIT,
third issuance ROLLBACK. Source presets exist only in disposable fixtures.

FIREWALL emitted:

- `FW-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001`
- `FW-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0002`

SERVER emitted:

- `SRV-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001`
- `SRV-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0002`

Preview equals issuance; database COMMIT accepts enforcement; persisted
housing_rack_id equals the resolved Rack, location matches and mount mode is
RACK_MOUNTED. Third issuance rolls back with zero state/counter delta.
SERVER had the same source gate; pre-fix SERVER was not separately executed.
Its focused successful result does not introduce a separate B2D-003 finding.

SWITCH/PDU/PATCH_PANEL exercise the same three operations and persistence
assertion. MDF/IDF/UPS/NODE/CCTV/AC_UNIT succeed without a housing_rack_id and
persist NULL Housing. Rack Distribution behavior remains working.
UPS remains `UPS-TIJ-Z01-0001` / `0002`, rollback zero (B2D-001 regression).

Corrected FIREWALL generic POST rejects foreign tenant, foreign branch,
nonexistent Rack and mismatched Distribution with HTTP 422 and zero
rules/assets/audits/counter delta. Existing managed error mapping is reused;
ErrHousingNotFound joins existing invalid-placement mapping. No protocol added.

Policy-not-type unit test covers named and unlisted types with Housing and
non-Housing policies. AST guard rejects AssetTypeCode access in the new helper.
The injected TenantDB sqlmock expectation was updated for the early policy
read; no global DB fallback is introduced.

## Validation and boundaries

Evidence logs use `/tmp/skia-hf2-` prefix: focused-final/final-domain (race),
b1, b2b, b2c (includes B2a PostgreSQL), binding, import. Fresh/second bootstrap,
runtime validator, ledger 31 and canonical fingerprint remain unchanged:
`e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`.
Pre-fixture preset count is zero; V2 production catalog remains inactive.

Completed: focused HF2 and HF1 PostgreSQL with race detector PASS; direct
managed FIREWALL/SERVER persistence + rollback PASS; B1/B2b/B2c PASS, including
B2a engine regressions; HF1 operation binding PASS; canonical MDF/IDF import
with race detector PASS. Full ordinary Go tests, vet and build PASS. Ordinary
Go tests without database URLs skip integration; the separate harnesses supply
the database evidence. Initial sqlmock ordering failures were corrected in the
test expectations, with the missing-placement fail-fast behavior preserved.
The specialized canonical housing write-path harness also passes on PostgreSQL
16.14, including transactional zero-delta assertions (`specialized.log`).

No Migration 040 is needed or created. No schema or privilege modifications.
No full B2d stress/100-iteration matrix or B3 readiness claim. HF2 review and
separate resume authorization remain required. Extra policy/resolver reads
have not been performance-certified at B2d stress scale.
