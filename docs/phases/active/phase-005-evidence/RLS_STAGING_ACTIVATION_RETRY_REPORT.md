# PHASE-005 — STAGING RLS Activation Retry Report

## Resultado

- Fecha: `2026-08-14`.
- Gate: `ARCHITECT_DECISION_STAGING_RLS_ACTIVATION_RETRY_GATE.md`.
- Rama: `phase/005-rls-enforcement`.
- Gate commit: `b705dd9bae42c583f70e38058412f66550b909f7`.
- Artefacto corregido: `aa127cf58e42b3eaddd38d7550455ce06098f25b`.
- Orígenes: `LOCAL`, `STAGING VPS`, `POSTGRES STAGING`, `HTTP STAGING`.
- Activación canónica: **APROBADA EN STAGING**.
- Rollback: **NO EJECUTADO**; no falló ningún control crítico.
- CAMPAÑA B: **NO EJECUTADA**.

## Preflight

La rama estaba limpia y los artefactos canónicos coincidían con el commit
revisado. Antes de DDL se verificó:

| Control | Resultado |
|---|---|
| Backend | healthy, restart count `0` |
| Health interno/público | `200` / `200` |
| Identidad API | `skia_runtime`; 2 conexiones observadas |
| Identidad migrador | `skia_user`, separada del runtime |
| Runtime | LOGIN, NOSUPERUSER, NOBYPASSRLS |
| Ownership/herencia privilegiada | `0` / `0` |
| Fixture | 3 tenants / 6 branches / 60 activos TEST |
| Mappings inválidos | tenant `0`; branch `0` |
| Estado previo | `relrowsecurity=false`, `relforcerowsecurity=true` en las tres tablas |

Hashes previos exactos:

- `assets`: `f39b9225e6e95b3e654e3161748f5c1a`;
- `asset_logs`: `4acd83f5389f69069dedf6f93fffca8b`;
- `asset_relationships`: `14a883076b3bc7bd6a2fc4491659c6bd`.

Las tres FKs aprobaron identidad, columnas origen/destino, `MATCH SIMPLE`,
`ON UPDATE NO ACTION`, `ON DELETE CASCADE`, validación y no-deferrabilidad.

## Activación

Se ejecutó exactamente una vez `ops/phase005/activate_canonical_rls.sql`
mediante `psql -f /dev/stdin`, con migrador y guards aprobados. El artefacto:

1. abrió transacción y locks;
2. revalidó el snapshot bajo lock;
3. convergió las tres policies;
4. verificó sus hashes;
5. habilitó RLS preservando FORCE;
6. verificó el post-estado;
7. completó `COMMIT`.

No se ejecutaron sentencias manuales equivalentes ni cambios de datos, esquema,
roles, grants, ownership, credenciales o aplicación.

## Estado canónico

| Tabla | Policy | Hash MD5 normalizado | RLS/FORCE |
|---|---|---|---|
| `assets` | `assets_tenant_branch_isolation` | `16283f38465792bdb7cba3cc265570cd` | `true/true` |
| `asset_logs` | `asset_logs_tenant_branch_isolation` | `6f7ecd60e4d50630fc35fb5cc6184f7f` | `true/true` |
| `asset_relationships` | `asset_relationships_tenant_branch_isolation` | `6e7ce93697090bc0ce92e3984c779771` | `true/true` |

## Probes directos PostgreSQL

Los probes utilizaron la identidad runtime de forma opaca. No se imprimieron
DSN, password ni secretos. Las escrituras se ejecutaron en una transacción que
terminó íntegramente en `ROLLBACK`.

| Prueba | Resultado |
|---|---|
| Sin contexto | cero filas en assets, logs y relaciones |
| Tenant A/A1 | 10 assets, 10 logs, 1 relación; A2 invisible |
| Tenant A/A2 | 10 assets, 10 logs, 1 relación; A1 invisible |
| Tenant A scope-all | 20 assets, 20 logs, 2 relaciones baseline; Tenant B invisible |
| Escritura log A2 desde A1 | denegada |
| Relación A1→A2 desde A1 | denegada |
| Relación A1→A1 | permitida dentro de la transacción y revertida |

La primera invocación del cliente directo omitió conectar stdin a `docker
exec`, por lo que no transmitió ni ejecutó SQL. Se corrigió únicamente la
invocación temporal y los probes reales se ejecutaron una vez con salida
`DIRECT_PROBES=APPROVED`.

## Probes HTTP

Se usaron sesiones TEST opacas; tokens/cookies no se imprimieron. Los cuerpos
temporales se protegieron y eliminaron.

| Actor/operación | Resultado |
|---|---|
| A-OPERATOR A1 | HTTP `200`; 10 activos; cero fugas |
| A-OPERATOR A2 | HTTP `403`; sesión preservó A1 |
| A-MULTI A1 | HTTP `200`; 10 activos; cero fugas |
| A-MULTI A2 | HTTP `200`; 10 activos; cero fugas |
| B-ADMIN B1 | HTTP `200`; 10 activos; cero fugas Tenant A/C |

## Job contextual

Una importación CSV vacía capturó Tenant A/A1, terminó `done`, extrajo cero
ítems y conservó los activos TEST en `60/60`. La fila de job TEST constituye
trazabilidad autorizada; no contiene credenciales ni creó activos.

## Controles finales

- RLS/FORCE: `true/true` en las tres tablas;
- hashes canónicos: exactos;
- API: `skia_runtime`, 2 conexiones observadas;
- health interno/público: `200/200`;
- contenedor: healthy, restart count `0`;
- mappings inválidos: `0/0`;
- fixture: `3/6/60`;
- FATAL/PANIC en últimas líneas inspeccionadas: `0`.

## Conclusión

El reintento único queda **APROBADO**. RLS canónico permanece habilitado en
STAGING y no se ejecutó rollback. Esta evidencia no autoriza ni ejecuta
CAMPAÑA B; se requiere un gate arquitectónico separado.
