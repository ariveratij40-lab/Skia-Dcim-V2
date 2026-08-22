# PHASE-011 — Blockers

## P11-BLK-002 — Resolved by portable hash adoption

- Stage: C — Database roles and clean bootstrap
- Status: **RESOLVED**
- Expected: `61bdcf58f437c5ab4d5c48ad48b14c9ba1af3a0439eb7a04f22da9d4817f3792`
- Observed: `d0d6e0541575a70bbca89ccb5786ac8f8144c34d1d5295c740c4db8a128ba827`
- Passed: two manifest invocations, ledger 10, restricted role attributes and
  zero fixture rows.
- Diagnostic result: semantic equality proven; the old hash changes between
  pg_dump 16.14 and 16.15, while the unified hash is stable.
- Resolution: `ARCHITECT_DECISION_PHASE011_HASH_ADOPTION_AND_CONTINUATION_GATE.md`
  adopted the portable procedure/hash. The mandatory recheck passed on
  2026-08-22.

## P11-BLK-003 — Canonical RLS prestate incompatible with clean production

- Stage: D — Canonical RLS and restricted runtime
- Status: **RESOLVED**
- Observed production prestate: zero policies and `RLS/FORCE=false/false` on
  all three protected tables, as produced by the approved clean bootstrap.
- Required canonical prestate: three exact legacy policies,
  `RLS/FORCE=false/true`, and twelve runtime table grants.
- Existing PHASE-011 adaptation changes only environment and approval values;
  it does not authorize a production-empty prestate transformation.
- Safety response: stopped before grants or activation. No database mutation
  occurred during the continuation attempt.
- Required resolution: an architectural decision defining a guarded
  production-empty activation path while preserving exact canonical final
  policy definitions and hashes.
- Resolution: the clean-production activation gate and independent PHASE-011
  artifact passed ephemeral validation and the single Stage-D execution.

## P11-BLK-004 — Restored CHECK expression representation differs

- Stage: E — Backup/restore proof
- Status: **BLOCKED**
- Backup and restore operations succeeded; ledger, data counts, RLS and policies
  matched.
- Fifteen CHECK constraints were reserialized with equivalent cast placement,
  changing the constraint fingerprint and portable dump hash.
- Safety response: restore target removed; no application build/deploy or proxy
  change attempted.
- Required resolution: architectural review of a restore-stable semantic/hash
  procedure. The current gate's exact restored hash requirement was not met.

## Final classification

**BLOCKED**

Stage D approved and Stage E created a valid backup and successful disposable
restore, but its exact comparison guard failed. Stages F–H were not executed.
No application build, dark deploy, reverse-proxy change, TLS, DNS or traffic
activation occurred. Production remains empty, isolated and healthy with
canonical RLS enabled.
