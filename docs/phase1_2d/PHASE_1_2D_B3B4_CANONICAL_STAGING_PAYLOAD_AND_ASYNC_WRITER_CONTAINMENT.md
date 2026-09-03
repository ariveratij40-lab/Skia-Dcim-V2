# Phase 1.2D-B3B4 — Canonical staging payload and async writer containment

## Decision

The active import flow is now `UPLOAD → PARSE → NORMALIZE → VALIDATE → STAGE → READY`. It does not create canonical assets. Canonical persistence remains reserved for the intentionally unimplemented `POST /api/import/inventory/{id}/commit` coordinator (B3B5, HTTP 501 today).

Before B3B4, `processImportFileAsync` wrote `import_items` and `assets` directly, selected asset types through hard-coded UUIDs, and generated `IMP-*` technical codes. `saveImportResult` and the inventory upload handler also wrote the staging tables directly. Those active paths bypassed the secure staging authority introduced by migration 029.

After B3B4:

- `processImportFileAsync` is parse-and-stage only;
- chunk upload is transport only;
- AI extraction uses the same canonical normalizer and secure staging service;
- the inventory upload endpoint creates its empty staging header through the secure function;
- `inventory_imports` and `inventory_import_rows` are written only through migration 029 functions;
- `import_jobs` and `import_items` are legacy compatibility concepts and are not canonical authority;
- async progress compatibility is in-memory and explicitly says “staged; canonical commit pending.”

## Shared normalization contract

`CanonicalStagingPayload` is the single server-side row representation for staging, preview and future commit. `previewCanonicalImportRow` delegates to the same normalizer and performs no write or sequence reservation.

The payload records the source row, canonical asset type code, descriptive/manufacturer/model/serial/tag fields, source identifiers and metadata, placement intent, canonical Zone identity where required, source internal code, source location ID, and raw source evidence. Tenant and branch are deliberately absent from canonical row authority: they come from the server session and transaction-local `app.tenant_id` / `app.branch_id` GUCs.

Raw `asset_type_id` is ignored. A canonical code is resolved against `asset_types`; unknown values produce `INVALID`. Category aliases are normalized explicitly. There is no default asset type.

## Zone and location policy

MDF and IDF have `placement_intent=ZONE` and require `zone_id`, `zone_code`, or both. Resolution runs inside the authoritative tenant/branch transaction. If both are present, both must resolve to the same row. Missing, inactive, cross-tenant, cross-branch, malformed, or mismatched Zone input produces an `INVALID` row.

`internal_area_id` never infers Zone. File-provided `location_id` is retained as source metadata only and never becomes placement authority. Staging creates no `locations` or `mdf_idf` row.

## Source codes and nomenclature

`internal_code`, `code`, `asset_code`, and any `IMP-*` value are source metadata only. Staging does not generate a canonical technical code, invoke nomenclature generation, reserve a sequence, or advance either naming counter table. Canonical nomenclature remains a commit-time responsibility.

## Deterministic hash

The server computes SHA-256 over canonical JSON generated from the normalized payload, excluding raw-source evidence. Go JSON encoding supplies deterministic object-key ordering. Whitespace/case normalization is applied where defined. The hash does not depend on client hash input, asset IDs, or nomenclature sequences. Canonical asset type and Zone changes alter the hash.

Rows are persisted through `stage_inventory_import_row`; reparsing uses its durable `(import_id,row_number)` identity and CAS rules. Equal content converges to `ROW_UNCHANGED`; changed content requires the previously observed hash; stale expected hashes return `ROW_CONTENT_CONFLICT`. The application never updates `normalized_row_hash` directly.

## Secure write authority

The application uses only:

- `create_inventory_import_staging`
- `stage_inventory_import_row`
- `update_inventory_import_progress`
- `finalize_inventory_import_staging`

Calls execute inside one `JobTenantTx` with server-derived tenant and authorized branch GUCs. No direct staging table grants or sequence grants were added. Migrations 027, 028 and 029 remain unchanged.

## Zero canonical-domain writes

The PostgreSQL 16.14 integration test stages valid MDF, valid IDF, a representative Switch, and invalid rows. It verifies exact deltas:

- `assets = 0`
- `locations = 0`
- `mdf_idf = 0`
- `asset_logs = 0`
- `nomenclature_counters = 0`
- `inventory_imports = +1`
- `inventory_import_rows = +8`

It also proves cross-tenant/cross-branch Zone inputs are invalid and that the source `IMP-*` code remains metadata.

## Active path classification

- `/api/import/upload/process` and `processImportFileAsync`: `SECURE_STAGING`.
- `/api/ai/process-pdf` and `saveImportResult`: `SECURE_STAGING`.
- `POST /api/import/inventory`: `SECURE_STAGING` header creation.
- chunk start/chunk/status: `LEGACY_COMPATIBILITY` transport/progress only, no database authority.
- `SaveImportToDB` / `SaveAssetsToDB` in the unregistered legacy handler: `DENIED_OR_DEAD`; not registered by `main.go`.
- ordinary DCIM handlers that create assets: `CANONICAL`, outside the import subsystem.
- `POST /api/import/inventory/{id}/commit`: `DENIED_OR_DEAD` pending B3B5 (HTTP 501).

The active MDF/IDF import-create bypass is closed because no active import entrypoint writes an `assets`, `locations`, or `mdf_idf` row. Bypass accounting moves from 23 to 22.

## Remaining work for B3B5

- implement the canonical CREATE_ONLY commit coordinator;
- re-read and revalidate durable normalized rows rather than trusting preview state;
- reserve authoritative nomenclature only inside the commit transaction;
- expose durable read/status access through an approved secure interface (current async status is process-local compatibility state);
- retire unregistered legacy import helpers after a separate dependency audit;
- define cleanup/recovery behavior for process restart during async parsing.

No schema, RLS, runtime grant, migration, frontend, deployment, VPS, or production change is part of B3B4.
