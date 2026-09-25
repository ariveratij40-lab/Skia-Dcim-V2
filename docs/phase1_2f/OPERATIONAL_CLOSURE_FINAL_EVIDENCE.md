# Prewindow operational closure — final local evidence

Base: `e42f9b757c884aabc8770df83fb83b93e2ba36df`.
Branch: `phase/1.2f-prewindow-operational-closure`.
Scope: local engineering closure only. No production execution authorization.

## Continuous rehearsal and artifact binding

`ops/phase010/operational_closure_evidence.json` binds the exact core executable
bytes and protected disposable evidence from fixture
`skia-activation-test-034df92d4c7e`. Checkpoint timestamp is Unix1790311220;
final OPEN timestamp is Unix1790311344. This is the already accepted single
continuous fresh run, not a new run or an aggregation of older split fixtures.
The source checkpoint was ledger27/catalog0. Both actual restores passed structural,
owner/ACL/security, ledger and business-baseline verification. Their raw dump
differences were classified POSTGRESQL_CANONICAL_EXPRESSION_RESERIALIZATION;
raw equality is not falsely claimed. Progression was27→28→29→30→31;040 absent.

The binding includes checkpoint/recovery, exact bounded runner/manifest,
post039 collector, activation authorization/journal, exact API/WEB candidates,
descriptor authority/verification and CLOSED/OPEN/reopen evidence. No session
value, session hash, business snapshot, dump, image archive or credential is
versioned. Only hashes of retained synthetic evidence are recorded. Core custody,
checkpoint, descriptor and rehearsal files predate that run and remain unchanged.
This retrospective local evidence binding is not a signed external attestation.

After the run, baseline derivation added rejection of unexpected empty directories
and the image build entry added local-Docker-builder checks. Neither changes the
already exercised operational path or its verified-image path. The current gate
adds offline writer accounting, negative tests and documentation only. No material
E2E executable change requires another full run. The core-byte regression fails
on drift; it does not itself rerun or certify Docker E2E.

Baseline source/context derivation is reproducible; bitwise Docker image
reproducibility is NOT claimed. Exact authorities remain in
POST035_DISPOSABLE_BASELINE_BUILD_GOVERNANCE.md. Historical image12bd6c00… remains
execution-prohibited in these tests, with zero fixture starts; this does not mean
the preexisting production container was stopped. Credential rotation review is
a separate required follow-up; no validity test or rotation was performed.

## Fresh read-only production inventory

Observed2026-09-25T04:51–05:01UTC. Final P0 observation05:00:14UTC:
ledger27,035 exactly once,036–040 absent, catalog0; raw8712fcae…ec0c10 and
structure7d6bfb8e…805be match canonical expectations. API,WEB,PostgreSQL,Redis
remain healthy. No runner, DDL/DML, session renewal or checkpoint was executed.
One SELECT initially referenced a nonexistent ledger column and failed; it was
corrected to canonical `path` and rerun READ ONLY. No data repair was involved.

All33 container configurations/networks and readable userspace process cgroups
were inspected; no unreadable process surface remained. Four idle connections
from172.23.0.4 map to production API5941df27…: runtime2, migrator1, onboarding1.
They are writers, not quiescent because idle. PostgreSQL5432 has no published
host port. API/WEB/Redis/PostgreSQL and shared Nginx share skia_prod_internal;
WEB/Redis/Nginx showed no skia_prod credential authority. Other stacks, including
skia_api_staging, skia_a2f_pgtest and the remote prewindow fixture, target separate
clusters/networks. Network reachability is not dismissed as proof of no authority:
root/Docker can connect new clients and is explicitly accounted below.

No container was privileged/host-networked or mounted a parent granting host-root,
production-secrets, Docker-socket or Docker-data authority. No independent host
SKIA worker or psql process was found; imports/jobs in the API share its pools.
Host SSH shells, sudo/root, Docker/containerd and retained deployment/maintenance
packages remain potential administrative writers. PgAdmin containers are outside
the production network; any future use/reattachment/tunnel is nevertheless an
administrative operation prohibited during the exclusive window.

Running services, all timers,710 installed unit/override files, system cron,
root/alvaro crontabs, run-parts directories and logrotate configuration were
inspected. There was no separate scheduled SKIA DB writer. Observed scheduling:

| Authority | Classification / future action |
| --- | --- |
| `/opt/scripts/backup_postgres.sh` | Targets global_postgres_db, NOT_SKIA_PROD; recheck target before window. |
| alvaro curl, `7 * * * *` | staging.iamet.mx, NOT_SKIA_PROD; no SKIA DB authority observed. |
| root `/opt/infra/renew-bajanet-cert.sh`, `17 3 * * *` | Shared-Nginx reload competitor. Do not overlap scheduled execution; check no active job. |
| apt/apt-daily-upgrade, unattended-upgrades, package/firmware maintenance | Potential host/service interference; choose a non-overlapping window, verify no active job; if exclusion cannot be proven, STOP for separate coordination. |
| logrotate/run-parts, sysstat, backups of dpkg, fstrim/tmpfiles, MOTD/man-db and remaining standard timers | No SKIA DB or Nginx mutation reference found; revalidate schedules/processes and stop on new/changed authority. |

Host timezone is America/Tijuana; scheduling must be evaluated in that timezone,
including timer jitter/persistence and worst-case job duration, not just nominal
start time. No cron/timer was disabled. Broad system privileges are retained as
administrative authority, not inferred harmless solely from grep results.

## Exact future isolation and administrative exclusion contract

The versioned inventory is an observation, NOT durable proof that no external or
offline credentials exist. The offline validator compares a separately reviewed
inventory with a fresh collection and rejects unknown/unreadable/changed surfaces,
roles, containers or missing exclusion actions. It neither collects credentials
nor issues authority or executes isolation. Auto-enrolling discoveries is forbidden.

| Writer authority | Required future action, separately authorized |
| --- | --- |
| API runtime/migrator/onboarding pools and in-process jobs/imports | CLOSE admission, drain, stop exact old API; no restart/reconnect. |
| Interactive operator/root/Docker/psql/PgAdmin/tunnel authority | Exclusive named operator; close other DB clients; no new manual client, network attachment or unaccounted operator. |
| skia_bootstrap administrative access | No parallel bootstrap/psql/checkpoint/maintenance invocation. Only the authorized checkpoint observer, then bounded runner, at their respective boundaries. |
| skia_migrator runner authority | Only the separately authorized bounded036–039 runner connection. No second runner or direct migration invocation. |
| Deployment, backup, import, maintenance packages | No parallel invocation. Unexpected process or session causes STOP; never terminate automatically under this HF. |
| Shared-Nginx administrators/certificate cron | No concurrent edit/reload across shared graph. Avoid cron window and verify no active competitor; otherwise STOP. |
| Package/service maintenance | No competing package job/restart in window; scheduling uncertainty blocks window execution. |

Immediately before a FUTURE window, the named operator must provide a protected,
same-window, same-canonical-SHA, same-database-identity attestation with issuance/
expiry(max900s), nonce and reviewed inventory hash. Exact assertions are:
NO_MANUAL_PSQL_SESSION; NO_PARALLEL_DEPLOYMENT; NO_PARALLEL_MIGRATION;
NO_MAINTENANCE_OPERATION; NO_MANUAL_NGINX_MUTATION; NO_UNACCOUNTED_OPERATOR;
NO_ADMIN_RECONNECT; SCHEDULED_MUTATORS_EXCLUDED_FOR_WINDOW.
All must be true and supported by fresh observations. This is a specification of
a future input, NOT an attestation obtained now; no operator confirmation was requested.
Protected authority ownership/custody must follow operational_custody; any drift,
expiry, inability to coordinate cron or additional operator blocks execution.

The exact query before checkpoint and each migration is:

```sql
SELECT count(*)
FROM pg_stat_activity
WHERE datname = current_database()
  AND backend_type = 'client backend'
  AND pid <> pg_backend_pid();
```

Expected0. The observer/runner excludes only itself; idle/API/admin sessions are
not exempt. The unchanged bounded runner enforces this condition. Inventory and
attestation cannot substitute for it, nor can a zero count substitute for exclusion.

Shared Nginx authority is only20-skia-staging.conf. The adapter binds the unrelated
graph and rejects concurrent graph drift; the real E2E also checked unrelated
vhost bytes unchanged through CLOSE/OPEN. Its local lock is not a global lock on
other administrators: the future exclusion/cron contract remains essential.

## Failure/reentry evidence map

| Gate | Executed tests/evidence |
| --- | --- |
| Baseline source/policy/image boundary | test_post035_baseline_build; exact source/context double derivation and all-layer audit. |
| Checkpoint purpose/window/SHA/database/owner/mode/symlink/hardlink | test_operational_custody; protected real E2E checkpoint. |
| Checkpoint TOCTOU/partial-write/readback/recovery failure | custody replacement and reserved-nonce tests; no completed evidence on failed restore. |
| Recovery binding | Nine retained-fixture evidence attacks: window/SHA/database/hash/dump/evidence-mode/dump-mode/symlink/baseline; no target DB created. Two actual positive restores. |
| Admission/external graph/reentry | test_production_admission_adapter, test_operational_admission_reentry; real unrelated-vhost preservation. |
| Unknown writer/scheduled/Nginx/admin authority | test_operational_writer_inventory; missing surface/action, unknown role/container and nonzero client tests. |
| Post039/activation | test_production_post039_evidence, test_execute_prewindow_activation; exact authority/database/port/session matrices. |
| API/WEB failures and integrated runtime | executor before-api/api-unhealthy/before-web/web-unhealthy, runtime negatives; no historical fallback or automatic restore. |
| Descriptor custody/order/TOCTOU/write/verify | test_operational_descriptor; actual atomic replace, competing lock, bad journal, missing post039, wrong hashes, post-write failure. |
| Premature reopen | missing receipt and live-gate negatives; no OPEN on failure. |
| Reentry | checkpoint consumed nonce, activation existing journal/exact-state cases, descriptor consumed/already-updated/failed-write state, admission current-authority drift. |

The new admission reentry test initially expected ValueError, but the existing
adapter correctly raises its dedicated Rejected exception. The test now asserts
that exact existing exception; no executor behavior was changed to pass a test.

## Commit and next boundary

Final suite:195 tests,194PASS, one explicit B3B_DISPOSABLE integration skip;
the single continuous Docker rehearsal ran separately and passed. Python AST,
JSON parsing and tracked/new-file whitespace checks passed. Complete candidate
content scanning classified three synthetic DSN/key-header markers and two
synthetic assignment markers in test_post035_baseline_build.py:116–118, plus a
source-concatenation false positive in the rehearsal's generated PGPASSWORD
assignment. None is an operational secret or key payload. The historical
credential string was compared in memory and is absent
from every candidate file. Zero unresolved findings, binaries, image archives or
business data. Migrations036–040 are byte-identical to the base;041 absent.

Final suite and staged scope/secret checks precede one local commit. Publication,
fresh real session, final V3, production checkpoint/migrations/admission/descriptor
or activation all require separate authorization. No cleanup of retained evidence
or the13 historical untracked documents. Current backend/frontend/migrations and
existing application derivation authority remain unchanged;041 absent.
