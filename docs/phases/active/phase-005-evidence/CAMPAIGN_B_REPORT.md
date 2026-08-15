# PHASE-005 — CAMPAÑA B under canonical RLS

## Resultado

- Fecha: `2026-08-14`.
- Gate: `ARCHITECT_DECISION_CAMPAIGN_B_GATE.md`.
- Rama: `phase/005-rls-enforcement`.
- Gate commit: `d07ab15ac30b021eff92399ebe14fc2ad68b2857`.
- Runner blob: `2752169633418a9a95de6d717f0f0cf79b2b7bb3`.
- Host: `https://skia.iamet.mx`.
- Invocaciones del runner: **1**.
- Resultado estructural: **BLOQUEADO / SIN MATRIZ EMITIDA**.
- Resultado global: **CAMPAÑA B BLOQUEADA**.

La única invocación validó primero los inputs inválidos, pero terminó sin
emitir `CAMPAIGN_EXECUTION_STATUS`, `PROCESS_EXIT_CODE` ni filas ISO. Conforme
al gate no se reintentó y no se reconstruyen resultados HTTP por inferencia.

## Preflight

| Control | Resultado |
|---|---|
| Backend | healthy; restart count `0` |
| Health interno/público | `200` / `200` |
| API runtime | `skia_runtime`; 2 conexiones observadas |
| Rol runtime | LOGIN, NOSUPERUSER, NOBYPASSRLS; ownership/herencia `0/0` |
| RLS/FORCE | `true/true` en las tres tablas |
| Hashes canónicos | exactos |
| Fixture | `3/6/9/60/60/6` |
| Mappings inválidos | tenant `0`; branch `0` |
| Manifest | regular, no symlink, modo `0600` |
| Manifest SHA-256 | `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161` |
| Contexto/credenciales | externos a Git, regulares, no symlink, modo `0600` |
| Base/campaña | `https://skia.iamet.mx` / `B` |
| Email inválido efímero | cero coincidencias antes del runner |

Los valores inválidos fueron generados en memoria, nunca impresos ni
versionados, y desaparecieron al terminar el proceso.

## Matriz CAMPAÑA B

La ausencia de salida tabular impide asignar resultados empíricos por request.
La matriz completa se preserva explícitamente como bloqueada:

| ID | Semántica | CAMPAÑA B | Cross-tenant | Cross-branch |
|---|---|---|---|---|
| ISO-001 | login/sesión A-ADMIN | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-002 | login inválido | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-003 | seleccionar Tenant A | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-004 | seleccionar A1 | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-005 | A-OPERATOR activos A1 | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-006 | A-OPERATOR denegar A2 | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-007 | A-MULTI A1/A2 | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-008 | A-ADMIN denegar Tenant B | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-009 | A-ADMIN denegar B1 | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-010 | query manipulada conserva A1 | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-011 | activo propio / related endpoints | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-012 | activo B1 / relación ajena | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-013 | actor sin contexto | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-014 | actor sin branch | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-015 | sesión inválida | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-016 | expiración/revocación natural | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-017 | B-ADMIN activos B1 | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-018 | C-ADMIN activos C2 | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-019 | B-ADMIN denegar Tenant C/C1 | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-020 | C-ADMIN denegar Tenant A/A2 | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-021 | logout/reuso operadores A/B/C | BLOQUEADO — sin fila emitida | no determinable | no determinable |
| ISO-022 | correlación PostgreSQL | **BLOQUEADO combinado** | no fuga DB observable | no mapping inválido observable |

## Correlación PostgreSQL read-only

La actividad de sesiones indica que la invocación alcanzó operaciones de
autenticación/contexto, pero esto no sustituye la matriz HTTP.

- sesiones TEST: 17 totales / 17 activas;
- sesiones fuera de `user_tenants`: `0`;
- sesiones fuera de `user_branches`: `0`;
- contextos más recientes relevantes, todos con mapping válido:
  - A-ADMIN: Tenant A / A1;
  - A-OPERATOR: Tenant A / A1;
  - A-MULTI: Tenant A / A2;
  - B-ADMIN: Tenant B / B1;
  - C-ADMIN: Tenant C / C2;
- API: `skia_runtime`, 2 conexiones observadas;
- RLS/FORCE: `true/true`;
- hashes canónicos: exactos;
- fixture: `3/6/9/60/60/6`;
- health interno/público: `200/200`;
- contenedor: healthy, restart count `0`;
- FATAL/PANIC recientes: `0`.

ISO-022 queda `BLOQUEADO`: la correlación no detecta mappings inválidos ni
drift, pero no existe matriz HTTP con la cual combinarla.

## Comparación CAMPAÑA A vs B

| Control | CAMPAÑA A final publicada | CAMPAÑA B | Comparación |
|---|---|---|---|
| Ejecución estructural | COMPLETE, exit `0` | sin status/matriz | B bloqueada |
| ISO-001–010 | ejecutables aprobados | todos bloqueados por falta de evidencia | no comparable |
| ISO-011–012 | acceso propio/ajeno aprobado; endpoints relacionados bloqueados | bloqueados | no comparable |
| ISO-013–014 | bloqueados por ausencia de actor observable | bloqueados | sin nueva evidencia |
| ISO-015 | aprobado | bloqueado | no comparable |
| ISO-016 | bloqueado | bloqueado | sin cambio observable |
| ISO-017–021 | ejecutables aprobados | bloqueados | no comparable |
| ISO-022 | aprobado combinado; mappings `0/0` | bloqueado combinado; mappings `0/0` | DB estable, HTTP ausente |
| Cross-tenant leak | false en pruebas ejecutadas | no determinable por matriz | no comparable |
| Cross-branch leak | false en pruebas ejecutadas | no determinable por matriz | no comparable |
| A-OPERATOR A2 | `403`, A1 preservada | no determinable | no comparable |
| Conteos A1/A2/B1/C2 | `10/10/10/10` | no emitidos | no comparable |
| Sesiones fuera mappings | `0/0` | `0/0` | estable |
| RLS/FORCE | `false/true` | `true/true` | defensa BD activa en B |
| Identidad DB observada | evidencia A registró `current_user=skia_user` | API correlacionada como `skia_runtime` | cambió otra variable además de RLS |

La comparación no permite atribuir mejoras a RLS: B carece de resultados HTTP
y, además, la evidencia publicada de A y B no mantiene constante la identidad
PostgreSQL observada. La defensa en profundidad sí fue demostrada por los
probes directos del gate de activación PHASE-005, pero no debe reinterpretarse
como una CAMPAÑA B completa.

## Conclusión

CAMPAÑA B queda **BLOQUEADA** por ausencia de matriz emitida. No se confirmó
una fuga ni degradación operacional, pero tampoco existe evidencia suficiente
para aprobar los controles HTTP. No se modificaron ni revirtieron RLS,
policies, código, fixtures o infraestructura y no se reintentó el runner.

RLS canónico permanece habilitado. Cualquier diagnóstico o nueva ejecución
requiere un dictamen arquitectónico posterior separado.
