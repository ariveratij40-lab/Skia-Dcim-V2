# Prewindow current topology and authenticated-session prerequisite

Base: `a80fe54511212d1a57ab2283fb609f1762770936`. Tooling-only;
no product code, migration, active configuration or production data changes.

## Current versus candidate authority

Read-only production observation on 2026-09-22: ledger 27, 035 once,
036–040 absent, catalog zero, raw schema
`8712fcae88f98f7c75605772ab88cbeb52d06e022c07a8782b045e33caec0c10`.
All four application/data containers healthy.

| Container | Config.ExposedPorts | HostConfig.PortBindings | NetworkSettings.Ports | Listener | Effective Nginx upstream |
|---|---|---|---|---|---|
| API | 8080/tcp | 127.0.0.1:18081 | 8080/tcp=null | none on 18081 | http://skia_api_prod:8080 |
| WEB | 3000/tcp | 127.0.0.1:13001 | 3000/tcp=null | none on 13001 | http://skia_web_prod:3000 |

Both are attached to skia_prod_internal, with backend/frontend aliases.
These are persisted configuration, not effective publication. Only these exact
legacy loopback mappings may pass CURRENT preflight; an external protected
authorization must bind container ID, exact Docker-DNS upstream, effective
Nginx config SHA256, observation time (at most 300 seconds old), and zero
listening sockets. Missing/stale authority or unexpected/effective bindings fail.
The executor records exposed, persisted and effective ports separately in its
capture and records expected removal of the legacy mapping. This is not a
general exemption for arbitrary PortBindings.

CANDIDATE image identity remains immutable and its persisted/effective port
publication must both be empty. No active topology repair is performed.

## Session authority and human acquisition

Supported local authentication: HTTPS POST `/api/auth/login`, cookie
`session_token`; existing active account, password verification, authorized
tenant membership and active authorized branch. OAuth is not required for an
existing local-password account. Never INSERT a production session or reuse a
historical token. Read-only account inspection found one potentially eligible
account and no unexpired session; operator authorization of that account and
successful login have **not** been established by this gate.

The helper `ops/phase010/acquire_prewindow_session.py` defaults to a non-mutating
plan. It is **not run against production in this gate**. After review and
explicit operator confirmation of the account, the future preparation gate must
create `/opt/apps/skia/prod/runtime/authenticated-smoke` as root:root 0700.
Then the human runs the reviewed helper in a private interactive terminal:

```sh
sudo python3 /PATH/TO/REVIEWED/ops/phase010/acquire_prewindow_session.py \
  --acquire --window WINDOW_ID \
  --user-id AUTHORIZED_USER_UUID --tenant-id AUTHORIZED_TENANT_UUID \
  --branch-id AUTHORIZED_BRANCH_UUID
```

Only non-secret identifiers appear in argv. CONFIRMO, email and password are
entered directly at hidden prompts, never in chat, history or command arguments.
Do not enable tracing, screen recording or HTTP debugging. The helper refuses
echo fallback, follows no redirects, never prints HTTP bodies/cookies, checks
Secure/HttpOnly cookie properties, verifies `/api/auth/me` against all three
expected IDs, and requires HTTP 200 on every representative read. Context
selection is not automatic: a mismatch stops and needs separate operator review.
It writes a new root-private window directory with `session` and `metadata.json`
(0600, exclusive creation, no symlink). No overwrite or automatic retry.
If a failure follows login, a server session may exist; inspect metadata before
retrying. Do not send credentials or session files back to this conversation.

Copy the protected metadata into the future authorization's `session_authority`
and pass only the file path through `--session-file`. Its expiry must exceed the
authorization expiry by 300 seconds (authorization lifetime at most 900 seconds).
The helper conservatively subtracts 60 seconds from the 24-hour cookie lifetime.
The executor checks format/source/expiry, protected-file ownership/mode/symlinks,
then checks actual server authorization and exact identity after API health.
Offline preflight cannot prove a stopped server's session validity: metadata is
an attestation, not a replacement for the actual authenticated HTTP gate.

The session must be acquired before isolation. Sessions are server-side opaque
tokens in PostgreSQL; migrations 036–039 do not change sessions. Replacement
preserves the database, therefore survival is conditional on expiry, no revocation,
unchanged user/membership/branch and successful post-activation read checks.
It is not an unconditional promise of validity. No JWT/OAuth token is fabricated.

Reads are auth/me, sites, MDF/IDF, racks, assets/housing, placements and naming-rule
readers. No business writes. Future authorized window closure must remove the
ephemeral session input and metadata, and end/revoke the normal session through
the supported authentication lifecycle; otherwise its server TTL bounds expiry.
No cleanup is performed now.

## Remaining execution prerequisites

`/opt/apps/skia/prod/runtime/activation-journals` is absent. The executor requires
it to preexist. Future separately governed preparation: root:root 0700 directory;
journal itself is root 0600 with exclusive creation/fsync. No directory created now.

The bounded runner `observe()` verifies exact ledger/checksums, live raw schema,
structural/security hash and baseline. `checkpoint_create()` defines recovery
verification. Neither is executed on production here. A future post039 evidence
assembler must compare the observed baseline with the protected U0 baseline,
bind database/daemon identity and exact ledger entries, and add freshly verified
writer-isolation/admission attestations before hashing the external JSON.
The executor accepts this externally reviewed evidence; it must not attest to
its own DB correctness. A fully reviewed production evidence assembly procedure
and concrete admission close/reopen procedure remain prerequisites, not facts
inferred from disposable evidence or boolean fields.

Read-only client observation: runtime/migrator/onboarding pools are idle at
172.23.0.4 (API). No other current production DB client. No matching cron/timer;
snapd.autoimport is unrelated. See PREWINDOW_RELEASE_PACKAGE.md for writer
classes and mandatory exclusive-operator recheck. This snapshot cannot prove
absence of dormant administrative clients. Do not label the future window GO
until inventory/exclusivity and external admission boundaries are ratified.

## Validation boundary

Unit tests cover legacy/candidate port distinction, missing Nginx evidence,
session expiry/format/context, file security, argv rejection and OAuth fail-closed.
Normal-login transport tests use only synthetic credentials and exercise missing,
expired, wrong user/tenant/branch, insufficient read permission and redirect denial.
Actual Docker rehearsal runs the immutable candidates on disposable PostgreSQL
16.14, preserving uploads/database state and running security validators.
Production login, session acquisition, journal creation, checkpoint, isolation,
migrations, activation and traffic changes remain unperformed and unauthorized.

Latest local validation, 2026-09-23: 76 Python tests ran successfully, with one
skip (not counted as executed coverage). The existing
`skia-activation-test-ddcddfca2c8d` fixture was reused sequentially without new
networks or removal of volumes/images. Its original successful rehearsal and
HTTP-negative evidence remain preserved.

`sequential_activation_matrix.py` passed two web-unhealthy boundary repetitions,
a clean equivalent, all five actual-executor failure boundaries, and reentry
A–F. Each case replaces fixture API/WEB containers only; PostgreSQL/network/
volume are reused. Therefore this is **not** evidence of a newly bootstrapped
database per case or a proof of the unknown historical Docker failure cause.
Actual executor completed a final clean-container equivalent on that same DB.
Historical classification remains `NON_REPRODUCED_UNKNOWN`.

Evidence directories (outside Git, preserved):

- `skia-sequential-matrix-vlylrw_1`: two repetitions, clean and 5/5 failures.
- `skia-sequential-matrix-wj5v6gqf`: A–F reentry and final clean equivalent.
- `skia-admission-rehearsal-kxciudhh`: actual Nginx 36/36 CLOSED and OPEN,
  9/9 boundary failures, and actual PostgreSQL read-only evidence assembly.

These are located under the host's private temporary directory; authorization,
fixture credentials and session inputs must never be copied into reports.
The first sequential harness result was retained separately: it misclassified
the executor's generic exception wrapper; reading the journal established the
expected `CANDIDATE_UNHEALTHY` cause. That harness accounting defect was fixed,
not hidden or attributed to Docker.

Publication remains BLOCKED by the admission production adapter/reopen gate,
complete negative matrix, protected assembler CLI integration, and final fresh
end-to-end window validation. See the active admission contract. No commit,
push, PR, real session, VPS access, checkpoint, production DB change or
deployment was performed in this pass.
