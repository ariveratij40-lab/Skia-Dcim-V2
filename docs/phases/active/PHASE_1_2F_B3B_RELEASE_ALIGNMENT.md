# Phase 1.2F-B3b — Release alignment tooling

## Authority and provenance

Authorized base/application release: `0c01d79ae714465ab95aac896e4100d0be893185`.
Branch: `phase/1.2f-b3b-release-alignment`. Predecessor: B3a, PR 63.
The explicit dual-provenance clarification governs this specification.
Package A is the exact clean application Git archive, including its unchanged
runner, manifest and migration 040. Package B contains only B3b tooling,
this specification, tests and runbook, attributable to its own future commit.
No overlay, injected specification, secrets, runtime data or `.git` in either
package. Active specification provenance is B3B_TOOLING_SHA, never application SHA.

## Scope and exclusions

Local operational tooling and disposable PostgreSQL 16.14 rehearsal only.
No product/backend/frontend changes, schema changes, migration 041, HTTP,
acceptance smoke, B3c, VPS, deployed DB access or deployment. Preserve all 13
historical untracked files. Publication is conditional on all validation passing;
commit/push/PR authorized, merge not authorized.

## Gates and acceptance

R1A verifies exact application tree, 040 hash
`773811a472b08eaa44c114bb7af00b4479c27c3fd4242d726bc355c554a69bd6`,
catalog hash `2c32e4b53c3969e310d70feb2e6d56e6c54dd71d73c4b9f7c83b5863219cad45`,
manifest 039→040, ledger 32, unchanged schema fingerprint
`e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`,
no 041, runner checksum and runtime trees. R1B verifies tooling Git provenance,
exact authorized package contents and per-file hashes. Before commit, candidate
tree evidence is explicitly provisional; never invent a tooling commit SHA.

R2 read-only observation records identity, PostgreSQL version, complete exact
ledger paths/checksums, schema, catalog, security and independently observed
component images/health/provenance. Missing 036–039 means PRE040_CHAIN_INCOMPLETE;
R5 may not implicitly upgrade them. Pre-040 requires ledger 31 and pending only
040. A pre-existing 040 requires ledger 32, exact checksum/catalog and no retry.

Catalog classifier: EMPTY, EXACT_IDENTICAL_ALREADY_PRESENT, PARTIAL_IDENTICAL,
CONFLICTING, UNEXPECTED_ADDITIONAL_ROWS. Only EMPTY is potentially eligible;
nonempty without 040 blocks provenance investigation. Serialization is the B3a
21-field array contract, asset_type_code C order, compact UTF-8 JSON with final LF.

R3 requires compatible API before R5: minimum V2 application
`ab1e730e12807c57f19a14dfefbefca0210522c2` or verified compatible descendant.
Historical API has runtime delta. Historical WEB frontend tree equals candidate;
code-driven WEB rebuild is not required, but observed image/config provenance is.
Git delta is not deployed-state evidence. API and WEB SHAs need not match.

R4 captures administrative read-only consistent snapshots of all tenant/physical
tables, counts and deterministic full-content hashes. Two snapshots separated
by a short interval must match: STABLE_OBSERVED, not guaranteed quiescence.
No automatic service shutdown. New pre-040 custom pg_dump checkpoint must be
nonempty, listable, hashed, identity/timestamp-bound and restored in an isolated
database, matching ledger/schema/catalog/baseline. Existence alone is insufficient.

### Authorized R4 clarification: dual fingerprints

The raw fingerprint above remains mandatory for live R2/R6. Restore-only raw
fingerprint is diagnostic when every raw difference is classified as PostgreSQL
expression reserialization AND an independent catalog-derived structural payload
and hash match exactly, including security. No blanket SQL whitespace/cast removal.
The observed equivalent rewrite is limited to constant varchar arrays cast to
text arrays versus per-element varchar-to-text casts in CHECK/index expressions.
Function definitions are never normalized. Unknown differences fail closed.
Structural records cover application schemas, relations, logical column order,
types/defaults/generated expressions, constraints/FKs, indexes, sequences and
ownership, enums/domains, views, routines, triggers, RLS/policies, owners/ACLs,
effective runtime privileges and role security. OIDs, dropped-column physical
slots and storage locations are excluded; named identities replace OIDs.
Ledger/checksums/catalog/tenant baseline and isolated restore identity remain
mandatory. Negative column/default, constraint, index, routine/security, RLS and
grant tests must detect structural drift before resuming R5. No schema migration
or global bootstrap fingerprint change is authorized.

R5 is a fail-closed precondition validator, not a migration executor. It requires
fresh R2, compatible API, exact pending040, verified restore, stable baseline,
and matching database identity. Future separately authorized execution uses the
unchanged application release runner; its checksum and guard checksum are separate.
Recheck immediately before invocation; no environment defaults bypass gates.

R6 is read-only: ledger32/040 once, exact12/hash, same schema, V1 excludes12,
V2/exact readers return12 active, exact privileges/RLS unchanged and zero tenant
baseline delta. R7 read-only health/auth checks accept guarded401; no first
acceptance. Exposure remains BACKEND_AVAILABLE_NO_FRONTEND_NO_V2_HTTP_ROUTE.
B3c owns HTTP/recommendation/acceptance UX. R8 requires separate authorization.

## Failure and rollback

SHA/checksum/ledger/security drift, missing prerequisites, nonempty unledgered
catalog, invalid checkpoint, unstable writes or incompatible API: STOP.
Runner nonzero: inspect actual committed ledger/schema/catalog before any retry.
Post-publication hash or tenant delta: INCIDENT, no acceptance. No automatic
restore, cleanup, forward repair or blind retry.
STATE_0: 040 absent, recovery depends on exact schema/application compatibility.
STATE_1: published with no accepted V2 rule, DB forward-only; historical writes
are not declared safe. STATE_2: V2 accepted; minimum rollback application is
ab1e730 or verified compatible descendant. Pre-B2c/pre-B2a prohibited. Never
delete/deactivate referenced history as rollback.

## Required validation

Disposable dual-package R1–R7 rehearsal; application archive remains byte/mode
identical. Classifier matrix, stable/unstable snapshots, checkpoint restore,
R5 positive/negative conditions, pending exactness, post040/idempotency checks.
B3a PostgreSQL, relevant B2d and bootstrap contracts, full Go test/vet/build,
Python/tooling tests, shell syntax and diff check. No failure may be hidden.

## Authorized R4-HF3 recovery procedure

HF3 supersedes post-restore extension-owner repair (unsupported SQLSTATE 42601),
not its historical failure evidence. The ratified exact authority matrix is in
`docs/phase1_2f/B3B_RECOVERY_SECURITY_AUTHORITY.md`. Source application stays fixed.

Prepare a new isolated target with explicit source encoding/libc locale and owner,
using template0. Validate all four SKIA roles and empty application memberships.
Verify plpgsql owner; create uuid-ossp under SET LOCAL ROLE skia_migrator and
immediately verify all ten exact function signatures remain owned by skia_bootstrap.
Normal pg_restore must exit zero, with no clean/filter/error suppression. Apply
only explicit runtime/onboarding CONNECT using a validated parameterized target.
PUBLIC default privileges are verified, never normalized. No role alterations,
catalog writes, owner transfers or extension-member rewrites in the procedure.

Require two independent restores, exact structure/security/data/ledger/catalog
equality, idempotent ACL provisioning, negative targets and transactional negative
structural/security tests. Extension-member named identities are included, in
addition to existing B3B_STRUCTURAL_V1 fields. Explicit default ACL and NULL ACL
use PostgreSQL acldefault for comparison; grants are not excluded. Raw live gates
remain unchanged. Wrong-owner negative uses a separately created extension.
Recovery is checkpoint plus governed prerequisites/tooling, not a dump alone.

## Final publication provenance gate

The final harness requires explicit `B3B_TOOLING_SHA` identifying the real B3b
repository commit. It archives the ten governed tooling paths from that commit
and executes the archived tooling, verifying Package B against Git before R2.
No temporary Git repository or fixture commit supplies authoritative provenance.
Checkpoint recovery metadata and all gate implementations use that same commit;
per-artifact SHA256 values are emitted with the rehearsal evidence. Package A
remains the exact application archive. Re-run the runtime-enabled rehearsal and
regressions after the cohesive commit, before push/PR. No merge or production R1.
