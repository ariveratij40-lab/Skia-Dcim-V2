# Phase 1.2F — bounded post-035 to post-039 upgrade

## Authority

Authorized implementation base: `af78ba0c14374e5d66aa33f0f4dbf8c98eb4959a`.
Branch: `phase/1.2f-production-upgrade-036-039`.
Application A: `0c01d79ae714465ab95aac896e4100d0be893185`.
This independent prerequisite does not redefine the B3b specification.
Only local tooling and disposable PostgreSQL 16.14 tests are authorized.
No VPS, production checkpoint, deployment, production migration, acceptance,
Migration 041, product code or historical untracked-document modification.
Commit/push/PR are conditional on all required tests passing; no merge.

## Exact boundary

Source: canonical post-035, ledger 27, empty catalog, raw schema fingerprint
`8712fcae88f98f7c75605772ab88cbeb52d06e022c07a8782b045e33caec0c10`.
Target: post-039/pre-040, ledger 31, empty catalog, raw schema fingerprint
`e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`.
The pending execution set is exactly 036,037,038,039. A versioned manifest
must pin the canonical prefix and these immutable SQL/checksum pairs. SQL is
not copied/forked; 040 is not an executable input and must remain unapplied.
Intermediate raw hashes must be measured in the disposable rehearsal before
they become runner authority. The normal bootstrap runner is not bounded.

## Execution and quiescence

LOCKSTEP_REQUIRED: old API write compatibility is NOT_PROVEN_DO_NOT_EXPOSE.
Future production execution must separately authorize writer isolation/drain,
checkpoint, bounded upgrade, validation, then enabling exact Application A.
HTTP health and an operator boolean alone do not establish quiescence.
Evidence must bind database/cluster identity, observation time, external writer
isolation control, no old API writers, drained in-flight write transactions,
and executor exclusivity. No production shutdown commands are introduced here.
Hold a database execution lock from prechecks through final validation; reject
a competing bounded executor. Uncooperative historical executors must also be
excluded by the operational isolation control: advisory locks alone cannot
constrain them. Execute each SQL and ledger insertion in one transaction as
restricted skia_migrator; never combine all four into one implicit transaction.

## Checkpoint and preservation

Create a new disposable post-035 checkpoint with identity, complete ledger and
checksums, schema, catalog, security, field-level baseline, custom dump and SHA256.
Use reviewed B3b recovery: precreate canonical extensions, normal restore, exact
CONNECT ACL provisioning, structure/security/data verification. No old pre-035
checkpoint substitution, owner rewriting, TOC filtering or error suppression.
The subsequent explicit restore clarification authorizes the B3b restore-only
exception: raw differences must be fully classified as the narrowly governed
PostgreSQL expression reserialization; structure, security, ledger, catalog and
data must match exactly. Raw equality alone is insufficient. LIVE source and
intermediate/target states still require exact raw fingerprints. Restored raw
hashes must never be used as the sole authority for live prefix fingerprints.

Preserve existing IDs, tenant/branch ownership, codes, physical relationships,
rule lineage, counter values and audit history. Compare old fields separately
from allowed new columns. 036 may classify legacy rules/provenance and derive
sequence scope; 037 may derive asset sequence scope/location metadata. Every
other data delta fails. No preset rows may be introduced.

## Failure, resume and validation

Failure after a committed migration leaves a prefix: 27,28,29,30 or31, never32.
Record actual ledger/schema/security before any decision. No automatic restore,
repair or blind retry. Resume only an exact recognized checksum/fingerprint
prefix under new authorization, without replaying committed SQL.
Required tests: each migration boundary, during/between failures, independently
constructed resume states, competing runners, missing quiescence, incorrect
ledger/hash/catalog/manifest and absence of preflight mutation; two recovery
targets; data preservation; restricted runtime privileges and restored RLS/FORCE;
Application A health and guarded/read infrastructure/naming capability; B3b,
B3a, B2d, bootstrap, full Go tests/vet/build, shell syntax and diff checks.
Intermediate/post-039 verification must retain empty catalog and zero040.

Read-only post039 validator requires exact ledger31/checksums/raw hash, empty
catalog, V1/V2/exact readers, audit routines, exact EXECUTE allowlist, denied
direct preset/audit access, NOBYPASSRLS, preservation and Application A evidence.
API rebuild is required unless independently attested exact compatible image
exists. WEB needs no source-driven rebuild; deployed provenance is separate.
After a separately authorized successful production upgrade, repeat B3b R2.
This tooling cannot authorize B3b R3 or production execution.

## Initial evidence and clarification chronology

The original state was RESTORE_CONTRACT_CLARIFIED_IMPLEMENTATION_PENDING.
Initial disposable PostgreSQL 16.14 schema-only prerequisite
rehearsal bootstrapped the exact historical post-035 source at
`658cfa35becaf75f851a27d44180fef20ea0f2ce`. At that time no representative tenant
fixture or 036-039 execution had been attempted.

Source raw hash matched the required `8712fcae...`; a new custom dump restored
using unmodified B3b precreation/restore/ACL code, pg_restore exit0/stderr empty.
Restored ledger/catalog were 27/0. However restored raw SHA256 was
`b49732a838698c3064527f46c598698c0a9bcfef822c10595240e8a600a0bd0f`.
Source and restored structural hashes both were
`7d6bfb8e958bc13700c2bbcd11fce71bcaa1489cc1e01accaddba3b87f5805be`.
The existing narrowly scoped B3b expression normalization made the raw dumps
equal; the original exact raw comparison remains FAIL, not relabeled PASS.
Observed differences include varchar-array casts versus per-element text casts
in CHECK constraints. No migration, schema or owner repair was performed.

Local evidence: `/tmp/skia-upgrade-recovery.DNtT1B/result.json`, `raw.diff`,
and `/tmp/skia-upgrade-recovery-preflight.log`. The disposable container was
removed by its scoped harness cleanup; the local checkpoint/evidence remain.
The subsequent user clarification explicitly approves the B3b restore-only
equivalence exception for this upgrade, retaining exact live gates. The original
failed exact-raw test above remains historical evidence, not rewritten as PASS.
Publication requires the complete final matrix below, not that initial test.

## Implemented interface and independently measured live prefixes

`ops/phase010/upgrade_036_039.json` lists the exact 31-path canonical prefix,
checksums and these independently measured PostgreSQL 16.14 LIVE raw hashes:

| Ledger | Last migration | Raw SHA256 |
| --- | --- | --- |
| 27 | 035 | `8712fcae88f98f7c75605772ab88cbeb52d06e022c07a8782b045e33caec0c10` |
| 28 | 036 | `e2e448d243a9c12d067a0fa3bfecb37177a3caedb5f55a2a38ecfe1c37382329` |
| 29 | 037 | `526264e8a52816a1110df02843fa2e806a1ca8d2634482ad1337757ca9a37ba1` |
| 30 | 038 | `c36963ffc829ec1c20cb1e07c3279d2568ba6b5900f4e3697538c899c59cb4f9` |
| 31 | 039 | `e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6` |

The manifest also pins the complete B3b structural/security hash for each
prefix. Measurements originated in a clean historical canonical bootstrap,
then immutable 036-039 SQL, not in a restored source. Separate live clones
reconfirm every prefix; recovery targets remain recovery evidence only.

`ops/phase010/upgrade_036_039.py` exposes four actions with explicit local
`--container` and `--database`: `observe`, `checkpoint`, `upgrade`, `validate`.
It requires the Git object for Application A to verify canonical SQL bytes.
`checkpoint` additionally requires `--quiescence`, a new `--dump` path and two
new `--restore-targets`. It never overwrites an archive or existing target.
`upgrade` requires JSON `--quiescence`, `--baseline`, `--checkpoint` evidence.
`validate` requires `--baseline` and `--application-evidence` and is read-only.
The JSON evidence is operator-controlled evidence, not cryptographic remote
attestation; approvals and custody remain external prerequisites.

One persistent psql backend owns advisory lock 3612039 from precheck through
validation. All migration SQL runs with transaction-local `skia_migrator`.
Checksums are checked again immediately before executing the same bytes.
Each migration plus its ledger insert commits atomically. No SQL discovery or
general bootstrap invocation can append 040. On failure the runner reports
the committed ledger boundary; it does not restore, repair or continue.

Quiescence evidence binds cluster identifier/database OID/name/version and a
timestamp no older than 600 seconds, plus requested/verified booleans,
old-writer absence, drained transactions and an external isolation reference.
The runner additionally rejects any other client session at every boundary.
This cannot prevent a privileged uncooperative client from connecting later;
future execution must independently enforce writer/executor isolation. It is
not permissible to manufacture a reference instead of establishing isolation.

The field-level baseline hashes every public business table, excluding only
ledger/catalog (separately checked) and exactly the new 036 naming-rule fields
and 037 asset sequence-scope fields enumerated in `ADDITIONS`. Fixtures assert
legacy classification and scope backfill separately. Existing field values,
row counts, IDs, codes, counters and audit history must remain identical.

Restore raw classification uses only existing B3b normalization: the observed
varchar-array/per-element text-cast representation difference. Any remaining
text difference is unclassified and rejected. Complete structural comparison
includes owners, roles/memberships, database ACL, extension membership/owners,
EXECUTE, function bodies/security/search paths, table/schema/sequence grants,
RLS/FORCE/policies, constraints/indexes/triggers/views and sequences.
No fields were removed from that reviewed verifier to obtain equality.

Exact observed raw-diff object inventory (only the array-cast serialization):

- `asset_logs_event_type_check`, `asset_relationships_relationship_type_check`;
- `asset_types_asset_class_check`, `asset_types_placement_policy_check`;
- `assets_inventory_status_check`, `assets_mount_mode_check`, `assets_status_check`;
- `buildings_status_check`, `floors_status_check`, `zones_status_check`;
- `catalogs_manufacturers_status_check`, `catalogs_models_status_check`,
  `catalogs_providers_provider_type_check`, `catalogs_providers_status_check`;
- `internal_areas_status_check`;
- `inventory_import_rows.check_status`, `inventory_import_rows_commit_hash_required`,
  `inventory_imports.check_status`;
- `locations_mdf_idf_physical_identity_format`, `locations_placement_type_check`,
  `locations_status_check`, `managed_location_requires_physical_authority`;
- `mdf_idf_type_check`, `racks_housing_type_check`;
- `technical_rooms_room_type_check`, `technical_rooms_status_check`;
- predicate serialization of `uq_locations_mdf_idf_physical_identity`.

In each, `(ARRAY['x'::character varying, ...])::text[]` becomes
`ARRAY[('x'::character varying)::text, ...]`; operands, literals, order,
operators and all other definition text remain identical after that restricted
classification. The index is not structurally changed; only the same cast
serialization in its predicate differs. Unclassified differences: zero.

`RESTORE_RAW_FINGERPRINT_GATE=DIAGNOSTIC_ONLY`;
`LIVE_RAW_FINGERPRINT_GATE=EXACT_REQUIRED`.
Raw-equal restore with structural/security drift also fails. Two restores
must pass before the checkpoint is marked recoverable. Local recovery targets
and evidence are retained until the disposable container's scoped cleanup.

Application evidence must identify exact Application A, immutable image ID,
database identity, health and authenticated reads, with timestamp <=600s.
Future staging must verify a Git archive and immutable image provenance before
separately authorized activation. The local test uses the previously built
Application A image, not a new production build. Old API remains
`NOT_PROVEN_DO_NOT_EXPOSE`. No V2 acceptance occurs in this upgrade fixture.

## Validation record

The harness creates a disposable PostgreSQL 16.14 source with tenant, user,
session, physical hierarchy, naming rule, issued asset, counter and audit row.
It tests all five prefixes and idempotent resume, per-migration rollback,
competing actual runners, live-client/quiescence denial, malformed manifest,
ledger/hash/catalog rejection and classified versus unknown restore drift.
Authenticated Application A GETs cover auth, Site/Zone, MDF/IDF, Rack,
assets/housing, placement and naming rules. No product mutation is exercised.

Earlier harness-only JSON boolean parse failure is not a migration
failure: corrected assertions use `to_jsonb` without changing migration SQL.
Regression B3a/B3b catalog tests use separate disposable databases; 040 remains
unreachable in the bounded upgrade and its prefix/checkpoint databases.

Final local validation: PASS (2026-09-20 America/Tijuana).
`ACTIVE_SPEC_STATUS=VALID`, `ACTIVE_SPEC_CONTRACT_DRIFT=NONE`.

- Full upgrade matrix exit 0: `/tmp/skia-upgrade-final-pass.log`; complete
  checkpoint, prefix and Application A evidence: `/tmp/skia-upgrade-matrix.ONn2Fy`.
- Live 27→31 and all independently constructed resume/idempotency prefixes
  PASS; failure injection during 036,037,038,039 rolled back SQL+ledger.
  Post039 validation failure remained at31. No040; catalog0 throughout.
- Two actual runners: exactly one owner. Old open transaction, missing
  quiescence, bad ledger/hash/checksum/catalog and extra/missing manifest
  entries rejected without further writes. Data preservation PASS.
- Both restores PASS_WITH_CLASSIFIED_RAW_RESERIALIZATION, raw match NO,
  structural/security match YES, unclassified raw differences0. Negative raw,
  structure, security and raw-equal/structure-different cases rejected.
- Governed checkpoint action PASS. Auth guards401 and authenticated reads200
  for auth/Site/Zone/MDF-IDF/Rack/assets/placement/naming PASS; API health PASS,
  no SQL/missing-column errors. Read-only post039 validator PASS.
- Harness fixture corrections: initial403 correctly exposed missing local
  user_tenants/user_branches assignments; initial422 correctly exposed absent
  Site/Floor query parameters. Only test inputs were corrected, no application
  behavior, privilege or migration change.
- B3b exit0: `/tmp/upgrade-b3b-regression.log`; B3a exit0:
  `/tmp/upgrade-b3a-regression.log`; extended B2d exit0:
  `/tmp/upgrade-b2d-regression.log`; clean/upgrade bootstrap contracts exit0:
  `/tmp/upgrade-bootstrap-regression.log`.
- Uncached full Go test, go vet, go build PASS. Python AST and bash syntax PASS;
  diff whitespace check PASS. No new regressions. The initial default Go cache
  sandbox denial was resolved using the existing disposable `/tmp` cache.
- Migrations036–040 byte-identical; no041; no product/frontend/backend change.
  Thirteen historical untracked documents retain their original SHA256 values.

Recovery is verified locally, not production-certified. READY_FOR_PRODUCTION_UPGRADE=NO.
External isolation, source identity, checkpoint freshness, image provenance and
production authorization remain mandatory future gates. No VPS, production,
production checkpoint/migration, deployment or merge was performed.
