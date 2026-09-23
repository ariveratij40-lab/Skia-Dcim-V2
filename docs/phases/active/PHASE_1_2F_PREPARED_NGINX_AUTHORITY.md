# Prepared SKIA Nginx authority: exact-file contract

This clarification supplements the admission design without editing the existing
14-file candidate. It authorizes local implementation/tests only, not installation
or reload on the VPS. Base: `a80fe54511212d1a57ab2283fb609f1762770936`.

## Observed graph and ownership

Read-only `nginx -T` on 2026-09-23 succeeded. The master is in `global_nginx`;
its main file `/etc/nginx/nginx.conf` is bound from
`/opt/infra/nginx/nginx.conf`, root:root 0644. Main includes mime.types,
`/etc/nginx/conf.d/*.conf`, and `/etc/nginx/sites-enabled/*.conf`.
The sites directory is a read-only directory bind from
`/opt/infra/nginx/sites-enabled`, root:root 0755. Atomic replacement of a child
is consequently visible to the container. Neither examined path is a symlink.
The main file, sites directory and SKIA file have observed device 64769.

SKIA owns the routing contract of exactly `20-skia-staging.conf`. Other effective
files are `20-bajanet-staging.conf`, `21-bajanet-prod.conf`,
`30-iamet-staging.conf`, `40-horos-staging.conf`, `50-kairos-staging.conf`, and
`60-kairos-prod.conf`: no write authority over those is granted. Main configuration,
mime.types, TLS material and the Nginx service remain host-global authorities.

The SKIA file has four servers: canonical/alias HTTP (ACME `^~` before catch-all
redirect), alias HTTPS redirect, canonical HTTPS (`/uploads/`, `/api/`, `/`).
API upstream is `skia_api_prod:8080`; WEB is `skia_web_prod:3000`. HTTPS uses
the existing mvp.skia.iamet.mx fullchain.pem/privkey.pem references. No TLS key
material was read. Version observed: nginx/1.31.0. Future service operations are
`docker exec global_nginx nginx -t` and, only on success, `nginx -s reload`.
They act on a shared master, requiring exclusive operator control of competing
configuration/reload writers throughout the window.

## Hash and prepared object

`634d3692d07781bc1db9790993250680771a8761d17bb481c49b4caba6a68bf3`
is SHA256 of the exact raw bytes of the single host SKIA file. It is NOT a hash
of nginx -T or of the whole graph. It was reproduced in this gate. The existing
file is uid/gid 1001:1001, mode 0664; prepared artifacts must instead be root
0600 under root 0700 staging. Preparation alone changes no active configuration.

The earlier include-based preparation is superseded for this adapter by ONE
complete-file mechanism. There is no alternate include/template fallback.
OPEN is byte-identical to the verified original file. CLOSED is derived only
from that exact hash: insert the existing reviewed maintenance directives at
the beginning of each of its four exact `server {` blocks, and omit only its
three exact `proxy_pass` directives. This retains server_name, listen, TLS,
headers, cookies, upload limits and location blocks. CLOSED must not resolve
upstream DNS: Nginx resolves static proxy_pass during `nginx -t` even behind
an unconditional 503. The fresh rehearsal reproduced that failure after API
isolation. Removing those three directives from CLOSED makes syntax validation
independent of stopped/replaced upstreams. OPEN restores every original byte,
including all three directives; no live routing template is reconstructed.
The unconditional server rewrite return precedes location selection and alias
redirects, including ACME, and emits 503, Retry-After 300 and Cache-Control
no-store. No arbitrary configuration is parsed or rewritten.

Prepared OPEN/CLOSED are full `.artifact` files plus an exact-key manifest,
binding base hash, artifact hash, window, operation, timestamp, expiry, graph
hashes and (for OPEN) CLOSED evidence and reopen-bundle digests. OPEN never
comes from a generic template or from memory. The archived original is the
authoritative source and must still have the captured hash.

Future staging: `/opt/infra/nginx/sites-enabled/.skia-admission/<window>/`.
It is outside the nonrecursive `*.conf` include. Future lock:
`/run/skia-admission.lock`. Future journal/evidence:
`/var/lib/skia-admission/<window>/`. These paths are not created
on production in this gate. Staging and target must have the same st_dev.
Read-only host metadata confirmed `/var/run` is a symlink, so `/run` is used
directly. Existing `/opt/apps/.../runtime` ancestors belong to uid 1001, so new
root-protected admission evidence uses `/var/lib` instead. No existing directory
ownership or permission change is part of this contract.
Reject symlinks, unexpected types, owner/mode, duplicate keys, unknown authority
keys, stale artifacts and authorization lifetime exceeding 900 seconds.

## Atomic installation and test failure

With the transition lock held, independently recheck the original source hash,
current target state, unrelated graph, prepared bytes/hash, same window and
fresh authorization immediately before installation. Use a new exclusive
same-filesystem temporary file, fsync its content, rename over ONLY the SKIA
target, then fsync the parent. No in-place edit, cross-device copy fallback,
symlink switch or unrelated-vhost mutation is permitted.

`nginx -t` checks the installed-but-not-reloaded graph. A failed test NEVER
signals reload: restore the previous exact file atomically and classify disk
and serving state separately. This model assumes the explicitly required
exclusive configuration/reload writer window; the tool cannot constrain an
uncooperative root operator using an independent reload mechanism.

Once reload was attempted, a command failure is not proof of unchanged serving
state. Keep CLOSED on disk, inspect serving state and stop. Failed OPEN must
attempt verified CLOSED recovery without touching API, DB or old application
images. If that recovery cannot be verified, record UNKNOWN and block further
actions: do not falsely report `NO_UNCONTROLLED_OPEN_STATE=YES`.

Successful evidence requires syntax success, known new worker generation,
drained previous workers and the full public matrix. A hash of nginx -T proves
the disk graph only, not which configuration existing workers serve.

Any base or unrelated graph drift invalidates preparation:
`REGENERATE_UNDER_NEW_REVIEW_OR_STOP`. Never overwrite it. OPEN additionally
requires independently bound same-window post039, runtime and descriptor
evidence; no operator-entered PASS booleans substitute for observations.

## Canonical protected interfaces and execution boundary

The original 14-file candidate is preserved unchanged. Its include-engine and
post039 prototype remain test/reference material, not alternate production
entrypoints. The sole production admission entrypoint for this contract is
`ops/phase010/production_admission_adapter.py`; no include-based fallback exists.
No arguments means offline PLAN. Future explicitly authorized modes are
`--prepare CLOSED|OPEN`, `--transition CLOSED|OPEN`, and `--verify CLOSED|OPEN`,
with `--window`. Production paths cannot be overridden. Preparation creates
non-effective artifacts only. Transition reads `<OPERATION>.authorization` from
the root-protected evidence window, including exact identity, manifest digest
and a maximum 900-second lifetime. No directory is silently provisioned.

`production_post039_evidence.py --assemble --window ...` is the selected
protected production interface. It reads root-private `u0.json`,
`isolation.json`, and `CLOSED.evidence`; independently observes the exact target
DB, all ledger/checksums, catalog, raw fingerprint, structural/security identity,
canonical role validators, tenant baseline, stopped API and absence of other DB
clients. It rechecks observations before exclusive atomic publication. No
operator-supplied PASS flag is accepted as proof. Default invocation is PLAN.

`production_reopen_gate.py --assemble --window ...` independently measures exact
candidate identities/health and authenticated read probes using a previously
acquired protected normal-auth session. It binds post039, runtime, CLOSED and
the exact two-key release descriptor into `reopen.json`. The adapter validates
this bundle again, including fresh live DB structure/baseline and runtime
probes. Session acquisition is not performed by these interfaces. Evidence
age is bounded to 300 seconds; expiration blocks OPEN rather than bypassing the
gate. The descriptor remains the existing uid-1001 protected authority; it is
read-only here. The adapter never updates it or authorizes application rollback.

## Final local evidence

- Base: `a80fe54511212d1a57ab2283fb609f1762770936`; branch
  `phase/1.2f-prewindow-topology-session-hf`.
- Combined candidate: original 14 files plus 14 focused contract/adapter/test
  files. No backend, frontend, migration or bounded-runner change.
- Unit/regression discovery: 123 tests, 122 passed, one explicitly gated legacy
  B3 disposable test skipped (its separate fixture/040 rehearsal was not run).
- Prepared authority negatives cover source/hash/window/expiry, ownership/mode,
  symlinks, duplicate/extra JSON authority, post-validation tamper, unrelated
  graph drift, filesystem boundary, missing lock and expired authorization.
- Actual production adapter on Nginx: 10/10 injected failures passed: base drift,
  artifact drift, atomic install, syntax, reload, CLOSED probe, OPEN prerequisite,
  OPEN syntax, OPEN reload, OPEN probe. Failed OPEN cases independently measured
  CLOSED; pre-reload CLOSE failures retained known original OPEN without
  advancing the window. Evidence: `skia-prepared-nginx-b5w5u0ng`.
- CLOSED with stopped/unresolvable upstream: PASS. OPEN is byte-identical to the
  reviewed file; unrelated vhost is unchanged.
- Fresh final fixture: `skia-activation-test-6cbb4542689c`, evidence directory
  `skia-activation-test-6cbb4542689c-6ju6k0xq`. Built from canonical bootstrap to
  post039, second bootstrap passed, ledger 31, catalog 0, 040 absent, raw hash
  `e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`.
- Full fresh chain PASS: OPEN -> CLOSED -> independent post039 evidence ->
  exact authorization -> real API then WEB replacement and gates -> independent
  runtime and synthetic descriptor -> bound reopen gate -> exact OPEN.
  This is fresh post039 activation/preservation evidence, not a claim that a
  production upgrade or checkpoint was executed.
- Final non-secret artifact-set SHA256 (sorted JSON map of individual SHA256s
  for CLOSED.evidence, post039.json, activation.authorization, activation.journal,
  runtime.json, reopen.json, OPEN.evidence):
  `c0c5eff2c2f8ebde76594aa85c1887a84bdc8b51c15e66dc9e99090189fbc558`.
- CLOSED artifact: `ce2554842363ecd8d7efef6498cea4727386e2ac1b7ecabd4f5ae9bc6cffcda9`.
- Prior executor 5/5 failure injection and A-F reentry evidence preserved;
  current executor/session/port unit regressions pass. Historical transient
  Docker failure remains `NON_REPRODUCED_UNKNOWN`, not retrospectively solved.
- New diagnosed failures: unstable Docker mount ordering corrected by canonical
  destination sorting; upstream DNS coupling corrected only in derived CLOSED.
  Failed fixture evidence is retained and was not relabeled PASS.

## Read-only production recheck and remaining production gates

Nginx raw base hash remains exact. Production remains post035: ledger 27,
catalog 0, raw fingerprint
`8712fcae88f98f7c75605772ab88cbeb52d06e022c07a8782b045e33caec0c10`.
The sorted ledger/checksum array matches the canonical prefix; digest
`bc383f6e770d09697ba476ab41dc57f108d962d1c1d87d856455f8aef01eb687`.
API/WEB/PostgreSQL/Redis are healthy with zero restart counts; their start times
predate this gate. Nginx identity/base stayed unchanged. Only three idle DB pools
were observed, runtime/migrator/onboarding, all at API address 172.23.0.4.
No additional mapped network client or SKIA cron/systemd job was found; DB has
no host-published ports. This is point-in-time inventory, not proof that a
dormant administrator cannot reconnect. Exclusive window attestation and fresh
zero-client checks remain mandatory during any separately authorized execution.

Checkpoint procedure remains the unchanged reviewed bounded-runner contract;
backup directory exists, pg_dump is 16.14, and observed free space exceeded
187 GB. No checkpoint was created. Protected production staging/evidence paths
are preparable, not created. Real session acquisition is still required and has
not occurred. No production Nginx write/reload, container change, DB mutation,
migration, deployment, writer isolation or lockstep execution occurred.
Publication is technical review only, not a production GO or execution grant.
