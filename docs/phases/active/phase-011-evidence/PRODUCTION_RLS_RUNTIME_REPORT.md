# PHASE-011 — Production RLS and Runtime Report

## Status

**APPROVED — CLEAN PRODUCTION RLS BOOTSTRAP**

The adopted Stage C continuation guards all passed. Before applying grants or
running the activation wrapper, the exact PHASE-005 guard was compared with the
observed production state.

The canonical activation artifact requires this exact legacy prestate on
`assets`, `asset_logs` and `asset_relationships`:

- three named legacy policies with fixed hashes;
- `FORCE ROW LEVEL SECURITY=true`;
- `ROW LEVEL SECURITY=false`;
- exactly twelve runtime table grants.

The clean PHASE-010 production bootstrap instead has the expected empty
production prestate:

- zero policies;
- `FORCE=false` and `RLS=false` on all three protected tables;
- no runtime grants yet.

`ops/phase011/activate_production_rls.sh` adapts only the authorized environment
and approval token. It does not adapt the canonical prestate guard. Therefore
the canonical SQL would reject this state before its transaction, and adding
the grants first would leave a partial Stage D mutation.

The clean-prestate mismatch was resolved by
`ARCHITECT_DECISION_PHASE011_CLEAN_RLS_BOOTSTRAP_GATE.md` and the independent
`ops/phase011/activate_clean_production_rls.sql` artifact. Historical PHASE-005
artifacts were not modified.

## Ephemeral validation

PostgreSQL 16.14 validated clean-to-final convergence, idempotent second
invocation, and exact PHASE-005 final hashes. Unexpected policy, wrong flags,
wrong FK semantics, unsafe role attributes, incomplete grants and excess grants
all blocked. An induced failure after transaction start restored the exact
clean state: `0 grants | 0 policies | 0 RLS flags`.

## Single production execution

Exactly one Stage-D activation ran on 2026-08-22 and committed successfully.
Postchecks recorded:

- RLS/FORCE `true/true` on all three protected tables;
- policy hashes: assets `16283f38465792bdb7cba3cc265570cd`, logs
  `6f7ecd60e4d50630fc35fb5cc6184f7f`, relationships
  `6e7ce93697090bc0ce92e3984c779771`;
- exactly 12 target DML grants and no inferred global table grants;
- runtime remained non-superuser/non-BYPASSRLS and owned zero protected tables;
- contextless runtime SELECT returned zero rows and runtime DDL was denied;
- tenants/users/assets remained `0/0/0`; ledger remained 10;
- PostgreSQL and Redis remained healthy with restart count zero.
