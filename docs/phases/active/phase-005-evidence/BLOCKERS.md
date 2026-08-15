# PHASE-005 — Blockers

| ID | Estado | Bloqueante | Riesgo |
|---|---|---|---|
| RLS-B01 | RESUELTO POR PHASE-006 | API STAGING usa `skia_runtime` NOSUPERUSER/NOBYPASSRLS | Evidencia `3a9aac33e4e479d0b98b54f7591645013aedc5d2` |
| RLS-B02 | RESUELTO POR PHASE-006 | Accesos objetivo convergieron a contexto tenant/branch explícito | Gate final PHASE-006 aprobado |
| RLS-B03 | RESUELTO LOCAL | Artefacto canónico hereda branch desde el activo y exige ambos endpoints de relaciones | Pruebas PostgreSQL 16 efímeras aprobadas |
| RLS-B04 | RESUELTO POR PHASE-006 | Runtime y migrador usan identidades separadas | Runtime `skia_runtime`; migrador separado |
| RLS-B05 | RESUELTO LOCAL | `ops/phase005/activate_canonical_rls.sql` es el artefacto nuevo canónico; hashes exactos bloquean divergencias | Migraciones históricas intactas |
| RLS-B06 | RESUELTO LOCAL | Guard FK restringido a tres constraints objetivo por identidad y semántica; casos ausente/incorrecto/adicional validados en PostgreSQL 16 efímero | Pendiente de revisión arquitectónica |
| RLS-B07 | RESUELTO | Activación canónica completada; RLS/FORCE `true/true`, hashes exactos y validación inmediata aprobada | Gate de reintento ejecutado |
| RLS-B08 | RESUELTO | El runner corregido emitió COMPLETE, exit `0` y matriz íntegra durante el retry autorizado | Validado por CAMPAÑA B |
| RLS-B09 | RESUELTO | CAMPAÑA B completa bajo RLS canónico, sin fugas observadas y con correlación read-only aprobada | Pendiente de dictamen arquitectónico final |

Fuera del ciclo normal de sesiones generado por login/logout del runner, no se
modificaron datos funcionales, esquema, roles, grants ni credenciales. RLS
permanece habilitado. No se autoriza una nueva CAMPAÑA B; corresponde el
dictamen arquitectónico final de PHASE-005.
