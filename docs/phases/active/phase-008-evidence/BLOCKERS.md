# PHASE-008 — Blockers and residual issues

## Blocking status

No blocker prevents publishing the candidate or opening the authorized draft
PR.

## Residual known issues

- Contradictory `NO ACTION` / `SET NULL` FKs on NOT NULL
  `import_jobs.user_id`; separate schema decision required.
- Inherited full-suite panic in
  `TestHandleInventoryImportRoutes_DetailValid`; visible and out of scope.
- Previously documented structurally unavailable ISO relationship,
  contextless-session and natural-expiry observations.
- The VPS checkout is an old dirty operational tree; active release identity is
  the healthy immutable image/revision. PHASE-008 did not mutate the checkout.
- The pre-existing local development DSN placeholder remains present exactly as
  in `main`, relocated by approved runtime code; no new secret was introduced.

None of these items authorizes a silent fix, merge to `main`, production action,
schema/FK change, role/grant change or RLS weakening.
