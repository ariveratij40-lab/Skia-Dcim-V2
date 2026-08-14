# PHASE-002 fixture toolkit

Status: **designed and implemented, not executed**. These artifacts do not authorize database access, fixture creation, HTTP testing, rollback, deployment, or RLS changes.

## Architecture and gates

1. `preflight.sh` is read-only and checks the explicit staging environment, authorized host expression, expected database, active backend release provenance, required schema objects, canonical/noncanonical `TEST-*` collisions and compatibility of the neutral runtime role `operator`. It pins the backend runtime to `d155910c231e96446672508534ccec83bf0d830f`, rejects the dirty legacy `/opt/apps/skia/staging` checkout as provenance, and fails if relevant authorization source differs locally. It requires exactly the normative `dcim:view` catalog row and reports it as `NO ENFORCED`; it never infers or clones permissions from real roles.
2. `prepare_fixtures.sql` requires separate write and profile-baseline approvals, uses deterministic UUIDs, creates fixture V1 in a transaction, never alters schema/RLS, and exports a client-side CSV manifest. It creates exactly three tenant-local roles named `operator`, one per TEST tenant. ADMIN, OPERATOR and MULTI-BRANCH are logical personas sharing that role; ADMIN/MULTI receive two branch mappings and OPERATOR one. Each role receives only normative `dcim:view`, classified `NO ENFORCED`.
3. `verify_fixtures.sql` uses a read-only transaction to verify tenants, branches, actors, roles, access mappings, 60 assets, metadata, logs and relationships.
4. `run_isolation_tests.sh` implements explicit expectations for `ISO-001`–`ISO-022`. Asset responses are captured in mode-`0600` temporary files and parsed with `jq` to verify expected TEST IDs/counts and absence of cross-tenant/cross-branch aliases. Only verdict rows are emitted; full bodies, cookies, tokens and passwords are never evidence.
5. `rollback_fixtures.sh` validates path, mode and a real SHA-256 comparison before invoking SQL. `rollback_fixtures.sql` validates exact per-table manifest counts and alias/ID coherence, deletes only exact IDs in FK-safe order, and checks all twelve authorized tables for survivors.

Every executable artifact fails closed when its explicit environment/approval inputs are absent. No artifact automatically chains preparation, campaign or rollback.

## External inputs

Nothing in this directory contains a usable credential. An authorized operator must provide, outside the repository:

- `DATABASE_URL`, expected DB and approved host regex for preflight;
- nine temporary Argon2id password hashes as psql variables for preparation;
- the corresponding temporary plaintext credentials in a mode-`0600` file for an authorized HTTP campaign;
- a nonsensitive context file containing fixture UUID variables;
- `PHASE002_EXPECTED_BACKEND_SHA=d155910c231e96446672508534ccec83bf0d830f`, the neutral role name and an explicitly attested active backend release source root for preflight;
- an absolute external manifest path, its independently computed SHA-256 checksum, the fixed role-permission row count `3`, and the exact campaign session-row count.

Do not place any of these files in the repository or paste their values into evidence. Remove credentials and session artifacts after each campaign.

## Manifest lifecycle

The prepare script exports `table_name, exact_id, logical_alias` via psql `\copy`, so the file is written by the authorized client outside PostgreSQL and outside Git. After an HTTP campaign, the optional read-only session capture in `verify_fixtures.sql` exports exact session IDs (never tokens) to a second external file; an authorized operator must merge those rows into the rollback manifest. Before rollback, the operator must restrict the consolidated manifest's permissions, compute SHA-256 externally, and retain it until rollback is complete. Only the checksum and a nonsensitive count summary may be versioned as evidence.

Rollback is entered through `rollback_fixtures.sh`. The wrapper computes SHA-256 and requires exact equality with the expected digest before `psql` can be invoked. SQL does not treat string length as checksum validation. It consumes exact IDs from the manifest; prefixes are used for integrity/verification only, never as deletion criteria.

The fixed manifest cardinalities are tenants 3, branches 6, users 9, roles 3, user-tenants 9, user-branches 15, user-roles 9, role-permissions 3, assets 60, asset logs 60 and relationships 6. Session count is an explicit dynamic input from the consolidated campaign manifest; no arbitrary minimum-row threshold is accepted.

## Campaign sequence

`PREPARACIÓN FIXTURE V1 → CAMPAÑA A → ROLLBACK COMPLETO → futura fase RLS aprobada → RECREACIÓN EXACTA FIXTURE V1 → CAMPAÑA B → ROLLBACK COMPLETO`

Campaign B must not be run before the independent RLS phase is approved. If application, authentication, authorization, RBAC, handlers, tenant/branch filters, schema or configuration also change between campaigns, the comparison is not an isolated measurement of RLS.

## Known design boundaries

- `ISO-016` (natural expiry/revocation) and `ISO-022` (PostgreSQL correlation) require separately authorized observation; the HTTP runner must record them as external/BLOCKED until that evidence exists.
- `ISO-011`/`ISO-012` relationship assertions remain `BLOQUEADO` while the detected application exposes no read-only relationships endpoint; their direct asset-isolation portions are still evaluated.
- The repository has historical migration inconsistencies. Runtime compatibility is therefore decided by preflight, not inferred from filenames.
- Runtime and governance SHAs are separate. Preflight records PHASE-003 specification SHA `d2e9c3519a18915ab3867d6526f0d1100559bd16`, authoritative PHASE-003 evidence SHA `7d68fa2e6b2dff05cfec9d21fed81c88414fd90c` and active backend runtime SHA `d155910c231e96446672508534ccec83bf0d830f` independently. The completed role-name/profile conclusions belong to the evidence SHA, not to the specification SHA alone.
- The active backend release source must resolve read-only to the approved runtime SHA and have no local changes in authentication, session/context, tenant/branch, role-name or DCIM asset paths. The legacy checkout is not accepted as a substitute. Missing or ambiguous provenance blocks before PostgreSQL access.
- The frontend runtime SHA remains `UNKNOWN/BLOQUEADO` until independently established; backend authorization conclusions bind to the backend runtime SHA.
- `operator` has no observed actor-side bypass in the PHASE-002 routes at the approved SHA. `admin` and `super_admin` are forbidden runtime names for fixture roles.
- `dcim:view` is normative catalog metadata only and must never be cited as an effective CAMPAÑA A security control.
- Execution order and concrete commands are deliberately omitted from this implementation round because no execution authority was granted.
