# DCIM Physical Location Model

## Decision

SKIA adopts one canonical physical path:

`tenant -> branch -> site (buildings) -> internal_area -> location (MDF/IDF) -> rack -> asset`.

`buildings` is retained as the persisted Site authority. Renaming the table only for UI terminology would add migration risk without changing semantics. `internal_areas` is new because the existing `zones` table requires a floor and therefore cannot represent both simple and complex customers without inventing a floor.

The canonical minimum is Site -> Internal Area. For complex customers, `internal_areas.floor_id` and `zone_id` are optional scoped references into the existing hierarchy; Zone requires Floor, while neither is mandatory. `technical_rooms` is retained for compatibility but is no longer an independent placement authority.

## Audit of the previous model

| Table | Previous function | Problem | Decision |
|---|---|---|---|
| tenants | tenant authority | none | retain |
| branches | session branch | no canonical nomenclature code | add canonical `code` |
| buildings | physical building | disconnected from placement; no code | reuse as Site; add `code` and tenant/branch identity |
| floors | level below building | optional but only connected to old hierarchy | retain as compatibility metadata |
| zones | level below floor | mandatory `floor_id`; unsuitable as universal area | do not reuse as Internal Area |
| technical_rooms | room below zone | overlaps physical placement; disconnected from locations | deprecate as placement authority |
| locations | MDF/IDF/WAREHOUSE placement | free-text building/floor/zone; no canonical area FK | add scoped `internal_area_id`; MDF/IDF require it |
| mdf_idf | MDF/IDF satellite | did not persist physical selection | retain; physical authority moves through asset.location_id |
| racks | rack satellite | can reference both technical room and MDF/IDF | `mdf_idf_id` is canonical; `technical_room_id` is legacy metadata |
| assets | canonical asset | could not expose Site/Area identity | retain; asset.location_id provides the path |
| naming_rules | nomenclature policy | branch/placement/custom only | add server-controlled Site/Internal Area components |
| nomenclature_counters | placement-scoped counter | resets per placement | retain for installable assets |
| imported_assets | import staging | not canonical inventory | unchanged; promotion remains separate |

No legacy row is renamed or backfilled with an inferred physical relationship. Existing unresolved rows remain legacy. New MDF/IDF placement rows are constrained.

## Entities and invariants

```text
tenants 1--* branches 1--* buildings(Site) 1--* internal_areas
                                         internal_areas 1--* locations(MDF/IDF)
locations 1--0..1 assets(container) 1--1 mdf_idf 1--* racks
```

A Site has `id, tenant_id, branch_id, code, name, status`. Its code is unique within tenant/branch. An Internal Area has the same scope plus `site_id`; `(site_id, code)` is unique. Composite foreign keys reject tenant/branch mismatch even outside application code.

MDF/IDF requests carry only `site_id` and `internal_area_id`. The backend resolves codes and active state inside the request TenantTx. Missing, inactive, cross-tenant, cross-branch, or site/area-mismatched references return 422. The client never supplies authoritative branch, tenant, Site text, Area text, or final technical code.

`locations` remains the operational placement catalog. For MDF/IDF, `placement_code` equals the container asset's immutable technical code and `asset_id` links the container. The row references `internal_area_id`; Site is derived from the Area. Text columns already present on `locations` are legacy display data, not authority.

`WAREHOUSE` is an operational placement for stored, non-operational assets. It may remain directly under a branch and does not require an Internal Area. An Internal Area named “Almacén” is ordinary physical hierarchy and never implies `placement_type=WAREHOUSE`.

## Nomenclature and transaction

MDF/IDF rules have server-controlled `include_site=true` and `include_internal_area=true`. Custom segments remain optional and are not substitutes for either component. The generated structure is:

`[TYPE]-[BRANCH]-[SITE]-[INTERNAL_AREA]-[SEQUENCE]`.

Example with a shared branch/rule counter:

- `MDF-TJ-PARQUE-PROD-001`
- `MDF-TJ-PARQUE-ALM-002`

`nomenclature_branch_counters` is keyed by `(nomenclature_id, branch_id)`. Reservation inserts the counter if absent, locks it with `SELECT ... FOR UPDATE`, and updates it in the same transaction. It never uses `MAX()+1`. `naming_rules.last_seq` is retained as a non-authoritative high-water mark for catalog compatibility.

The MDF/IDF handler uses the single TenantTx installed by `RequireTenantTx`: resolve Site/Area; create the pending location row; lock/reserve the branch counter; generate the code; insert asset and `mdf_idf`; bind the location to the asset/code; write `asset_logs`; middleware commit. The location is created first because the database nomenclature trigger independently resolves Site/Area through `assets.location_id`. Every step is in the same SQL transaction, so any failure rolls back counter, location, asset, satellite, and audit log together.

## API and frontend

- `GET/POST /api/dcim/sites`
- `GET/POST /api/dcim/internal-areas?site_id=<uuid>`
- existing MDF/IDF POST now requires `site_id` and `internal_area_id`

Tenant and branch always come from session identity and TenantTx. Reads use existing operational authorization. Creation requires tenant `admin` or `super_admin` through the existing naming-catalog RBAC check.

The MDF/IDF wizard is ordered Site -> Internal Area -> normative preview -> MDF/IDF data -> summary. It provides “Crear sitio” and “Crear área interna” zero-state actions, reloads the catalogs, and selects the new record. It sends only IDs. No manual technical-code field is present.

## RLS and grants

`buildings`, `internal_areas`, and `nomenclature_branch_counters` use `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and exact tenant/branch policies based on `app.tenant_id` and `app.branch_id`. The runtime allow-list adds exactly:

- `buildings`: `SELECT, INSERT, UPDATE`
- `internal_areas`: `SELECT, INSERT, UPDATE`
- `nomenclature_branch_counters`: `SELECT, INSERT, UPDATE`
- `floors`, `zones`, `technical_rooms`: `SELECT` only, for optional hierarchy resolution/display

There is no runtime DELETE, TRUNCATE, DDL, BYPASSRLS, SUPERUSER, CREATEDB, or CREATEROLE. Migrator remains schema authority. Onboarding receives no new physical-model grant.

## Migration strategy

Migration `022_physical_location_hierarchy.sql` is append-only and listed in the canonical bootstrap manifest. Applied migrations are not rewritten. It backfills only deterministic branch/Site codes and counter high-water marks; it does not infer Site/Area assignments for legacy assets. Constraints for legacy-sensitive relationships are `NOT VALID`: they protect new writes without invalidating existing fictitious or unresolved rows.

## TEST_DATABASE_RESET_PLAN

This plan is documentation only; it is not executed by this change.

1. Stop only local/test API and worker containers and record their image IDs.
2. Export a schema-only dump and an encrypted, access-controlled data dump; record checksums. Do not store secrets in Git.
3. Drop/recreate only the named test database and roles after independently confirming host, port, and database name are non-production.
4. Run the canonical bootstrap manifest through migration 022, then role provisioning and validators.
5. Load fictitious seeds: Tenant Demo; branch `TJ`; Sites `PARQUE`, `CORP`; Areas `PROD`, `ALM`, `CAL`, `OFI`, `DC`.
6. Create demo users through the onboarding path with generated local passwords supplied out-of-band; never commit credentials.
7. Run bootstrap ledger, schema, RLS/FORCE, exact-grant, TenantTx, concurrency, rollback, and frontend validations.
8. Roll back by recreating the test database from the verified dump. No production or VPS command is part of this plan.

Illustrative commands (replace placeholders only after an independent local/test target check):

```bash
pg_dump --format=custom --file=/secure-backup/skia-test-before-022.dump "$TEST_DATABASE_URL"
PHASE010_DATABASE_URL="$EMPTY_LOCAL_TEST_DATABASE_URL" ops/phase010/run_clean_bootstrap.sh
psql "$EMPTY_LOCAL_TEST_DATABASE_URL" -f /path/outside-git/demo_physical_location_seed.sql
pg_restore --clean --if-exists --dbname="$RESTORE_ONLY_LOCAL_TEST_DATABASE_URL" /secure-backup/skia-test-before-022.dump
```

The operator must first prove that every URL resolves to an ephemeral/local test instance. The plan intentionally omits passwords, VPS paths, production container names, and any automatic destructive command.

## Seed design

Seeds are intentionally not added to bootstrap. A future test-only fixture may insert Tenant Demo, branch `TJ/Tijuana`, `PARQUE/Parque Industrial`, `CORP/Corporativo`, and the Areas listed above. This prevents fictional records from entering real tenant bootstrap.

## Residual risks and deferred work

- Legacy assets remain `legacy_unresolved_physical_location`; remediation requires evidence and a separate workflow.
- Optional floor/zone attachment to Internal Area needs a later explicit contract; the current simple hierarchy is canonical and does not force artificial levels.
- `technical_rooms` and `racks.technical_room_id` remain for compatibility but must not be used as a competing placement authority; `racks.mdf_idf_id` is canonical.
- Site/Area rename policy and formal nomenclature-rule versioning are deferred. Managed asset identity remains immutable, so catalog edits do not rename historical assets.
- Browser QA remains required for focus, zero states, create-and-return behavior, responsive layout, and dark/light themes before any deployment.
