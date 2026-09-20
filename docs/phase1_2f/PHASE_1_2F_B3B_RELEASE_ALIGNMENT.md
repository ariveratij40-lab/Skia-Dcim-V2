# B3b release alignment runbook and evidence

## Authority / packages

This runbook implements the [active specification](../phases/active/PHASE_1_2F_B3B_RELEASE_ALIGNMENT.md).
Application release A: `0c01d79ae714465ab95aac896e4100d0be893185`.
Tooling B: independently identified B3b commit, restricted to the six paths in
`TOOL_PATHS` in `ops/phase010/b3b_release.py`, including the catalog-only structural
query `ops/phase010/b3b_structure.sql`. Do not inject B into A.
No VPS/deployed execution is authorized by this document or tool success.
The current gate authorizes only disposable rehearsal and publication for review.

Archive A using `git archive <application-sha>` into a new empty application
directory. Archive B using `git archive <tooling-sha> <six-exact-paths>` into a
separate empty directory. Never copy a worktree with secrets or runtime data.
`python3 <tooling>/ops/phase010/b3b_release.py r1 --repo <trusted-git-repository>
--application <A> --tooling <B> --tooling-sha <exact-commit>` compares every
file byte, executable bit and symlink against Git, rejects omissions/extras,
and outputs hashes including runner, manifest, catalog and tooling. R1A does not
require the B3b specification; R1B does. Verification requires trusted Git objects,
not a self-declared archive filename or image tag.

Before committing, the rehearsal uses an explicitly candidate-only Git object
store populated with only the six tooling files, not a repository commit.
This is provisional validation, not published provenance. After the one real
commit, repeat R1 with its actual SHA before publication.

## Inputs and evidence handling

Python 3 standard library, Git, Docker CLI; container PostgreSQL tools must be
16.14. All DB tooling requires explicit `--container`, `--database`, `--user`.
No default production target. Use existing local container authentication;
no passwords/DSNs in arguments or evidence. Administrative superuser visibility
is required for audit snapshots, not granted by this tool. Runtime remains
restricted. Every SQL capture is repeatable-read/read-only with bounded timeout.
Evidence contains counts/hashes and catalog metadata, not tenant row values.
Store JSON outputs/checkpoints in a private operator evidence directory outside
both packages. Evidence files must be protected from edits and held with their
hashes and operator/run identity. JSON evidence is not a signed authorization.

## R1–R7

1. **R1**: verify both packages. Application source supplies build trees,
   migration, manifest and unchanged release runner. B supplies preflight,
   checkpoint procedure, guard and post-publication validation. Record all
   per-file hashes from R1. Versioned API delta is nonempty vs c5b905; WEB tree
   identical vs 658cfa35. DB delta is 036–040. None proves deployed state.
2. **R2**: `snapshot --application <A>` captures DB identity/version, complete
   ledger/checksums/pending list, schema fingerprint, catalog classifier,
   runtime/RLS/ACL security state and all public tenant tables. Only global
   catalog and migration ledger are excluded from the full-content baseline.
   Query hash visibility is administrative, never tenant-filtered. Repeat if
   concurrent catalog/schema changes are possible: pg_dump is a separate read
   snapshot. No DDL/DML is performed. `components --repo <git> --api-container
   <api> --web-container <web> --api-sha <sha> --web-sha <sha>` inspects images,
   exact image IDs/digests and OCI build revision labels, health and restart
   counts; no environment/secrets are emitted. A tag alone is insufficient.
   If existing images lack verifiable build labels, STOP for separately
   authorized provenance/build alignment; do not manufacture labels.
3. **R3**: align compatible API under separate deployment authorization BEFORE
   R5. Minimum API ab1e730 or compatible descendant. Ancestry establishes the
   minimum; separate review still must certify descendants did not regress.
   WEB_REBUILD_REQUIRED_BY_CODE_DELTA=NO, but image/config provenance and health
   require verification. Re-run component observation after alignment.
4. **R4**: `stability --interval 2 --application <A>` compares two complete
   captures. UNSTABLE blocks. STABLE_OBSERVED is not guaranteed global quiescence;
   stronger freeze requires separate authorization. `checkpoint --dump <new-path>
   --application <A>` creates a new private custom-format dump, list-checks it,
   records timestamp/identity/ledger/schema/catalog/baseline and hash, and checks
   no observed concurrent delta. Restore manually in a NEW isolated disposable
   DB with matching roles; never restore into source. Capture restored snapshot,
   then `verify-restore --checkpoint <checkpoint.json> --after <restored.json>`.
   Exact ledger/structural-schema/security/catalog/baseline must match. Raw
   restored fingerprint is diagnostic only after classified expression
   reserialization and independent structural equality. Live R2/R6 raw gates
   remain unchanged. Retain the checkpoint and
   its verified JSON; file existence/listability alone cannot pass.
5. **R5**: immediately re-capture R2 and component evidence. `guard --before
   <fresh.json> --stability <stable.json> --checkpoint <verified.json>
   --components <components.json> --r1 <r1.json>` requires fresh evidence (300s),
   same source baseline/identity, verified checkpoint bytes, compatible healthy
   API/WEB, ledger31, exact checksum chain and only pending040, EMPTY catalog.
   This validates preconditions ONLY: it never invokes a runner. Separate
   execution authorization must recheck state immediately before invoking the
   unchanged A `ops/phase011/run_database_bootstrap.sh` with upgrade contract.
   That runner executes all manifest entries twice, plus provisioning/validators;
   it is NOT a 040-only script. Missing036–039 means STOP/separate upgrade gate.
   Record RELEASE_RUNNER_SHA256 separately from B3B_R5_GUARD_SHA256. Do not
   replace the release runner or overlay B on its `source` directory.
6. **R6**: `r6 --before <pre040.json> --application <A>` captures post-state,
   requires ledger32,040once, exact12/hash/schema and identical all-table tenant
   baseline/security. Under runtime role, checks V1=0,V2=12,exact active=12.
   No acceptance writer is called. Already-applied exact state means do not
   reexecute; an invalid already-applied state is INCIDENT.
7. **R7**: separately authorized GET-only API health/WEB/auth surface and
   physical/MDF-IDF/Rack/Housing reads. Record URL without credentials, status,
   timestamp; protected401 is AUTH_GUARD_PASS, not proof of authenticated data
   correctness. Compare restart counts over observation interval and read bounded
   redacted application logs for missing-column/rack_id/housing_rack_id/SQL/500.
   Do not emit secret-containing log lines. Absent V2 HTTP/UI is expected:
   BACKEND_AVAILABLE_NO_FRONTEND_NO_V2_HTTP_ROUTE. Catalog backend capability
   comes from R6. No automated acceptance smoke; R8 is separate authorization.

## Descriptor contract

Record independently (no API=WEB SHA assumption): APPLICATION_RELEASE_SHA,
B3B_TOOLING_SHA, API_SOURCE_SHA/API_IMAGE/API_IMAGE_DIGEST or exact IMAGE_ID,
WEB_SOURCE_SHA/WEB_IMAGE/WEB_IMAGE_DIGEST or exact IMAGE_ID,
MIGRATION_SOURCE_SHA/MIGRATION_040_SHA256,
RELEASE_RUNNER_SOURCE_SHA/RELEASE_RUNNER_SHA256,
B3B_R5_GUARD_SOURCE_SHA/B3B_R5_GUARD_SHA256,
B3B_R6_VALIDATOR_SOURCE_SHA/B3B_R6_VALIDATOR_SHA256,
DATABASE_LEDGER/DATABASE_SCHEMA_FINGERPRINT/DATABASE_CATALOG_HASH.
Guard and R6 share one hashed Python executable. Do not modify RELEASE.env now.
Images without repository digests must retain exact local content-addressed IDs
plus immutable build evidence. Release descriptor must agree with observations;
configuration must be reviewed by names/hashes, never secret values in reports.

## Failure matrix and rollback

SHA/checksum drift: STOP. Unexpected ledger/checksum/pending migration: STOP.
Missing036–039: PRE040_CHAIN_INCOMPLETE, separate upgrade phase.
Catalog EMPTY: candidate, not permission. Exact12 without040: provenance
investigation. Partial/conflicting/additional: BLOCK, no repairs.
Invalid checkpoint, unstable baseline, incompatible API: STOP.
Runner nonzero: inspect actual ledger/schema/catalog read-only BEFORE retry;
the migration might already be committed. Catalog hash/tenant/security drift
after040: INCIDENT, no acceptance. No automatic cleanup/restore/blind retry.

STATE_0 (040 absent): preserve existing recovery artifacts; evaluate actual
application/schema compatibility, not a blanket historical rollback claim.
STATE_1 (published/no accepted V2): DB forward-only; historical write compatibility
is not safe by implication. STATE_2 (acceptedV2): minimum rollback app ab1e730 or
proven compatible descendant; pre-B2c/pre-B2a prohibited. Never remove or deactivate
referenced preset history as rollback. No restore is authorized by this runbook.

## Rehearsal / evidence

`bash ops/phase010/test_b3b_release.sh` uses only a uniquely named disposable
PostgreSQL16.14 container. Application archive is hashed before/after. Tooling
candidate lives in a separate package/object store. Representative pre039 DB,
checkpoint/isolated restore, guarded canonical bootstrap040 and R6 are exercised.
R3/R7 observations use explicit simulation fixtures; they do not claim an actual
deployed service passed. Live R7 remains a future authorized operator gate.
No B3c product gap is repaired here. Validation results must be recorded before
publication; no declaration of production readiness is made.

### Local validation 2026-09-20 — BLOCKED, not publishable

Base confirmed by fetch: 0c01d79ae714465ab95aac896e4100d0be893185.
The initial disposable fixture incorrectly referenced a nonexistent tenants.slug;
the harness was corrected to use an explicit fixture UUID. No application changed.
Pure catalog/guard/read-only-envelope tests pass. B3a PostgreSQL regression passes;
B2d ordered/UPS, counter stress, acceptance stress and security matrix pass.
Full Go test, vet and build pass. No backend/frontend/migration file changed.
Bootstrap contract regression also passes: clean empty guard, pre035 FORCE RLS
upgrade, post035 existing database, fingerprint, idempotency and fail-closed with
data. Shell syntax and whitespace checks pass, including the five new files.
The application archive was reverified against Git after the failed rehearsal:
tree/content evidence hash `7fd51683f6c4eefcfa327fdaa87c857e55e159f9c0e613196fd0636465b3f924`.
Versioned API runtime delta contains 15 paths; WEB delta contains zero paths.
All 13 historical untracked files retain their original SHA-256 values.

R4 restore verification remains FAIL-CLOSED. Repeated PostgreSQL16.14 custom
dump/restore produces:

- source raw schema hash:
  `e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`;
- restored raw schema hash:
  `f1a18efb5b080a6cf893218df7ec045b0c6384227bb1d4c1d45dd606326b3d82`;
- ledger31, exact ledger entries, catalog and all tenant-table baseline hashes
  remain identical.

Inspection found pg_dump re-deparses array casts after restore, including
managed_location_requires_physical_authority and partial unique indexes such as
uq_assets_nomenclature_location_scope_sequence and uq_locations_mdf_idf_physical_identity.
For example, array-level `::text[]` casts become element-level `::text` casts.
This observation is NOT a full semantic-equivalence certification. The required
raw fingerprint equality was not weakened or normalized, and no alternate hash
was adopted. The checkpoint is NOT marked verified. R5/R6/full R1–R7 rehearsal
are not reached; no publication or deployed operation is permitted.

The subsequent R4 clarification authorizes dual raw/structural fingerprints,
as described below. Remaining downstream tests and production observation remain
unverified, including actual component/health evidence and the full R5 runner
rehearsal. Current files are an uncommitted candidate, not approved tooling.

### R4 clarification execution — REAL_STRUCTURAL_DIFFERENCE

The complete normalized raw dump diff was inspected before structural hashing.
All observed changes are constant varchar-array to text-array cast
reserialization in CHECKs/index predicates. No function-body normalization is
permitted. The raw fingerprint contract remains unchanged in R2/R6/bootstrap.

Structural V1 emits explicitly typed array records from PostgreSQL catalogs,
sorted by UTF-8 canonical bytes, compact JSON plus LF. It includes schemas,
relations/columns/logical ordinals/types/defaults, constraints/FKs, indexes,
sequences/ownership, enum/domain types, views, routines/signatures/bodies/security,
triggers, policies/RLS/FORCE, owners/ACLs/effective runtime privileges, roles,
memberships/default privileges, extensions and database owner/ACL/locale.
Only the narrowly identified literal-array cast expression form is normalized;
routine bodies remain exact. Physical OIDs/storage and dropped-column slots are
not object identities. The isolated database name is represented as RESTORE_TARGET.
The structural verifier remains a candidate: the negative matrix is not certified.

The disposable comparison produced:

- SOURCE_STRUCTURAL_SCHEMA_HASH:
  `76eb7343a28b55544ff98004b7751dd6aeedd332b75a66aa5ff53e1d1f44a9c2`
- RESTORED_STRUCTURAL_SCHEMA_HASH:
  `a187df5ee23a81a38da4764482eee02ab62cefe86c3b35b73c0ae41beb570f7c`

Exact payload differences (all other emitted records matched):

1. Source explicit database CONNECT grant from skia_migrator to skia_runtime
   is absent in restored database.
2. Source explicit database CONNECT grant from skia_migrator to skia_onboarding
   is absent in restored database.
3. uuid-ossp extension owner is skia_migrator in source, postgres after restore.

These are real authority/privilege differences, not expression serialization.
The custom dump restored without CREATE DATABASE does not restore database ACLs;
the extension is created by the restore executor. Existing generic PUBLIC CONNECT
does not justify discarding explicit-grant preservation. No repair, owner change,
grant, suppression or alternate normalization was performed to force a pass.

RESTORE_STRUCTURAL_GATE=FAIL. Ledger31/checksums/catalog/baseline remain exact.
Security structural equality fails. Per explicit STOP instruction, negative
verifier mutation matrix and R5–R7 resume were not executed. No commit/push/PR.
Continuation needs an approved checkpoint/restore procedure preserving database
ACLs and extension ownership; do not weaken the structural comparison.

## HF3 authorized recovery completion — local evidence

The preceding HF1/HF2 failures remain historical, not reclassified. The ratified
matrix and superseding procedure are in `B3B_RECOVERY_SECURITY_AUTHORITY.md`.
Application release stays `0c01d79ae714465ab95aac896e4100d0be893185`.

Local PostgreSQL 16.14 recovery now precreates uuid-ossp under skia_migrator in a
new template0 target with explicit UTF8/en_US.utf8 locale/ctype and owner. Its ten
member functions naturally remain owned by skia_bootstrap. plpgsql is verified,
not repaired. Both normal pg_restore invocations exited 0 with empty stderr.
Only runtime/onboarding explicit CONNECT grants are reapplied transactionally.

Two independent restored DBs match source structural hash:
`06aabac1804fee98db60e8a5ed05faf23ccb73d7bab098f25e3f0f42f927be5f`.
The payload now also explicitly covers extension membership, with all previous
security fields retained. Historical hashes are not interchangeable with this
expanded payload or the canonical bootstrap-admin fixture. Raw source fingerprint
is unchanged; restored raw differences remain classified expression serialization.

Exact ledger/checksum/catalog/tenant-content/security equality, second ACL run
without delta, wrong/empty/malformed/injection-like target rejection, and thirteen
independent negative checks passed. Every transactional negative rolls back.
Wrong extension owner is produced by separate creation, never catalog edits.
`verify-restore` only sets restore_verified after two distinct target identities.
Checkpoint CLI requires exact Package B provenance and records its artifact hashes.

Run `B3B_RUNTIME_SMOKE=YES bash ops/phase010/test_b3b_release.sh` after building
local images `skia-hf3-api:0c01d79` and `skia-hf3-web:0c01d79` from the exact
application archive's backend/frontend Dockerfiles, labeled
`org.opencontainers.image.revision=0c01d79ae714465ab95aac896e4100d0be893185`.
No host ports are published. These are disposable tests, not deployed provenance.
Without that flag the harness explicitly reports runtime R3/R7 not executed.

The local runtime-enabled rehearsal passed exact Package A verification, candidate
Package B verification using a private temporary Git fixture, real image provenance
and health, R4 recovery, R5 only-040-pending guard, the unchanged canonical production
runner in an isolated test root, R6 ledger32/catalog12/zero tenant delta, and R7
API health200, login200, unauthenticated auth/me401. No R8 or acceptance operation.
Real repository Tooling SHA remains uncommitted; fixture SHA is never publication
evidence. Real-commit Package B verification remains a pre-publication gate.

B3a PostgreSQL regression, B2d ordered operational matrix, bootstrap contract suite,
full Go tests, vet/build, pure tooling tests, shell syntax and diff checks passed.
No application/backend/frontend/migration changes. No VPS/production/deployment.

## Final committed-tooling validation

The fixture-provenance runs above are historical local candidate evidence only.
For publication run:

```sh
B3B_TOOLING_SHA=<exact-real-tooling-commit> B3B_RUNTIME_SMOKE=YES bash ops/phase010/test_b3b_release.sh
```

The harness no longer creates Git fixture commits. It archives the real tooling
commit separately from the immutable application release, executes Package B,
requires R1A/R1B PASS, and emits the real tooling SHA and every artifact checksum.
The recovery checkpoint metadata records the same SHA, governed matrix hashes
and artifact checksums. R5 and R6 run from that verified Package B. Real-commit
evidence supersedes fixture provenance only; it does not rewrite earlier failed
restores or their causes. Production R1, R8 and B3c remain unauthorized.
