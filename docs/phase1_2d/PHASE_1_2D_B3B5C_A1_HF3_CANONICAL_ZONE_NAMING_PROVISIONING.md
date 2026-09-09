# HF3 — provisión canónica de nomenclatura por Zona

## Evidencia y causa raíz

El E2E productivo encontró una jerarquía Site/Floor/Zone/Internal Area válida, pero el alta MDF falló con `NAMING_RULE_ZONE_CONTEXT_REQUIRED`. La norma MDF activa seguía en `LEGACY_INTERNAL_AREA`, con `include_site=true`, `include_internal_area=true`, `include_zone=false` y secuencia emitida. La migración 026 incorporó el modelo versionado y la capacidad `CANONICAL_ZONE`, pero deliberadamente conservó activas las reglas históricas; no existía una transición posterior ni provisión forward para tenants nuevos. Además, el API y el preview omitían el contexto y podían prometer una estructura distinta de la exigida por el backend.

## Transición 033

La migración 033 promueve MDF e IDF por tenant de manera independiente. Una regla legacy activa se conserva, se desactiva y recibe un sucesor activo con `rule_version + 1` y `supersedes_rule_id` exacto. El sucesor usa `CANONICAL_ZONE`, Branch y Zone; excluye Site, Internal Area, Placement y el indicador location legado. Conserva separador y ancho válidos, fija el prefijo canónico del tipo y comienza con `last_seq=0`. Una raíz ausente se crea como versión 1. Una regla canónica que ya coincide no se modifica. Estados históricos incompletos o configuraciones canónicas incompatibles abortan la transacción completa.

Los activos y códigos emitidos permanecen intactos. No se preserva continuidad numérica entre la regla legacy y su sucesora: el primer alta de cada norma canónica reserva 1. La unicidad activa y el sucesor lineal continúan bajo los índices de migration 026.

## Contrato operativo

- MDF: `MDF-{BRANCH}-{ZONE}-{SEQUENCE}`.
- IDF: `IDF-{BRANCH}-{ZONE}-{SEQUENCE}`.
- Floor continúa siendo contexto relacional, no un segmento de naming.
- El backend conserva la autoridad final y no incorpora fallback legacy.
- El catálogo expone `context_mode`, `include_zone` y `rule_version`.
- El wizard selecciona exclusivamente la regla activa del tipo y contexto `CANONICAL_ZONE`; sin ella muestra un error controlado.
- El preview toma Branch de sesión y el código Zone resuelto, sin Site, Floor ni Internal Area en el contrato por defecto.

La función trigger de provisión cubre tenants creados en adelante por `skia_onboarding` o `skia_runtime`; se ejecuta como `skia_migrator`, establece el tenant RLS local y no agrega grants de escritura sobre `naming_rules`. FORCE RLS y los atributos restringidos de roles no cambian.

## Seguridad, rollback y despliegue

HF3-HF1 cierra la validación con un fixture PostgreSQL 16.14 que parte de
MDF `LEGACY_INTERNAL_AREA` activo con `last_seq=7`, sin raíz IDF, aplica la
cronología hasta 033 y crea ambos activos por el handler HTTP real. Persiste
`MDF-B1-ZONE1-001` e `IDF-B1-ZONE1-001`, con deltas unitarios en `assets`,
`locations`, `mdf_idf` y `asset_logs`, y contadores independientes; el
predecesor conserva `last_seq=7`. Un estado legacy aislado responde 422
`NAMING_RULE_ZONE_CONTEXT_REQUIRED` sin escrituras.

Las pruebas frontend deterministas con `node:test` cubren cambio MDF/IDF,
cambio de Zona, resets por Piso/Sitio, selección exclusiva del sucesor activo
`CANONICAL_ZONE` y exclusión de Sitio, Piso y Área interna bajo la regla default.

La migración se ejecuta por bootstrap/migrator en una transacción junto con su ledger. Cualquier conflicto revierte desactivación y sucesor. La segunda ejecución no crea versiones ni reinicia secuencias. Migration 026–032 permanecen inmutables. `SEC_LOG_001` (tokens/estado OAuth en logs) requiere un hotfix separado y no se mezcla con HF3.

El acceso a producción, el despliegue y la aplicación de migration 033 permanecen pendientes de autorización explícita.
