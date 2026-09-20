# B2d integrated validation — blocked on operational UPS issuance

Historical reports below are preserved. The latest second-resume evidence is
in the final section; the original B2D-001 and B2D-002 failures are not erased.

Date: 2026-09-20. Status: **BLOCKED**, not an integrated acceptance PASS.
Canonical base: `7bc42600cb87494dccca50cba26f17352331ca9a`.
Branch: `phase/1.2f-b2d-integrated-validation`.

## Environment and scope

Local disposable `postgres:16.14-alpine`, server reports 16.14. Admin prepares
fixtures; acceptance, preview and the existing HTTP writer use `skia_runtime`.
The harness removes only its own disposable container on exit. No VPS,
deployed database, production seed, catalog activation or deployment occurred.
No product code or migration was changed. The 13 historical untracked documents
are unchanged (SHA-256 comparison against the preceding gate).

The supplied authorization ends at `HF1_REG` in the output template. Its
execution/defect/publication instructions are complete. Sections 24 and 28
require a blocked report before product correction or publication.

## Bootstrap and authority evidence

`bash ops/phase010/test_nomenclature_b2d.sh` performs two canonical bootstrap
runs, reapplies provisioning and activates the canonical RLS contract locally.

- Clean bootstrap: PASS; second bootstrap: PASS.
- Highest migration 039; no 040; ledger count 31.
- Pre-fixture `system_naming_presets` count: 0.
- Schema fingerprint:
  `e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`.
- Runtime validator: `RUNTIME_AUTH_ROLE_VALIDATION=APPROVED`.
- Source re-audit: rule insertion/deactivation is in the acceptance/customization
  domain. The engine's `last_seq` update remains counter bookkeeping, not an
  alternative structural mutation authority. Legacy POST/PUT return HTTP 409;
  GET/preview are preserved. Legacy editor writes are not working compatibility.

Actual observed RLS/FORCE:

| Table | RLS | FORCE |
|---|---|---|
| naming_rules | true | true |
| assets | true | true |
| locations | true | true |
| buildings | true | true |
| floors | true | true |
| zones | true | true |
| mdf_idf | true | true |
| racks | true | true |
| nomenclature_branch_counters | true | true |
| nomenclature_counters | true | true |
| audit_logs | false | false |

Audit safety is the secure-function boundary and denial of direct runtime CRUD,
not an invented claim of audit-table FORCE RLS. The effective-privilege validator
passed; new overload/ownership injection scenarios have not been run in B2d.

## Reproduced product defect B2D-001

Severity: **HIGH** — blocks the approved UPS preset's existing creation flow.

`TestB2dUPSCanonicalZoneOperationalPostgreSQL16` uses exactly UPS_V1's normative
policy: prefix UPS, branch and Zone included, CANONICAL_ZONE, BRANCH sequence,
four digits and `-` separator. No production seed is created.

1. Admin arranges actual Building/Floor/Zone/MDF/IDF/Rack relations using the
   existing canonical parent fixture. TIJ and Z01 are database codes, not request
   authority. A valid authenticated session selects the fixture Branch.
2. Runtime exact preset read: PASS.
3. Runtime explicit acceptance: PASS, transaction committed.
4. Runtime preview: `UPS-TIJ-Z01-0001`; `sequence_reserved=false`; counter delta 0.
5. Existing `POST /api/infra/ups-pdus`, with `device_type=ups`,
   `mount_mode=ROOM_MOUNTED` and the canonical placement UUID, returns **500**:
   `{"error":"database error creating asset"}` instead of 201.
6. Independent database inspection confirms no rule/assets/audit changes and no
   sequence consumption from the failed creation.

Root cause in canonical source:

- `handleUpsPdus` resolves a valid `CanonicalHousingState` but passes no ZoneID
  or resolved CanonicalZone to `reserveManagedAsset`.
- `ResolveCanonicalNomenclature`'s CANONICAL_ZONE branch resolves only ZoneID
  (or the server's resolved Zone object); it does not derive Zone from placement.
- `ResolveCanonicalZone` rejects the empty ZoneID as `invalid_physical_scope`.
- The error is not mapped to a specialized response and becomes HTTP 500.

This is not a reason to accept client-supplied physical codes or bypass scope.
The existing canonical location already provides the physical relationship.
No schema defect or need for Migration 040 has been demonstrated. Product
correction requires separate authorization, followed by full B2d continuation.

## Twelve-preset readiness

| Preset | B2d E2E | B3 ready |
|---|---|---|
| MDF | not executed | not certified |
| IDF | not executed | not certified |
| RACK | not executed | not certified |
| SWITCH | not executed | not certified |
| UPS | FAIL: operational HTTP issuance after successful acceptance/preview | NO |
| PDU | not executed | not certified |
| PATCH_PANEL | not executed | not certified |
| NODE | not executed | not certified |
| FIREWALL | not executed | not certified |
| SERVER | not executed | not certified |
| CCTV | not executed | not certified |
| AC_UNIT | not executed | not certified |

`B3_ACTIVATION_STRATEGY=BLOCKED`. No subset activation is recommended.

## Validation limits and remaining matrix

The defect stops certification. This document does not reuse prior HF1 test
results as proof that the larger B2d matrix passed.

- Go vet and build: PASS. Standard `go test ./...`: PASS **without database
  URLs**, so integration tests skip; this does not override the B2d failure.
- B2d PostgreSQL harness: FAIL (exit 1), reproduced operational defect.
- Initial harness-only errors (attempted change to immutable Branch code and
  premature pool closure before fixture cleanup) were corrected in tests only.
- B1/B2a/B2b/B2c/HF1 full PostgreSQL regressions: not rerun in this blocked gate.
- Post035/036/037/038 upgrade/data/identity/counter preservation matrix: pending.
- Two-tenant/four-branch adversarial and actor-spoof matrix: pending.
- 32x20 per-scope issuance stress, independent scopes and 100-iteration
  acceptance/customization races: pending; no stress PASS claimed.
- Eleven failure-injection points, ambiguous COMMIT reconciliation, global
  successor graph and historical actor deletion: pending.
- Exact pre-B2c and pre-B2a application rollback compatibility against post039:
  not executed; neither historical baseline is certified for activated V2.
- All remaining twelve-preset lossless/issuance/rollback cases: pending.

No commit, push or PR is authorized by a failed B2d result. Retain the failing
regression test and this evidence for the separately authorized correction.

## Authorized resume after HF1 — 2026-09-20

HF1 was approved locally. Its product correction and tests remain unchanged.
No UPS-specific routing, Migration 040, frontend or HTTP feature was added.
The original B2D-001 evidence above is historical, not the current UPS result.

The local PostgreSQL 16.14 harness was rerun twice. UPS baseline passed,
including two emissions (`UPS-TIJ-Z01-0001`, `UPS-TIJ-Z01-0002`), rollback
counter delta zero and cross-tenant/cross-branch Zone denials. Clean and second
bootstrap passed; ledger 31, zero preset rows before fixtures, exact fingerprint
`e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`.
The runtime validator returned APPROVED. RLS/FORCE remains as tabulated above;
audit protection remains its secure writer boundary, not table FORCE RLS.

New test `TestB2dOrderedPresetOperationalMatrix` uses exact version-1 policies
from the approved catalog, explicit runtime acceptance, PRESET provenance,
runtime preview, the actual generic asset POST handler inside authenticated
TenantTx, COMMIT for each of the first two emissions and ROLLBACK for the third.
MDF/IDF and Rack parents are created through that writer, not injected as
prebuilt assets. All fixture presets are confined to the disposable database.
HTTP middleware COMMIT coverage remains in the preserved UPS HF1 test; the
ordered test explicitly controls transactions to exercise rollback.

| Preset | Actual first code | Basic writer result |
|---|---|---|
| MDF | MDF-TIJ-Z01-001 | two emissions + rollback PASS |
| IDF | IDF-TIJ-Z01-001 | two emissions + rollback PASS |
| RACK | RK-TIJ-MDF-TIJ-Z01-001-001 | two emissions + rollback PASS |
| SWITCH | SW-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001 | two emissions + rollback PASS |
| UPS | UPS-TIJ-Z01-0001 | two emissions + rollback PASS |
| PDU | PDU-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001 | two emissions + rollback PASS |
| PATCH_PANEL | PP-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001 | two emissions + rollback PASS |
| NODE | ND-TIJ-Z01-0001 | two emissions + rollback PASS |
| FIREWALL | no emitted code | FAIL B2D-002 |
| SERVER | not executed | stopped |
| CCTV | not executed | stopped |
| AC_UNIT | not executed | stopped |

These basic results do not certify full E2E audit/stress completeness. For the
eight successful types preview equals each issued code, preview reserves no
sequence, and rollback preserves full rules/assets/audits snapshots and both
counter tables. Full adversarial/audit/global-graph matrices remain pending.

### B2D-002 — HIGH, operational creation blocker

FIREWALL: `CANONICAL_HOUSING`, `BRANCH`. Exact preset read and acceptance succeed.
Preview resolves the newly created Rack and returns
`FW-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001`.
The POST includes that same `housing_rack_id`, its Location, Zone and
`RACK_MOUNTED`. Actual result: HTTP 500, `database error creating asset`;
internal error `invalid_physical_scope`. Rollback leaves rules/assets/audits
and both counter tables unchanged.

Source cause: generic `createAsset` constructs `canonicalHousing` only for
RACK/PATCH_PANEL/SWITCH/PDU/UPS. FIREWALL bypasses this resolution. The naming
context copies HousingRackID only from `canonicalHousing`, so the resolver
receives an empty HousingRackID and `ResolveHousing` rejects it. Merely copying
the request ID would not establish persistence correctness: the INSERT also
derives mount mode and housing rack from `canonicalHousing`, otherwise NONE/NULL.
SERVER follows the same source branch, but its operational test was **not run**.
No product fix or migration is authorized by this finding. Migration 040 is
not demonstrated necessary. Separate write-path authorization is required.

### Stop decision and remaining work

Per stop-on-product-defect policy, later presets and counter/acceptance stress
were not run. No 32x20 or 100-iteration metrics are claimed. The four staged
upgrade fixtures, full two-tenant/four-branch and actor matrices, overload
injection rerun, failure-injection matrix, ambiguous COMMIT reconciliation,
legacy and historical application rollback matrix remain unexecuted in this
resume. Prior HF1 regression evidence is preserved, not relabeled as rerun.
Network ambiguity was not simulated. No historical application is certified
safe for activated V2. All twelve B3 readiness decisions remain uncertified;
`B3_ACTIVATION_STRATEGY=BLOCKED`, with no subset recommendation.

Evidence: `/tmp/skia-b2d-resume-baseline.log` (PASS) and
`/tmp/skia-b2d-resume-matrix.log` (exit 1, B2D-002). Standard Go tests without DB
URLs pass but skip integration; they do not override this PostgreSQL failure.
No commit, push, PR, VPS, production or deployment actions were performed.

## Second resume after approved HF2 — local integrated evidence

Base remains `7bc42600cb87494dccca50cba26f17352331ca9a`, branch
`phase/1.2f-b2d-integrated-validation`. HF1 and HF2 product changes are preserved;
this resume adds only tests, a reusable test-fixture option, harness and this
report. No migration, provisioning, runtime privilege or application correction
was made. Migration 040 remains absent. Publication is not authorized here.

### Twelve operational preset contracts

All twelve execute exact preset read, acceptance, provenance/audit verification,
runtime preview and the real generic asset POST, two committed issuances and a
third rolled-back issuance. Preview equals the committed identity. Preview and
rollback consume zero sequences. Zone means a registered Zone and its ancestry;
Distribution means MDF/IDF plus registered Location; Housing means the canonical
Rack with its Distribution/Location. Housing used for generation equals Housing
persisted on assets. No UPS/FIREWALL type special case was introduced.

| Type | Context / scope | Actual issuance 1 | Issuance 2 final sequence |
|---|---|---|---|
| MDF | CANONICAL_ZONE / BRANCH | MDF-TIJ-Z01-001 | 002 |
| IDF | CANONICAL_ZONE / BRANCH | IDF-TIJ-Z01-001 | 002 |
| RACK | CANONICAL_DISTRIBUTION / DISTRIBUTION | RK-TIJ-MDF-TIJ-Z01-001-001 | 002 |
| SWITCH | CANONICAL_HOUSING / BRANCH | SW-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001 | 0002 |
| UPS | CANONICAL_ZONE / BRANCH | UPS-TIJ-Z01-0001 | 0002 |
| PDU | CANONICAL_HOUSING / BRANCH | PDU-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001 | 0002 |
| PATCH_PANEL | CANONICAL_HOUSING / BRANCH | PP-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001 | 0002 |
| NODE | CANONICAL_ZONE / BRANCH | ND-TIJ-Z01-0001 | 0002 |
| FIREWALL | CANONICAL_HOUSING / BRANCH | FW-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001 | 0002 |
| SERVER | CANONICAL_HOUSING / BRANCH | SRV-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001 | 0002 |
| CCTV | CANONICAL_ZONE / BRANCH | CAM-TIJ-Z01-0001 | 0002 |
| AC_UNIT | CANONICAL_ZONE / BRANCH | AC-TIJ-Z01-0001 | 0002 |

### Bootstrap, stress and security

PostgreSQL 16.14 disposable containers only. Clean/second bootstrap and upgrades
from 035, 036, 037 and 038 pass. Each upgrade preserves fixture data, historical
identity and counters, has ledger 31 and exactly one 039, and produces
`e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`.
Pre-fixture production preset seed count is zero; test presets are disposable
and do not activate a production catalog.

For EACH BRANCH, PLACEMENT and DISTRIBUTION scope: 32 workers x 20 attempts =
640 attempted, 512 committed, 128 rolled back, zero failed, 512 unique sequences,
512 unique codes, counter 0 -> 512. Three independent fixture scopes also run
concurrently with those same individual metrics; these are separate tenants,
not a claim of shared-rule/different-placement contention.

Acceptance races execute 100 iterations each: initial, successor,
accept/customize, customize/customize, and same-operation customization/retry.
Every iteration checks its graph and audit/result binding. All 500 fixtures
remain until a global graph/audit scan (not an empty-database check): no cycles,
branching, version regression, cross-tenant/type lineage or multiple active rules.

Security executes four populated branches in two tenants against all four
physical targets, including Building/Floor/Zone/Distribution/MDF/IDF/Rack/Location
and counter visibility. Tenant-wide naming rules remain visible across their
tenant's branches. Supplied actor/tenant, client role claim, missing/wrong actor
GUC, inactive actor, removed membership and viewer are denied; admin and
super_admin succeed and dual role resolves super_admin. Canonical RLS/FORCE and
runtime validator pass. PUBLIC, explicit, inherited and ownership-based overload
EXECUTE are rejected; removal restores validator approval. Audit logs retain
their secure-function boundary, not fictitious table FORCE RLS.

### Failure, audit and legacy contracts

Eleven boundaries execute: preset read, authorization, lock, rule insertion,
predecessor deactivation, provenance (same atomic rule INSERT), audit, sequence,
asset INSERT, deferred Distribution COMMIT validation and pre-COMMIT rollback.
Snapshots/counters remain unchanged. No separate provenance write is invented.
Network-level ambiguous COMMIT simulation is NOT_AVAILABLE. Independent durable
reconciliation commits successfully, treats the outcome as unknown and retries
the same operation via a new connection: original result, no extra mutation/audit.

B2c/HF1 regressions additionally cover actor deletion preserving evidence,
issued/newer and issued/customization preservation, exact operation fingerprint
and result binding, and historical asset-to-rule identity. The 014 SERVER policy
shape and 033 MDF/IDF policy shape execute current runtime read/preview tests;
these fixtures do not claim to reapply historical migrations on a current DB.
LEGACY_UNATTRIBUTED remains unchanged; current GET succeeds and POST/PUT are 409.
Inactive and issued compatibility is covered by the B2c PostgreSQL matrix.

### Historical application rollback is restricted

Both exact archives `9dacf5ee2db1ae6e0d48a7f5765d1de57de343ef` and
`82deb8f38e5edf74ce1163d9dc179fd456214d37` start with the restricted runtime
security gate against post-039 and respond HTTP 200 on health. Naming GET is
200; V1 reader completes. Their legacy POST is 201 and valid legacy PUT is 200
(the test transactions are rolled back). Therefore historical write rollback
does NOT preserve the current single-mutation-authority boundary. Neither build
is certified generically SAFE or for activated V2 authority. These are probes
of archived builds, not a current-product regression or a production rollback.
Both archives also accept a V2 Housing-shaped POST with HTTP 201 but persist
LEGACY_INTERNAL_AREA / include_housing=false. This is explicit evidence against
using those historical mutation routes for activated V2, not a successful V2
compatibility claim. Evidence: `-historical-v2.log` under the same log prefix.

### Evidence and completion boundary

Local logs: `/tmp/skia-b2d-second-basic.log`, `-upgrades-v4.log`,
`-independent.log`, `-global-stress.log`, `-audit-stress.log`,
`-four-populated.log`, `-failures.log`, `-legacy-final.log`,
`-historical-final.log`, `-b1.log`, `-b2b.log`, `-b2c.log`, `-binding.log`.
All suffixes use the `/tmp/skia-b2d-second` prefix. Tests/harness are versionable;
logs are local evidence, not committed artifacts. Full Go tests without URLs
skip PostgreSQL tests; the separate container runs provide integration evidence.

Final local decision: **PASS_LOCAL** for the current candidate. The corrected
500-iteration audit/graph run exits 0. B1/B2a/B2b/B2c, operation-binding,
HF1/HF2, bootstrap/upgrade and the integrated matrices pass. Full `go test`,
`go test -race`, `go vet`, `go build`, `git diff --check` and shell syntax pass;
no new current-build regression was found. Historical rollback restrictions
above remain explicit and are not waived by this result.

All twelve types are locally B3_READY; activation strategy is ALL_12, not a
subset. This is readiness for a separate publication/definition decision, not
authorization to publish, seed or activate B3. Migration 040 is not required.
No B3 seed, HTTP/UI work, commit, push, PR, VPS or deployment was performed.

Harness accounting: the first strengthened audit-stress assertion failed because
it compared a PRESERVED_CONFLICT event's requested newer preset with the retained
rule's older source preset. The product intentionally preserves the rule and
audits the requested preset. The test now checks that distinction explicitly;
`-audit-stress.log` retains the failed assertion evidence, and the corrected
full rerun is `-audit-stress-final.log`. No product change was used to pass it.

This resume touches ten test/documentation/harness paths: the reusable
`backend/canonical_housing_integration_test.go` fixture, preset matrix, four new
B2d tests (stress/security/failures/legacy), two B2d shell harnesses, the archived
application test template, and this report. Cumulative candidate scope is 22
paths including preserved HF1/HF2. The 13 historical Phase 1.2D untracked files
are separate and untouched. Index remains empty; HEAD remains the authorized base.
