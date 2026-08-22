# PHASE-010 — Clean Bootstrap Manifest

## Status

**APPROVED IN LOCAL/EPHEMERAL VALIDATION**

The executable source of truth is `ops/phase010/bootstrap.manifest`, applied by
`ops/phase010/run_clean_bootstrap.sh`. It selects ten production-safe artifacts
in explicit order. Historical demo/test/password-repair/legacy-truncation SQL,
the duplicate `015_assets_rls.sql`, and `016_assets_branch_scope_all.sql` are
excluded. Canonical RLS remains a separate `ops/phase005` operation.

The runner accepts only a local PostgreSQL URL, rejects missing or changed
artifacts, records path plus SHA-256, applies pending files transactionally,
converges on subsequent invocations and validates the resulting contract.

Forward-only additions are `017_clean_bootstrap_branch_invariant.sql` and
`018_clean_bootstrap_runtime_schema.sql`.
