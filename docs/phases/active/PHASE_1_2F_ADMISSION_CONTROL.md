# Phase 1.2F admission control — implementation contract

Authorized base: `a80fe54511212d1a57ab2283fb609f1762770936`.
The seven-file topology/session candidate is preserved unchanged. This gate
authorizes local tooling and disposable tests, never production installation,
reload, traffic changes, login, checkpoint, isolation or migration execution.

## Observed authority, 2026-09-22

`global_nginx` includes `/etc/nginx/conf.d/*.conf` and
`/etc/nginx/sites-enabled/*.conf`. The directory bind mount is
`/opt/infra/nginx/sites-enabled` -> `/etc/nginx/sites-enabled`, read-only inside
the container. Host directory is root:root 0755. The exact SKIA file is
`20-skia-staging.conf`, currently alvaro:alvaro 0664. Do not infer staging
upstreams from its historical filename.

Filtered effective configuration shows four server blocks: HTTP canonical and
alias servers redirect normal requests to canonical HTTPS (ACME locations have
precedence); HTTPS alias redirects to canonical HTTPS; canonical HTTPS sends
`/api/` and `/uploads/` to `http://skia_api_prod:8080` and `/` to
`http://skia_web_prod:3000`. Login/static routes use the WEB catch-all, while
API health and Google callback use the API prefix. No distinct public operator
route is established. Observed proxy HTTP version is 1.1; filtered headers did
not establish a WebSocket Upgrade contract. Certificate paths remain
`/etc/letsencrypt/live/mvp.skia.iamet.mx/{fullchain,privkey}.pem`.
No certificate contents are read or modified.

## CLOSED policy

Both canonical and alias hostnames, HTTP and HTTPS, must terminate requests at
Nginx with HTTP 503, `Retry-After: 300`, `Cache-Control: no-store`, and a fixed
non-sensitive body. No redirects while CLOSED. This includes login, OAuth
callback, API health, business APIs, uploads, static assets and ACME challenges.
There is no external allowlist or personal-IP bypass. The short maintenance
window must not be scheduled across a certificate-renewal requirement.

Operator checks use VPS/container-local authenticated reads, not a public
exception. A normal production session must be obtained separately before the
window; this gate does not acquire one. Monitoring should recognize maintenance
503, rather than retain public API access for convenience.

Admission is independent of API health or stop state. Existing connections and
in-flight upstream requests require explicit drainage: a graceful Nginx reload
alone cannot prove that old workers have ceased serving an old configuration.
Do not emit `admission_closed=true` until old worker generations have drained,
fresh external probes pass and independent writer isolation/quiescence follows.

## Future installation and transition design

A separately reviewed preparation must preserve the original authority bytes and
install one governed server-level include into each of the four SKIA blocks,
before routing/return directives. Do not regex-edit arbitrary live configuration.
The prepared base must be an exact reviewed artifact, preserving TLS and Docker
DNS routes. Other virtual hosts must remain byte-identical. Strengthen the
prepared authority to root-owned, non-group-writable files; current 0664 source
is not accepted as a protected transition artifact. Nothing is installed now.

Proposed host paths:

- Immutable tooling: `/opt/apps/skia/prod/tooling/admission/<reviewed-sha>/`.
- Nginx include: `/opt/infra/nginx/sites-enabled/skia-admission/state.inc`.
  The existing directory mount makes it visible inside global_nginx; the
  `.inc` extension avoids the top-level `*.conf` include.
- Protected state/evidence/journals: `/opt/apps/skia/prod/runtime/admission/`.
- Authorization: `/opt/apps/skia/prod/runtime/admission/authorization/<window>-<operation>.json`.
- Transition lock: `/var/run/skia-admission.lock`.

Directories root:root 0700 where container access permits; config snippets
root:root 0644 for Nginx reading, with root-owned non-writable parent authority.
No symlinks. State/evidence/authorization/journals root 0600. No secrets.

Default tooling mode is PLAN. Future CLOSE/OPEN require an exclusive flock,
fresh short-lived single-use authorization bound to host/window/operation,
reviewed package hash, current effective config hash, container ID and expected
current artifact hash. Exclusive journal creation precedes mutation. Concurrent,
stale, consumed, incomplete or unexpectedly modified state stops for inspection.

Atomic same-directory replacement + fsync installs the target snippet. Execute
`nginx -t` before reload. On syntax failure, restore the prior on-disk artifact
without reloading and record disk/effective state separately. A failed reload
requires state inspection, never a success assertion. Verify worker generation,
old-worker drainage and public response matrix before committing CLOSED evidence.

CLOSE-already-CLOSED and OPEN-already-OPEN still verify the effective state and
matching window; no blind rewrite. An incomplete prior transition blocks automatic
reentry, including where disk state differs from serving workers.

## Reopen gate and failure policy

OPEN requires independently derived same-window post039 DB evidence (ledger31,
040 absent/catalog0, exact schema, security and U0 preservation), exact API/WEB
identities and health, authenticated integrated reads, WEB/API routing, and
verified updated release descriptor. Missing prerequisites reject before mutation.

Reopen atomically installs the reviewed OPEN include and performs syntax test,
reload and external WEB/API/login/routing probes. Real OAuth login is a separate
authorization; routing verification must not invent an authorization code.
Failure keeps/restores CLOSED where safely possible and records uncertainty.
Never reactivate the old API or restore a pre039 DB as an admission fallback.

## Evidence boundary

Protected canonical JSON must bind environment, hostname, window, timestamp,
Nginx container and config identity, artifact SHA256, syntax/reload results,
worker-drain evidence, public route matrix and effective state. Do not accept an
operator boolean as proof of admission closure. The future post039 assembler
must validate CLOSED evidence for the same window and recheck freshness/state;
the activation executor remains a separate authority for API/WEB replacement.

Required order: CLOSED -> writer isolation -> zero other DB clients -> fresh
checkpoint/recovery verification -> 036–039 and per-prefix validation -> post039
evidence -> short-lived activation authority -> API gate -> WEB/integrated gate
-> verified descriptor -> OPEN -> observation.

## Local implementation and validation, 2026-09-23

`ops/phase010/admission_control.py` now implements the transition engine. Its
CLI remains PLAN only. `rehearse_admission_control.py` supplies a **disposable**
Nginx adapter, not a production adapter. It pins Nginx by image ID, uses the
explicitly authorized existing fixture network, publishes no host ports, and
retires only its own two containers without volumes/images/network deletion.

Actual Nginx passed 36 CLOSED and 36 OPEN checks across HTTP/HTTPS, canonical
and alias hostnames, normal traffic/login/OAuth/API/uploads/static/ACME paths.
CLOSED probes caused zero upstream-log delta. Nine injected boundary failures
passed, with real serving-state checks and retained failed journals. Reload
failure is injected before signalling; this does not establish recovery from
every possible partially effective real reload failure.

On syntax failure no reload occurs. After any attempted reload, failed CLOSE
retains CLOSED on disk rather than putting OPEN back for a later unrelated
reload. Failed OPEN attempts to recover CLOSED; if recovery cannot be measured,
the tool records unknown effective state, never fabricated successful closure.
Incomplete journals block automatic retries.

`post039_activation_evidence.py` implements independent read-only assembly:
exact ledger/checksums/raw/structural checks, catalog-only security validators,
U0 comparison, actual quiescence, repeated observations, and same-window live
CLOSED measurement binding. PostgreSQL 16.14 disposable assembly passed. The
fixture U0 comparison is a preservation-test baseline, not a new production
upgrade observation. The assembler CLI remains PLAN pending the live adapter.

Remaining publication blockers:

- Governed production Nginx adapter and protected CLI input/output binding are
  not implemented. Prepared base/include authority still needs its separately
  reviewed installation contract; no live configuration was installed.
- Disposable reopen prerequisites are explicitly a test double. Production
  post039/runtime/descriptor/session prerequisites and unhealthy/missing
  prerequisite negative matrix are not yet connected to OPEN.
- Full negative matrix and partial-reload/recovery-failure coverage remain
  incomplete; no universal `NO_UNCONTROLLED_OPEN_STATE` claim is made.
- No production writer inventory refresh or real session acquisition occurred.

The independently proven address-pool exhaustion and recovered slot do not
explain the older failure. Historical classification stays
`NON_REPRODUCED_UNKNOWN`; no broad inventory/cleanup was repeated.
