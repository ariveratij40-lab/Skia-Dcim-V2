# P0 production executor HF — implementation only

Authorized base: 67996bbf3e40077c0adc8d72bd817a4d1fd8cfd3.
This gate does not authorize production repair or publication. No migrations,
Model B changes, application changes, service changes or production fixtures.

## Execution design

Keep the disposable CLI and its exact namespace guard. A separate production
entry shares the existing eight-signature transaction, not a second SQL list.
Default invocation is an offline plan. Production requires root, the pinned local
Docker/cluster/container/network/database identity, a root-controlled immutable
Git checkout, and a separately issued external root-owned 0600 authorization.
The identity contract pins the read-only observation of 2026-09-24; recreation or
identity drift requires a new reviewed contract, not a CLI override.

The authorization binds purpose, environment, database, canonical checkout SHA,
tooling closure SHA256, manifest SHA256, exact hashes/counts, operator, lifetime
(maximum 900 seconds), and a 32-hex single-use ID. It is not a DB credential.
Provision externally with O_CREAT|O_EXCL|O_NOFOLLOW and mode0600, fsync file and
parent, in /var/lib/skia/p0-security-repair (root0700). Never pass its contents
in argv. Duplicate JSON keys and unexpected fields fail closed. Root is the
trusted issuing authority; this is not a signed multi-party approval system.
The operator is bound to `alvaro` and the observed sudo invoking user. Future
execution uses a root-controlled checkout and sanitized Python environment
(`python3 -E -s -B`); no PYTHONPATH injection or remotely selected Docker context.
The tooling digest covers the complete local Python/SQL/identity/ledger dependency
closure. The manifest digest binds the single ROUTINES tuple plus its reviewed
security/body specification. Canonical SHA must match checkout HEAD, descend from
the authorized base, and contain the exact executable closure bytes.

Before any DB mutation, exclusively create and fsync a nonce claim in the same
protected directory. Every attempt consumes its nonce, including failed attempts.
Never delete or recycle claims. Capture only baseline hashes/counts and routine
identities, not row values. Verify live source, identity, baseline, and expiry
again in transaction immediately before the fixed repair. Verify canonical
structure, preserved baseline/ledger/catalog and authorization expiry before
commit; raw fingerprint is checked before and after as in the reviewed repair.

Interruption before transaction leaves a consumed nonce and no repair. During
transaction PostgreSQL connection loss rolls back; catchable interruptions
explicitly roll back. After COMMIT and before evidence, outcome is uncertain:
the durable claim remains consumed. Only read-only classification may follow;
never blind retry or an automatic corrective transaction. Durable success is
written only after exact postconditions. External concurrent business writes
may cause preservation rejection; this tool neither freezes writers nor opens
an admission gate. An exclusive operator window remains required.

## Test authority

The test-only adapter lives in the test harness, not the shipping CLI. It binds
an independently inspected local disposable container whose name must match the
existing namespace, and cannot bind skia_postgres_prod. It exercises the same
authorization, claim, live verification and atomic repair orchestration, with
synthetic artifacts and current-user protected temporary directories. Production
identity/file/provenance gates are tested separately; no production override flag.

## Release boundary

Local commit only after all applicable tests pass. Push/PR require separate
explicit authorization under AGENTS.md. Merging does not issue an authorization
artifact or execute repair. Production remains untouched by this gate.

## Validation evidence (local, 2026-09-24)

Fresh PostgreSQL16.14 fixture `skia-p0-05738ec0ce1a-a` exercised the actual
executor orchestration with the test-only adapter. Source structure
`19d3ecd3062980f27efbb8b0101d1342a8b1824b8fc58a3a3d58412ed4866854` became
`7d6bfb8e958bc13700c2bbcd11fce71bcaa1489cc1e01accaddba3b87f5805be`;
raw stayed `8712fcae88f98f7c75605772ab88cbeb52d06e022c07a8782b045e33caec0c10`.
Ledger27/catalog0 and the complete business/function snapshot were preserved.
No036–040 migration was executed; the 036 negative is a rolled-back ledger marker.

Actual-path ledger/036/owner/ACL/missing-routine negatives passed. Interruptions
after repairs1/4/8 rolled back. A simulated evidence-write failure after commit
left canonical state and a durable consumed claim; same-artifact and new-artifact
reentry both rejected. A separately reset disposable rehearsal completed with
durable success evidence. Existing disposable repair/security regressions,
32 EXECUTE cases and rollback-only onboarding trigger passed before and after.

Tooling suite:136 tests,135 PASS,1 existing explicitly gated disposable skip.
Authorization field/expiry/identity/hash/mode/symlink/hardlink/duplicate/nonce
negatives passed; concurrent exclusive claim allowed exactly one winner.
Python syntax and diff checks passed. Model B, backend, frontend and migrations
036–040 are byte-identical to base;041 absent. No new regression detected.

Production access was limited to read-only target-identity discovery and GET
verification of the existing protected session. No new login or persistent
production operation. Session valid with77735 seconds remaining at observation
(72395 above the5340-second threshold); not a promise of future validity.

Changed scope: this specification, `p0_security_repair.py`,
`execute_p0_production_repair.py`, `p0_production_identity.json`,
`test_p0_production_executor.py`, `test_p0_production_rehearsal.py`.
No production execution, no push and no PR are authorized by this local result.

Final repeated rehearsal `skia-p0-18ed8c383fd8-a` additionally exercised a real
PostgreSQL division-by-zero failure after the fourth repair, confirmed complete
rollback, and verified live raw mismatch before transaction consumes the claim
without any database change. All prior positive/security/interruption/reentry
matrices passed again. Both disposable fixtures and evidence remain retained.

Authorization exact JSON keys: `purpose`, `environment`, `database`,
`canonical_sha`, `tooling_sha256`, `manifest_sha256`, `source_structure`,
`target_structure`, `raw_fingerprint`, `affected_routine_count`, `source_ledger`,
`catalog_count`, `operator`, `issued_at`, `expires_at`, `id`. No extra keys.
Filename is `<id>.json`; sibling `<id>.claimed`, `<id>.before` and `<id>.success`
are exclusively created protected evidence. Missing success is never proof of
rollback: classify live structure read-only before any new authorization.
