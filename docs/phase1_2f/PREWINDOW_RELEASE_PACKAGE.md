# Prewindow release package — review, not activation

## Authorities and decision

Base: `29b0d26ad837d8111dc7c217c9832d4f989fed93`.
Application source: `3ee4da51fcd7c5f026fda389158b5e13df6e0c64`.
Public authority: `https://skia.iamet.mx`.

Technical package is reviewable. Window decision remains **NO-GO**:
Google provider callback authority is **UNVERIFIABLE**. The active API lacks
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; no accessible provider authority
proves the registered callback. Before window authorization, the authorized
provider owner must attest the exact callback
`https://skia.iamet.mx/api/auth/google/callback` and complete any separately
authorized secret provisioning through the existing secret authority. No
provider or production secret changes were made by this gate.

This package does not implement or authorize production activation. Its strict
specification and Docker Engine disposable create-plan are the reviewed basis
for a separately authorized production execution gate. It must not be replaced
by an ad-hoc `docker run` or the current compose with stale host ports.

## Source state and preservation

Read-only deployed precheck: ledger 27; 035 exactly once; 036–040 absent;
system catalog empty. Raw schema SHA256:
`8712fcae88f98f7c75605772ab88cbeb52d06e022c07a8782b045e33caec0c10`.
No production database mutation, migration, checkpoint, traffic change,
container restart, descriptor/configuration change, or isolation was performed.
The thirteen historical untracked documents remain outside this change.

## Environment and activation contract

Versioned contract: `ops/phase010/prewindow_api_activation.json`.
Validator/isolated Engine create-plan: `ops/phase010/prewindow_activation.py`.
Only environment names and public values are versioned. Production secrets
remain referenced at `/opt/apps/skia/prod/secrets/production.env`; their values
are neither copied nor read by the package.

Required independent DB identities: `DATABASE_URL`, `MIGRATOR_DATABASE_URL`,
`ONBOARDING_DATABASE_URL`; `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true`.
Preserve existing JWT and Redis settings through the existing secret authority.
Ratified public values: FRONTEND_URL and APP_BASE_URL equal the public authority;
GOOGLE_REDIRECT_URL equals the callback above. Existing CORS permits this origin;
cookie behavior stays host-only. No authentication code changes are required.

Future API identity: `skia_api_prod`, image
`sha256:1c3734699870077a46b158ed71461f01e7e9511eb3442ae8ee9092a133d62507`,
command `./skia-api`, working directory `/app`, current default user/entrypoint,
network `skia_prod_internal`, aliases `skia_api_prod` and `backend`, internal
8080, **no published ports**, `skia_prod_uploads:/app/uploads` read-write,
restart `unless-stopped`. Health: `wget --spider -q
http://localhost:8080/api/health`, interval 10s, timeout 5s, retries 12.

## WEB build authority and artifact evidence

`NEXT_PUBLIC_API_URL` is BUILD_TIME for browser routing (`pages/_app.tsx` and
`pages/configuracion/index.tsx`). Merely changing the running environment does
not rewrite compiled bundles. FRONTEND_URL, APP_BASE_URL and GOOGLE_REDIRECT_URL
are backend RUNTIME values, not WEB build variables. Login uses the relative
`/api/auth/google` route. Google client secrets are never WEB inputs.

The frontend Git tree is identical between `658cfa35becaf75f851a27d44180fef20ea0f2ce`
and the application source: `3bd59197cac082c83e3660d1305e16f01bf83e23`.
The new inactive WEB was built from the latter exact source, using the versioned
`ops/phase011/Dockerfile.frontend`, public build argument
`NEXT_PUBLIC_API_URL=https://skia.iamet.mx`, no production secrets.

- Tag: `skia-web-prod:3ee4da51fcd7c5f026fda389158b5e13df6e0c64-iamet`.
- Image ID / repository digest: `sha256:6cf014e5f31625b60d8e0a810a7f0374fd6236096b31fbcb8144322a6b916e03`.
- OCI revision label: exact application source; public-origin label: ratified URL.
- Dockerfile SHA256: `148b7c19834194910f9e882ace636c9a2f7249fdff5e2cb80fdaf621c4771e39`.
- BUILD_ID: `hf2t8X_5zS_xmFC4n0ttI`.
- package.json SHA256: `90c42fb2842f02f887423d0a10fe74e23ab2fb20b3beb3176f4bb6be6a6d54e0`.
- routes-manifest SHA256: `096d5b7660cc5444e2b709837e2cf285147b896a774065b49f81b62a2b982d11`.
- build-manifest SHA256: `cdecf667bfa930852a92be4eca67d398005549e7eb6f6d1a6f04d2ac42c1f41c`.
- pages-manifest SHA256: `fb274aaccd9aa348fd7621d7eea62e5827819edd58f73ca111b7167787d620d0`.
- Routes: 32 manifest entries including internal routes; build generated 30 static pages.
- Browser static files with old production URL: 0; with ratified URL: 2.

Classification: VERIFIED_NEW_CANDIDATE_COMPATIBLE at artifact and isolated HTTP
surface level. No real-provider OAuth end-to-end or browser visual QA is claimed.
WEB replacement is required in a later authorized window; it is not activated.

## Disposable evidence

`rehearse_prewindow_activation.py --disposable-rehearsal --repo <git-repository>`
uses only generated `skia-prewindow-test-*` resources on a new **internal** Docker
network, without published ports, with synthetic credentials. Canonical SQL
hardcodes the database name `skia_prod`; this is a separate disposable PostgreSQL
container, never the deployed server. Source fixture is exact historical post039
`7bc42600cb87494dccca50cba26f17352331ca9a`; 040 is rejected from that fixture.
Fixtures remain for review, not silently cleaned. Future re-runs create new
names and do not reuse production containers, volumes, credentials or networks.

Observed fixture: `skia-prewindow-test-e583314870f0`; evidence directory
`/tmp/skia-prewindow-test-e583314870f0-zdyv47k4` on the authorized VPS.
Post039 ledger31/catalog0/no040. Exact API candidate became healthy.
Anonymous 401 and synthetic-session reads passed for auth/me, sites, MDF/IDF,
racks, assets, placements, naming-rules. WEB login/racks/nomenclature surfaces
and WEB-container-to-API DNS/health passed. Synthetic OAuth construction returned
302 with the exact callback and host-only cookie; redirect was not followed.
Public TLS/browser routing was not exercised against the disposable network.

Negative plan tests reject 18081, 13001, missing uploads, altered DNS/network,
wrong image, missing health, missing restricted mode and wrong public URLs before
container creation. Five local unittest tests pass. Supplementary isolated test:
write synthetic upload sentinel, stop only disposable API, verify zero other
client backends, restart disposable API, read sentinel: PASS. Production API/WEB
were never stopped. This demonstrates persistence and achievable quiescence in
the model, not current production quiescence.

## Writer inventory and future exclusion contract

Read-only observed production clients: skia_runtime, skia_migrator and
skia_onboarding, all idle, all client address 172.23.0.4 (active API), empty
application_name and null xact_start. No unmapped current clients.
Staging API references the same role name but targets `skia_postgres_staging`,
database `skia_db`, network `infra_network`; it is not a production writer.
Production DB has no host port publishing. Active API has three separate pools.
User/root crontabs and system cron/systemd custom configuration scans found no
SKIA jobs; matching `snapd.autoimport.service` is unrelated. No matching timers
or standalone SKIA maintenance/import process was observed. Dormant future
operator access cannot be disproved by a point-in-time activity query.

| Writer class | Future isolation | Verification | U0-only reversal |
|---|---|---|---|
| API pools and in-process jobs | Separately authorized stop of active API, block new admission | Container stopped and all three pools gone | Restart old API only before first migration |
| Any new worker/cron/import job | Pause by identified owner before window | Repeat inventory and no target DB session | Restore prior schedule only at U0 |
| Other applications | Verify topology; block any newly discovered production access | No unmapped client; no shared target | Restore only at U0 |
| Administrative operators | Exclusive authorized operator window; other operators attest logout/no reconnect | Zero other client backends before every migration step | End exclusivity only at U0 or after validated forward completion |

Future runner must enforce ZERO_OTHER_CLIENT_BACKENDS, excluding only its own
authorized connection and PostgreSQL internal processes. Any new/unknown client
blocks execution. Inventory is complete for observed authorized surfaces;
exclusive operator attestation and recheck are mandatory at execution time.
No production isolation or privilege revocation was performed here. Once schema
mutation starts, do not blindly restart the old application: follow reviewed
forward recovery/lockstep policy, not a purported safe historical write rollback.

## Release ordering and immutable tooling

Leave descriptor unchanged while staged. Future separately authorized order:
exclude writers/traffic admission under the window contract; bounded post039
upgrade and validation; activate API with public URL package; verify exact
container/image and health; replace WEB with the compiled aligned candidate;
verify WEB identity, routing and health before reopening admission. Update each
component descriptor only after actual identity/health are verified; do not
advertise staged images as active. No stronger contrary convention was found
in the reviewed release gate; any newly discovered conflict blocks execution.

Bounded runner SHA256:
`09e6984f63cf1b5387a0ffdf42fbcc817c21068f919dad4e5bfc77be3077d7e0`.
Bounded manifest SHA256:
`f97244ec5c65b52c407653f090d061e8f3c6ee4a641a14fa93ffcf04256bae23`.
040 remains excluded. No product code, migrations, bootstrap authorities or
active deployment files are changed by this PR. No merge or window execution
is authorized by publication. OAuth prerequisite remains the current NO-GO.
