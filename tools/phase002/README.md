# PHASE-002 fixture toolkit

Status: **designed and implemented, not executed**. These artifacts do not authorize database access, fixture creation, HTTP testing, rollback, deployment, or RLS changes.

## Architecture and gates

1. `preflight.sh` is read-only and checks the explicit staging environment, authorized host expression, expected database, required schema objects and pre-existing `TEST-*` collisions.
2. `prepare_fixtures.sql` requires separate write approval, uses deterministic UUIDs, creates fixture V1 in a transaction, never alters schema/RLS, and exports a client-side CSV manifest.
3. `verify_fixtures.sql` uses a read-only transaction to verify tenants, branches, actors, roles, access mappings, 60 assets, metadata, logs and relationships.
4. `run_isolation_tests.sh` implements the `ISO-001`–`ISO-022` campaign contract through HTTP only. It requires an external context file and a mode-`0600` credential file; it never prints response bodies, cookies, tokens or passwords.
5. `rollback_fixtures.sql` imports the external manifest into a temporary table, deletes only exact IDs in FK-safe order, and verifies removal. It never uses a `TEST-*` prefix as its deletion criterion.

Every executable artifact fails closed when its explicit environment/approval inputs are absent. `prepare_fixtures.sql` and `rollback_fixtures.sql` are intentionally not wrapped by an automatic launcher.

## External inputs

Nothing in this directory contains a usable credential. An authorized operator must provide, outside the repository:

- `DATABASE_URL`, expected DB and approved host regex for preflight;
- nine temporary Argon2id password hashes as psql variables for preparation;
- the corresponding temporary plaintext credentials in a mode-`0600` file for an authorized HTTP campaign;
- a nonsensitive context file containing fixture UUID variables;
- an absolute external manifest path and its independently computed SHA-256 checksum.

Do not place any of these files in the repository or paste their values into evidence. Remove credentials and session artifacts after each campaign.

## Manifest lifecycle

The prepare script exports `table_name, exact_id, logical_alias` via psql `\copy`, so the file is written by the authorized client outside PostgreSQL and outside Git. After an HTTP campaign, the optional read-only session capture in `verify_fixtures.sql` exports exact session IDs (never tokens) to a second external file; an authorized operator must merge those rows into the rollback manifest. Before rollback, the operator must restrict the consolidated manifest's permissions, compute SHA-256 externally, and retain it until rollback is complete. Only the checksum and a nonsensitive count summary may be versioned as evidence.

Rollback requires the manifest path, its externally verified 64-character checksum, the expected database and a distinct approval token. The SQL consumes exact IDs from the manifest; prefixes are used only by verification queries, never to select deletion targets.

## Campaign sequence

`PREPARACIÓN FIXTURE V1 → CAMPAÑA A → ROLLBACK COMPLETO → futura fase RLS aprobada → RECREACIÓN EXACTA FIXTURE V1 → CAMPAÑA B → ROLLBACK COMPLETO`

Campaign B must not be run before the independent RLS phase is approved. If application, authentication, authorization, RBAC, handlers, tenant/branch filters, schema or configuration also change between campaigns, the comparison is not an isolated measurement of RLS.

## Known design boundaries

- `ISO-016` (natural expiry/revocation) and `ISO-022` (PostgreSQL correlation) require separately authorized observation; the HTTP runner must record them as external/BLOCKED until that evidence exists.
- The repository has historical migration inconsistencies. Runtime compatibility is therefore decided by preflight, not inferred from filenames.
- Execution order and concrete commands are deliberately omitted from this implementation round because no execution authority was granted.
