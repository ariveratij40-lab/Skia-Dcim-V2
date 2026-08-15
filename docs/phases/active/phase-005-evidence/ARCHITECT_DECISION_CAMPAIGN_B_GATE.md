# PHASE-005 — Architect Decision: CAMPAÑA B under canonical RLS

## Decisión

**AUTORIZADA CONDICIONALMENTE — una sola ejecución completa.**

CAMPAÑA B debe medir el mismo aislamiento funcional probado en CAMPAÑA A, ahora con defensa en profundidad activa en PostgreSQL.

Baseline obligatorio:

- RLS/FORCE: `true/true` en `assets`, `asset_logs`, `asset_relationships`.
- Policies/hashes: estado canónico exacto publicado por PHASE-005.
- API runtime: `skia_runtime`, `NOSUPERUSER`, `NOBYPASSRLS`.
- PHASE-006 runtime restringido: aprobado en STAGING.
- Fixture PHASE-002: 3 tenants, 6 branches, 9 users y 60 activos TEST, sin mappings inválidos.
- Host canónico: `https://skia.iamet.mx`.
- Runner autorizado: `tools/phase002/run_isolation_tests.sh` desde `phase/002-fixture-implementation`, blob `2752169633418a9a95de6d717f0f0cf79b2b7bb3` o contenido byte-idéntico.
- CAMPAÑA A de comparación: evidencia publicada en commit `16f5b34f83e723c2ca66dff43dbf5dab18293b29`.

## Preflight obligatorio

Antes del primer HTTP, comprobar read-only:

1. Backend Docker `healthy`, restart count `0`, health interno/público `200/200`.
2. Conexiones API efectivas como `skia_runtime`.
3. `skia_runtime` sin `SUPERUSER`, `BYPASSRLS`, ownership objetivo ni herencia privilegiada.
4. `relrowsecurity=true` y `relforcerowsecurity=true` en las tres tablas.
5. Nombres y hashes de las tres policies exactamente canónicos.
6. Fixture íntegro y cardinalidades esperadas.
7. Cero sesiones TEST fuera de `user_tenants` o `user_branches`.
8. Manifest PHASE-002 íntegro con el checksum previamente aprobado, si sigue disponible en el canal externo autorizado.
9. Archivos de credenciales/contexto fuera de Git, regulares, no symlink y modo `0600`.
10. `PHASE002_BASE_URL=https://skia.iamet.mx` y `PHASE002_CAMPAIGN=B`.
11. Inputs inválidos de ISO-002 presentes mediante valores efímeros no versionados; el email inválido debe comprobarse inexistente antes del lanzamiento.

Si cualquier precondición falla, no ejecutar CAMPAÑA B y documentar `BLOQUEADO`.

## Ejecución autorizada

Ejecutar **exactamente una vez** el runner completo desde `ISO-001` hasta `ISO-022` con:

- `SKIA_ENVIRONMENT=staging`;
- `PHASE002_TEST_APPROVAL=PHASE002_CAMPAIGN_AUTHORIZED`;
- `PHASE002_CAMPAIGN=B`;
- `PHASE002_BASE_URL=https://skia.iamet.mx`.

No modificar el runner, la aplicación, las policies, el fixture ni la configuración durante la campaña.

El runner debe conservar su comportamiento fail-closed:

- no seguir redirects;
- no imprimir cuerpos, cookies, tokens, session IDs, passwords ni DSN;
- cualquier fuga cross-tenant detectada debe detener inmediatamente la ejecución;
- cualquier matriz `INCOMPLETE` invalida la campaña y prohíbe reintento bajo este gate.

## Correlación PostgreSQL read-only posterior

Después de la única ejecución, realizar únicamente consultas read-only para determinar:

- sesiones TEST activas e inválidas por tenant/branch, sin revelar tokens/IDs;
- identidad efectiva del API;
- estado RLS/FORCE y hashes canónicos;
- fixture 3/6/60 intacto;
- contexto final de actores relevantes;
- ausencia de fugas cross-tenant/cross-branch observables;
- health y errores FATAL/PANIC recientes.

Para `ISO-022`, combinar la matriz HTTP con esta correlación y asignar una clasificación explícita (`APROBADO`, `FALLIDO` o `BLOQUEADO`).

## Comparación A vs B obligatoria

Crear una tabla comparativa que use la misma semántica de pruebas:

- CAMPAÑA A: aplicación con runtime restringido / RLS deshabilitado, usando su evidencia final publicada.
- CAMPAÑA B: aplicación con runtime restringido / RLS habilitado canónico.

Comparar al menos:

1. resultado por `ISO-001`–`ISO-022`;
2. cross-tenant leak;
3. cross-branch leak;
4. branch selection A-OPERATOR A2;
5. conteos A1/A2/B1/C2;
6. sesiones fuera de mappings;
7. endpoints/pruebas que siguen `BLOQUEADO` por ausencia de mecanismo observable;
8. estado RLS/FORCE;
9. identidad PostgreSQL runtime.

No declarar una mejora causada por RLS cuando el test no permita aislar causalidad. La defensa en profundidad se considera demostrada por la combinación de probes directos PHASE-005 y CAMPAÑA B, no por inferencia desde HTTP solamente.

## Criterios de resultado

### APROBADA

CAMPAÑA B puede declararse aprobada si:

- `CAMPAIGN_EXECUTION_STATUS=COMPLETE`;
- no hay fuga cross-tenant;
- no hay fuga cross-branch;
- A-OPERATOR A2 permanece denegado y el contexto no muta;
- lecturas por branch contienen exactamente los 10 activos esperados y ningún activo ajeno;
- sesiones inválidas tenant/branch = `0`;
- API permanece healthy como `skia_runtime`;
- RLS/FORCE y hashes canónicos permanecen exactos.

Los ISO explícitamente no observables pueden continuar `BLOQUEADO`, siempre que estén claramente separados de controles de aislamiento que sí son ejecutables.

### FALLIDA

Cualquier fuga confirmada, sesión persistida fuera de mappings, mutación cross-branch no autorizada, exposición cross-tenant, policy/hash drift o pérdida de identidad runtime restringida es `FALLIDO` crítico.

### BLOQUEADA

Runner `INCOMPLETE`, inputs externos ausentes, estado RLS inesperado, runtime distinto o infraestructura no saludable => `BLOQUEADO`.

## Política ante fallo

CAMPAÑA B es una campaña de observación y no modifica RLS. **No ejecutar rollback RLS automáticamente por un fallo funcional de la matriz.** Conservar el estado y detenerse para dictamen, salvo que exista una degradación operacional crítica independiente (por ejemplo health no recuperable); en ese caso detenerse y solicitar decisión separada. No corregir ni reintentar automáticamente.

## No autorizado

Este gate NO autoriza:

- modificar/rollback de RLS o policies;
- cambios de código o runner;
- migraciones, esquema, roles, grants, ownership o credenciales;
- recrear fixtures;
- broad session cleanup;
- deploy/restart de servicios;
- producción;
- merge a `main`.

## Evidencia y cierre

Publicar en `phase/005-rls-enforcement` un reporte de CAMPAÑA B que incluya:

- preflight resumido;
- matriz completa redacted;
- correlación PostgreSQL read-only;
- comparación A vs B;
- clasificación global;
- estado final de RLS, runtime, fixture y health.

Después de publicar la evidencia, **DETENERSE**. El cierre de PHASE-005 y el eventual rollback de fixtures PHASE-002 requieren un dictamen posterior separado.
