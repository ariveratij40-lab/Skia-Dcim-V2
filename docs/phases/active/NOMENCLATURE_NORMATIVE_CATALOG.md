# Nomenclature normative catalog

## Purpose and scope

This phase turns the nomenclature screen into SKIA's tenant-scoped normative
catalog for technical asset identity. It implements first-rule creation,
catalog visibility when no rules exist, safe editing, and the wizard return
flow while preserving INV-ASSET-NOM-001 through INV-ASSET-NOM-005.

- **INV-ASSET-NOM-006:** every managed asset type must have an explicit active
  nomenclature norm before new assets of that type are admitted.
- **INV-ASSET-NOM-007:** every managed asset retains the exact rule and sequence
  that originally identified it; later norm changes never rename it.

Managed types in this phase are MDF, IDF, RACK, SWITCH, PATCH_PANEL, NODE, UPS,
PDU and BACKBONE. SERVER, FIREWALL, CCTV and AC_UNIT are displayed as existing
configurable catalog types but remain `requires_nomenclature=false` until a
separate asset workflow brings them under INV-ASSET-NOM-006.

## Audit and implemented model

Previously the UI rendered only `rules.map()`, GET returned only inner-joined
rules, PUT was the sole mutation, and an empty tenant could not define its first
norm. GET now returns every `asset_types` row with its optional tenant rule, so
the UI derives `NO CONFIGURADA`, `ACTIVA` or `INACTIVA` without inventing rows.

No `name` column is added in this phase. `description` is the normative name and
free-text description. Adding separate title/body fields can be considered with
formal versioning; duplicating semantics now would create avoidable migration
and compatibility cost.

| Type | Rule in an empty tenant | Frontend/endpoint before this phase | DB model | Result |
|---|---|---|---|---|
| MDF, IDF, RACK, SWITCH, PATCH_PANEL, NODE, UPS, PDU, BACKBONE | No | Hidden by `rules.map()`; GET/PUT only | `requires_nomenclature=true`, one optional tenant rule | Always listed; first rule can be created; asset admission remains blocked until active |
| SERVER, FIREWALL, CCTV, AC_UNIT | No | Hidden and without a specialized managed wizard | Canonical asset type with `requires_nomenclature=false` | Listed as configurable future types without claiming managed status |

The root cause was therefore not missing asset types or an RLS visibility
failure: the read model used an inner-join-shaped response and the UI iterated
only existing rules, while the API lacked a first-rule mutation entirely.

## API contract

- `GET /api/dcim/catalogs/naming-rules`: authenticated tenant members; returns
  `asset_types` with optional `rule` plus the compatible `naming_rules` list.
- `POST /api/dcim/catalogs/naming-rules`: tenant `admin`/`super_admin` only;
  tenant comes exclusively from the request context; `last_seq` starts at zero;
  duplicate tenant/type is 409 and invalid type or forbidden authority fields
  are 422.
- `PUT /api/dcim/catalogs/naming-rules/{id}`: tenant `admin`/`super_admin` only.
  When `last_seq=0`, structure is editable. Once a code has been issued,
  structural changes return 409 `normative_version_required`; description and
  active state remain editable.
- DELETE is intentionally unsupported.

Payload validation limits sequence digits to 2–6, requires a non-empty prefix,
accepts only an existing asset type, and never accepts client `tenant_id` or
`last_seq`.

## Database authority and RLS decision

The application catalog already runs as `skia_runtime` inside
`RequireTenantTx`. First-rule creation therefore requires the minimal exact
change from `SELECT, UPDATE` to `SELECT, INSERT, UPDATE` on `naming_rules`.
There is no DELETE, sequence, DDL, role, database, superuser or BYPASSRLS grant.
FORCE RLS continues to restrict all reads/writes to `app.tenant_id` from the
request transaction. Application RBAC is additive: operational/viewer users can
read; only the verified existing `admin` and `super_admin` role names mutate.

## Versioning and editing policy

Formal multiple versions per tenant/type are deferred because the current
unique constraint and generator assume one current row. Silent structural
mutation is prevented now: after `last_seq>0`, prefix, separator, branch/location
flags, reset scope, custom segment values/labels and sequence digits are locked.
Active/description changes do not alter historical identity. A later versioning
phase must introduce immutable norm versions, activation rules and generator
selection before relaxing this lock.

## Wizard roundtrip

The missing-rule link opens the catalog with `type` and `from=wizard` while the
original wizard remains open. The target type is highlighted and its creation
form opens immediately. After saving, “Regresar al alta” closes the catalog tab;
the wizard reloads availability on window focus and displays the new preview.

## Rollback strategy

No existing rows are rewritten and no asset identity is changed. Application
rollback is the removal of the new POST/catalog UI behavior and restoration of
the prior exact role allow-list. The additive validation constraint may be
dropped only through a separately approved forward migration; the existing
unique key, RLS policy and historical asset references remain valid throughout.

## Residual risks and compatibility

- Formal normative versions remain debt; structural changes after issuance
  require a future version rather than editing in place.
- `include_location` and `reset_per_location` remain represented in the model,
  but the current generator does not derive location components; enabling them
  is displayed honestly and does not fabricate a preview value.
- Future asset types may be configured before their specialized wizard exists,
  but this alone does not make them managed or bypass `requires_nomenclature`.
- Browser restrictions may prevent programmatic tab close; the return action
  falls back to browser history/instructions without losing the saved norm.
