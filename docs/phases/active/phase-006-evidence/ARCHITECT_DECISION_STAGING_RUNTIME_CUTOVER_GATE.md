# ARCHITECT DECISION — PHASE-006 STAGING Runtime Cutover Gate

## Estado

- Decisión: AUTORIZADO CONDICIONALMENTE.
- Entorno: STAGING exclusivamente.
- Backend mínimo aprobado: `67e5fdd878543b81b98831c5e4a707f6e7405f53`.
- Objetivo: validar en STAGING la separación migrador/runtime y operar la API con el rol restringido real antes de activar RLS.
- RLS debe permanecer DESHABILITADO durante todo este gate.

## Fundamento

PHASE-006 completó la convergencia de contexto tenant/branch y la separación lógica de conexiones. La siguiente variable a aislar es la identidad PostgreSQL usada por runtime. Activar simultáneamente el rol restringido y RLS mezclaría dos cambios de seguridad y dificultaría atribuir fallos. Por tanto este gate autoriza únicamente el cutover de identidad runtime, manteniendo sin cambios `relrowsecurity` en las tablas objetivo.

## Precondiciones obligatorias

Antes de modificar STAGING:

1. Publicar y ejecutar desde un release identificable que contenga como mínimo `67e5fdd878543b81b98831c5e4a707f6e7405f53` y esta decisión.
2. Confirmar árbol/release limpio y preservar imagen/release/configuración anterior para rollback.
3. Confirmar read-only que `skia_runtime` existe y cumple: LOGIN, NOSUPERUSER, NOBYPASSRLS, no ownership de `assets`, `asset_logs` ni `asset_relationships`, y sin membresía heredada en roles superuser/BYPASSRLS.
4. Confirmar que el rol migrador autorizado sigue siendo distinto del runtime y conserva capacidad suficiente para las migraciones de arranque requeridas.
5. Confirmar que las tres tablas objetivo mantienen `relrowsecurity=false` antes del cutover. Si alguna está habilitada, abortar.
6. Confirmar fixture PHASE-002 íntegro y health interno/público HTTP 200 antes del cambio.
7. Preparar `DATABASE_URL` runtime y `MIGRATOR_DATABASE_URL` mediante el mecanismo externo de secretos de STAGING. No imprimir, versionar ni registrar DSN/password completos.
8. Establecer `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true`.

## Cambio autorizado

Se autoriza exclusivamente:

- desplegar/recrear el backend STAGING con el release PHASE-006;
- configurar `DATABASE_URL` para la identidad PostgreSQL restringida `skia_runtime`;
- configurar `MIGRATOR_DATABASE_URL` para la identidad migradora separada;
- activar `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true`;
- ejecutar las migraciones de arranque normales únicamente mediante la conexión migradora separada;
- reiniciar/recrear solo `skia_api_staging` cuando sea necesario para aplicar el release/configuración.

No se autoriza modificar PostgreSQL roles/grants, políticas, esquema, datos funcionales, frontend, Nginx, Redis ni otros servicios.

## Validación inmediata obligatoria

Después del cutover, y antes de cualquier otro cambio:

1. Backend container `healthy`, restart count estable y health interno/público HTTP 200.
2. Evidencia read-only desde conexiones del API que `current_user=skia_runtime` para runtime.
3. Evidencia de que `skia_runtime` continúa NOSUPERUSER/NOBYPASSRLS/no owner/no herencia privilegiada.
4. Confirmar que `relrowsecurity=false` permanece en `assets`, `asset_logs`, `asset_relationships`.
5. Ejecutar pruebas funcionales focales sin modificar tooling:
   - login TEST válido;
   - selección tenant/branch válida;
   - A-OPERATOR A1 permitido;
   - A-OPERATOR A2 denegado;
   - A-MULTI A1/A2 permitido;
   - listado de activos A1 devuelve los 10 aliases esperados;
   - B y C continúan aislados en las rutas cubiertas;
   - importación/job focal que toque `assets` usa contexto explícito y no falla por identidad runtime;
   - `handleClearInventory` no debe ejecutarse destructivamente; solo validar estáticamente/configuración o mediante prueba no destructiva ya existente.
6. Ejecutar el gate/linter focal definido en PHASE-006 y registrar cualquier hallazgo nuevo.
7. Confirmar que no aparecen sesiones con tenant/branch fuera de mappings.

## Criterio de éxito

El gate se considera APROBADO si:

- el API opera efectivamente como `skia_runtime`;
- migraciones y runtime usan conexiones distintas;
- health y pruebas focales permanecen aprobadas;
- no aparecen fallos nuevos por ausencia de contexto en rutas cubiertas;
- RLS continúa deshabilitado, de forma que cualquier cambio observado pueda atribuirse al cutover de identidad y no a policies.

## Rollback

Si el backend no arranca, health falla o una ruta crítica cubierta pierde funcionalidad:

1. detener la validación;
2. restaurar exclusivamente el release/configuración backend anterior preservado;
3. no cambiar RLS, policies, roles, grants, datos ni fixtures;
4. confirmar health 200 y runtime previo;
5. registrar el fallo sin intentar una segunda corrección bajo este gate.

## No autorizado

Este gate NO autoriza:

- `ENABLE ROW LEVEL SECURITY` ni cambios de policies;
- CAMPAÑA B;
- cambios de roles/grants PostgreSQL;
- cambios de esquema/constraints;
- merge a `main`;
- producción;
- rollback de fixtures;
- deploy de frontend, Nginx, Redis o PostgreSQL.

## Salida requerida

Publicar evidencia con SHA/release backend, identidad runtime efectiva, separación migrador/runtime, estado RLS antes/después, health, matriz focal, resultado del gate estático y cualquier rollback ejecutado. Detenerse después del resultado para nueva decisión arquitectónica.