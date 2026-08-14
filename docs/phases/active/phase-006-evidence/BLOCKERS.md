# PHASE-006 — Blockers

| ID | Estado | Bloqueante | Autoridad requerida |
|---|---|---|---|
| P006-B01 | BLOQUEADO | `handleClearInventory` necesita scope multi-branch pero no demuestra rol/capacidad compatible con `branch_scope_all` | Arquitectura de autorización |
| P006-B02 | BLOQUEADO | Jobs/importación acceden a tablas objetivo sin contrato uniforme de contexto | Arquitectura de jobs/runtime |
| P006-B03 | BLOQUEADO | Cutover real requiere credencial STAGING y deploy | Gate posterior; fuera de alcance |
| P006-B04 | BLOQUEADO | Linter conserva hallazgos relevantes sin resolver | Reanudar Etapa C tras decisiones B01/B02 |

No se activó RLS, no se cambiaron credenciales, esquema, constraints, roles ni privilegios.
