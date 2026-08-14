# PHASE-002 — Architectural decision: runtime SHA pinning for preflight

## Context

The PHASE-002 tooling commit `925d0012e42debfc54fbdd44687b2867d2ec47a0` currently requires `PHASE002_EXPECTED_APP_SHA=d2e9c3519a18915ab3867d6526f0d1100559bd16` and compares it against the checkout used by `preflight.sh`.

That SHA belongs to the PHASE-003 documentation/specification lineage. It is not the backend release SHA observed as deployed in staging during PHASE-001.

PHASE-001 established that the active API release in staging points to canonical commit:

`d155910c231e96446672508534ccec83bf0d830f`

A direct GitHub comparison from `d155910c231e96446672508534ccec83bf0d830f` to the later governance baseline `5b4f01e028508b1045aef1ecbb386947d627aac3` shows only documentation/governance additions; no backend or frontend source file changed in that interval.

Therefore the role-name trace performed against the canonical later branch is code-equivalent, for the relevant runtime source, to backend commit `d155910c231e96446672508534ccec83bf0d830f`.

## Decision

PHASE-002 preflight must distinguish **governance/evidence SHA** from **deployed runtime code SHA**.

For CAMPAÑA A readiness, the backend runtime baseline is:

`d155910c231e96446672508534ccec83bf0d830f`

The tooling must not require the PHASE-003 documentation commit `d2e9c3519a18915ab3867d6526f0d1100559bd16` to exist in `/opt/apps/skia/staging` or in an operational checkout.

## Required tooling correction

1. Replace the current `PHASE002_EXPECTED_APP_SHA` interpretation with an explicit runtime variable, preferably:

   `PHASE002_EXPECTED_BACKEND_SHA`

2. For the current approved baseline, require exactly:

   `d155910c231e96446672508534ccec83bf0d830f`

3. Validate the runtime SHA against the active backend release source when that provenance can be established read-only (for example the active release path/source metadata observed in PHASE-001), not against the dirty legacy `/opt/apps/skia/staging` checkout merely because that directory is a Git repository.

4. If the exact active backend release SHA cannot be established without mutation or ambiguity, classify the preflight `BLOQUEADO`; do not substitute the staging checkout SHA.

5. Record separately in evidence:

   - PHASE-003 governance/evidence SHA;
   - canonical source code baseline used for static trace;
   - active backend runtime SHA;
   - whether relevant runtime source differs between the static-trace baseline and deployed backend baseline.

6. Any backend source change after `d155910...` affecting authentication, session context, tenant/branch mappings, role-name handling, or DCIM asset handlers invalidates the role-name trace and requires a new architectural review before fixture preparation.

## Frontend

The exact frontend source SHA remains unresolved from PHASE-001. This does not authorize ignoring it. The PHASE-002 HTTP isolation campaign must record the frontend provenance as `BLOQUEADO/UNKNOWN` unless independently resolved.

For backend authorization/isolation conclusions, the active API/backend SHA is the binding runtime code baseline.

## Authorization state

- PHASE-002 tooling at `925d0012...`: **REQUIRES THIS CORRECTION BEFORE PREFLIGHT EXECUTION**.
- New staging preflight: **NOT YET AUTHORIZED** until the correction is versioned and reviewed.
- Fixture preparation: **NOT AUTHORIZED**.
- SQL writes: **NOT AUTHORIZED**.
- HTTP authenticated campaign: **NOT AUTHORIZED**.
- RLS changes: **NOT AUTHORIZED**.
- Deploy: **NOT AUTHORIZED**.
