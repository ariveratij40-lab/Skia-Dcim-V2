# PHASE-005 — RLS Policy Canonicalization Report

## Resultado

- Fecha: `2026-08-14`.
- Gate: `ARCHITECT_DECISION_RLS_POLICY_CANONICALIZATION_GATE.md`.
- Rama: `phase/005-rls-enforcement`.
- Orígenes: `STAGING VPS`, `POSTGRES STAGING`, `LOCAL`, `CONTAINER LOCAL`.
- Implementación/validación/publicación local: **APROBADA**.
- Activación RLS en STAGING: **NO EJECUTADA / NO AUTORIZADA**.

## Snapshot exacto de entrada

La lectura final de STAGING confirmó:

- base `skia_db`; owner/migrador observado `skia_user`;
- API con 2 conexiones como `skia_runtime`;
- `skia_runtime`: LOGIN, NOSUPERUSER, NOBYPASSRLS, cero ownership objetivo;
- grants `SELECT, INSERT, UPDATE, DELETE` sobre las tres tablas;
- `relrowsecurity=false`, `relforcerowsecurity=true`;
- columnas UUID y FKs simples esperadas presentes.

| Policy previa | Hash normalizado MD5 |
|---|---|
| `assets_tenant_branch_isolation` | `f39b9225e6e95b3e654e3161748f5c1a` |
| `asset_logs_tenant_isolation` | `4acd83f5389f69069dedf6f93fffca8b` |
| `asset_relationships_tenant_isolation` | `14a883076b3bc7bd6a2fc4491659c6bd` |

No se mostró ningún DSN o secreto y no se modificó PostgreSQL STAGING.

## Artefacto canónico

`ops/phase005/activate_canonical_rls.sql`:

- exige entorno, base y aprobación futura exactos;
- bloquea esquema/FKs incompatibles;
- bloquea runtime privilegiado, owner o sin los 12 grants esperados;
- acepta únicamente el snapshot previo exacto o el estado canónico exacto;
- converge las policies dentro de una transacción;
- verifica hashes canónicos antes de habilitar RLS;
- no cambia datos, roles, grants, ownership ni credenciales.

| Policy canónica | Hash normalizado MD5 |
|---|---|
| `assets_tenant_branch_isolation` | `16283f38465792bdb7cba3cc265570cd` |
| `asset_logs_tenant_branch_isolation` | `6f7ecd60e4d50630fc35fb5cc6184f7f` |
| `asset_relationships_tenant_branch_isolation` | `6e7ce93697090bc0ce92e3984c779771` |

Logs exigen que su activo pertenezca al mismo tenant y sea visible en el scope
actual. Relaciones exigen simultáneamente source y target dentro del mismo
tenant y scope. `USING` y `WITH CHECK` son equivalentes; contexto ausente falla
cerrado. Scope-all sigue siendo explícito y nunca cruza tenant.

## Rollback

`rollback_canonical_rls.sql` acepta únicamente el estado canónico exacto o el
snapshot ya restaurado. Deshabilita RLS y repone los tres nombres, roles,
expresiones y hashes previos, conservando FORCE activo. No altera fixtures,
datos, roles, grants ni secretos. Activación y rollback son idempotentes.

## Validación local

Se utilizó la imagen ya disponible `postgres:16-alpine` en un contenedor
efímero sin red. El contenedor se eliminó al finalizar.

Resultados:

- `bash -n`: APROBADO;
- activación desde snapshot exacto: APROBADA;
- ausencia de tenant context: cero filas en las tres tablas;
- A/A1: solo assets/logs/relaciones permitidos de A1;
- A/A2: A1 no visible;
- scope-all Tenant A: ambas branches, nunca Tenant B;
- log cuyo activo está fuera de branch: escritura denegada;
- relación con un endpoint fuera de branch: escritura denegada;
- relación same-branch: permitida;
- update de asset hacia otra branch: denegado por `WITH CHECK`;
- segunda activación: no-op idempotente;
- rollback exacto: APROBADO;
- segundo rollback: no-op idempotente;
- variables/approval ausentes o incorrectas: bloqueo antes de DDL con exit no-cero;
- drift de policy: activación y rollback bloqueados antes de cambios con exit no-cero.

Resultado del runner: `PHASE005_LOCAL_VALIDATION=APPROVED`.

## Conclusión

El artefacto canónico, rollback y verificaciones cumplen el gate local. RLS
permanece deshabilitado en STAGING. Se requiere una decisión PHASE-005 separada
antes de ejecutar activación o CAMPAÑA B.
