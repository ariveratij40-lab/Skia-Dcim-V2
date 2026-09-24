# Phase 1.2F — MODEL B production integration HF

Authorized base: `fe8e54b92129417bfe050bbcd9f3a15013473f02`.
Scope: configuration assembly, activation tooling, tests and documentation only.
Production inspection is read-only. No activation, migrations or deployment.

## Authority

The protected canonical `production.env` supplies `SKIA_RUNTIME_DB_PASSWORD`,
`SKIA_MIGRATOR_DB_PASSWORD` and `SKIA_ONBOARDING_DB_PASSWORD`. Their respective
runtime variables are `DATABASE_URL`, `MIGRATOR_DATABASE_URL` and
`ONBOARDING_DATABASE_URL`, with fixed roles `skia_runtime`, `skia_migrator` and
`skia_onboarding`. No role fallback or persistent full DSN is permitted.

All URLs use `skia_postgres_prod:5432/skia_prod?sslmode=disable`. Docker inspection
must establish both `postgres` and `skia_postgres_prod` aliases on the canonical
activation network before derivation. Passwords are percent-encoded as a complete
URL userinfo component and checked by exact decode/re-encode round trip.

The metadata-only configuration preflight is independent of database phase and
cannot authorize activation. Execution retains the existing post039 evidence,
short-lived authorization, image, topology, session and writer-isolation gates.
Secret-bearing runtime assembly is never a diagnostic result or persisted file.
Future Docker candidate environment injection necessarily transfers derived URLs
to Docker via stdin, not process argv. No active production container is changed
in this gate.

## Validation gate

Require component/encoding/identity/topology/diagnostic negative matrices, a fresh
disposable post035-to-post039 rehearsal with the exact reviewed API image, full
tooling regression and final read-only production P0/session recertification.
No local commit or publication until all required evidence passes. Historical
untracked files and product/migration sources remain untouched.

## Implemented interface and provenance

`execute_prewindow_activation.py --preflight-config` is production-root-only,
reads the protected canonical source, inspects Docker aliases, constructs and
discards the candidate body in memory, and emits a fixed metadata allowlist.
It cannot create a container, write a journal or grant activation authorization.
Default `--plan` remains offline. `--verify`/`--execute` retain their independent
authorization gates. The existing `required_secret_names` contract describes the
assembled runtime environment, not persisted DSN keys. Persisted DSNs are rejected.

The executor package digest now also binds `p0_config_model.py`. Future packages
must include that dependency and obtain fresh authorization/evidence bound to
the new digest; old package authorization is not reusable. This HF does not
stage or activate a production package.

## Validation evidence — 2026-09-24

- Python tooling discovery: 139 tests, 138 passed, one existing explicit gated
  skip. Includes MODEL B negatives and six activation negatives with valid
  MODEL B credentials (post035, missing evidence, missing authorization,
  non-isolated old API, expiry, wrong image).
- Syntax AST validation and `git diff --check`: PASS.
- Fresh disposable PostgreSQL 16.14 fixture `skia-p0-1189957fcc5e-b`, private
  network `skia-activation-test-e5dd558c5e93`, reviewed subnet `10.0.0.16/29`.
  Canonical post035 verified before 036→039; ledger progressed 28/29/30/31.
  Catalog zero and 040 absent; raw fingerprint
  `e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`.
  Actual production parser/derivation path used synthetic components. Exact
  reviewed API and WEB images healthy; three distinct DB connection identities,
  restricted runtime security, authenticated reads, V1/V2/exact readers,
  unchanged read baseline and no secret log leakage all PASS. Fixture retained.
- Production configuration preflight: PASS_METADATA_ONLY using the new modules
  delivered solely in memory. Two initial SSH source transfers failed with
  connection reset; compact transfer succeeded. No remote source file written.
- Production final read-only P0: ledger 27, 036–040 count zero, catalog zero,
  raw `8712fcae88f98f7c75605772ab88cbeb52d06e022c07a8782b045e33caec0c10`,
  structural `7d6bfb8e958bc13700c2bbcd11fce71bcaa1489cc1e01accaddba3b87f5805be`.
  API/WEB/PostgreSQL/Redis healthy. Existing session valid, 22019 seconds remaining
  and 16679 seconds over the 5340-second gate at observation (not durable evidence).
- API image `sha256:1c3734699870077a46b158ed71461f01e7e9511eb3442ae8ee9092a133d62507`
  and WEB image `sha256:6cf014e5f31625b60d8e0a810a7f0374fd6236096b31fbcb8144322a6b916e03`
  present; both revision labels identify reviewed runtime
  `3ee4da51fcd7c5f026fda389158b5e13df6e0c64`. No rebuild.
- OAuth key metadata and fail-closed contract PASS using the existing explicitly
  ratified operator/provider attestation. No new provider inspection or login.
- Backend/frontend and migrations036–040 unchanged; 041 absent. Bounded runner
  hash remains `09e6984f63cf1b5387a0ffdf42fbcc817c21068f919dad4e5bfc77be3077d7e0`;
  bounded manifest remains `f97244ec5c65b52c407653f090d061e8f3c6ee4a641a14fa93ffcf04256bae23`.
- No production mutation. Thirteen historical untracked documents untouched.

Local review readiness does not authorize publication, V3 GO, lockstep, or
production activation. Session freshness must be checked again at the next gate.
