# ARCHITECT DECISION — PHASE-011 FRONTEND BUILD BLOCKER GATE

## Decision

**APPROVED FOR REPOSITORY-ONLY DIAGNOSIS, MINIMAL FIX, REBUILD, AND DARK-DEPLOY CONTINUATION IF PROVEN.**

Stage E is accepted as complete. The current blocker is isolated to Stage F: `frontend/components/BackboneSelector.tsx` imports `../lib/backboneStore`, but the referenced module is absent from the canonical source tree used for the production build.

This gate does not authorize weakening TypeScript/Next.js build checks, deleting the component merely to make the build pass, or introducing a new unreviewed data model.

## Required diagnosis before editing

Codex must determine, from repository history and active references, which of the following is true:

1. `backboneStore` existed previously and was omitted accidentally from the promoted lineage;
2. the component was migrated incompletely and should use an existing canonical module/API instead;
3. `BackboneSelector` is dead/unreachable code and can be removed only if repository evidence proves no active import/runtime route depends on it;
4. another structural condition exists, in which case stop `BLOCKED` rather than inventing behavior.

Search repository history/branches/commits for `backboneStore`, exported symbols `BackboneItem`, `BackboneMedia`, `BackboneType`, `BackboneStatus`, `getBackbones`, `addBackbone`, and every import/use of `BackboneSelector`.

Document exact provenance and active call graph before changing code.

## Authorized minimal fixes

Only after provenance is established, Codex may implement exactly one of these evidence-backed repairs:

- restore the missing module byte-for-byte or semantically equivalent from an authoritative prior repository version, adapting only what is required for the current build;
- reconnect `BackboneSelector` to an already-existing canonical store/API with the same intended domain semantics;
- remove the component and its imports only if it is conclusively unreachable/dead and no supported user flow depends on it.

If a new store/module design would have to be invented, stop `BLOCKED` for architectural review.

## Validation requirements

Before any VPS application deployment:

- `npm ci` must succeed from the exact frontend source;
- `next build` / production frontend build must pass with no ignored TypeScript/module-resolution errors;
- run focused tests/lint/typecheck available for the affected frontend path;
- search must show no unresolved import of `backboneStore` or equivalent missing module;
- backend image already built must still correspond to the approved production source lineage, or be rebuilt from the same exact post-fix source SHA if the repository commit changes the release source;
- no secret or environment default may be introduced into source.

The fix and evidence must be committed and pushed on `phase/011-empty-production-provisioning` before any dark deploy.

## Source-lineage rule

Because the frontend fix changes application source after `main@8139fc4c65c3cdacc9d7467285f3b3c4b977c7cb`, the dark deployment MUST use the exact new PHASE-011 commit SHA containing the reviewed fix and evidence. Record image tags/digests against that SHA. Do not label the resulting application image as the old `main` SHA.

This branch-level dark deploy is allowed only for PHASE-011 validation. Promotion of the source fix to `main` requires a later PR/merge gate before public production traffic activation.

## Continuation authorization

If the minimal fix is evidence-backed and all local/build validations pass, Codex is authorized to continue Stages F-H:

- build immutable backend/frontend images from the exact PHASE-011 fix SHA;
- start application containers in dark mode only;
- verify internal health, runtime DB identity, RLS behavior, Redis connectivity, zero business data, and smoke/security checks;
- keep public Nginx/DNS routing disabled;
- publish complete evidence.

## Hard stops

Stop `BLOCKED` if:

- provenance of the missing module cannot be established;
- the repair requires inventing a new backbone domain model or persistence contract;
- additional unrelated frontend build errors expose broader incomplete feature integration;
- dark deploy would require DNS/public routing, production data, or STAGING changes;
- any security/runtime/RLS invariant regresses.

Final classification remains:

- `READY FOR PRODUCTION TRAFFIC ACTIVATION GATE`, or
- `BLOCKED`.
