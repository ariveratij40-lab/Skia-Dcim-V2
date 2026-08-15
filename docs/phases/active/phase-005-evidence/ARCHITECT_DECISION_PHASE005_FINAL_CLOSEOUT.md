# PHASE-005 — Final Architectural Closeout

## Estado

- Resultado: **APROBADA EN STAGING**.
- Rama: `phase/005-rls-enforcement`.
- Evidencia final de CAMPAÑA B: `584500a31d871eac943af55748a71e29dca63178`.
- Runtime activo: `skia_runtime` restringido.
- RLS/FORCE: `true/true` en `assets`, `asset_logs`, `asset_relationships`.
- Policies canónicas: hashes exactos y sin drift.
- CAMPAÑA B: `COMPLETE`, exit `0`, sin fugas cross-tenant ni cross-branch observadas.

## Dictamen

PHASE-005 cumple su objetivo técnico: SKIA STAGING opera con doble defensa de aislamiento para las rutas y entidades cubiertas por la campaña y por los probes directos:

1. **Capa aplicación**: sesión, tenant, branch, mappings y handlers fail-closed.
2. **Capa PostgreSQL**: runtime restringido `skia_runtime`, sin SUPERUSER/BYPASSRLS, con RLS/FORCE habilitado y policies canónicas tenant/branch.

La evidencia no permite afirmar causalidad exclusiva de RLS al comparar CAMPAÑA A vs B, porque entre ambas también cambiaron el backend y la identidad runtime. Esa limitación queda aceptada y no invalida la demostración independiente de RLS mediante probes PostgreSQL directos ni la CAMPAÑA B completa bajo el estado final.

## Controles aprobados

- Backend healthy y estable.
- Health interno/público `200/200`.
- Runtime `skia_runtime`, NOSUPERUSER/NOBYPASSRLS.
- RLS/FORCE `true/true` en las tres tablas objetivo.
- Hashes canónicos exactos.
- Fixture íntegro: 3 tenants, 6 branches, 9 actores, 60 assets, 60 logs, 6 relaciones.
- Mappings inválidos tenant/branch: `0/0`.
- A-OPERATOR A1 permitido; A2 rechazado `403` y contexto preservado.
- A-MULTI A1/A2 permitido con conteos exactos.
- Tenant B/C aislados en las rutas ejecutadas.
- Logout/reuso de sesión fail-closed.
- Cross-tenant leak `false`.
- Cross-branch leak `false`.
- Probes directos RLS sin contexto, branch-scoped, scope-all tenant-only y escrituras fuera de scope: aprobados.

## Bloqueos residuales aceptados

Los casos estructuralmente no observables de la matriz permanecen documentados como `BLOQUEADO` y no se reinterpretan como aprobados, incluyendo endpoints ausentes y observaciones naturales de expiración donde corresponda.

El fallo preexistente de la suite Go completa en `TestHandleInventoryImportRoutes_DetailValid` por `db == nil` permanece fuera del alcance funcional de PHASE-005 y debe tratarse en una fase separada antes de declarar la suite global limpia.

## Estado operativo que debe preservarse

- Mantener RLS canónico habilitado en STAGING.
- Mantener API runtime como `skia_runtime`.
- Mantener identidad migradora separada.
- No reutilizar `skia_user` como runtime.
- No modificar policies canónicas fuera del mecanismo versionado `ops/phase005/`.
- Cualquier cambio futuro en tablas, FKs, policies, rol runtime o semántica tenant/branch debe volver a pasar por preflight y pruebas de aislamiento equivalentes.

## Cierre de fixtures PHASE-002

Los fixtures TEST ya cumplieron su propósito de auditoría. Su rollback debe ejecutarse únicamente mediante el manifest exacto y tooling versionado de PHASE-002, bajo un gate de limpieza separado. Este closeout **no autoriza** todavía el rollback de fixtures ni la eliminación de actores/sesiones TEST.

## No autorizado por este documento

- merge a `main`;
- promoción a producción;
- rollback de RLS;
- rollback de fixtures;
- cambios adicionales de esquema, grants, roles o infraestructura;
- eliminación de evidencia.

## Siguiente decisión recomendada

Abrir una fase de **consolidación y limpieza de STAGING** con dos objetivos separados:

1. versionar/consolidar las ramas aprobadas PHASE-004/005/006 en una línea integrable y revisar el plan de merge;
2. retirar fixtures/sesiones TEST mediante rollback exacto, verificando que RLS y el runtime restringido permanecen sanos después de la limpieza.

PHASE-005 queda formalmente cerrada como **APROBADA EN STAGING**.