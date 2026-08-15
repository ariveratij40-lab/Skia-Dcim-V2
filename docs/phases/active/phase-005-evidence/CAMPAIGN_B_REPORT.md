# PHASE-005 — CAMPAÑA B under canonical RLS

## Resultado

- Fecha: `2026-08-14` / `2026-08-15 UTC`.
- Gate: `ARCHITECT_DECISION_CAMPAIGN_B_RETRY_GATE.md`.
- Rama: `phase/005-rls-enforcement`.
- Gate commit: `ce9d0aab97b6e7b0a2525ce9942c5d3653f37062`.
- Runner aprobado: commit `d012f4f09a4fb6272a088f4e3ffd0352d0fa4799`, blob `2854515f994e85a88986be045ba6cc37d48c5d7b`.
- Host: `https://skia.iamet.mx`.
- Invocaciones del runner bajo este gate: **1**.
- `CAMPAIGN_EXECUTION_STATUS=COMPLETE`.
- `PROCESS_EXIT_CODE=0`.
- Resultado global: **CAMPAÑA B COMPLETA Y APROBADA EN EL ALCANCE EJECUTABLE**.

No se observó fuga cross-tenant ni cross-branch. Los casos estructuralmente no
observables permanecen `BLOQUEADO` conforme a la matriz aprobada; no fueron
reinterpretados como aprobados.

## Preflight

| Control | Resultado |
|---|---|
| Working tree / runner | limpio; blob idéntico al aprobado |
| Backend | healthy; restart count `0` |
| Health interno/público | `200` / `200` |
| Imagen / revisión backend | `skia-api:phase006-final-16e3ec6` / `16e3ec6725ff9eae26faee84b37d74add1b35c18` |
| API runtime | 2 conexiones como `skia_runtime` |
| Rol runtime | LOGIN, NOSUPERUSER, NOBYPASSRLS; ownership/herencia privilegiada `0/0` |
| RLS/FORCE | `true/true` en las tres tablas objetivo |
| Hashes canónicos | exactos, sin drift |
| Fixture | `3/6/9/60/60/6` |
| Activos por branch | A1/A2/B1/B2/C1/C2: `10/10/10/10/10/10` |
| Mappings inválidos | tenant `0`; branch `0` |
| Manifest | regular, no symlink, modo `0600`, SHA-256 `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161` |
| Contexto/credenciales | externos a Git, regulares, no symlink, modo `0600` |
| Input inválido | generado efímeramente; email inexistente confirmado por SELECT |

El primer transporte de la comprobación del email inválido omitió `docker
exec -i`; PostgreSQL no recibió stdin y el runner no fue invocado. Se corrigió
únicamente esa invocación temporal, se ejecutó la consulta read-only real con
resultado cero y después se consumió la única ejecución HTTP autorizada. Los
valores inválidos no se imprimieron ni versionaron y fueron eliminados al
terminar.

## Matriz CAMPAÑA B

| ID | Actor/operación | HTTP | Estado | Esperado | Observado | Cross-tenant | Cross-branch |
|---|---|---:|---|---:|---:|---|---|
| ISO-001 | A-ADMIN login | 200 | APROBADO | N/A | N/A | false | false |
| ISO-001 | A-ADMIN sesión | 200 | APROBADO | N/A | N/A | false | false |
| ISO-002 | login inválido | 401 | APROBADO | 0 | 0 | false | false |
| ISO-003 | A-ADMIN seleccionar Tenant A | 200 | APROBADO | N/A | N/A | false | false |
| ISO-004 | A-ADMIN seleccionar A1 | 200 | APROBADO | N/A | N/A | false | false |
| ISO-005 | A-OPERATOR activos A1 | 200 | APROBADO | 10 | 10 | false | false |
| ISO-006 | A-OPERATOR denegar A2 | 403 | APROBADO | 0 | 0 | false | false |
| ISO-007 | A-MULTI activos A1 | 200 | APROBADO | 10 | 10 | false | false |
| ISO-007 | A-MULTI activos A2 | 200 | APROBADO | 10 | 10 | false | false |
| ISO-008 | A-ADMIN denegar Tenant B | 403 | APROBADO | 0 | 0 | false | false |
| ISO-009 | A-ADMIN denegar B1 | 403 | APROBADO | 0 | 0 | false | false |
| ISO-010 | query manipulada conserva A1 | 200 | APROBADO | 10 | 10 | false | false |
| ISO-011 | A-ADMIN activo propio A1 | 200 | APROBADO | N/A | N/A | false | false |
| ISO-011 | endpoints logs/relationships ausentes | N/A | BLOQUEADO | N/A | N/A | false | false |
| ISO-012 | denegar activo B1 | 404 | APROBADO | 0 | 0 | false | false |
| ISO-012 | endpoint relationship ausente | N/A | BLOQUEADO | N/A | N/A | false | false |
| ISO-013 | actor sin contexto | N/A | BLOQUEADO | N/A | N/A | false | false |
| ISO-014 | actor sin branch | N/A | BLOQUEADO | N/A | N/A | false | false |
| ISO-015 | sesión inválida | 401 | APROBADO | 0 | 0 | false | false |
| ISO-016 | expiración/revocación natural | N/A | BLOQUEADO | N/A | N/A | false | false |
| ISO-017 | B-ADMIN activos B1 | 200 | APROBADO | 10 | 10 | false | false |
| ISO-018 | C-ADMIN activos C2 | 200 | APROBADO | 10 | 10 | false | false |
| ISO-019 | B-ADMIN denegar Tenant C | 403 | APROBADO | 0 | 0 | false | false |
| ISO-019 | B-ADMIN denegar C1 | 403 | APROBADO | 0 | 0 | false | false |
| ISO-020 | C-ADMIN denegar Tenant A | 403 | APROBADO | 0 | 0 | false | false |
| ISO-020 | C-ADMIN denegar A2 | 403 | APROBADO | 0 | 0 | false | false |
| ISO-021 | A-OPERATOR logout/reuso | 200/401 | APROBADO | 0 | 0 | false | false |
| ISO-021 | B-OPERATOR logout/reuso | 200/401 | APROBADO | 0 | 0 | false | false |
| ISO-021 | C-OPERATOR logout/reuso | 200/401 | APROBADO | 0 | 0 | false | false |
| ISO-022 | correlación PostgreSQL | N/A | APROBADO combinado | mappings 0/0 | 0/0 | false | false |

Todos los logins `SETUP` usados por la matriz devolvieron `200/APROBADO`. Las
respuestas de activos contenían exactamente los 10 aliases esperados y ningún
alias TEST de otro tenant o branch. No se conservaron cuerpos, cookies, tokens,
IDs de sesión ni credenciales en evidencia.

## Correlación PostgreSQL read-only posterior

- API: 2 conexiones como `skia_runtime`; LOGIN, NOSUPERUSER y NOBYPASSRLS.
- RLS/FORCE: `true/true` en `assets`, `asset_logs` y `asset_relationships`.
- hashes canónicos:
  - `assets`: `16283f38465792bdb7cba3cc265570cd`;
  - `asset_logs`: `6f7ecd60e4d50630fc35fb5cc6184f7f`;
  - `asset_relationships`: `6e7ce93697090bc0ce92e3984c779771`.
- fixture: `3/6/9/60/60/6`.
- sesiones TEST: 22 totales / 22 activas / 0 sin contexto completo.
- sesiones con tenant fuera de mapping: `0`.
- sesiones con branch fuera de mapping: `0`.
- contextos más recientes, todos con mappings tenant/branch válidos:
  - A-ADMIN: Tenant A / A1;
  - A-OPERATOR: Tenant A / A1;
  - A-MULTI: Tenant A / A2;
  - B-ADMIN: Tenant B / B1;
  - C-ADMIN: Tenant C / C2.
- backend healthy, restart count `0`, health interno/público `200/200`.

La primera versión de la consulta final usó `tenants.code`, columna ausente, y
falló dentro de `BEGIN READ ONLY`. Se repitió únicamente esa consulta con
`tenants.name`/`branches.name`; no se repitió CAMPAÑA B ni hubo escritura.

## Comparación CAMPAÑA A vs B

| Control | CAMPAÑA A final | CAMPAÑA B | Comparación |
|---|---|---|---|
| Ejecución | COMPLETE, exit 0 | COMPLETE, exit 0 | equivalente |
| ISO-001–010 | ejecutables aprobados | ejecutables aprobados | equivalente |
| ISO-011–012 | acceso propio/ajeno aprobado; endpoints relacionados bloqueados | mismo resultado | equivalente |
| ISO-013–014 | bloqueados | bloqueados | sin nueva observabilidad |
| ISO-015 | 401/APROBADO | 401/APROBADO | equivalente |
| ISO-016 | bloqueado | bloqueado | sin nueva observabilidad |
| ISO-017–021 | ejecutables aprobados | ejecutables aprobados | equivalente |
| ISO-022 | mappings 0/0; aprobado combinado | mappings 0/0; aprobado combinado | equivalente |
| Cross-tenant leak | false | false | sin regresión observada |
| Cross-branch leak | false | false | sin regresión observada |
| A-OPERATOR A2 | 403; A1 preservada | 403; A1 preservada | equivalente |
| Conteos A1/A2/B1/C2 | 10/10/10/10 | 10/10/10/10 | equivalente |
| RLS/FORCE | false/true | true/true | RLS activado en B |
| Identidad DB | `skia_user` | `skia_runtime` | variable adicional cambió |
| Backend | `01efd5099758d8ad85fc4bcdf4720c5e23e59270` | `16e3ec6725ff9eae26faee84b37d74add1b35c18` | código/runtime adicional cambió |

La matriz funcional HTTP no muestra regresiones con RLS activo. Sin embargo,
la comparación A/B no es un experimento aislado del efecto de RLS: también
cambiaron la identidad runtime y el backend entre campañas. Por ello la
equivalencia HTTP demuestra compatibilidad del estado actual, pero no atribuye
por sí sola una mejora causal exclusivamente a RLS. La defensa en profundidad
se sustenta adicionalmente en los probes directos de PostgreSQL ya publicados
por el gate de activación.

## Conclusión

CAMPAÑA B quedó **COMPLETE**, exit `0`, con matriz ISO-001–ISO-022, bloqueos
estructurales explícitos, cero fugas observadas y postcondiciones intactas.
RLS canónico permanece habilitado y no fue modificado. Fuera de la creación y
eliminación normal de sesiones que forman parte de los login/logout del runner,
no hubo mantenimiento ni mutación manual de sesiones o PostgreSQL. No se
modificaron policies, código, fixtures o infraestructura; no se ejecutó deploy,
rollback ni una segunda campaña.

El resultado queda publicado para dictamen arquitectónico final de PHASE-005.
