# PHASE-004 — Stale TEST Session Cleanup Report

## Resultado

- Entorno: `STAGING`.
- Actor lógico: `A-OPERATOR`.
- Clasificación: sesión TEST `predeploy` con contexto A2 no autorizado.
- Conteo antes: `1`.
- Filas afectadas: `1`.
- Conteo después: `0`.
- Estado de limpieza: `APROBADO`.
- Estado de validación posterior: `APROBADO`.
- Clasificación PHASE-004: `APROBADA EN STAGING`.

No se registraron token, cookie, ID de sesión ni credenciales.

## Transacción autorizada

La transacción revalidó que el predicado exacto identificara una sola sesión activa A-OPERATOR, tenant A, branch A2, creada antes del deploy PHASE-004 y sin mapping en `user_branches`.

Se utilizó el mecanismo nativo observado en logout: eliminación de la fila de `sessions`. La operación verificó `affected_rows=1` y ausencia del objetivo antes de `COMMIT`. No se modificaron usuarios, mappings, fixtures, roles, activos ni otras sesiones.

## Validación posterior

| ID | Origen | Comprobación | Observado | Estado |
|---|---|---|---|---|
| CLEAN-001 | POSTGRES STAGING | Sesiones TEST fuera de `user_branches` | 0 | APROBADO |
| CLEAN-002 | HTTP STAGING | Login A-OPERATOR | 200 | APROBADO |
| CLEAN-003 | HTTP STAGING | Tenant A para A-OPERATOR | 200 | APROBADO |
| CLEAN-004 | HTTP STAGING | A-OPERATOR selecciona A1 | 200 | APROBADO |
| CLEAN-005 | HTTP STAGING | A-OPERATOR intenta A2 | 403 | APROBADO |
| CLEAN-006 | POSTGRES STAGING | Contexto posterior A-OPERATOR | A1, mapping válido | APROBADO |
| CLEAN-007 | HTTP STAGING | A-MULTI selecciona A1 | 200 | APROBADO |
| CLEAN-008 | HTTP STAGING | A-MULTI selecciona A2 | 200 | APROBADO |
| CLEAN-009 | POSTGRES STAGING | Contexto posterior A-MULTI | A2, mapping válido | APROBADO |
| CLEAN-010 | POSTGRES STAGING | Sesiones inválidas creadas desde deploy | 0 | APROBADO |
| CLEAN-011 | STAGING VPS | Health interno | 200 | APROBADO |
| CLEAN-012 | HTTP STAGING | Health público | 200 | APROBADO |
| CLEAN-013 | STAGING VPS | Contenedor backend | healthy, restart count 0 | APROBADO |

El backend continuó ejecutando la revisión `01efd5099758d8ad85fc4bcdf4720c5e23e59270`.

## Límites respetados

No se reejecutó CAMPAÑA A completa ni CAMPAÑA B. No se modificaron fixtures PHASE-002, RLS, esquema, migraciones, Nginx, frontend, Redis ni producción.
