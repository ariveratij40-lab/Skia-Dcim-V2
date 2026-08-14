# PHASE-002 — Fixture implementation design evidence

## Record

- Evidence origin: `LOCAL`
- Baseline authorized: `5b4f01e028508b1045aef1ecbb386947d627aac3`
- Fixture definition: `SKIA-PHASE-002-FIXTURE-V1`
- Execution state: `NO EJECUTADO`
- VPS/DB/HTTP access: not performed in this round

## D-002-001 — Deterministic fixture model

- State: `APROBADO` (static design)
- Evidence: deterministic IDs cover 3 tenants, 6 branches, 9 actors, tenant/branch mappings, 6 tenant-local roles (`admin`/`operator`), exact cloned role permissions, 60 assets, 60 logs and 6 intra-branch relationships. The B multi-branch actor maps to canonical tenant B (`...8000...000b`).
- Risk: the effective staging schema may differ from repository migrations.
- Recommendation: execute the read-only preflight under separate authorization before any write.
- Corrective phase: not applicable unless preflight reports incompatibility.

## D-002-002 — Staging-only fail-closed controls

- State: `APROBADO` (static design)
- Evidence: shell and SQL entry points require explicit staging markers and separate approval tokens; preflight verifies host/database/schema/collisions without writes.
- Risk: environment variables are operator-controlled and must be supplied through an authorized execution channel.
- Recommendation: retain preflight output and operator authorization as campaign evidence.

## D-002-003 — Credential isolation

- State: `APROBADO` (static design)
- Evidence: no password/token/cookie is embedded. Password hashes enter psql externally; HTTP credentials enter through an external mode-`0600` file; bodies and session artifacts are not emitted.
- Risk: process environment and temporary files remain sensitive during an authorized campaign.
- Recommendation: use the approved staging secret-delivery mechanism and verify cleanup.

## D-002-003A — Exact RBAC semantics

- State: `APROBADO` (static design)
- Evidence: preflight requires one unambiguous permission-set variant for each real non-global role name `admin` and `operator`, selects a complete source pair from one existing tenant, and reports source IDs/counts/hashes. Preparation clones only those exact `permission_id` sets. No global/non-global or permission-name inference remains.
- Risk: if current staging roles diverge by tenant, preparation intentionally blocks.
- Recommendation: treat divergence as an RBAC governance finding; do not select a broader set manually.

## D-002-004 — Exact rollback manifest

- State: `APROBADO` (static design)
- Evidence: preparation exports table, exact ID and logical alias to a client-side external CSV. The new shell wrapper computes and exactly compares SHA-256 before invoking `psql`. SQL validates fixed counts per entity plus exact dynamic RBAC/session counts, then deletes exact IDs in FK-safe order.
- Risk: losing or tampering with the manifest would block safe rollback.
- Recommendation: mode-restrict it, compute SHA-256 externally, retain it through verified rollback, and version only checksum/count summaries.

## D-002-005 — Isolation matrix

- State: `APROBADO` (static design), execution `NO EJECUTADO`
- Evidence: the runner assigns explicit expectations and automatic `APROBADO`/`FALLIDO`/`BLOQUEADO` verdicts for `ISO-001`–`ISO-022`. Asset-list tests parse temporary JSON and record expected/observed TEST counts plus cross-tenant and cross-branch leakage booleans. A `200` alone never approves an asset isolation test.
- Risk: natural session expiry and application/DB correlation cannot be established by HTTP alone.
- Recommendation: mark those observations `BLOQUEADO` until separately authorized read-only correlation is available.

## Validation record

Static checks executed in this round:

- `bash -n tools/phase002/preflight.sh tools/phase002/run_isolation_tests.sh`: exit `0`, `APROBADO`.
- guarded invocation of `preflight.sh` without required environment: exit `1` before `psql`, `APROBADO`.
- guarded invocation of `run_isolation_tests.sh` without required environment: exit `1` before HTTP, `APROBADO`.
- guarded invocation of `rollback_fixtures.sh` without required environment: exit `1` before checksum/`psql`, `APROBADO`.
- negative checksum test using an empty mode-`0600` temporary file and an intentionally incorrect digest: exit `1` with confirmation that `psql` was not invoked, `APROBADO`.
- static SQL review without PostgreSQL connection: transaction, approval, database, exact RBAC clone, manifest cardinality/alias and exact-ID deletion guards present, `APROBADO` by inspection.
- secret-pattern filename-only review: no embedded secret assignment detected, `APROBADO`.
- `git diff --check`: exit `0`, `APROBADO`.
- path-scope verification: changes are limited to `tools/phase002/` and `docs/phases/active/phase-002-evidence/DESIGN_REPORT.md`, `APROBADO`.
- `shellcheck`: `NO EJECUTADO`; tool unavailable and no installation was authorized.
- PostgreSQL SQL parser/`psql`, `sqlfluff` or `pg_format`: `NO EJECUTADO`; tools unavailable and no installation was authorized.
- deterministic UUID/FK audit: 117 UUID literals syntactically valid, 9/9 user-to-tenant mappings coherent and 15/15 user-to-branch mappings coherent, `APROBADO`.
- runner leakage logic inspection: all ten expected aliases plus one expected exact ID are required; foreign tenant/branch counters must both be zero; full bodies have no output/evidence path, `APROBADO`.
- rollback postcheck inspection: the loop covers all 12 authorized manifest tables and raises before commit on any survivor, `APROBADO`.

## Architectural-review corrections

- `FIX-002-01`: corrected TEST-B-MULTI tenant FK and added cross-table tenant/branch coherence postconditions.
- `FIX-002-02`: removed inferred permission selection (`is_global`, `LIKE view/read`) and replaced it with exact cloning from a deterministic real role pair.
- `FIX-002-03`: runner now captures mode-`0600` bodies only in its private temporary directory, validates content with `jq`, and emits summaries only.
- `FIX-002-04`: canonical V1 presence is idempotent verification/convergence mode; only foreign/noncanonical collisions block.
- `FIX-002-05`: rollback wrapper performs real SHA-256 equality before `psql`; SQL requires wrapper attestation.
- `FIX-002-06`: rollback postcheck covers tenants, branches, users, roles, all mappings, permissions, sessions, assets, logs and relationships.
- `FIX-002-07`: arbitrary manifest minimum removed in favor of exact per-table counts and alias/ID coherence.

No fixture, login, SQL statement, rollback or network operation was executed.

## FIX-002-08 — Manifest export corrected after failed preparation

The first authorized preparation attempt ended in automatic rollback because psql rejected `:'manifest_path'` inside `\copy`. The local correction replaces that meta-command with CSV output through `\g :manifest_path`, positioned before `COMMIT` and protected by `ON_ERROR_STOP`. An open/write error therefore ends psql while the transaction remains uncommitted.

The new `prepare_fixtures.sh` client guard requires absolute external paths, rejects repository paths, symlink destinations and pre-existing files, applies `umask 077`, pre-creates the manifest with mode `0600`, passes the same validated path to psql and removes an incomplete manifest when psql fails. Exact IDs, logical aliases and fixture cardinalities are unchanged.

Local-only validation covered `bash -n`, the guard with missing variables, static ordering of `\g` before `COMMIT`, absence of executable `\copy`, `git diff --check`, and simulated-client checks for failed-manifest cleanup and successful retention at mode `0600`. No PostgreSQL connection or SQL statement was executed.

The temporary generator `/private/tmp/skia_phase002_credential_gen.go`, its nine generated credentials and their hashes were deleted before versioning. They were never added to Git and no recoverable secret material from that generation is retained.
