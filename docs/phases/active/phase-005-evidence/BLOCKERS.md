# PHASE-005 — Blockers

| ID | Estado | Bloqueante | Riesgo |
|---|---|---|---|
| RLS-B01 | RESUELTO POR PHASE-006 | API STAGING usa `skia_runtime` NOSUPERUSER/NOBYPASSRLS | Evidencia `3a9aac33e4e479d0b98b54f7591645013aedc5d2` |
| RLS-B02 | RESUELTO POR PHASE-006 | Accesos objetivo convergieron a contexto tenant/branch explícito | Gate final PHASE-006 aprobado |
| RLS-B03 | RESUELTO LOCAL | Artefacto canónico hereda branch desde el activo y exige ambos endpoints de relaciones | Pruebas PostgreSQL 16 efímeras aprobadas |
| RLS-B04 | RESUELTO POR PHASE-006 | Runtime y migrador usan identidades separadas | Runtime `skia_runtime`; migrador separado |
| RLS-B05 | RESUELTO LOCAL | `ops/phase005/activate_canonical_rls.sql` es el artefacto nuevo canónico; hashes exactos bloquean divergencias | Migraciones históricas intactas |
| RLS-B06 | BLOQUEADO POR GATE | Aplicación del artefacto y activación efectiva de RLS en STAGING | Requiere decisión arquitectónica PHASE-005 separada |

No se requiere modificar datos, esquema, roles, grants ni credenciales. El diseño y su rollback están validados localmente; Etapa C continúa expresamente no autorizada.
