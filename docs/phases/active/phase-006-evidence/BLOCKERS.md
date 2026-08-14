# PHASE-006 — Blockers

| ID | Estado | Bloqueante | Autoridad requerida |
|---|---|---|---|
| P006-B01 | RESUELTO LOCAL | La decisión exige rol `admin` + scope explícito + password; implementado y probado | Decisión arquitectónica aplicada |
| P006-B02 | RESUELTO LOCAL | `JobTenantContext` y transacción runtime contextual implementados | Decisión arquitectónica aplicada |
| P006-B03 | RESUELTO | Credencial nueva `skia_runtime` y configuración migrador/runtime separada provisionadas externamente con permisos restrictivos | Gate de provisionamiento ejecutado |
| P006-B04 | RESUELTO LOCAL | Gate focal devuelve cero hallazgos relevantes no clasificados | Etapa D |
| P006-B05 | BLOQUEADO | Validación efectiva con rol PostgreSQL runtime restringido y RLS activo | Gate PHASE-005/STAGING posterior |
| P006-B06 | HALLAZGO PREEXISTENTE | Suite completa falla por panic de test con `db == nil` | Fase correctiva de pruebas, fuera del cambio funcional PHASE-006 |
| P006-B07 | RESUELTO | La sesión contextless de `phase002-a-admin@test.invalid` fue eliminada transaccionalmente con `rows_affected=1` y verificación cero | Gate de limpieza ejecutado |
| P006-B08 | RESUELTO LOCAL | La omisión de PHASE-004 en la ascendencia fue identificada; `handleSelectBranch` vuelve a exigir mapping exacto y UPDATE protegido. La sesión TEST resultante fue eliminada con `rows_affected=1` | Gate de regresión ejecutado |
| P006-B09 | BLOQUEADO | La corrección de branch no ha sido desplegada ni validada en STAGING | Nueva decisión explícita de deploy/cutover |

Etapas C/D quedan completas en alcance LOCAL. No se activó RLS, no se cambiaron credenciales, esquema, constraints, roles ni privilegios. PHASE-006 queda preparada para revisión/cierre; no autoriza por sí misma cutover ni deploy.
