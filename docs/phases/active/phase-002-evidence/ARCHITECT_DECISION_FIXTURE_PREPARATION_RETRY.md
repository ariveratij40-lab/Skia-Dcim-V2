# PHASE-002 — Architect Decision: Controlled Fixture Preparation Retry

## Decision

The corrective commit `60a52319d20a47ffbe19cbb2d54027731c10bd9d` has been reviewed against the failed first preparation attempt.

The manifest export correction is approved for one controlled retry in STAGING.

## Basis

- The first attempt failed before commit and PostgreSQL rolled back all fixture inserts.
- Follow-up read-only verification confirmed zero surviving fixture rows.
- The corrected client wrapper validates an absolute external manifest path, rejects repository paths, symlink destinations and pre-existing files, creates the destination with mode `0600`, and removes an incomplete manifest when psql fails.
- `prepare_fixtures.sql` exports the exact manifest using psql `\g :manifest_path` before `COMMIT`.
- `ON_ERROR_STOP=1` remains mandatory.
- Fixture cardinality and tenant/branch coherence checks execute before the manifest export and commit.
- The corrected tooling does not alter RLS, schema, runtime application code, Docker, Nginx or deployment configuration.

## Authorization

Authorized exactly once for this retry:

1. Confirm the branch/tooling SHA is `60a52319d20a47ffbe19cbb2d54027731c10bd9d` or a later commit containing only this architectural decision/evidence and no tooling changes.
2. Repeat the approved PHASE-002 read-only preflight immediately before writing.
3. Confirm the active backend runtime remains `d155910c231e96446672508534ccec83bf0d830f` and relevant runtime source differs=false.
4. Confirm the canonical fixture range is empty and no noncanonical TEST collisions exist.
5. Confirm the previously required verified backup remains usable, or create/verify a new staging backup before writing.
6. Generate fresh temporary test credentials outside Git; do not reuse credentials from the failed attempt.
7. Use `tools/phase002/prepare_fixtures.sh` as the only preparation entry point. Do not invoke `prepare_fixtures.sql` directly.
8. Use a new absolute manifest path outside the repository under a restrictive directory. The destination must not pre-exist.
9. Execute preparation once.
10. If preparation exits nonzero, stop immediately. Do not patch or retry interactively. Run only read-only survivor checks and document the failure.
11. If preparation exits zero, immediately verify manifest existence, mode `0600`, checksum SHA-256, expected per-table cardinalities, and execute `verify_fixtures.sql` read-only.
12. Record the preparation and verification evidence without secrets.

## Success criteria

A retry is `APROBADO` only if all of the following are true:

- preparation exit code `0`;
- manifest exists externally with mode `0600`;
- SHA-256 checksum is computed and retained externally;
- exact expected fixture cardinalities are present;
- `verify_fixtures.sql` passes all applicable checks;
- no privileged runtime role names are present in fixture roles;
- no cross-tenant/branch coherence error is observed;
- no pre-existing data is modified outside the deterministic fixture set.

## Failure handling

If preparation fails before commit, confirm zero surviving fixture IDs read-only and preserve failure evidence.

If preparation commits but verification fails, do not execute CAMPAÑA A. Preserve the manifest and checksum and stop for architectural review. Do not perform rollback unless separately authorized.

## Not authorized

This decision does **not** authorize:

- CAMPAÑA A HTTP/login testing;
- session creation beyond what is intrinsically required by fixture preparation (none expected);
- manual SQL outside the approved preparation and read-only verification paths;
- rollback execution;
- RLS changes;
- migrations;
- Docker/Nginx changes;
- deploy;
- production activity.

## Next gate

If preparation and verification are fully approved, return the evidence for a separate decision on CAMPAÑA A authenticated isolation testing.
