# Phase 1.2D-B1D — MDF/IDF Zone handler integration

## Scope and route

This phase integrates `POST /api/infra/mdf-idf` and its directly coupled GET path with the canonical physical-domain authority introduced through migration 026. It does not change schema, generic asset creation, imports, relocation, frontend onboarding, or system preset acceptance.

## Request and authority contract

Tenant and active Branch come only from the authenticated session resolved by `RequireTenantTx`. Optional `tenant_id` and `branch_id` request fields are assertions: a mismatch is forbidden and never authorizes a different scope.

The write discriminator is explicit:

- `zone_id` present: canonical V2 Zone flow;
- no `zone_id`, but `site_id + internal_area_id` present: legacy compatibility flow;
- neither authority: `ZONE_REQUIRED`;
- `zone_id + internal_area_id`: dual-reference flow, accepted only when the InternalArea explicitly references the same Zone in the same tenant, Branch, and Site.

MDF and IDF require neither Housing nor an MDF parent. IDF is not forced into the historical universal distribution-parent assumption.

## V2 Zone flow

`ResolveCanonicalZone` resolves only an active Zone matching the server-authoritative tenant and Branch. The handler inserts a canonical `locations` row with `zone_id`; it never derives Zone from InternalArea, auto-creates a Zone, or auto-populates InternalArea. An optional InternalArea is checked by `ResolvePhysicalLocationForZone` before persistence, while migration 026 remains the deferred database backstop.

## Legacy flow

The active production request shape using `site_id + internal_area_id` remains supported explicitly as `LEGACY_INTERNAL_AREA`. It retains scoped Site/InternalArea validation and the existing legacy nomenclature components. It is not presented as canonical Zone placement.

## Naming readiness

Physical and naming readiness are separate. A Zone may resolve successfully while creation remains blocked because no active `CANONICAL_ZONE` rule exists for the tenant and asset type. In that case the handler returns `NAMING_RULE_ZONE_CONTEXT_REQUIRED`; it does not fall back to a legacy rule, fabricate an InternalArea, change rule activation, or reserve a sequence.

The active-rule uniqueness constraint from migration 026 provides one deterministic active authority per tenant/type. The generator additionally filters by the required context mode. Canonical Zone code generation consumes `zones.code`; it never consumes `zones.name` or falls back to InternalArea.

## Atomic persistence

The full flow runs on the single `TenantDB` injected by `RequireTenantTx`:

1. resolve Zone or legacy physical context;
2. insert location;
3. select and lock the context-compatible naming rule;
4. reserve the branch counter;
5. insert `assets`;
6. insert `mdf_idf`;
7. attach generated code/asset to the location;
8. insert the audit record;
9. middleware commit.

Any handler error or commit failure rolls back the location, counter, asset, subtype, and audit together. There is no global database fallback in this route.

## Read compatibility and relocation

GET returns additive `zone_id`, `internal_area_id`, and `placement_authority`. Zone-backed rows resolve Zone/Site/Floor names from canonical tables; legacy rows retain their InternalArea presentation. Reads never mutate or backfill records.

Placement-changing PUT/PATCH behavior is not introduced. MDF/IDF relocation remains deferred and must fail closed until a dedicated move contract exists.

## Security and tests

Focused unit and PostgreSQL 16 tests cover authenticated TenantTx usage, tenant/Branch assertion spoofing, cross-tenant/cross-Branch Zone invisibility, dual mismatch, missing Zone, missing compatible rule, MDF and IDF creation, IDF without parent/Housing, canonical code from `zones.code`, legacy compatibility, GET provenance, sequence behavior, and rollback without orphan location/asset.

## Remaining bypasses

- generic `POST /api/dcim/assets` MDF/IDF bypass remains;
- import MDF/IDF bypass remains;
- generic relocation/update bypasses remain;
- remaining raw tenant/Branch authority bypasses outside this handler remain;
- system naming preset acceptance and administrative rule activation remain separate work.

No migration 027 is required. Migration 026 is sufficient for this handler integration.
