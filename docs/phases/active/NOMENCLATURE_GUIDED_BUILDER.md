# Guided nomenclature builder

## Objective

The nomenclature editor now explains technical-code composition in business
language without changing the normative contract. Administrators define the
rule; operators select authoritative branch and placement context; the backend
continues to reserve the sequence and generate the definitive code.

The existing modal, form state, POST/PUT payloads, structural lock, save flow and
preview calculation remain intact. The change adds a compact type-specific guide,
human-readable placeholders and clearer optional-segment guidance.

## Current normative logic

The production generator currently composes:

```text
prefix
+ optional branch code resolved from branches.city/name
+ optional placement_code resolved from the selected active location
+ custom_segment_1 when configured
+ custom_segment_2 when configured
+ transactionally reserved padded sequence
```

The visible preview uses `[SUCURSAL]` and `[UBICACIÓN]`; internal API/DB property
names remain unchanged. `[SUCURSAL]` is replaced by the active branch code when
the asset is registered. Placement is resolved from `placement_id` and is never
entered as free text.

## Capability matrix

| Component | Current source | Status | Can participate today? |
|---|---|---|---|
| Sucursal | authenticated branch context; `branches.city/name` | SUPPORTED | Yes, through `include_branch` |
| Placement | validated `placement_id`; `locations.placement_code` | SUPPORTED for SWITCH, RACK, PATCH_PANEL, UPS, PDU and NODE | Yes, enforced by `include_placement` |
| Consecutivo | `naming_rules.last_seq` or placement-scoped `nomenclature_counters` | SUPPORTED | Yes, authoritative and transactional |
| Prefijo | `naming_rules.prefix` | SUPPORTED | Yes, administrator-configurable |
| Separador | `naming_rules.separator` | SUPPORTED | Yes, administrator-configurable |
| Dígitos | `naming_rules.seq_digits` | SUPPORTED | Yes, administrator-configurable |
| Segmentos personalizados | two label/value pairs in `naming_rules` | SUPPORTED | Yes, static values configured by administrator |
| Rack | `rack_id` exists for some satellite records, often assigned after asset creation | PARTIALLY_SUPPORTED | No; the nomenclature generator does not read it |
| Tipo/función de switch | captured by parts of the frontend but not persisted consistently by canonical creation | NOT_SUPPORTED | No |
| Puertos | satellite `port_count` exists for switches and patch panels | PARTIALLY_SUPPORTED | No; satellite insertion occurs after code reservation and the generator does not read it |
| Legacy `include_location` | reserved database field rejected by the normative API when true | NOT_SUPPORTED | No; superseded operationally by authoritative placement support |

Rack, function and port count may appear in educational target examples, but
are visibly marked **CAPACIDAD FUTURA**. They never appear in the operational
preview and are not presented as currently derived.

## Type-specific guidance

`frontend/components/NomenclatureGuide.tsx` centralizes examples for SWITCH,
RACK, PATCH_PANEL, UPS, PDU, NODE, MDF and IDF, plus a safe generic fallback.
The Switch guide uses the conceptual target `TIJ-IDF01-R02-ACC-48-001` and
explains Sucursal, Ubicación, Rack, Tipo, Puertos and Consecutivo individually.
Each token is classified so the UI distinguishes current generator capability
from future composition.

## Administrator-configurable components

The editable contract remains limited to description, prefix, separator,
sequence digits, branch inclusion, active state and the two existing custom
segment label/value pairs. The custom fields are grouped under **Segmentos
personalizados (opcional)** and explicitly reserved for information SKIA cannot
derive automatically. Examples use coherent pairs such as Edificio/E1 and
Piso/P02 and never populate values automatically.

## Compatibility and authority

- Existing rules load and save every existing field without transformation.
- POST and PUT payloads are unchanged.
- `include_branch`, backend-controlled `include_placement`, prefix, separator,
  digits, custom segments and counters retain their semantics.
- No code-generation, placement, RLS, database or API behavior changes.
- The preview remains orientative; definitive codes remain backend-generated.

## Files

- `frontend/components/NomenclatureGuide.tsx`
- `frontend/pages/infraestructura/catalogs/nomenclaturas.tsx`
- `docs/phases/active/NOMENCLATURE_GUIDED_BUILDER.md`

## Validation and residual risks

Validation covers clean dependency installation, TypeScript, the production
Next.js build, `git diff --check` and static review of create/edit/cancel/close,
save, preview, branch, placement, custom segments, placement/non-placement asset
types and preservation of payload data.

Manual browser QA remains recommended for guide wrapping, modal scrolling,
focus/Escape behavior and final light/dark appearance. Future support for rack,
switch function or port count requires an explicit backend contract and must not
be simulated with static custom segments.
