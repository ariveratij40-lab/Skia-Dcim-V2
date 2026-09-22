# OAuth activation fail-closed tooling HF

Authorized base: `916e7da54a30e8a95179a985854f8da44d87f525`.
Scope: activation tooling, tests and this contract only. The explicit HF
authorization supplements the prewindow package; no runtime/schema change.

## Contract and trust boundary

The checked-in activation spec remains unauthorized (`activation_authorized=false`)
and contains names/references only. Production validation requires an explicitly
authorized in-memory specification, exact immutable package settings, and both
GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET references resolved from the declared
governed authority. It receives metadata only, never credential values.

`validate_production_activation` requires the explicit mode
RESOLVED_PRODUCTION_SECRET_AUTHORITY. Each exact OAuth name must have the exact
source path, matching name, resolved=true, synthetic=false and production
classification. Missing, unknown, unresolved, synthetic, value-bearing, incorrectly
typed or extra records fail closed with a constant redacted exception.
Exact HTTPS hostname/callback and activation authorization are mandatory.
Separately supplied Google-provider evidence must mark the exact callback
VERIFIED_EXACT and the client-authority match true. Application configuration
alone, absent evidence, an unverified status or a different client is rejected.
Tests mock this separate evidence; they never mark the real provider verified.

Metadata is a trusted resolver output, **not a proof of resolution by itself**.
A future separately authorized executor must obtain fresh metadata from its
governed resolver, never accept caller-supplied assertions as authority, call
this gate before execution, and enforce all external provider/window gates.
No production executor, secret reader, provisioning or provider verifier is
introduced here. Mocked successful validation proves logic only; it neither
proves provider registration nor authorizes deployment.

DISPOSABLE_SYNTHETIC_CONFIGURATION is separate. The existing disposable plan
now calls explicit synthetic OAuth validation and remains NOT_PRODUCTION_READY.
Synthetic values or metadata cannot satisfy the production validator. No real
OAuth values are used by tests. Google callback verification remains external.

## Validation and boundaries

Run locally: `python3 -m unittest discover -s ops/phase010 -p 'test_prewindow*.py'`.
Coverage includes all mandated missing/unresolved/synthetic/redirect/authorization
cases, exact source/name binding, redacted errors, mocked production metadata,
offline disposable configuration rehearsal and the prior activation regression
matrix. API/WEB image identities, bounded runner/manifest and JSON spec remain
unchanged. The initial HF authorized no VPS access. The acquisition gate below
separately permits image inspection/export/transfer only; no candidate rebuild,
production migration, secret/provider mutation or deployment is authorized.

## Exact-image acquisition and completed regression

The initial local-image blocker was closed under the separate exact-candidate
acquisition authorization. No image rebuild or active-container export/commit.
VPS `docker image save` archives, transferred with `rsync --partial --progress
--timeout=30` to local disposable storage, matched both exact sizes and SHA256
before `docker image load`:

- API: 67,436,544 bytes;
  `ab53eb8cb1c9dd912944801bb1d2013a309ea4b59a96a063d5a6f1b43f757c8e`.
- WEB: 249,018,880 bytes;
  `f52f02cdf66fd0716b9d8a05e348cdb171d982e322aeefeb9ba65b802dbf3936`.

Export directory: `/opt/apps/skia/prod/skia-oauth-exact-images-fmliaeuj`.
Local archives: `/private/tmp/skia-oauth-exact-images.Eiajq3`.
Both candidates are linux/amd64. Their original tags were retained. Loaded and
post-rehearsal identities:

- API: `sha256:1c3734699870077a46b158ed71461f01e7e9511eb3442ae8ee9092a133d62507`.
- WEB: `sha256:6cf014e5f31625b60d8e0a810a7f0374fd6236096b31fbcb8144322a6b916e03`.

Existing unchanged harness executed locally against the uncommitted HF module:
`rehearse_prewindow_activation.py --disposable-rehearsal --repo .`.
Fixture prefix: `skia-prewindow-test-94caf1d9cefb`; internal Docker network,
synthetic credentials, unique uploads volume, no published ports. Canonical SQL
uses database name `skia_prod` **inside the isolated local PostgreSQL container**;
there is no connection to the deployed database or production secret authority.

Post039 ledger31, 036/037/038/039 each once, 040 zero, catalog zero; raw fingerprint
`e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`.
Exact API healthy; guards and authenticated auth/me, sites, MDF/IDF, racks,
assets/housing, placements and nomenclature reads PASS. Exact WEB starts and its
major HTTP surfaces and WEB-to-API internal routing PASS. Compiled old hostname
absent; synthetic redirect exact and cookie host-only. No Google request or real
login. Public-browser/TLS end-to-end remains outside this isolated HTTP rehearsal.

All 15 tooling tests PASS, including independent provider evidence negatives;
Python syntax and diff checks PASS. No new regression observed. VPS active
API/WEB identities and start times preserved. Remote operations were limited to
image metadata inspection and authorized new image archives; no production DB,
secrets, provider, activation or configuration access/change. Archives and local
fixtures are preserved. Disposable SQL bootstrap is test-only, not production
migration execution. Classification: DISPOSABLE_ONLY_NOT_PRODUCTION_READY.

Rollback before publication means reverting only these tooling changes under
review; no deployed state or database needs rollback. OAuth remains blocked by
unverified provider authority and absent production credential provisioning.
