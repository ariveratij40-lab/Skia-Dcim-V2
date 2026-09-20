# B2d-HF1 — operational canonical physical context propagation

Base: `7bc42600cb87494dccca50cba26f17352331ca9a`.
Branch: `phase/1.2f-b2d-integrated-validation`.
Date: 2026-09-20. Local correction; no publication or deployment.

## Original evidence retained

The original `PHASE_1_2F_B2D_INTEGRATED_VALIDATION.md` remains unchanged as
historical evidence of `UPS_E2E=FAIL_HTTP_500`. Its test and harness are retained;
the test now also asserts the corrected outcomes. Before product edits the same
PostgreSQL 16.14 reproduction was executed again:

```text
EXACT_PRESET=PASS ACCEPTANCE=PASS PREVIEW=UPS-TIJ-Z01-0001 COUNTER_DELTA=0
HOUSING_RESOLUTION_ERROR=<nil> MANAGED_ISSUANCE_ERROR=invalid_physical_scope
HTTP=500 body={"error":"database error creating asset"}
rule/assets/audit unchanged, counter delta=0
```

Exact call chain:
`RequireTenantTx -> handleUpsPdus -> ResolveCanonicalHousing -> reserveManagedAsset
-> generateInternalCodeWithContext -> ResolveCanonicalNomenclature
-> ResolveCanonicalZone(empty ID)`.

The request and DTO have `placement_id`, not an independent Zone selector.
Room placement resolution retained LocationID but not ZoneID. The managed writer
and generator passed that reference but the CANONICAL_ZONE resolver previously
required an explicit ZoneID and did not traverse the existing Location relation.
This was lost context, not missing physical authority or a schema defect.

## Contract and correction

`CanonicalNomenclatureInput` remains the shared typed server-side contract:
authenticated Tenant/Branch plus ZoneID, DistributionID, HousingRackID and
PlacementID. Existing `managedAssetInput` and `NomenclatureContext` are adapters
to that same engine contract, not new sources of physical authority.

`completeCanonicalPhysicalContext` completes that input inside the same TenantTx:

- LEGACY_INTERNAL_AREA returns to the existing compatibility path unchanged.
- V2 Housing resolves through the existing scoped `ResolveHousing` authority.
- Distribution resolves through the existing scoped `ResolveDistributionPoint`.
- Placement is re-read by tenant/branch, allowed physical type and active status.
- Zone comes from the canonical ancestry, then the canonical Zone resolver.
- Building and Floor are derived by the existing Zone hierarchy resolver; no
  new client Building/Floor codes or physical naming authority is introduced.
- Explicit references that disagree with resolved ancestors fail closed rather
  than being overwritten. Server compatibility objects contribute IDs only for
  V2 and are re-resolved, not trusted as a second code authority.
- The completion function never routes on AssetType; its AST regression test
  rejects AssetTypeCode selection or a UPS literal.

The normal generic POST had a second instance of the same adapter defect: it
resolved housing but passed only `Placement` into the generator. It now passes
the existing request Zone reference and server-resolved placement/distribution/
housing IDs as well. HTTP fields/routes and persistence authority are unchanged.

No Migration 040 is required or created. No migration, RLS policy, grant,
counter schema, rule authority, preset seed or frontend change is included.

## Production writer inventory

| Path | Before | After / boundary |
|---|---|---|
| Specialized MDF/IDF -> createMdfIdf | CANONICAL_CONTEXT_COMPLETE: explicit Zone, server-created Location | retained; V2 IDs re-resolved |
| Generic MDF/IDF POST -> createMdfIdf | WRAPPER_COMPLETE | retained |
| Import coordinator -> commitCanonicalImportRow -> createMdfIdf | WRAPPER_COMPLETE: DB-revalidated normalized Zone ID | retained; race/rollback regression PASS |
| Import batch coordinator | WRAPPER_COMPLETE: canonical row coordinator | no separate identity generator |
| handleRacks | CANONICAL_CONTEXT_COMPLETE: Distribution + Location | representative specialized/generic PostgreSQL PASS |
| handleEnsureRack | WRAPPER_COMPLETE: same Distribution + Location contract | source audited; shared reserve/generator retained |
| handleSwitches | CANONICAL_CONTEXT_COMPLETE: Housing + Location | representative specialized/generic PostgreSQL PASS |
| handleUpsPdus | CONTEXT_LOSS for Zone policies: Location/Housing without Zone | canonical ancestors derived generically; UPS first/second/rollback PASS |
| handlePatchPanels | CANONICAL_CONTEXT_COMPLETE: Housing + Location | shared layer; specialized housing regression |
| handleNodos | CONTEXT_LOSS for Zone policies; legacy Placement complete | same generic completion; legacy Placement representative PASS |
| Generic non-MDF/IDF createAsset | CONTEXT_LOSS: resolved parents not forwarded | existing parent IDs forwarded; Rack/Switch/UPS/Node tests PASS |
| handleBackbone | LEGACY_NOT_APPLICABLE: relationship-only, deferred V2 catalog | unchanged; no invented physical authority |
| generateInternalCode compatibility wrapper | LEGACY_NOT_APPLICABLE: no production caller found | unchanged; no implicit parent invented |
| duplicate_detector insertAsset/UpsertAsset + ProcessImportAsync | LEGACY_NOT_APPLICABLE: retired pipeline, no live caller into ProcessImportAsync | unchanged; not certified as managed issuance |
| Current async upload/staging | LEGACY_NOT_APPLICABLE: staging only | no canonical assets created until explicit commit coordinator |

Scope caveat: generic SERVER/FIREWALL mounted persistence is not covered by the
existing five-type housing adapter. This previously deferred creation capability
is not implemented or certified by HF1; all-12 B3 readiness remains B2d work.

## Focused evidence

All database executions use disposable local PostgreSQL 16.14. Runtime paths
execute as `skia_runtime`; administrative connections only arrange/inspect tests.

- Pre-fixture seed count 0, clean and second bootstrap PASS, ledger 31, fingerprint
  `e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`.
- UPS preview `UPS-TIJ-Z01-0001`, first committed POST same code, second
  `UPS-TIJ-Z01-0002`, rolled-back third leaves counter at 2 and no third asset.
- Exact Zone/Location/rule association checked in DB. Rollback leaves rule and
  provenance unchanged. Normal generic UPS POST subsequently emits `0003`.
- Rack Distribution, Switch Housing and Node legacy Placement: preview equals
  specialized operational issuance; the generic POST also succeeds.
- Building/Floor components match database ancestry, with immutable fixture
  codes preserved.
- Cross-tenant and cross-branch Zone, Distribution, Housing and Placement all
  reject. Rule/assets/audit and both counter-table snapshots remain unchanged.
  For non-Placement tests a valid in-scope placement is supplied so an invalid
  parent is not merely hidden by an earlier placement rejection.
- Missing Zone, unavailable Zone, scope mismatch and invalid placement retain
  their existing 422 mappings. Generic POST now uses the existing managed-domain
  error mapper. No new error protocol is introduced.
- B1, B2b, B2c and HF1 operation-binding PostgreSQL harnesses PASS. The latter
  two include B2a's PostgreSQL engine/sequence regression.
- Canonical MDF/IDF import commit PostgreSQL regression PASS with `-race`,
  including same physical authority, cross-scope rejection and failure rollback.
- Go test, vet, build and diff checks run separately. Database tests are not
  counted as executed merely because default `go test` skips missing URLs.

During focused test development, two fixture-only errors were corrected:
`inventory_status=in_use` (not a schema value; now installed) and an attempted
update of an immutable Site code (now compared without mutation). Neither caused
a product/schema change. The original pre-fix defect remains documented above.

## Review boundary

HF1 is ready for review only after the recorded focused/regression commands pass.
It does not certify B2d or any of its remaining 12-preset, 32x20 stress,
100-race, rollback-baseline or ambiguous-commit matrices. Those were not resumed.
Review authorization is required before resuming B2d. No commit, push, PR, B3,
catalog activation, VPS access or deployment is performed in this gate.

Residual consideration: common V2 completion performs extra scoped reads of
ancestors; this gate proves correctness, not performance under full B2d stress.
