# PHASE-008 — Candidate content report

## Result

Stage B: **APROBADO**.

- Branch: `phase/008-main-promotion-candidate`.
- Base: `main@5b4f01e028508b1045aef1ecbb386947d627aac3`.
- Audited content commit: `545fbe8048ed6eaf0488380948dd73fd0b1bfd52`.
- History strategy: clean reconstruction with exact tree equivalence; source
  phase history remains published and unchanged.

## Included content

- PHASE-006 restricted runtime/migrator separation, tenant/branch transaction
  context, contextual jobs/imports, fail-closed inventory operations and tests.
- PHASE-004 branch mapping enforcement as represented by the final PHASE-006
  implementation and focused tests.
- `tools/tenant_db_lint/` from the approved runtime lineage.
- PHASE-005 canonical RLS activation, verification, rollback and PostgreSQL 16
  local validation artifacts under `ops/phase005/`.
- PHASE-008 specification, architecture decision and required readiness
  evidence.

## Excluded content

- PHASE-002 fixture preparation, credentials handling, manifests, deterministic
  TEST IDs and HTTP campaign runner;
- historical phase evidence not required to review this promotion;
- migrations/schema changes, Docker, Nginx, frontend and production config;
- backups and `.bak` files inherited by `main`;
- temporary local/VPS artifacts and all secrets.

The PHASE-002 runner emission test is therefore not applicable to this clean
candidate: neither the runner nor its fixture tooling is promoted. Historical
runner results remain traceable on the published PHASE-005/007 lineages.

## Security content check

No high-confidence secret, private key, token, TEST fixture ID, manifest or
production endpoint was introduced. A local development DSN using the
pre-existing `skia:skia` placeholder moved from `main.go` to
`database_roles.go`; the identical value already exists in `main` and is not a
new credential. Restricted mode requires explicit separated runtime/migrator
DSNs and fails closed when they are absent or equal.
