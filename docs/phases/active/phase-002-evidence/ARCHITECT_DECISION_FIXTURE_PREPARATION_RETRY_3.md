# PHASE-002 — Architect Decision: Third Controlled Fixture Preparation Attempt

## Decision

The portable manifest-permission guard published in commit `1e3cd6f5233bfbb587da81803e5f6bf2f86cc6f2` is approved for a third controlled preparation attempt in STAGING.

This authorization is narrow. It permits only:

1. immediate read-only preflight;
2. generation of fresh temporary fixture credentials outside Git;
3. a single invocation of `tools/phase002/prepare_fixtures.sh` using the approved tooling;
4. immediate manifest validation if preparation succeeds;
5. immediate read-only `verify_fixtures.sql` if preparation succeeds;
6. read-only survivor checks if preparation fails before commit.

It does not authorize CAMPAÑA A HTTP, RLS changes, deploy, migrations, production, manual SQL variants, direct execution of `prepare_fixtures.sql`, or rollback unless separately authorized.

## Required preconditions

Before invoking preparation, Codex must confirm and record without exposing secrets:

- branch/tooling corresponds to published PHASE-002 tooling and commit `1e3cd6f5233bfbb587da81803e5f6bf2f86cc6f2` or a later commit containing no additional functional changes to the preparation path;
- backend runtime remains `d155910c231e96446672508534ccec83bf0d830f`;
- `relevant_runtime_source_differs=false`;
- database is `skia_db`;
- PostgreSQL role is the previously audited staging role;
- canonical fixture range is empty and there are no noncanonical TEST collisions;
- the verified pre-existing backup remains available, readable, mode-restricted and checksum-consistent;
- manifest destination is a fresh absolute external path outside Git under a protected directory;
- the manifest destination does not exist before the wrapper is invoked;
- fresh credentials/hashes are generated outside Git and are not written to evidence.

If any precondition differs, stop and classify `BLOQUEADO`.

## Execution constraints

The wrapper must be invoked exactly once. Do not call `prepare_fixtures.sql` directly.

The wrapper must remain fail-closed for manifest permission validation. The portable stat detection must produce normalized mode `600` before psql may be invoked.

No interactive correction or second invocation is permitted during this authorization.

## Success path

If `prepare_fixtures.sh` exits `0`:

1. confirm the manifest exists outside Git and has mode `0600`;
2. compute SHA-256 externally;
3. verify exact manifest cardinalities and aliases expected by Fixture V1;
4. run `verify_fixtures.sql` read-only;
5. record exact observed counts for tenants, branches, users, roles, user_tenants, user_branches, user_roles, role_permissions, assets, asset_logs and asset_relationships;
6. verify no privileged runtime role name was created;
7. verify tenant/branch coherence and the approved neutral `operator` profile baseline;
8. stop. Do not begin CAMPAÑA A.

A preparation exit `0` is not sufficient by itself; verification must also pass before the fixture can be classified `PREPARADO Y VERIFICADO`.

## Failure path

If preparation exits non-zero before commit:

- do not retry;
- verify the manifest was removed or is safely incomplete and non-authoritative;
- run read-only survivor checks over all fixture tables;
- require zero surviving canonical fixture IDs;
- delete fresh credential artifacts;
- document the failure and stop.

If preparation appears to commit but verification fails, do not run CAMPAÑA A and do not execute rollback automatically. Preserve the manifest and checksum, classify the state `PERSISTIDO PERO VERIFICACIÓN FALLIDA`, and request a new rollback decision.

## Evidence

Update `docs/phases/active/phase-002-evidence/FIXTURE_PREPARATION_REPORT.md` with the third-attempt result. Do not include secrets, password hashes, tokens, cookies, connection strings or full sensitive responses.

## Current authorization state

- Third controlled preparation attempt: `AUTORIZADO`.
- Immediate read-only verification after success: `AUTORIZADO`.
- CAMPAÑA A HTTP: `NO AUTORIZADA`.
- Rollback after committed fixture: `NO AUTORIZADO` without a new decision.
- RLS changes: `NO AUTORIZADAS`.
- Deploy: `NO AUTORIZADO`.
- Production: `FUERA DE ALCANCE`.
