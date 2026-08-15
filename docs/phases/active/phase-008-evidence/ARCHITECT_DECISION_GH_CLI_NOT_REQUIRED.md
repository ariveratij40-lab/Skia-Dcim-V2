# PHASE-008 — Architect Decision: GitHub CLI is not a prerequisite

## Decision

APPROVED.

The absence of the local `gh` executable must not block PHASE-008. GitHub CLI is a convenience tool, not an architectural control.

## Authorized publication path

Codex may continue autonomously with PHASE-008 using standard `git` for local branch/worktree operations and authenticated `git push` for publication. It must not install or authenticate `gh` solely to satisfy PHASE-008.

For the draft pull request step, either of the following is acceptable:

1. If a supported authenticated GitHub API/client is available in the execution environment, use it to open the draft PR.
2. Otherwise, complete and publish the validated promotion candidate branch, publish all PHASE-008 evidence, record the exact candidate branch and SHA, and stop with the PR creation step marked `PENDING EXTERNAL ORCHESTRATOR` rather than `BLOCKED`.

The external architect/orchestrator may create the draft PR through the connected GitHub API without changing candidate content or requiring a local `gh` installation.

## Scope unchanged

All other PHASE-008 controls remain mandatory:

- do not merge to `main`;
- do not deploy production;
- do not change STAGING except read-only equivalence checks explicitly allowed by PHASE-008;
- do not weaken RLS or runtime-role controls;
- do not introduce schema, grant, role, credential or infrastructure changes;
- fail closed on unexpected lineage, code, security-policy or runtime drift;
- preserve documented residual technical debt rather than silently fixing it outside scope.

## Required behavior

Proceed from Etapa A without requesting installation of `gh`.

After A–D pass, publish the candidate branch with normal `git push`. For Etapa E, create the draft PR if a supported authenticated API is available; otherwise publish the evidence and stop with exact branch/SHA so the architect can create the draft PR directly.

Lack of `gh` by itself is not a stop condition and must not be reported as a technical blocker again.
