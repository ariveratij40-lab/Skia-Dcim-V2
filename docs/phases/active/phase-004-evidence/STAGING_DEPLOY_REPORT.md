# PHASE-004 — STAGING Deploy Report

## Resultado global

- Entorno: `STAGING`.
- Estado del deploy backend: `APROBADO`.
- Estado de la corrección sobre sesiones nuevas: `APROBADO`.
- Gate completo: `BLOQUEADO` por una sesión inválida activa creada antes del deploy.
- Commit de implementación: `01efd5099758d8ad85fc4bcdf4720c5e23e59270`.
- Release: `/opt/apps/skia/releases/01efd509`.
- Imagen efectiva: `sha256:bf17592f3a82ee49316c0365185d47d3ec729c7a0adf6d1e315c3f0afd61e486`.

## Precondiciones

- Backend previo: imagen `sha256:99bdead4177b59347fe2bd2d137c8d96afaf4b398d65325ae59f0a5ad89127dc`, saludable y sin reinicios.
- Rollback backend preservado como `staging-skia_api_staging:rollback-phase004-99bdead4`.
- Health interno y público previo: HTTP `200`.
- Manifest PHASE-002: modo `0600`, checksum SHA-256 `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`.
- Fixture verificado read-only: 3 tenants, 6 branches, 9 usuarios, 3 roles, 60 activos, 60 logs y 6 relaciones; todas las comprobaciones canónicas aprobaron.
- Se observó antes de las pruebas una sesión TEST activa con mapping inválido, creada antes del deploy.

## Deploy

Se construyó el backend desde un release aislado del commit autorizado. Se recreó exclusivamente `skia_api_staging` con `--no-deps` y `--no-build`. Frontend, PostgreSQL, Redis, pgAdmin y Nginx no fueron reiniciados ni modificados.

El contenedor resultante quedó `healthy`, con restart count `0` y la etiqueta de revisión exacta del commit autorizado. No fue necesario aplicar rollback porque no hubo indisponibilidad ni regresión funcional del backend.

## Validación post-deploy

| ID | Origen | Comprobación | Esperado | Observado | Estado |
|---|---|---|---|---|---|
| STG-004-01 | STAGING VPS | Health interno | 200 | 200 | APROBADO |
| STG-004-02 | HTTP STAGING | Health público | 200 | 200 | APROBADO |
| STG-004-03 | HTTP STAGING | Login A-OPERATOR | 200 | 200 | APROBADO |
| STG-004-04 | HTTP STAGING | A-OPERATOR selecciona tenant A | 200 | 200 | APROBADO |
| STG-004-05 | HTTP STAGING | A-OPERATOR selecciona A1 | 200 | 200 | APROBADO |
| STG-004-06 | HTTP STAGING | A-OPERATOR intenta A2 | 403 | 403 | APROBADO |
| STG-004-07 | POSTGRES STAGING | Sesión nueva A-OPERATOR conserva A1 | A1 con mapping válido | A1 con mapping válido | APROBADO |
| STG-004-08 | HTTP STAGING | Login A-MULTI | 200 | 200 | APROBADO |
| STG-004-09 | HTTP STAGING | A-MULTI selecciona tenant A | 200 | 200 | APROBADO |
| STG-004-10 | HTTP STAGING | A-MULTI selecciona A1 | 200 | 200 | APROBADO |
| STG-004-11 | HTTP STAGING | A-MULTI selecciona A2 | 200 | 200 | APROBADO |
| STG-004-12 | POSTGRES STAGING | Sesión nueva A-MULTI termina en A2 | A2 con mapping válido | A2 con mapping válido | APROBADO |
| STG-004-13 | POSTGRES STAGING | Nuevas sesiones inválidas desde deploy | 0 | 0 | APROBADO |
| STG-004-14 | POSTGRES STAGING | Ausencia de todo contexto A2 inválido para A-OPERATOR | 0 | 1 sesión activa pre-deploy | FALLIDO |

No se registraron passwords, tokens, cookies, IDs de sesión ni headers de autorización.

## Conclusión

El defecto de mutación fue corregido para las solicitudes ejecutadas contra el runtime nuevo: la selección A2 no autorizada recibió 403 y la nueva sesión conservó A1. No obstante, una sesión inválida A-OPERATOR/A2 creada durante la campaña anterior permanece activa. El gate exige detenerse ante este resultado y no autoriza modificar o revocar sesiones existentes.

No se reejecutó CAMPAÑA A completa, no se hizo rollback de fixtures y no se modificaron RLS, esquema, migraciones, frontend ni infraestructura.
