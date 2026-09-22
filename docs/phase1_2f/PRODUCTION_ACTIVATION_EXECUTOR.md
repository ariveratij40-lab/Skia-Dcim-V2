# Production activation executor: review package, not window authorization

Base `76af9132d674aaf737d072e4278120a3a967113c`. This gate implements only
operational tooling. Application source remains
`3ee4da51fcd7c5f026fda389158b5e13df6e0c64`; images were not rebuilt.
The active specification is
`docs/phases/active/PHASE_1_2F_PRODUCTION_ACTIVATION_EXECUTOR.md`.

## Interfaces and authority

`python3 -B ops/phase010/execute_prewindow_activation.py` defaults to offline plan.
`--verify` performs inspections only; `--execute` is an explicit mutation request
and additionally requires a future protected authorization, DB evidence, session
input and journal path. No production authorization artifact exists in this PR.
The old JSON remains `activation_authorized=false`; the old validator remains a
non-executing component. The separate executor overlays ONLY the flag from an
explicitly authorized bundle; immutable topology and image settings cannot be
overridden. `validate_production_activation` remains the OAuth metadata gate.

Authorization JSON fields (no credentials):

- activation_authorized: true, environment: production, database: skia_prod;
- package_sha256: digest printed by offline plan, binding executor, original
  validator/spec and bounded manifest;
- api_image and web_image: exact reviewed IDs;
- topology: exact offline-plan topology, no additional settings;
- issued_at, expires_at: integer Unix timestamps, maximum 900 seconds;
- operator, window: nonempty safe identifiers;
- daemon_id and network_id: current immutable Docker identities;
- volume_identity: exact Name/Driver/CreatedAt/Options/Labels inspection;
- current_containers: exact API/WEB container IDs;
- db_evidence_sha256: digest of independently produced protected evidence;
- provider_evidence: original validator's exact Google-provider attestation,
  bound by the operator to the resolved client, not inferred from public URLs.

DB evidence binds window, daemon_id, database, nonempty database_identity and
observed_at (at most 300 seconds old at preflight). Its ledger is the exact 31
path/sha256 entries from the bounded manifest. catalog_count=0,
migration_040_count=0, fingerprint=e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6.
security_pass, tenant_preservation_pass, writers_isolated and admission_closed
must all be true. These are independently reviewed administrative attestations,
NOT a replacement for the actual window's DB checks. The executor runs no SQL.

Production execution runs as root. Authorization/evidence/session files must be
root-owned private regular files; secret file may remain alvaro-owned mode600.
Ancestor directories must be controlled by root/alvaro and not group/world writable.
The administrator and alvaro are trusted operator authorities; this is not a
cryptographic attestation against a compromised host administrator.

Required secret file is fixed `/opt/apps/skia/prod/secrets/production.env`.
Parser does not execute shell or interpolate variables. Required DB identities
must target skia_postgres_prod/skia_prod with their three distinct reviewed roles.
Missing/empty/duplicate/unresolved/synthetic inputs fail closed. JWT/Redis values
already present in the old container must be preserved exactly. Values travel in
memory and Docker request stdin, never process arguments, plan or journal.
Authenticated reads require a separately supplied existing session file; executor
never creates a session or business data. An expired session blocks the API gate.

## Docker and lifecycle boundaries

The local Unix Docker endpoint must match the authorized daemon. Both exact images,
bridge/internal network identity and local volume identity are checked first.
Production network and uploads volume must exist; executor has no create/delete
network/volume operation. API uses skia_api_prod/backend aliases, port8080 internal,
skia_prod_uploads:/app/uploads RW, reviewed command/health/restart configuration.
WEB uses skia_web_prod/frontend aliases on the same network, internal3000, no mounts,
npm run start, docker-entrypoint.sh, /app, unless-stopped and a 10s/5s/12 healthcheck.
Neither publishes host ports. Public URLs remain https://skia.iamet.mx.

The old API must already be stopped by the separately authorized isolation gate.
The executor does not stop it or pretend admission is closed. Old containers are
renamed to retained-window names and disconnected, not deleted. New API starts,
passes exact identity/health and anonymous401/authenticated200 reads before WEB
replacement. Existing WEB supplies the Node HTTP probe before its replacement.
WEB then passes identity/HTTP/routing and compiled public-host checks. Proxy,
admission, release descriptor, provider and database are never mutated here.

Exclusive root lock `/var/run/skia-production-activation.lock` prevents concurrent
cooperating executions. The fixed journal directory is
`/opt/apps/skia/prod/runtime/activation-journals`, which must be prepared in a future
authorized gate. `activation-<window>.jsonl` uses exclusive creation and fsync;
same-window reuse fails. It records non-secret current authority, replacement IDs,
gate outcomes and fixed failure codes. A failure leaves actual candidate state
unchanged (possibly created/running/unhealthy), old API stopped, and a retained
journal. It never restores old API, retries or cleans resources automatically.

Reentry requires a NEW separately approved window/evidence with current IDs.
Exact healthy containers are verified and skipped; API exact with legacy WEB
pending proceeds only after API gate. Exact unhealthy candidates are rejected
before mutation. Missing canonical names after interrupted creation require
separate incident reconciliation; no blind rename or recreation is attempted.

## Validation evidence

Local Docker only; no VPS. Exact candidate images already imported locally:

- API sha256:1c3734699870077a46b158ed71461f01e7e9511eb3442ae8ee9092a133d62507
- WEB sha256:6cf014e5f31625b60d8e0a810a7f0374fd6236096b31fbcb8144322a6b916e03

`python3 -B -m unittest discover -s ops/phase010 -p 'test_*prewindow*.py'`:
30 tests pass, including the 15 unchanged planner/OAuth regressions. Tests cover
authorization, expiry, DB prefix/catalog/fingerprint, resource/image/topology,
ports/health, file security, secrets, API-before-WEB, failure and reentry matrix.

`rehearse_activation_executor.py --disposable-rehearsal --repo .` creates a unique
local internal network, uploads volume and PostgreSQL16.14 database bootstrapped
to exact post039. It invokes the actual executor CLI verify and execute modes.
Final successful fixture: `skia-activation-test-6726807621bd`. Both replacements, exact
image/health/topology, authenticated reads, WEB HTTP/compiled host/WEB→API and named
volume sentinel preservation PASS. No candidate image build. Old local historical
images supply fixture containers only; old API is never started against post039.
Whole data-only dump fingerprint remained unchanged across activation; runtime
and onboarding validators passed before and after. Fixture bootstrap transports
its synthetic password by stdin/environment, not a credential-bearing URL argv.

`exercise_activation_failures.py --fixture-evidence <local-rehearsal-directory>`
uses the actual executor on additional disposable topologies, injecting failures
at its Docker IO boundary: before API, after API creation, API unhealthy, before
WEB replacement, WEB unhealthy. All five PASS; no old API restart, no volume/network
recreation, retained failure journal and correct failure point. Health failures are
explicit injected observations, not claims of a defect in the candidate images.
Actual healthy reentry also PASS without destructive actions.
Final failure evidence directory basename: `skia-activation-failures-ak1w8nya`.
Final executor SHA256:
`da575a7dda648ee4b50e00dc4c199fb85d043cbe1b53d9273d422ddc4271f63e`.

Initial failed fixtures are preserved: macOS /var symlink input rejection, then
an inappropriate fixture PostgreSQL image introducing an extra anonymous mount.
Harness corrected to realpath and historical API image; protections were not
weakened. The first failure-matrix run incorrectly counted network inspect as a
mutation; action accounting corrected and matrix rerun PASS. No failures hidden.

Bounded runner remains 09e6984f63cf1b5387a0ffdf42fbcc817c21068f919dad4e5bfc77be3077d7e0.
Bounded manifest remains f97244ec5c65b52c407653f090d061e8f3c6ee4a641a14fa93ffcf04256bae23.
Original activation specification/validator and all migrations/product code unchanged.

## Residual gates

This is review-ready tooling, NOT production-ready authorization. No live DB,
provider, root authorization inputs or production topology was accessed here.
Future prewindow must revalidate these and prepare the governed journal/session
inputs. Protected external DB evidence is trusted, not generated by this executor.
Actual Google login/callback and public TLS/Nginx traffic admission remain external
window checks. Failure recovery is separately authorized forward action only.
No migration040, catalog seed, V2 acceptance, merge or production activation.
