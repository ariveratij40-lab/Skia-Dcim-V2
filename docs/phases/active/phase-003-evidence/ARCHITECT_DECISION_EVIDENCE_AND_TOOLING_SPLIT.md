# ARCHITECT DECISION — Separate PHASE-003 evidence from PHASE-002 tooling changes

## Status

`APPROVED ARCHITECTURAL DIRECTION`

## Context

The local working tree currently contains two materially different classes of untracked work:

1. PHASE-003 evidence under `docs/phases/active/phase-003-evidence/`.
2. Adapted PHASE-002 tooling under `tools/phase002/`.

The local PHASE-003 branch is also behind the remote architectural-decision commits.

These concerns must not be mixed into one commit or treated as one phase deliverable.

## Decision

### A. Preserve and version PHASE-003 evidence on the PHASE-003 execution branch

First, safely fast-forward the local branch to the current remote `origin/phase/003-rbac-baseline-execution` without losing untracked evidence.

Then version only PHASE-003 evidence produced by Etapas A/B and the role-name trace/tooling validation, preserving the architect decision files already present remotely.

The PHASE-003 evidence set may include:

- `RBAC_BASELINE_REPORT.md`
- `RBAC_PERMISSION_MATRIX.md`
- `BLOCKERS.md`
- `RBAC_PROFILE_PROPOSAL.md`
- `ROLE_NAME_TRACE.md`
- `PROFILE_BASELINE_TOOLING_VALIDATION.md`

Do not include `tools/phase002/` in the PHASE-003 evidence commit.

### B. PHASE-002 tooling must return to its own implementation branch

The adapted files under `tools/phase002/` are implementation artifacts of PHASE-002, not PHASE-003.

After PHASE-003 evidence is safely committed, move/carry the PHASE-002 tooling changes to `phase/002-fixture-implementation` using a safe method that preserves the already published PHASE-002 history.

Do not overwrite, reset, or lose the published PHASE-002 commits.

The resulting PHASE-002 tooling diff must be reviewed against the last published tooling baseline and contain only the profile-baseline adaptation authorized by PHASE-003.

### C. No execution authority

This decision does NOT authorize:

- PHASE-003 Etapa C;
- SQL writes;
- HTTP staging tests;
- fixture creation;
- rollback execution;
- RLS changes;
- deploy;
- VPS modification.

## Required local sequence

1. Preserve all untracked evidence/tooling safely.
2. Fast-forward PHASE-003 local branch to the remote tip.
3. Confirm no evidence was lost.
4. Commit only the PHASE-003 evidence set.
5. Do not push until requested.
6. Return/carry `tools/phase002/` changes to `phase/002-fixture-implementation` without mixing PHASE-003 evidence into that branch.
7. Show the resulting diff/status on both branches.

## Architectural rationale

PHASE-003 defines and audits the authorization baseline. PHASE-002 owns the fixture tooling that consumes that baseline. Keeping the commits separate preserves phase boundaries, makes review/rollback deterministic, and prevents a documentation/audit phase from silently owning implementation changes belonging to another phase.
