# Phase 1.2E — A2E Legacy Authority Eradication Audit

## Purpose

A2E is a read-only release gate. It determines whether the deprecated Rack authorities can be removed in a later, separately authorized migration. A2E does **not** drop columns, rewrite data, modify Migration 034, or create Migration 035.

Canonical Rack authority is `assets.housing_rack_id`. The deprecated authorities under audit are:

- `switches.rack_id`
- `patch_panels.rack_id`
- `pdus.rack_id`
- `assets.specs['rack_id']`

## Authorized base

`9d1fcd9e47eb0485e87b4fd012f1c851d10002ab`

Branch: `phase/1.2e-a2e-legacy-authority-audit`

## Required evidence

Run:

```bash
DATABASE_URL='postgres://...' bash scripts/phase1_2e_a2e_legacy_authority_audit.sh
```

The script is read-only. PostgreSQL is entered with `BEGIN READ ONLY` and terminated with `ROLLBACK`.

## PASS criteria

A2E may be declared `PASS` only when all of the following are demonstrated:

1. `BASE_IS_ANCESTOR=YES`.
2. `RUNTIME_LEGACY_REFERENCE_COUNT=0` for executable backend/frontend source. Historical migrations, documentation and test fixtures are evidence but are not runtime blockers.
3. `MIGRATION_035_PRESENT=NO` during A2E.
4. Each legacy data authority contains zero live values:
   - `switches.rack_id = 0`
   - `patch_panels.rack_id = 0`
   - `pdus.rack_id = 0`
   - `assets.specs.rack_id = 0`
5. Every reported `DIVERGENCE` count is zero.
6. No runtime database view or function depends on the exact `rack_id` token.
7. The audit completes with `DB_AUDIT=COMPLETE_READ_ONLY`.
8. No schema/data mutation, VPS access, deployment, or production change occurs.

## BLOCKED criteria

A2E is `BLOCKED` if any runtime reader/writer remains, any legacy value remains, a database object depends on the legacy authority, or database evidence cannot be obtained. A blocked audit must produce a remediation plan; it must not create the drop migration.

## Next gate

Only after A2E is `PASS` may a later phase consider Migration 035 to remove deprecated authorities. That migration must be independently reviewed and validated; A2E itself never performs the drop.
