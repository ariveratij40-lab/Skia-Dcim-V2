# PHASE-011 — Frontend Dependency Integration Report

## Inventory and classification

The complete TypeScript inventory found two unresolved internal dependency
families and no others.

1. `../lib/backboneStore` — **RECONNECT EXISTING CONTRACT**. The module never
   existed in any available commit/ref. `SwitchAdmin -> BackboneSelector` is an
   active call graph, and `GET/POST /api/infra/backbone` is the authoritative
   existing persistence contract.
2. `@/providers/SkiaContextProvider` — **SUPERSEDED/DEAD CODE**. Every consumer
   was confined to `components/layout/*`; that `AppShell` subtree had zero
   imports from pages, `_app` or the active `components/AppLayout.tsx`.

The candidate reconnects BackboneSelector to the existing API and removes only
the unreachable alternate layout subtree. No provider, store, authorization
source, endpoint, localStorage authority or default identity was introduced.

## Validation

- `npm ci`: approved.
- `tsc --noEmit`: approved; zero unresolved internal imports.
- `next build`: approved; 29 static/page routes generated.
- `next lint`: not executable non-interactively because no ESLint configuration
  is versioned and Next.js starts its configuration wizard. No configuration
  was synthesized in this gate.
- Dependency audit remained at 1 moderate and 6 high findings; no dependency
  mutation was authorized.
- Secret/default scan: no production credential or authorization default added.

The frontend build-closure candidate is approved for immutable dark-deploy
validation only. Main promotion remains a separate gate.
