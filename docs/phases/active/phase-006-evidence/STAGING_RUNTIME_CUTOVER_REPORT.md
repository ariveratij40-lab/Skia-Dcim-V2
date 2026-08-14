# PHASE-006 — STAGING Runtime Cutover Report

## Resultado

- Fecha: `2026-08-14`.
- Origen: `STAGING VPS` / `POSTGRES STAGING` / `HTTP STAGING`.
- Gate: `ARCHITECT_DECISION_STAGING_RUNTIME_CUTOVER_GATE.md`.
- Backend mínimo aprobado: `67e5fdd878543b81b98831c5e4a707f6e7405f53`.
- Resultado global: `BLOQUEADO ANTES DEL CUTOVER`.
- Deploy/recreación: `NO EJECUTADO`.
- Rollback: `NO APLICA`; no se modificó el servicio.

El gate se detuvo en las precondiciones obligatorias. STAGING no dispone de una credencial externa identificable para `skia_runtime` ni de configuración separada para `MIGRATOR_DATABASE_URL`. Extraer la contraseña de `DATABASE_URL` vigente y reutilizarla con otro rol fue rechazado por el control de seguridad y no se ejecutó. No se generó, recuperó, copió, rotó ni mostró ningún secreto.

## Baseline preservado

| Comprobación | Resultado |
|---|---|
| Host / usuario | `ubuntu` / `alvaro` |
| Ruta operativa observada | `/opt/apps/skia/staging` |
| Checkout VPS | `main @ cc80606e744bf64e1534c4b6818d0ff2e29b5031`, con cambios locales históricos; no fue modificado ni usado como fuente de release |
| Imagen backend previa | `sha256:bf17592f3a82ee49316c0365185d47d3ec729c7a0adf6d1e315c3f0afd61e486` |
| Contenedor backend | `healthy`, restart count `0` |
| Identidad DB efectiva antes del cambio | `skia_user` |
| Health interno | HTTP `200` en `/api/health` |
| Health público | HTTP `200` en `https://skia.iamet.mx/api/health` |

La imagen anterior quedó intacta y disponible como baseline técnico para un futuro intento autorizado.

## PostgreSQL read-only

| Control | Resultado | Estado |
|---|---|---|
| `skia_runtime` existe y tiene LOGIN | sí | `APROBADO` |
| `skia_runtime` NOSUPERUSER / NOBYPASSRLS | sí | `APROBADO` |
| Herencia privilegiada de `skia_runtime` | ninguna observada | `APROBADO` |
| Ownership de tablas objetivo | pertenece a `skia_user`, no a runtime | `APROBADO` |
| DML runtime en `assets`, `asset_logs`, `asset_relationships` | SELECT/INSERT/UPDATE/DELETE presentes | `APROBADO` |
| Migrador actual `skia_user` | SUPERUSER/BYPASSRLS y CREATE en `public`; distinto de runtime | `APROBADO` solo como capacidad migradora existente |
| Identidad efectiva del API | conexiones observadas como `skia_user` | `PENDIENTE DE CUTOVER` |

## Estado RLS

Antes de cualquier cambio se observó:

| Tabla | `relrowsecurity` | `relforcerowsecurity` |
|---|---:|---:|
| `assets` | `false` | `true` |
| `asset_logs` | `false` | `true` |
| `asset_relationships` | `false` | `true` |

RLS permaneció deshabilitado durante toda la ronda. No se ejecutó `ENABLE ROW LEVEL SECURITY`, no se modificaron policies y no existe estado posterior distinto porque no hubo cutover.

## Fixture PHASE-002

La verificación por IDs canónicos y alias TEST confirmó:

- tenants: `3`;
- branches: `6`;
- activos `TEST-ASSET-*`: `60`.

Estado: `APROBADO` como precondición de integridad.

## Configuración externa

Se inspeccionaron exclusivamente nombres de variables y referencias de configuración, nunca valores. El contenedor vigente expone `DATABASE_URL`, pero no `MIGRATOR_DATABASE_URL` ni `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB`. Los archivos externos revisados no contienen una referencia identificable a `SKIA_RUNTIME_DB_PASSWORD`, `MIGRATOR_DATABASE_URL` o `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB`.

Por tanto no fue posible satisfacer simultáneamente y de forma segura:

1. `DATABASE_URL` autenticando como `skia_runtime`;
2. `MIGRATOR_DATABASE_URL` autenticando como identidad migradora distinta;
3. `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true`;
4. ausencia de revelación, recuperación o reutilización no autorizada de secretos.

## Matriz post-cutover

Todas las pruebas funcionales posteriores — login TEST, tenant/branch, A-OPERATOR, A-MULTI, aislamiento B/C e import/job — quedaron `NO EJECUTADAS`, porque el gate exige realizarlas después de un cutover exitoso. Ejecutarlas contra el runtime anterior no demostraría el objetivo de esta ronda.

El gate/linter local ya publicado permanece aprobado. No se modificó tooling.

## Reanudación requerida

Se requiere provisionar por un mecanismo externo autorizado una credencial separada y utilizable para `skia_runtime`, además de la configuración migradora, sin cambiar roles/grants. Un nuevo gate o reintento aprobado deberá comenzar nuevamente desde las precondiciones y desplegar un release limpio que contenga como mínimo `67e5fdd878543b81b98831c5e4a707f6e7405f53`.

No se modificaron VPS checkout, PostgreSQL, datos, fixture, Docker, frontend, Nginx, Redis, RLS ni servicios.
