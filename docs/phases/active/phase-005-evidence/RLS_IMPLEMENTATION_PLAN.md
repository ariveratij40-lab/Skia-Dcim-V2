# PHASE-005 — Implementation Plan

## Estado

- Etapa: `B — DISEÑO Y VALIDACIÓN LOCAL`.
- Resultado: `ARTEFACTO CANÓNICO Y ROLLBACK IMPLEMENTADOS LOCALMENTE`.

PHASE-006 resolvió la identidad runtime y la cobertura de contexto; la decisión
de canonicalización resolvió la semántica branch de entidades relacionadas. Se
creó un SQL operativo nuevo bajo `ops/phase005/`, sin reescribir migraciones
históricas. Su token de aprobación no ha sido autorizado para STAGING.

## Dependencias resueltas antes de Etapa C

1. **Identidad runtime:** PHASE-006 dejó la API en `skia_runtime`, separada del
   migrador, sin `SUPERUSER`, `BYPASSRLS`, ownership ni herencia privilegiada.
2. **Cobertura de contexto:** PHASE-006 convergió handlers, jobs y operaciones
   tenant-wide a contexto explícito tenant/branch.
3. **Entidades relacionadas:** el gate aprobó logs branch-scoped por activo y
   relaciones visibles únicamente cuando ambos endpoints están en scope.
4. **Mecanismo canónico:** `ops/phase005/` contiene SQL nuevo, transaccional,
   idempotente y protegido por hashes; `015`, `016` y ops históricos no cambian.

## Diseño de activación futura

El artefacto implementado:

1. comprobar entorno STAGING, base, tablas, policies y rol runtime;
2. verificar `NOSUPERUSER`, `NOBYPASSRLS` y ausencia de ownership runtime;
3. verificar que la API ya usa ese rol mediante evidencia externa al SQL;
4. capturar `relrowsecurity`, `relforcerowsecurity` y definiciones exactas;
5. habilitar solo las tablas aprobadas dentro de una transacción;
6. comprobar el estado y terminar sin modificar datos funcionales.

## Rollback implementado

`rollback_canonical_rls.sql` restaura exactamente las policies previas y sus
hashes, deshabilita RLS y conserva FORCE activo. Solo acepta el estado canónico
exacto o el snapshot ya restaurado; cualquier divergencia aborta antes de DDL.

Rollback no debe cambiar roles, secretos, fixtures ni datos. Un cutover de `DATABASE_URL` requiere su propio rollback de release/configuración backend, separado del rollback RLS.

## Validación local realizada

- Inspección de `migrations/015_assets_rls.sql`, `migrations/016_assets_branch_scope_all.sql` y el script histórico de `ops/`.
- Trazado de `BeginTenantTx`, `RequireTenantTx`, `RequireTenantTxScoped` y rutas DCIM.
- Ejecución del linter estático: 221 hallazgos, exit code `1`.
- Comparación de policies versionadas contra `pg_policies` real.
- PostgreSQL 16 efímero: activación, matriz read/write, idempotencia, rollback y
  guards negativos aprobados.
- `bash -n` y `git diff --check` aprobados; `shellcheck` no disponible.

## Gate siguiente

Se requiere una decisión arquitectónica separada antes de ejecutar el artefacto
en STAGING, habilitar RLS o iniciar CAMPAÑA B.
