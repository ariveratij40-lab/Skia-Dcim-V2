# Asset nomenclature enforcement

## Audit map

| Asset type | Frontend | Create API | Tables | Previous code authority | Previous nomenclature state | Risk |
|---|---|---|---|---|---|---|
| Generic managed asset | `ActivoWizard` | `POST /api/dcim/assets` | `assets` plus type satellite | backend with fallback | `naming_rules` optional | definitive asset without a rule |
| MDF / IDF | `MdfIdfWizard` | `POST /api/infra/mdf-idf` | `assets`, `mdf_idf` | client/UUID fallback | UI suggestion only | arbitrary code |
| Rack | `RackWizard`, automatic MDF rack | `POST /api/infra/racks`, `ensure-rack` | `assets`, `racks` | client/derived fallback | none | code/name conflation |
| Switch | `SwitchWizard` | `POST /api/infra/switches` | `assets`, `switches` | client/UUID fallback | none | arbitrary code |
| UPS / PDU | `UpsPduWizard` | `POST /api/infra/ups-pdus` | `assets`, `ups`/`pdus` | client/UUID fallback | none | arbitrary code |
| Patch panel | `PatchPanelWizard` | `POST /api/infra/patch-panels` | `assets`, `patch_panels` | client/UUID fallback | none | code/name conflation |
| Backbone | `BackboneWizard`, `BackboneSelector` | `POST /api/infra/backbone` | `assets`, `backbone_links` | client/UUID suggestion | prefix lookup only | race and arbitrary code |
| Node | `NodeWizard` | `POST /api/infra/nodos` | `assets`, `nodes` | client/UUID fallback | none | arbitrary code |

`RackBuilder` changes layout only and does not create an asset. The satellite
tables reference `assets`; `assets.internal_code` is already unique by
`(tenant_id, branch_id, internal_code)`.

## Target model and stable components

The existing `naming_rules` table remains authoritative and is extended with
`active` and `description`. `assets` gains nullable `nomenclature_id` and
`nomenclature_sequence`; null identifies a legacy row, not a valid new managed
asset. `(nomenclature_id, nomenclature_sequence)` is unique when present.
`asset_types.requires_nomenclature` plus an insert trigger fail closed for the
nine in-scope types, including direct/bulk insertion paths.

Rules are tenant-scoped. `BRANCH` may participate as a configured component,
but rules are not duplicated per branch. Stable supported components are:

- `TYPE`: represented by the selected rule/prefix;
- `TENANT`: scope boundary, not normally rendered;
- `BRANCH`: optional stable branch token;
- `SITE`, `LOCATION`, `MDF_IDF`, `RACK`: only as explicit, stable custom
  segments; not derived live from mutable containment;
- `SEQ`: transactionally reserved counter.

Location and rack are excluded by default because a physical move must not
silently rename technical identity. A locational naming policy is an explicit
governance choice and requires a separate rename/audit workflow.

The existing unique scope `(tenant_id, branch_id, internal_code)` is preserved
for compatibility. Sequence allocation is tenant-wide per rule, so two
branches cannot receive the same sequence even when the branch token is off.

## Generator and API contract

All managed create paths lock the active rule with `SELECT ... FOR UPDATE`,
increment `last_seq`, generate the code, persist the rule id and sequence, and
insert the asset within the request transaction. Rollback restores the counter.
No `MAX(code)+1` or client-supplied code is accepted.

- missing/inactive rule: HTTP 422, `nomenclature_required`;
- manual code: HTTP 422, `manual_code_not_allowed`;
- unique reservation conflict: HTTP 409, `asset_code_conflict`;
- another tenant's rule is indistinguishable from a missing rule;
- successful responses return `internal_code` and `nomenclature_id`.

The frontend blocks save without an active rule, links to configuration, shows
“Se generará automáticamente”, and captures `name` independently.

## Restricted runtime authority

The create path continues to use the three PHASE-005 RLS-protected asset
tables. Its additional authority is deliberately limited to:

- `asset_types`: `SELECT`, to resolve the managed type and enforcement flag;
- `naming_rules`: `SELECT, UPDATE`, to lock the tenant rule and reserve its
  counter in the same transaction;
- `mdf_idf`, `racks`, `switches`, `ups`, `pdus`, `patch_panels`,
  `backbone_links`, `nodes`: `SELECT, INSERT`, to read and create the selected
  satellite record.

The role provisioner first revokes all non-protected table privileges and then
reapplies this exact allow-list. It grants no sequence, DDL, `TRUNCATE`, role
creation, database creation, superuser, or `BYPASSRLS` authority. The SQL and
backend startup validators reject missing or additional grants.

`naming_rules` is protected by tenant RLS. Every satellite table is protected
by tenant-and-branch RLS for both reads and inserts, so direct runtime access
cannot use the newly required grants to bypass the asset policy. The naming
catalog endpoint therefore runs inside the same `RequireTenantTx` boundary as
the managed create endpoints.

## Invariants

- **INV-ASSET-NOM-001:** every new definitive managed asset uses an active,
  tenant-valid nomenclature.
- **INV-ASSET-NOM-002:** technical code and descriptive name are independent.
- **INV-ASSET-NOM-003:** only the backend generates technical code.
- **INV-ASSET-NOM-004:** the rule counter and asset insert share a transaction
  and sequence pairs are unique.
- **INV-ASSET-NOM-005:** rule lookup is constrained to the request tenant and
  branch-derived components are resolved inside that tenant.

## Legacy compatibility

No existing row is renamed or backfilled automatically. A read-only audit can
classify rows using the following order:

1. `orphan`: invalid/missing asset type or tenant/branch relationship;
2. `duplicate`: duplicate normalized code in the chosen uniqueness scope;
3. `legacy_without_nomenclature`: `nomenclature_id IS NULL`;
4. `invalid_code`: linked rule but code does not match its immutable recorded
   prefix/sequence evidence;
5. `compliant`: valid rule link and unique sequence.

Remediation is a separate approved operation: export the classification,
resolve duplicates/orphans, assign rules, reserve replacement codes only where
approved, retain old codes in an audit mapping, and never bulk-rename silently.

## Residual risks

- Existing import/bulk paths now fail closed for in-scope types until they adopt
  the same authoritative generator; this is intentional and avoids a bypass.
- Existing custom segments are literal stable values; dynamic token templates
  require a separately versioned grammar and migration.
- Nullable legacy rows remain readable/updatable, while the insert trigger
  rejects new definitive in-scope rows without a valid active tenant rule.
