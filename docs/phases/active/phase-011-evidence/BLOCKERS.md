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
- Status: **BLOCKED**
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

## Final classification

**BLOCKED**

Stage D was stopped before mutation; Stages E–H were not executed. No grants,
RLS, backup/restore, application build,
dark app deployment, reverse-proxy change, TLS, DNS or traffic activation
occurred. Continuation requires a separate architectural decision.
Isolated PostgreSQL and Redis remain healthy for review.
