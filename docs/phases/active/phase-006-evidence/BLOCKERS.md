# PHASE-006 — Blockers

| ID | Estado | Bloqueante | Autoridad requerida |
|---|---|---|---|
| P006-B01 | RESUELTO LOCAL | La decisión exige rol `admin` + scope explícito + password; implementado y probado | Decisión arquitectónica aplicada |
| P006-B02 | RESUELTO LOCAL | `JobTenantContext` y transacción runtime contextual implementados | Decisión arquitectónica aplicada |
| P006-B03 | BLOQUEADO | Cutover real requiere credencial STAGING y deploy | Gate posterior; fuera de alcance |
| P006-B04 | RESUELTO LOCAL | Gate focal devuelve cero hallazgos relevantes no clasificados | Etapa D |
| P006-B05 | BLOQUEADO | Validación efectiva con rol PostgreSQL runtime restringido y RLS activo | Gate PHASE-005/STAGING posterior |
| P006-B06 | HALLAZGO PREEXISTENTE | Suite completa falla por panic de test con `db == nil` | Fase correctiva de pruebas, fuera del cambio funcional PHASE-006 |

Etapas C/D quedan completas en alcance LOCAL. No se activó RLS, no se cambiaron credenciales, esquema, constraints, roles ni privilegios. PHASE-006 queda preparada para revisión/cierre; no autoriza por sí misma cutover ni deploy.
