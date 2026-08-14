# PHASE-006 — Final Restricted Runtime Cutover

## Resultado

- Fecha: `2026-08-14`.
- Gate: `ARCHITECT_DECISION_RESTRICTED_RUNTIME_CUTOVER_RETRY_FINAL.md`.
- Orígenes: `LOCAL`, `STAGING VPS`, `POSTGRES STAGING`, `HTTP STAGING`.
- Reintento final de cutover: **APROBADO EN STAGING**.
- Backend al cierre: `skia_runtime` restringido.
- RLS al cierre: **deshabilitado** en las tres tablas objetivo.
- Rollback: no ejecutado; el gate aprobó y exige conservar el runtime restringido.

## Baseline y precondiciones

El despliegue se realizó desde `phase/006-runtime-role-context` en el commit
`16e3ec6725ff9eae26faee84b37d74add1b35c18`, descendiente directo de la
corrección autorizada `27be9b64c658afcbcc74b233c5d132069817e8d7`.

Antes del cutover se verificó:

- árbol local limpio;
- configuración y credenciales runtime externas al repositorio, regulares, sin
  symlinks y con modo `0600`; no se leyó ni mostró ningún secreto;
- identidad runtime `skia_runtime`, migrador `skia_user`, identidades distintas;
- `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true`;
- `skia_runtime`: LOGIN, NOSUPERUSER, NOBYPASSRLS, sin ownership de tablas
  objetivo y sin herencia privilegiada;
- fixture íntegro: 3 tenants, 6 branches y 60 activos TEST;
- cero sesiones TEST fuera de mappings tenant/branch;
- health interno/público `200`/`200`;
- `relrowsecurity=false` en `assets`, `asset_logs` y `asset_relationships`.

Se preservó para rollback la imagen previa
`sha256:bf17592f3a82ee49316c0365185d47d3ec729c7a0adf6d1e315c3f0afd61e486`.

## Release y cutover

Se generó un release limpio en
`/opt/apps/skia/releases/phase006-final-16e3ec6/backend` mediante `git archive`,
sin modificar el checkout histórico del VPS. El archivo `RELEASE_SHA` registra
el SHA aprobado exacto.

Se construyó y desplegó exclusivamente el backend:

| Control | Resultado |
|---|---|
| Imagen | `sha256:5d85157b5ddce7f831458ec5818b9e96528686b3e9b2ca77c6d3d590c722cf90` |
| Revisión OCI | `16e3ec6725ff9eae26faee84b37d74add1b35c18` |
| Servicio recreado | `skia_api_staging` únicamente |
| Health Docker | `healthy` |
| Restart count | `0` |
| Identidad efectiva del API | `skia_runtime` |

Frontend, PostgreSQL, Redis, pgAdmin, Nginx, DNS y producción no fueron
recreados ni modificados.

## Validación funcional ordenada

Las sesiones TEST existentes se utilizaron opacamente dentro del VPS. Tokens y
cookies no fueron impresos ni almacenados en evidencia. Los cuerpos HTTP se
capturaron en archivos temporales con permisos restrictivos y fueron eliminados.

| Control | Evidencia resumida | Estado |
|---|---|---|
| Health interno | `/api/health` HTTP `200` | APROBADO |
| Health público | `https://skia.iamet.mx/api/health` HTTP `200` | APROBADO |
| Identidad API | 2 conexiones observadas como `skia_runtime` | APROBADO |
| Restricción del rol | NOSUPERUSER, NOBYPASSRLS, cero herencia privilegiada, cero ownership objetivo | APROBADO |
| Sesiones previas | tenant inválido `0`; branch inválido `0` | APROBADO |
| A-OPERATOR sesión | `/api/auth/me` HTTP `200`; Tenant A HTTP `200` | APROBADO |
| A-OPERATOR A1 | selección HTTP `200`; 10 activos A1; cero fugas | APROBADO |
| A-OPERATOR A2 | HTTP `403`; la sesión conservó A1 | APROBADO |
| A-MULTI A1 | HTTP `200`; 10 activos; cero fugas | APROBADO |
| A-MULTI A2 | HTTP `200`; 10 activos; cero fugas | APROBADO |
| B-ADMIN B1 | HTTP `200`; 10 activos; cero fugas | APROBADO |

La prueba B-ADMIN satisface el control obligatorio de al menos una lectura
acotada de Tenant B/C.

## Job con contexto explícito

Se ejecutó una única importación CSV vacía controlada con A-OPERATOR en Tenant
A / Branch A1. El parser produjo cero ítems; llegar al estado `done` exige que
la ruta atraviese `BeginJobTenantTx` con el `JobTenantContext` capturado y que
la transacción contextual termine correctamente.

| Control | Resultado |
|---|---|
| HTTP de creación/consulta | `200` / `200` |
| Estado final | `done` |
| Ítems extraídos | `0` |
| Scope persistido del job | Tenant A / Branch A1 |
| Activos TEST antes/después | `60` / `60` |
| Activos A1 antes/después | `10` / `10` |
| Activos TEST fuera de A1 antes/después | `50` / `50` |

No se creó ni modificó ningún activo. La fila de job TEST autorizada queda como
trazabilidad de la ejecución; no contiene credenciales.

## Controles finales

| Control | Resultado |
|---|---|
| Sesiones TEST fuera de `user_tenants` | `0` |
| Sesiones TEST fuera de `user_branches` | `0` |
| Fixture | 3 tenants / 6 branches / 60 activos |
| Health interno/público | `200` / `200` |
| Backend health/restarts | healthy / `0` |
| Errores FATAL/PANIC/ERROR en últimas 120 líneas | `0` |
| `schema_migrations` | 11 filas; máxima `015_email_verification` |
| RLS | `relrowsecurity=false` en las tres tablas |
| FORCE baseline | `relforcerowsecurity=true` en las tres tablas, sin efecto mientras RLS está deshabilitado |

No se ejecutaron migraciones, cambios de esquema, grants, cambios de rol,
policies ni operaciones RLS durante el gate.

## Conclusión

El reintento final del cutover restringido queda **APROBADO EN STAGING**. El
backend permanece healthy y ejecutándose como `skia_runtime`; la regresión de
selección de branch está corregida y validada, y el job contextual no produjo
mutación fuera de alcance.

PHASE-006 cumple el gate operativo autorizado. Esto no aprueba RLS ni declara
completo el aislamiento de base de datos: `relrowsecurity` continúa en `false`.
La activación RLS y CAMPAÑA B requieren una decisión separada de PHASE-005.
