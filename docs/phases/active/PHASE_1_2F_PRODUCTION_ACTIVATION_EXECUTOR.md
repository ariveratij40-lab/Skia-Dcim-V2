# Production activation executor — implementation gate

Authorized base: `76af9132d674aaf737d072e4278120a3a967113c`.
Scope: a separate executor, tests, disposable rehearsal and operational contract.
The existing planner/specification remain unchanged and unauthorized. No VPS,
production activation, migration, image build, isolation or checkpoint in this gate.

## Execution authority

Default is a non-mutating plan. Verify does not mutate Docker or create a journal.
Execute requires a protected local authorization bundle supplied by the authorized
operator in a future gate. Root owns authorization/evidence/session inputs, with no
group/other access. The existing secret authority may retain owner alvaro. Parents
must belong to root or the authorized alvaro operator, without group/other write;
symlinks are rejected. This is an administrative
trust boundary, not a claim that JSON proves database state. An independent
reviewed database gate produces the evidence. The authorization binds its digest,
Docker daemon ID, network ID, volume identity, both current container IDs, package
digest, exact image IDs, operator/window identifier, issuance/expiration (maximum
15 minutes), and explicit activation_authorized=true. No live artifact is created
by this implementation gate. The immutable base specification stays false.

The resolved production contract is the exact base specification with only the
separately authorized activation flag overlaid. False/missing authorization fails.
DB evidence requires exact post039 ledger/checksums identity and fingerprint,
catalog zero, 040 absent, preserved tenant/security gates and writer isolation.
It is bound to the same window and daemon, fresh within five minutes at entry.

## Replacement and failure

Preflight validates both images and resources before any stop/rename. Existing
containers are retained, stopped and renamed by exact ID; nothing is deleted.
Old aliases are disconnected before candidate creation. Network and uploads
volume must already exist and are never created, removed or recreated by executor.
API runs before WEB and authenticated read probes must pass first. A protected
exclusive journal binds a window to one invocation. Repeated same-window execution
is rejected. A new explicitly authorized window may classify already exact healthy
containers and skip replacement; unhealthy candidates stop rather than blind retry.
Any failure records only fixed diagnostic codes and stops; no old API fallback.
An incident after isolation needs separate recovery/forward-fix authorization.

## Boundaries and acceptance

No Nginx/admission/descriptor/DB mutation support. These remain external window
gates. Secrets are parsed into memory and transported to Docker over stdin only,
never CLI arguments, output or journal. Authenticated smoke uses a separately
protected existing session input; executor creates no user/session/business data.
Disposable mode requires an explicit unique namespace and fixture authorization,
never production names, networks or credential files. It runs the same executor.

Required acceptance: success topology/identity/health/read/routing matrix; negative
authority, DB, image, secret, port, network, volume and health matrix; failure
injection and reentry; secret sentinel hygiene; unchanged runner/manifest/images.
Publication only after all local and actual-image disposable checks pass.

## Authorized topology/session HF (base a80fe545)

Classify current persisted bindings separately from effective publication. Only
the exact historical loopback 18081/API and 13001/WEB bindings may be accepted for
old images, with null effective ports, independently observed absent listeners and
fresh protected Nginx Docker-DNS evidence bound to current container IDs. Unknown
bindings/effective publication fail. Candidate validation remains unchanged: no
persisted or effective publication. Capture classification and expected removal.

Require a normal-authentication session and expected user/tenant/branch identity,
with expiry beyond the authorized window plus 300 seconds. Compare /auth/me
identity and require every representative read to pass; never accept any tenant
merely because HTTP200 was returned. Session acquisition is a human-only normal
login procedure, not SQL insertion. No real session is created in this HF gate.
No production mutation, topology repair, isolation, checkpoint or migration.
