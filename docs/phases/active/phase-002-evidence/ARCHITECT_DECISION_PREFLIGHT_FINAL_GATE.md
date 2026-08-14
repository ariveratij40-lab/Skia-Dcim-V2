# PHASE-002 — Final preflight gate

## Decision

Commit `c564a9ae1f3c16c1363aa8a7ea61e24e6ba725e1` correctly separates runtime provenance from governance history and pins CAMPAÑA A backend runtime to `d155910c231e96446672508534ccec83bf0d830f`.

One traceability correction is required before the definitive read-only preflight.

## Required correction

`preflight.sh` currently labels `d2e9c3519a18915ab3867d6526f0d1100559bd16` as `canonical_static_role_trace_sha`. That SHA is the PHASE-003 specification lineage and is not the commit that contains the completed role-name trace evidence.

The authoritative PHASE-003 evidence commit is:

`7d68fa2e6b2dff05cfec9d21fed81c88414fd90c`

The preflight report must not imply that `d2e9c351...` contains the completed role-name trace.

Use separate provenance fields if useful, for example:

- `phase003_specification_sha=d2e9c3519a18915ab3867d6526f0d1100559bd16`
- `phase003_evidence_sha=7d68fa2e6b2dff05cfec9d21fed81c88414fd90c`
- `active_backend_runtime_sha=d155910c231e96446672508534ccec83bf0d830f`

The completed role-name/profile conclusions are governed by the PHASE-003 evidence/architectural-decision lineage, not by the specification SHA alone.

## Runtime provenance

The definitive preflight must validate the active backend release source corresponding to `d155910...`; `/opt/apps/skia/staging` remains invalid as runtime provenance.

The read-only execution must not require deployment or persistent installation of PHASE-002 tooling on the VPS. It may execute the reviewed script through an ephemeral authorized channel, provided no repository checkout, Docker configuration, service, database data, schema, RLS state, or VPS configuration is modified.

## Authorization state

- Local correction of provenance labels: `AUTORIZADO`.
- Versioning/publishing that correction: `AUTORIZADO`.
- Definitive PHASE-002 preflight read-only: `AUTORIZADO AFTER CORRECTION`.
- Fixture preparation/writes: `NOT AUTHORIZED`.
- HTTP campaign: `NOT AUTHORIZED`.
- RLS changes: `NOT AUTHORIZED`.
- Deploy: `NOT AUTHORIZED`.

After the correction is published, execute only the definitive read-only preflight and record a new evidence report. A successful preflight does not itself authorize fixture creation.