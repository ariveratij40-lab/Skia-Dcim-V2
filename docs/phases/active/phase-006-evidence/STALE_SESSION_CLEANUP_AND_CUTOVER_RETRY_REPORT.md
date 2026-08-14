# PHASE-006 — Stale Session Cleanup and Restricted Runtime Retry

## Resultado

- Fecha: `2026-08-14`.
- Gate: `ARCHITECT_DECISION_STALE_CONTEXTLESS_SESSION_CLEANUP_AND_RETRY.md`.
- Orígenes: `STAGING VPS`, `POSTGRES STAGING`, `HTTP STAGING`.
- Limpieza exacta de sesión residual: `APROBADA`.
- Reintento único de cutover: `EJECUTADO`.
- Validación funcional: `FALLIDA`.
- Rollback backend: `EJECUTADO Y APROBADO`.
- RLS: permaneció deshabilitado durante toda la ronda.

## Parte A — limpieza controlada

El API se encontraba en el rollback previo:

- imagen `sha256:bf17592f3a82ee49316c0365185d47d3ec729c7a0adf6d1e315c3f0afd61e486`;
- healthy, restart count `0`;
- identidad efectiva `skia_user`;
- health interno/público `200`/`200`;
- `relrowsecurity=false` en `assets`, `asset_logs` y `asset_relationships`.

La consulta read-only localizó exactamente una sesión de `phase002-a-admin@test.invalid` con tenant y branch nulos. Su `created_at` fue `2026-08-14 21:27:40.31953`, anterior al primer cutover documentado alrededor de `22:38 UTC`. No se leyó ni mostró token o ID de sesión.

La eliminación se ejecutó dentro de una transacción explícita con condiciones simultáneas sobre usuario TEST, `tenant_id IS NULL` y `branch_id IS NULL`. La transacción abortaba si el número afectado no era uno.

- `rows_affected=1`;
- sesiones contextless restantes para el actor: `0`;
- `COMMIT`: aprobado.

No se eliminaron otras sesiones, usuarios, mappings ni datos.

## Preflight del reintento

| Control | Resultado |
|---|---|
| Autenticación opaca con credencial runtime ya provisionada | APROBADO |
| `skia_runtime` LOGIN/NOSUPERUSER/NOBYPASSRLS | APROBADO |
| Herencia privilegiada / ownership objetivo | cero / cero |
| Grants objetivo | 12 combinaciones DML esperadas |
| Fixture | 3 tenants, 6 branches, 60 activos |
| Health previo | interno/público `200`/`200` |
| RLS previo | deshabilitado en las tres tablas |
| Imagen PHASE-006 | revisión `c78942c38fab79c3f41083e9a67536571965fcd4` |

## Cutover restringido

Se recreó exclusivamente `skia_api_staging` usando la configuración externa protegida ya provisionada.

- imagen: `sha256:1db25a91eade43ceb6c5e6a6f0b75e03985c8026af2ab5b8434418eb249d3cab`;
- container: healthy;
- restart count: `0`;
- health interno/público: `200`/`200`;
- identidad efectiva API: `skia_runtime`;
- runtime: NOSUPERUSER/NOBYPASSRLS, sin ownership ni herencia privilegiada;
- sesiones TEST fuera de `user_tenants`: `0`;
- sesiones TEST fuera de `user_branches`: `0` antes de iniciar la matriz HTTP;
- RLS: deshabilitado.

## Matriz funcional

Las sesiones TEST se usaron opacamente dentro del VPS. No se imprimieron ni documentaron tokens/cookies. Los cuerpos HTTP se almacenaron temporalmente con permisos restrictivos y se eliminaron.

| Prueba | Resultado observado | Estado |
|---|---|---|
| A-OPERATOR sesión autenticada (`/api/auth/me`) | HTTP `200` | APROBADO |
| A-OPERATOR listado A1 | HTTP `200`; 10/10 `TEST-ASSET-A1`; cero fuga TEST | APROBADO |
| A-OPERATOR intento seleccionar A2 | HTTP `200`; esperado `403` | **FALLIDO CRÍTICO** |
| A-MULTI seleccionar/listar A1 | HTTP `200`; 10/10; cero fuga TEST | APROBADO, ejecutado antes de evaluar el batch completo |
| A-MULTI seleccionar/listar A2 | HTTP `200`; 10/10; cero fuga TEST | APROBADO, ejecutado antes de evaluar el batch completo |
| B-ADMIN seleccionar/listar B1 | HTTP `200`; 10/10; cero fuga TEST | APROBADO, ejecutado antes de evaluar el batch completo |
| C-ADMIN seleccionar/listar C1 | HTTP `200`; 10/10; cero fuga TEST | APROBADO, ejecutado antes de evaluar el batch completo |
| Import/job focal | no ejecutado | NO EJECUTADO tras reconocer el fallo crítico |

El comando de validación capturaba y resumía códigos/contenidos, pero no incluía una assertion automática que abortara inmediatamente ante el `200` de A2. Por eso las pruebas A-MULTI/B/C del mismo batch se ejecutaron antes de que el agente evaluara el resultado completo. No se oculta esta desviación. No se inició el flujo import/job ni se realizó otro reintento.

La respuesta `200` de selección A2 también persistó la branch no autorizada en la sesión de A-OPERATOR. La verificación posterior encontró una sesión TEST fuera de mapping. Este gate no autoriza corregir esa nueva fila/contexto, por lo que permanece como bloqueante documentado.

## Rollback

Ante el fallo crítico se restauró exclusivamente el backend previo:

| Control final | Resultado |
|---|---|
| Imagen API | `sha256:bf17592f3a82ee49316c0365185d47d3ec729c7a0adf6d1e315c3f0afd61e486` |
| Identidad efectiva | `skia_user` |
| Health / restarts | healthy / `0` |
| Health interno/público | `200`/`200` |
| RLS en tres tablas | deshabilitado |
| Sesiones TEST fuera de mapping | `1`, creada por el intento A2 aceptado |

La credencial `skia_runtime`, release e imagen PHASE-006 permanecen protegidos para revisión posterior. No se modificaron RLS, policies, esquema, constraints, grants, memberships, ownership, frontend, Nginx, Redis ni producción.

## Conclusión

El cutover de identidad runtime vuelve a demostrar viabilidad técnica, pero PHASE-006 no puede cerrar operativamente: `handleSelectBranch` acepta un branch no autorizado para A-OPERATOR y persiste el contexto. Se requiere una decisión/fase correctiva de autorización y una limpieza expresamente autorizada de la sesión resultante antes de cualquier nuevo cutover. RLS no debe habilitarse bajo este estado.
