# Nomenclature rule editor UX

## Problem and cause

The nomenclature catalog rendered its single create/edit form after the entire
asset-type card grid. Selecting **Definir norma** or **Editar norma** updated the
correct asset type and form state, but users with a long catalog had to discover
and scroll to the editor at the bottom of the page.

The API flow was already correct. New rules use the existing POST endpoint,
existing rules use the existing PUT endpoint, and the backend remains the
authority for definitive codes. The issue was exclusively presentation.

## New behavior

The existing form is now presented in a centered dialog immediately after an
asset type is selected. The same dialog handles unconfigured and configured
rules and preserves the current form initialization, structural locking,
preview calculation, save requests, error handling and catalog refresh.

The dialog:

- fits within the viewport and scrolls its content independently;
- keeps its action footer visible;
- focuses the description field when opened;
- exposes dialog semantics and associated field labels;
- closes through **Cancelar**, the visible close button or Escape;
- disables every close action while a save is active;
- restores page scrolling when closed;
- closes and reloads the catalog after a successful save so the affected card
  immediately displays its current status and backend preview.

## Fields and segment semantics

No fields or API properties were added. The editor continues to map description,
prefix, separator, sequence digits, branch inclusion, active state and the two
existing custom segment label/value pairs.

Each custom pair is presented as **Segmento adicional 1/2**:

- **Nombre del segmento** maps to the existing label property and describes the
  concept, for example Edificio, Piso, Área or Zona.
- **Valor** maps to the existing segment value and is the literal text/code that
  participates in the preview, for example E1, P02 or SITE-A.

Examples are helper text only and never populate the form. Placement remains a
derived, non-editable component only for the asset types already supported by
the current contract. Unsupported location flags are not exposed or invented.

## Normative preview

The preview uses the unchanged frontend calculation: prefix, optional branch,
the currently supported derived placement marker, configured custom segments
and next sequence. It is now visually prominent and identifies the conceptual
prefix, configured components and consecutive portions. It remains orientative;
the backend continues to generate authoritative asset codes.

## Scope and files

- `frontend/pages/infraestructura/catalogs/nomenclaturas.tsx`
- `docs/phases/active/NOMENCLATURE_RULE_EDITOR_UX.md`

There are no backend, API, database, migration, RLS, placement, counter,
sidebar, Dashboard, asset-summary or PHASE-013 changes.

## Validation and residual risks

Required validation includes clean dependency installation, TypeScript, the
production Next.js build and `git diff --check`, plus static review of create,
edit, cancel, close, save, preview, segments, branch, derived placement, active
state, loading/error feedback and responsive overflow.

Manual browser QA remains recommended for focus order, small viewport scrolling,
Escape behavior and the final visual appearance in both supported themes.
