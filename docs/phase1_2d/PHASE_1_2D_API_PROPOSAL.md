# Phase 1.2D minimal API proposal

All authorities come from session context; every tenant table access uses TenantDB/FORCE RLS.

| Method/path | Authority/input | Output | Tx/RLS | Idempotency/V1 |
|---|---|---|---|---|
| GET `/api/dcim/physical-infrastructure/readiness` | session; optional `asset_type_code` | initial + per-type reasons/actions | read TenantTx | derived; keep old readiness during transition |
| GET `/api/dcim/physical-infrastructure/tree` | session | Branch→optional Building/Floor→Zone→distribution→Housing | read TenantTx | reuse/replace hierarchy DTO additively |
| GET `/api/dcim/zones` | session; filters only | active scoped Zones | read TenantTx | repeatable; new semantic endpoint |
| POST `/api/dcim/zones` | admin; code/name and optional parent IDs | resolved Zone | one TenantTx | duplicate scope/code returns existing/conflict |
| GET `/api/dcim/housings` | session; optional MDF/IDF | Housing DTOs | read TenantTx | wraps current racks storage; rack aliases retained |
| POST `/api/dcim/housings` | admin; type, MDF/IDF, attributes | Housing + legacy rack alias | one TenantTx | client idempotency key recommended |
| GET `/api/dcim/naming/presets` | authenticated admin | reviewed global presets | controlled read path | no mutation; requires atomic grant contract change |
| POST `/api/dcim/naming/apply-recommended` | admin; preset version/selection | created/unchanged/conflicts | one TenantTx | idempotent; no assets/sequences |
| POST `/api/dcim/naming/preview` | authenticated; type + scoped IDs | preview + resolved components | read-only | never locks/reserves |
| POST `/api/dcim/assets` | existing create permission; type + IDs | asset/code | one TenantTx | authoritative reservation; specialized V1 routes retained |

Reuse `/api/dcim/sites` only for optional Building management. Existing `/api/dcim/placements` remains legacy Location listing until its DTO exposes Zone provenance. Do not create separate Floor/TechnicalRoom APIs unless a selected policy requires them.
