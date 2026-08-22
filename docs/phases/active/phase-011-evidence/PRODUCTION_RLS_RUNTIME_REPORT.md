# PHASE-011 — Production RLS and Runtime Report

## Status

**BLOCKED BEFORE MUTATION — CANONICAL PRESTATE CONTRACT MISMATCH**

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

No grants were issued and the activation wrapper was not executed. No policy,
RLS flag, role, ownership, data or schema was changed. Resolution requires an
architecturally approved production-empty prestate adaptation that preserves
the canonical final policy definitions and hashes.
