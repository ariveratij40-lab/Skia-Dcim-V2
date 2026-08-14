# PHASE-005 — Canonical FK Guard Correction Report

## Resultado

- Fecha: `2026-08-14`.
- Rama: `phase/005-rls-enforcement`.
- Baseline de entrada: `2be7b6bffd26a4332742bc952afe682f3887e171`.
- Orígenes: `LOCAL`, `CONTAINER LOCAL`.
- Corrección del guard FK: **APROBADA LOCALMENTE**.
- Activación RLS en STAGING: **NO EJECUTADA**.
- CAMPAÑA B: **NO EJECUTADA**.

## Causa corregida

El intento documentado en `RLS_STAGING_ACTIVATION_REPORT.md` abortó antes de
DDL porque el guard contaba globalmente FKs de `public` mediante texto
normalizado. Encontró 11 definiciones genéricas coincidentes cuando esperaba
3, aunque las tres FKs objetivo eran correctas.

## Guard canónico corregido

`ops/phase005/activate_canonical_rls.sql` ya no usa un conteo global ni compara
únicamente texto. Cada FK requerida se valida individualmente en
`pg_constraint` / `pg_attribute` mediante:

- nombre exacto de constraint;
- tabla origen exacta (`conrelid`);
- columna origen exacta (`conkey` + `pg_attribute.attnum`);
- tabla referenciada exacta (`confrelid=public.assets`);
- columna referenciada exacta (`confkey` hacia `assets.id`);
- `contype='f'`;
- `MATCH SIMPLE`;
- `ON UPDATE NO ACTION`;
- `ON DELETE CASCADE`;
- constraint validada, no deferrable y no deferred.

Las identidades exigidas son:

1. `asset_logs_asset_id_fkey`: `asset_logs.asset_id → assets.id`;
2. `asset_relationships_source_asset_id_fkey`:
   `asset_relationships.source_asset_id → assets.id`;
3. `asset_relationships_target_asset_id_fkey`:
   `asset_relationships.target_asset_id → assets.id`.

Una FK adicional fuera de esas identidades no participa en el resultado.

## Validación PostgreSQL 16 efímera

Se ejecutó `run_local_validation.sh` con la imagen local ya disponible
`postgres:16-alpine`, en un contenedor sin red y eliminado al finalizar.

| Caso | Resultado esperado | Resultado observado | Estado |
|---|---|---|---|
| Tres FKs objetivo correctas | permitir convergencia local | activación y validación completas | APROBADO |
| FK adicional no relacionada con forma `asset_id → assets.id CASCADE` | ignorarla | no bloqueó el guard | APROBADO |
| `asset_logs_asset_id_fkey` ausente | bloquear antes de DDL | exit `3` | APROBADO |
| `asset_relationships_target_asset_id_fkey` con `ON DELETE RESTRICT` | bloquear antes de DDL | exit `3` | APROBADO |

Después de cada caso negativo se verificó:

- `relrowsecurity=false` y `relforcerowsecurity=true` en las tres tablas;
- los hashes baseline de las tres policies permanecieron exactos;
- ningún DDL de policy/RLS fue ejecutado por el artefacto.

El ciclo restante también aprobó:

- semántica canónica de lectura/escritura;
- activación idempotente;
- rollback exacto e idempotente;
- guards de variables, aprobación y drift.

Resultado final: `PHASE005_LOCAL_VALIDATION=APPROVED`.

## Alcance y conclusión

Solo se modificaron el guard FK canónico, su fixture/runner local, README y
evidencia. No se accedió a STAGING durante esta corrección; no se ejecutaron
SQL de activación, CAMPAÑA B, cambios de datos, roles, grants, esquema o
infraestructura reales.

La corrección queda lista para revisión arquitectónica. Un nuevo intento en
STAGING requiere autorización posterior explícita.
