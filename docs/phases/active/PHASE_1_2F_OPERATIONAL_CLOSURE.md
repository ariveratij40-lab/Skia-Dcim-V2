# Phase 1.2F — prewindow operational closure

Authorized base: e42f9b757c884aabc8770df83fb83b93e2ba36df.
Scope: checkpoint governance, release descriptor updater, observable writer
inventory, tests. No product, migration or production operational changes.
Publication requires separate authorization; local commit requires all gates.

## Authorized separate post035 disposable build governance

Historical image 12bd6c00ac0171e9ade2283ca459f584e368ea39f2d0cdc141c2f26e96afc4d1
is quarantined for execution: its application binary contains a credential DSN.
It must never start in these fixtures. Its archive remains protected forensic
evidence. Credential validity testing and rotation are not authorized; a separate
historical credential rotation review is required.

The separately authorized source is c5b90598d0d9ab52482e09ea0bcdb582cb4fad07.
New post035-only governance under ops/phase010 must bind its full Git inventory,
tree, blob IDs and modes, an independently hashed credential-free transformer,
the exact derived source inventory and a separate minimal build inventory.
Only backend/database_roles.go may change in derived source: remove the compiled
localDevelopmentDSN and require valid external database configuration. Preserve
optional migrator/onboarding inheritance when restricted mode is off; restricted
mode continues to require three separate explicit identities. lib/pq parsing
validates syntax without opening a connection; errors must never contain inputs.
SQL/RLS, routes, tenant/branch, migrations and dependency versions do not change.
The historical Dockerfile is retained byte-for-byte, with no build arguments,
secret mounts or additional environment inputs. Its mutable base/package inputs
mean context reproducibility is not a bitwise image reproducibility claim.

Derivation occurs only in new disposable directories, never current backend/.
The existing 3ee4da51 build policy remains unchanged. Backups, tracked binaries,
image archives, runtime data and files outside the explicitly bound compilation
inputs cannot enter the context. All drift fails before build. Source and context
must independently reproduce twice; negative governance/configuration tests and
all-layer image audits precede any container start. Tag only
skia-post035-disposable-baseline:<derived-id>; never a production tag. Rollback is
to stop using the derived fixture; no live rollback or credential action follows.
No commit until the parent operational closure matrices and continuous E2E pass.

## Current implementation status — local technical closure

The operational modules are a local review candidate, not a production
authorization. Protected window/purpose authority, bounded expiry, pinned file
identity, live database identity and exclusive nonce consumption are implemented.
The reviewed canonical main is pinned in source, not a caller flag. Production
authority resides only in /var/lib/skia-admission/<window_id>, root:root0700;
authorization files are root:root0600. The implementation does not issue grants.
All operations reserve consumption before mutation; failures require review, not
blind retry. The source baseline includes the full recovery snapshot and exact
immutable ledger. Public entry points do not accept an arbitrary dump pathname.
Local checkpoint/recovery and descriptor rehearsals are recorded below. The new
separate post035 build governance and continuous post035-through-reopen rehearsal
have now passed locally. Final parent failure/reentry and administrative exclusion
accounting is recorded in docs/phase1_2f/OPERATIONAL_CLOSURE_FINAL_EVIDENCE.md.
Older split rehearsals are not substitutes for the continuous result. The future
exclusion contract is defined, not executed; a local commit does not authorize
publication or a production window. Final engineering checks precede that commit.

## Checkpoint contract

The existing bounded checkpoint binds database identity, source ledger count,
raw fingerprint, business baseline, full recovery snapshot (ledger/catalog/raw/
structure/security), dump SHA256, restore targets/results and creation time.
It does not itself bind window or canonical main, and uses ordinary path opens.
The new governed interface must preserve recovery semantics and add explicit
window/environment/database/reviewed execution SHA and protected file custody.
Production files: root:root0600, protected root-controlled0700 window directory,
regular files only, no symlink parents, exclusive creation, fsync. Disposable
tests use the executing uid/gid in a private temporary directory, never relax
production ownership. File identity is checked by device/inode and metadata,
with content hashes before consumption and after recovery. Replacement stops.
The reviewed SHA is compared with the independently selected execution package,
not accepted merely because an input carries a well-formed SHA.

## Descriptor contract

Target is exclusively /opt/apps/skia/prod/runtime/RELEASE.env. Read-only metadata
inspection observed alvaro:alvaro (1001:1001), mode0600; the runtime parent is
1001:1001 mode0700. These identities must be rechecked, not changed by the updater.
Only API_SOURCE_SHA and WEB_SOURCE_SHA may be written, both equal the
reviewed candidate application source. Tooling SHA is a separate binding.
Update requires protected same-window authorization, consumed successful
activation journal, independent live post039/runtime checks and CLOSED admission.
Atomic replacement preserves measured ownership/mode; an exclusive lock and
single-use journal prevent concurrent update and blind retry. Any post-write
failure retains classified state; no automatic database/runtime rollback.
The existing independent reopen gate remains required after descriptor verify.

## Writer authority

Inventory covers DB clients, Docker creation configuration/topology, host
processes, services/timers, cron/user crontabs, jobs/imports, maintenance/deploy
scripts and administrative access. Unknown entries block, not assumed read-only.
The active API includes all three pools and in-process imports/jobs: future
isolation is admission CLOSED followed by separately authorized old API stop.
Administrative root/Docker/database access is an operator authority requiring
exclusive-window attestation, closure of other clients and no reconnect. No
privilege revocation is introduced. Every boundary requires zero other client
backends, excluding only the runner connection. Nothing is isolated here.

### Fresh read-only inventory, 2026-09-24/25

Four skia_prod clients were observed from 172.23.0.4, all mapped to
skia_api_prod: skia_migrator x1, skia_runtime x2, skia_onboarding x1.
They are WRITE_CAPABLE. Future action: admission CLOSED, drain, stop old API,
then verify zero other client backends. Imports/jobs in that process share this
authority and must not be restarted during the window.

All 33 Docker configurations/networks were inspected. Other application stacks
and the remote prewindow disposable fixture have separate database/network
targets: NOT_SKIA_PROD. No container mounted the production secrets directory,
host root, /opt root or Docker socket. Production WEB/Nginx/Redis showed no
skia_prod database environment authority. PostgreSQL server processes are the
database infrastructure, not an additional client backend to stop.

Host processes were mapped through cgroups; no separate SKIA worker was observed.
Root/alvaro SSH shells, Docker daemon/socket access, retained maintenance and
deployment packages, bootstrap/psql/runner access are WRITE_CAPABLE administrative
authorities, including dormant future invocation. Future policy: exclusive
operator attestation, close non-runner DB clients, prohibit new psql/docker-exec,
imports, maintenance/deployment invocations and reconnects. Do not infer exclusion
merely from absence of current connections. Only the authorized runner connection
may remain during migrations. No current administrative exclusion was performed.

Running services and all timers were enumerated. Installed systemd service/timer
and override files had no SKIA, psql, pg_dump or /opt application/script references.
System cron and root/alvaro crontabs were readable. The PostgreSQL backup script
/opt/scripts/backup_postgres.sh still targets global_postgres_db, not skia_prod:
NOT_SKIA_PROD. Alvaro's curl cron targets staging.iamet.mx, not SKIA. Root's
/opt/infra/renew-bajanet-cert.sh has no PostgreSQL reference but can reload shared
Nginx: it is an operational admission competitor, requiring separate future-window
coordination; it must not be silently disabled here. Its exclusion is not proven.

This inventory is bounded to the inspected observable surfaces, not proof that
arbitrary offline credentials do not exist. A new/unknown authority blocks the
window. Fresh inventory and administrative exclusion attestation remain required
immediately before execution. The exact quiescence query is:

```sql
SELECT count(*) FROM pg_stat_activity
WHERE datname = current_database()
  AND backend_type = 'client backend' AND pid <> pg_backend_pid();
```

Expected result is zero before checkpoint and each migration, not four idle
connections. The canonical bounded runner enforces this query.

## Executed disposable evidence

- Fixture skia-activation-test-f34590f6edf4: fresh/second post035 bootstrap passed,
  ledger27/catalog0/040absent. Protected checkpoint and two actual restores passed;
  structure, ACL, ledger, catalogue and business data equality were verified.
  Both raw differences were classified POSTGRESQL_CANONICAL_EXPRESSION_RESERIALIZATION.
- Nine recovery negatives (window, SHA, DB, hash, modified dump, evidence mode,
  dump mode, symlink, baseline) rejected before creating a database.
- The immutable bounded runner then validated progression 28/29/30/31 with
  catalog0 and 040 absent on that local fixture only.
- Separate fresh fixture skia-activation-test-33777e8611fa: post039 bootstrap,
  admission CLOSE, API/WEB activation, integrated reads, actual atomic descriptor
  update, independent receipt/live reopen gate and admission OPEN all passed.
- These are split rehearsals, NOT the required single full control-plane PASS.

### Historical full-rehearsal blocker — superseded locally

The locally available historical image skia-hf3-api:0c01d79
(35e62b53527a2562b8db49902b2baba08d366564098a2f3b1b8b05f17ea7d5d9)
cannot start on post035: its runtime security gate requires
read_active_system_naming_presets_v2(text[]), introduced later. Health was not
waived and the post039 candidate was not substituted on post035. The failed local
container was stopped; its fixture/evidence remain. An exact authorized compatible
post035 baseline image was needed for the full sequence. A later explicitly
authorized archive acquisition found a compiled credential in image 12bd6c00...,
so that image remains execution-prohibited. Separate build governance now derives
only a disposable sanitized historical baseline; see
docs/phase1_2f/POST035_DISPOSABLE_BASELINE_BUILD_GOVERNANCE.md. Fresh continuous
fixture skia-activation-test-034df92d4c7e passed through OPEN with exact post039
candidates. No production change or security-gate bypass was used. Consolidated
failure/reentry and administrative/cron exclusion accounting is finalized in the
final evidence document; actual production exclusion remains separately gated.

The original seven candidate paths replaced the original five-file count: the original five
are preserved/evolved; the existing disposable rehearsal gained explicit closure
modes, and a dedicated descriptor negative-test module was added. No product or
migration file was changed. Separate baseline governance adds its own tooling,
policy, transformation, fixture tests and documentation; final scope must list
these additions explicitly rather than reuse the historical seven-file count.

## Validation and failure boundary

Required: negative file/security/binding matrices, actual disposable post035
checkpoint/two restores, full036–039 control-plane and descriptor/reopen rehearsal,
failure injection and existing tooling regressions. No PASS before execution.
No production checkpoint, descriptor write, isolation, migration or deployment.
Pre036 reversal requires separate authority; after036 the old API stays isolated.
After039 activation failure keeps admission closed and DB intact; forward repair
only. No automatic restore, retries, cleanup or production authorization.
