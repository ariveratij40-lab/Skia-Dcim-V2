# Architectural Decision — PHASE-003 Profile Baseline

## Decision

PHASE-003 Etapa B establishes the following architectural rule for PHASE-002 isolation fixtures:

1. The runtime role names `admin` and `super_admin` MUST NOT be used for PHASE-002 fixture actors.
2. The logical actor aliases `ADMIN`, `OPERATOR`, and `MULTI-BRANCH` are test personas, not runtime role names.
3. For CAMPAÑA A, all three personas SHOULD use the same non-privileged runtime role semantics so that tenant/branch isolation is tested without role-name side effects.
4. The preferred runtime role name is `operator` if the current schema/assignment path accepts it safely; otherwise preparation remains BLOCKED pending a compatible neutral role name explicitly validated by preflight.
5. `TEST-ADMIN` differs from `TEST-OPERATOR` only by branch mappings for purposes of PHASE-002. It is an administrative test persona label, not a grant of runtime `admin` semantics.
6. `TEST-MULTI-BRANCH` MUST use the same role semantics as `TEST-OPERATOR`; its broader scope comes only from two explicit `user_branches` mappings.
7. The normative catalog permission `{dcim:view}` may be assigned for traceability/minimum-privilege documentation, but it MUST be classified as `NO ENFORCED` until runtime code actually checks it. It cannot be cited as an effective security control in CAMPAÑA A.
8. Effective authorization evidence for CAMPAÑA A must be attributed to the observed controls actually enforced by the application: session validity, tenant mapping, branch mapping, handler/context filtering, and any separately observed runtime checks.
9. RLS remains outside PHASE-003 and unchanged. PHASE-002 CAMPAÑA A continues to measure the application layer with the currently observed RLS state.

## Rationale

The role-name trace found that `admin` expands capabilities outside the PHASE-002 minimum matrix, including administrative users access, dashboard multi-branch behavior, and AI `branch_scope_all`. Using `admin` would therefore introduce an uncontrolled variable and could create false conclusions about tenant/branch isolation.

The trace also found that `operator` and `viewer` do not create equivalent actor-side bypasses in the examined runtime paths, while `{dcim:view}` is present only as catalog/seed/documentation and is not enforced by runtime code.

For isolation testing, the clean experimental design is to hold role semantics constant and vary only tenant/branch mappings. This allows PHASE-002 to determine whether contextual authorization and filters prevent cross-tenant and cross-branch disclosure without conflating the result with privileged role-name behavior.

## Required PHASE-002 tooling changes before preparation

The PHASE-002 fixture tooling must be revised so that:

- it does not require a real `admin`/`operator` source pair;
- it does not create or assign runtime role name `admin` to fixture users;
- the logical ADMIN persona receives the same neutral/operator role semantics as the operator personas;
- the ADMIN persona receives two authorized branches through `user_branches` only;
- the OPERATOR persona receives one branch;
- the MULTI-BRANCH persona receives two branches and otherwise remains identical to OPERATOR;
- `{dcim:view}` is recorded as normative metadata/catalog assignment only, not as an effective enforcement claim;
- preflight explicitly verifies that the selected neutral role name has no special actor-side bypass in the PHASE-002 matrix;
- preflight blocks if the assignment mechanism rejects the selected neutral role name or if any new special-case role-name behavior is discovered.

## Experimental control

For CAMPAÑA A, the intended variable set is:

- same role semantics across all actors;
- different tenant mappings;
- different branch mappings;
- deterministic fixture data;
- unchanged application SHA during the campaign;
- unchanged RLS state during the campaign.

Any deviation must be recorded as a confounding variable.

## Status

- PHASE-003 Etapa B: `APROBADA` for this baseline decision.
- PHASE-003 Etapa C: `NO AUTORIZADA` by this document.
- PHASE-002 preparation: `BLOQUEADA` until tooling is adapted to this decision and a new read-only preflight passes.
- VPS deploy: not authorized.
- PostgreSQL writes: not authorized.

## Next authorized action

Codex may update PHASE-003 evidence and PHASE-002 tooling locally to consume this baseline, then perform static/local validation only. No staging writes, HTTP campaign, fixture creation, rollback, deploy, RLS change, or migration is authorized until a subsequent architectural approval.
