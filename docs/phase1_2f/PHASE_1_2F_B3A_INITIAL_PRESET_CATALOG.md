# Phase 1.2F-B3a — Initial V2 catalog implementation evidence

## Authority and scope

Base: `ab1e730e12807c57f19a14dfefbefca0210522c2`.
[Active specification](../phases/active/PHASE_1_2F_B3A_INITIAL_PRESET_CATALOG.md).
[Canonical matrix](B3_DEFINITION_CATALOG_CANONICAL.json) is a byte-identical copy
of the explicitly ratified external artifact, including final LF:
`2c32e4b53c3969e310d70feb2e6d56e6c54dd71d73c4b9f7c83b5863219cad45`.

Migration 040 SHA-256:
`773811a472b08eaa44c114bb7af00b4479c27c3fd4242d726bc355c554a69bd6`.

The embedded JSON is checked against the versioned bytes. Database reconstruction
uses the specified ordered 21-field JSON arrays, compact serialization and final LF;
the actual seeded rows independently produce the approved SHA-256. UUIDs and times
are intentionally excluded. Five NULL metadata fields stay NULL for all 12 rows.

Migration is one atomic DO statement, also inside the canonical runner's transaction
with its ledger insertion. SHARE ROW EXCLUSIVE serializes publication. All overlapping
code/type-version rows are compared before writes, with JSON null-safe equality;
every resulting approved row is rechecked. No updates, deletes or reactivation.
Exact existing rows are retained; conflicts abort. No persistent schema objects,
privileges, functions or sequence grants are added.

Global publication is not tenant acceptance. System recommendations become eligible
for the existing secure V2 readers and explicit B2c acceptance; no tenant authority
is created by the migration.

## Validation evidence

Local PostgreSQL 16.14 only. Commands:

- `bash ops/phase010/test_nomenclature_v2_initial_preset_catalog.sh`: PASS,
  including Go integration tests with race detector.
- B1 `test_nomenclature_v2_foundation.sh`: PASS.
- B2b `test_nomenclature_v2_enforcement_audit_writer.sh`: PASS.
- B2c `test_nomenclature_v2_acceptance_domain.sh`: PASS.
- B2c-HF1 `test_nomenclature_operation_binding.sh`: PASS.
- B2d `test_nomenclature_b2d.sh` with standard extended stress/security:
  PASS. Failure/reconciliation and legacy suites run separately: PASS.
- `test_nomenclature_b2d_upgrades.sh`: PASS for post-035/036/037/038.
- Full `go test ./...`, `go test -race ./...`, `go vet ./...`,
  `go build` with output outside repository: PASS. Tests requiring dedicated
  URLs skip in the unconfigured full run and execute in their named DB harnesses.
- B2a canonical builder/router tests run in the full suite; actual branch,
  placement and distribution PostgreSQL counter stress runs in B2d.
- Runner `test_database_bootstrap_contracts.sh`: PASS, clean ledger 32,
  populated FORCE-RLS upgrade, visibility equivalence, exact count preservation,
  idempotency and fail-closed rejection.

B3a explicitly proves:

- Fresh and second bootstrap: ledger 32, 040 once, twelve rows.
- Five independent conflicts (code, type/version, active, empty description,
  empty label) abort without partial rows; conflicting fixtures unchanged.
- Sixth-insert injected failure rolls back the entire statement.
- Exact existing row no-op and unchanged catalog hash.
- V1 excludes twelve; V2 returns twelve; exact active/inactive/not-found.
- Runtime direct preset SELECT denied, runtime NOBYPASSRLS; canonical runtime
  validator passes. Structural update of an actual published row is rejected.
- Actual seeded twelve B2c acceptances: exact field mapping, six-key actor
  snapshot, provenance and bound atomic audit.
- Twelve prescribed first previews, two committed issuances and one rollback
  for each type. Zone/Distribution/Housing are all exercised with DB enforcement.
- A populated post-039 scenario starts with one canonical MDF fixture,
  accepted/issued MDFs and nonempty physical hierarchy/audit/branch counters;
  legacy/custom/inactive rules, accepted/derived provenance and a placement counter
  are added. Migration publishes the remaining eleven rows without changing any
  public table except the global catalog. Full-row snapshots include all tenant
  tables, not just counts. Canonical bootstrap then records 040 once.
- Disposable SERVER deactivation hides it from the active reader, exact reader
  returns FOUND_INACTIVE, new acceptance fails, and existing operational tenant
  rules/assets/provenance/audit remain byte-equivalent. Test restores active state.
- Bootstrap checksum tampering is rejected.

Schema fingerprint is measured, not inferred:
`e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`.
It is unchanged because 040 is data-only. Ledger expectation becomes 32.

## Harness compatibility and observed corrections

The bootstrap physical-model validator previously inserted SERVER v1 as a temporary
uniqueness fixture. Publication correctly caused that insert to conflict.
The rollback-only fixture now uses BACKBONE, outside the authorized catalog;
its uniqueness assertions are unchanged and it never persists the fixture.

Historical B1/B2b/B2c/HF1/B2d scripts arrange their own recommendations. Their disposable
manifest is explicitly pinned at 039, preserving their original prepublication
contracts. B3a independently covers fresh/current publication and actual seeded
readers, acceptance, issuance and upgrade. Historical tests are not represented as
post-seed tests.

Two exploratory combined B2d invocations failed due to repeated UPS fixtures and
shared SERVER test versions. Final runs isolate the stress/security suite from
failure/legacy fixtures; all final runs pass. No application fix was made for those
test scheduling collisions. The first local Go command hit the sandbox's default
cache restriction; subsequent full runs use a writable local GOCACHE.

## Release and rollback boundary

Minimum supported V2 application:
`ab1e730e12807c57f19a14dfefbefca0210522c2`.
Deployed release alignment remains a separate required gate; not inspected here.
Historical pre-B2c/pre-B2a reads are only partially compatible; V2 writes are not.
Rollback to either after tenant V2 acceptance is prohibited.

Failed 040 rolls back atomically. After committed publication, catalog deactivation
or any forward remediation requires separate authorization. Never delete referenced
presets, accepted rules, issued identities, provenance or audit. Deactivation does
not revoke an already accepted tenant rule.

No application behavior, HTTP, frontend, Migration 041, grants, RLS, VPS or deployment
changes. No seed executed outside disposable local databases. Thirteen historical
untracked documents remain untouched. B3b/B3c are not started. Publication is allowed
only after all validations pass, and merge remains unauthorized.
