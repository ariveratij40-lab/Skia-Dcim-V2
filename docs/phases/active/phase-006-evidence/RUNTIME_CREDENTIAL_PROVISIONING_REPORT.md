# PHASE-006 — Runtime Credential Provisioning and Cutover Report

## Resultado global

- Fecha: `2026-08-14`.
- Gate: `ARCHITECT_DECISION_RUNTIME_CREDENTIAL_PROVISIONING_GATE.md`.
- Orígenes: `STAGING VPS`, `POSTGRES STAGING`, `HTTP STAGING`.
- Release preparado: `c78942c38fab79c3f41083e9a67536571965fcd4`.
- Backend funcional mínimo incluido: `67e5fdd878543b81b98831c5e4a707f6e7405f53`.
- Provisionamiento de credencial: `APROBADO`.
- Cutover técnico restringido: `APROBADO` temporalmente.
- Gate funcional completo: `FALLIDO` por sesión TEST fuera de mappings.
- Rollback: `EJECUTADO Y APROBADO`.
- Estado final del API: release/imagen e identidad runtime previos restaurados.
- RLS: permaneció deshabilitado durante toda la ronda.

## Precondiciones

| Control | Resultado |
|---|---|
| API previo | healthy, restart count `0` |
| Health interno / público | `200` / `200` |
| Fixture canónico | 3 tenants, 6 branches, 60 activos |
| `skia_runtime` | LOGIN, NOSUPERUSER, NOBYPASSRLS, sin CREATEDB/CREATEROLE |
| Herencia privilegiada runtime | cero memberships detectadas |
| Ownership runtime sobre tablas objetivo | cero |
| RLS previo | `relrowsecurity=false` en las tres tablas |
| Imagen previa preservada | `sha256:bf17592f3a82ee49316c0365185d47d3ec729c7a0adf6d1e315c3f0afd61e486` |

## Provisionamiento

Se generó fuera del repositorio una contraseña criptográficamente aleatoria y distinta para el rol existente `skia_runtime`. Se modificó exclusivamente la contraseña del rol; no se cambiaron atributos, grants, memberships ni ownership.

Controles aplicados:

- el temporal local tuvo permisos `0600` y fue eliminado tras la transferencia;
- el destino externo `/opt/apps/skia/config/phase006-runtime/` se creó como directorio privado `0700`, no symlink;
- `runtime.secret`, `runtime.env` y el override Compose quedaron `0600`;
- la autenticación de `skia_runtime` se validó sin mostrar la credencial;
- `MIGRATOR_DATABASE_URL` se construyó opacamente desde la configuración administrativa existente;
- los secretos runtime y migrador son distintos;
- ningún valor se imprimió, documentó o versionó.

La credencial nueva permanece provisionada y protegida después del rollback, conforme a la decisión arquitectónica.

## Release y cutover

El backend se transfirió mediante `git archive` a un release separado del checkout histórico del VPS:

- directorio: `/opt/apps/skia/releases/phase006-c78942c/`;
- revisión OCI: `c78942c38fab79c3f41083e9a67536571965fcd4`;
- imagen: `sha256:1db25a91eade43ceb6c5e6a6f0b75e03985c8026af2ab5b8434418eb249d3cab`;
- servicio recreado: exclusivamente `skia_api_staging`;
- frontend, PostgreSQL, Redis, pgAdmin y Nginx: no recreados ni modificados.

El primer marcador `RELEASE_SHA` contenía una expansión manual incorrecta del SHA abreviado. Se detectó y corrigió al SHA exacto antes de construir la imagen; nunca se desplegó una imagen con marcador ambiguo.

Durante el cutover:

- el contenedor alcanzó `healthy` con restart count `0`;
- health interno y público devolvieron `200`;
- `pg_stat_activity` mostró la conexión del API como `skia_runtime`;
- el contenedor expuso los nombres `DATABASE_URL`, `MIGRATOR_DATABASE_URL` y `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB`;
- los logs redactados mostraron migraciones completadas antes de `Connected to runtime database`;
- los atributos restringidos y ownership de `skia_runtime` permanecieron sin cambios;
- el fixture conservó 3 tenants, 6 branches y 60 activos;
- RLS continuó con `relrowsecurity=false` en `assets`, `asset_logs` y `asset_relationships`.

## Fallo de validación

La consulta obligatoria de sesiones TEST fuera de mappings devolvió `1`. El diagnóstico read-only, sin token ni ID de sesión, identificó:

- actor lógico: `phase002-a-admin@test.invalid`;
- tenant de sesión: ausente;
- branch de sesión: ausente;
- mapping tenant válido para el contexto almacenado: `false`;
- mapping branch válido para el contexto almacenado: `false`.

Estado: `FALLIDO`. El gate exige cero sesiones TEST fuera de `user_branches`; por ello se detuvo la matriz funcional y se ejecutó rollback. No se extrajo ni reutilizó el token de sesión y no se corrigió/eliminó la fila, porque este gate no autoriza modificar sesiones.

Las pruebas A-OPERATOR/A-MULTI, lecturas A/B/C e import/job quedaron `NO EJECUTADAS` después del fallo crítico. Continuarlas no habría cumplido la secuencia de detención/rollback definida.

## Rollback verificado

Se recreó exclusivamente `skia_api_staging` usando el Compose/configuración previos.

| Control final | Resultado |
|---|---|
| Imagen API | `sha256:bf17592f3a82ee49316c0365185d47d3ec729c7a0adf6d1e315c3f0afd61e486` |
| Identidad API | `skia_user` |
| Container health | healthy |
| Restart count | `0` |
| Health interno / público | `200` / `200` |
| RLS `assets` | deshabilitado |
| RLS `asset_logs` | deshabilitado |
| RLS `asset_relationships` | deshabilitado |

No se modificaron RLS, policies, esquema, constraints, fixture, roles distintos de la contraseña autorizada, grants, memberships, ownership, frontend, Nginx, Redis ni producción.

## Reanudación

Antes de otro cutover se requiere una autorización específica para tratar la sesión TEST sin tenant/branch o una decisión que determine que esa clase de sesión no viola el criterio. El siguiente intento debe repetir precondiciones y la matriz completa. No debe habilitar RLS ni ejecutar CAMPAÑA B bajo esta evidencia.
