# ARCHITECT DECISION — PHASE-011 FRONTEND BUILD CLOSURE GATE

## Decision

**APPROVED FOR BOUNDED FRONTEND BUILD CLOSURE IN REPOSITORY ONLY.**

Stage F exposed a second independent unresolved frontend dependency after the first Backbone integration defect was diagnosed. This means the production frontend cannot be treated as a one-file repair. A bounded build-closure pass is required before any application image may be deployed.

Production PostgreSQL/Redis/RLS state remains authoritative and must not be modified by this gate.

## Confirmed facts

- `BackboneSelector` is active code and its persistent contract is the existing `/api/infra/backbone` API.
- The proposed minimal Backbone API reconnection removed the original missing-module error but was intentionally withdrawn when a broader build issue appeared.
- `frontend/components/layout/AppShell.tsx` actively imports `useSkiaContext` from `@/providers/SkiaContextProvider`.
- No `SkiaContextProvider` implementation was found in the currently available repository search/historical refs during the prior gate.
- No application production containers have been started.

## Objective

Produce one coherent, reviewable frontend candidate that builds from a clean checkout without inventing parallel state-management architecture.

## Authorized work

Codex may, on `phase/011-empty-production-provisioning` only:

1. run a complete static inventory of unresolved local/alias imports and missing modules reachable by the Next.js production build;
2. trace each unresolved symbol to its active call graph, existing API/session/context contract, historical refs, sibling components, tests and backend endpoints;
3. classify every unresolved dependency as one of:
   - **RECONNECT EXISTING CONTRACT** — a canonical API/session/context mechanism already exists;
   - **SUPERSEDED/DEAD CODE** — repository evidence proves the importing code is unreachable or replaced;
   - **MISSING CANONICAL IMPLEMENTATION** — active code requires a provider/module whose behavior can be reconstructed exactly from existing consumers and authoritative runtime contracts;
   - **ARCHITECTURAL GAP** — behavior cannot be derived safely without inventing semantics;
4. implement only the smallest set of changes needed to close classes 1–3;
5. for `SkiaContextProvider`, first determine all consumers and the authoritative sources for `currentTenant`, `currentBranch`, `currentUser` and any additional exposed contract before implementation or replacement;
6. prefer existing authenticated session/context endpoints and already-approved tenant/branch selection semantics over localStorage, hard-coded defaults, synthetic context or role-name bypasses;
7. retire an import/component only when repository evidence proves it is superseded or unreachable;
8. restore the previously validated Backbone API reconnection only if the full build-closure candidate remains coherent;
9. add focused tests for any newly reconciled provider/store behavior where practical;
10. publish a complete frontend dependency/integration report before Stage F deployment.

## Mandatory fail-closed rules

Do not:

- create placeholder providers that return fake/demo tenant, branch or user values;
- introduce localStorage as an authority for tenant/branch authorization;
- invent new backend endpoints or auth semantics merely to satisfy the build;
- suppress TypeScript/module errors with broad `any`, path aliases to empty shims, `// @ts-ignore`, disabled type checking, or Next.js build-ignore flags;
- remove active production functionality solely to make `next build` pass;
- copy undocumented modules from unrelated projects;
- touch production DB, RLS, grants, secrets, Nginx or DNS while doing build closure.

If any active missing dependency is classified **ARCHITECTURAL GAP**, stop and publish `BLOCKED` without further Stage-F deployment attempts.

## Validation gate before any VPS application deployment

The candidate must pass from a clean frontend checkout/environment:

- `npm ci`;
- complete production `next build` with no ignored type/module errors;
- static unresolved-import scan showing zero reachable unresolved internal imports;
- focused tests/type checks available for reconciled modules;
- no secrets/default production credentials introduced;
- diff review proving changes are limited to frontend build closure and evidence;
- backend image/source remains pinned to the approved production source unless a separately documented source change is required by the frontend contract.

The exact candidate Git SHA must be committed and pushed before building deployable images.

## Stage-F/H continuation

If all validation passes, Codex is authorized to:

1. rebuild backend/frontend images using the exact committed candidate SHA;
2. verify image IDs/digests and labels map to that SHA;
3. execute dark `docker compose up` only for the production application services already authorized by PHASE-011;
4. perform internal/loopback health, session/auth, tenant/branch fail-closed and empty-database smoke tests;
5. preserve PostgreSQL/Redis/RLS invariants;
6. publish all Stage F-H evidence.

No DNS, public Nginx route activation or production traffic is authorized.

## Main promotion requirement

Because this closure changes application code relative to `main@8139fc4c65c3cdacc9d7467285f3b3c4b977c7cb`, a successful dark-deploy candidate is **not eligible for public traffic** until its exact source changes are reviewed and merged to `main` under a separate promotion gate.

## Final classification

Return exactly one of:

- `READY FOR MAIN PROMOTION AND PRODUCTION TRAFFIC ACTIVATION GATES` — build closure and dark deploy/smoke validation all pass; or
- `BLOCKED` — any unresolved architectural gap, build failure or dark-deploy validation failure remains.
