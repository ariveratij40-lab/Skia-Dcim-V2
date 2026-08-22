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

## P11-BLK-005 — Semantic gate expected 15 serializer diffs; observed 16

- Stage: E — Backup/restore semantic revalidation
- Status: **RESOLVED**
- One disposable restore revalidation enumerated 225/225 constraints and paired
  every raw difference by exact table/constraint identity.
- Observed serializer-only CHECK identities: 16; authorized exact count: 15.
- After the strictly limited cast normalization, semantic differences were zero
  and both sides hashed to
  `19f95417bba53f97adc66ae024abcbcde87bca9a650a0ea22f1e00024fe840b1`.
- Safety response: validator failed closed, target removed, and no Stage-F
  application operation was attempted.
- Required resolution: a new gate must explicitly reconcile the authoritative
  serializer-only identity set/count. Semantic equality alone cannot override
  the exact-count guard.
- Resolution: the cardinality-correction gate authorized exactly 16; the single
  revalidation passed with the fixed semantic SHA and Stage E was approved.

## P11-BLK-006 — Authorized frontend source does not build

- Stage: F — Application dark deploy
- Status: **BLOCKED**
- Stage E was approved by the cardinality-corrected semantic gate.
- Backend image build succeeded from the exact authorized SHA.
- Frontend `next build` failed because `components/BackboneSelector.tsx`
  references absent module `../lib/backboneStore`.
- Safety response: Compose deployment was not reached; no application
  containers, Nginx route, DNS change or traffic activation occurred.
- Required resolution: correct the frontend in an authorized functional phase,
  promote a new immutable source SHA and obtain a continuation/deploy gate.

## P11-BLK-007 — Broader missing frontend provider discovered

- Stage: F — Repository fix validation
- Status: **BLOCKED**
- Provenance: `backboneStore` has no historical implementation; the live
  selector call graph reaches the canonical backbone HTTP handler.
- A minimal repository-only reconnection removed the original module error, but
  production build then failed on absent `@/providers/SkiaContextProvider`
  imported by `components/layout/AppShell.tsx`.
- Safety response: candidate functional change withdrawn; no fix commit, image
  rebuild, application container or deploy was produced.
- Required resolution: architectural/product review of the broader incomplete
  frontend integration rather than serially inventing missing modules.

## Final classification

**BLOCKED**

Stages D and E approved. Stage F stopped on the frontend build failure before
container creation; Stages G–H were not executed beyond final evidence. No dark
deploy, reverse-proxy change, TLS, DNS or traffic activation occurred.
Production remains empty, isolated and healthy with canonical RLS enabled.
