# PHASE-005 — Implementation Plan

## Estado

- Etapa: `B — DISEÑO Y VALIDACIÓN LOCAL`.
- Resultado: `BLOQUEADO ANTES DE SQL ACTIVABLE`.

La condición de entrada de Etapa B no se cumple: las políticas no cubren inequívocamente branch para tablas relacionadas y el backend efectivo no usa el rol restringido ni suministra contexto en todas las rutas. No se creó una migración ni script de activación para evitar convertir un diseño incompleto en una operación ejecutable.

## Fases correctivas requeridas antes de Etapa C

1. **Convergencia de identidad runtime**
   - aprobar el uso efectivo de `skia_runtime` en la API;
   - entregar su secreto fuera del repositorio;
   - separar el rol de runtime del rol propietario/migrador;
   - verificar que la aplicación no puede heredar `BYPASSRLS`.
2. **Cobertura de contexto**
   - inventariar por handler todos los accesos a las tres tablas;
   - migrar rutas HTTP al mismo `TenantDB` transaccional;
   - diseñar contexto explícito para jobs y operaciones tenant-wide;
   - convertir el lint en un gate con allowlist revisada, no ignorar sus 221 hallazgos globales.
3. **Política de entidades relacionadas**
   - decidir formalmente si logs y relaciones son tenant-wide o branch-scoped;
   - demostrar integridad tenant/branch entre cada registro y sus activos referenciados;
   - añadir pruebas directas con `skia_runtime` para lectura y escritura cross-branch.
4. **Mecanismo canónico**
   - crear un SQL operativo nuevo, transaccional e idempotente;
   - no modificar `015`, `016` ni el script histórico de `ops/`;
   - fijar hashes de políticas y abortar ante divergencia.

## Diseño de activación futura

Una vez resueltos los bloqueantes, el artefacto deberá:

1. comprobar entorno STAGING, base, tablas, policies y rol runtime;
2. verificar `NOSUPERUSER`, `NOBYPASSRLS` y ausencia de ownership runtime;
3. verificar que la API ya usa ese rol mediante evidencia externa al SQL;
4. capturar `relrowsecurity`, `relforcerowsecurity` y definiciones exactas;
5. habilitar solo las tablas aprobadas dentro de una transacción;
6. comprobar el estado y terminar sin modificar datos funcionales.

## Rollback propuesto

El rollback futuro debe restaurar exactamente el snapshot previo. Para el estado observado —políticas existentes, FORCE activo y RLS deshabilitado— el rollback mínimo de una activación que no cambie policies sería `DISABLE ROW LEVEL SECURITY` únicamente en las tablas activadas. Si el gate aprueba cambios de policy, el rollback deberá restaurar además cada definición exacta capturada, nunca aproximarla.

Rollback no debe cambiar roles, secretos, fixtures ni datos. Un cutover de `DATABASE_URL` requiere su propio rollback de release/configuración backend, separado del rollback RLS.

## Validación local realizada

- Inspección de `migrations/015_assets_rls.sql`, `migrations/016_assets_branch_scope_all.sql` y el script histórico de `ops/`.
- Trazado de `BeginTenantTx`, `RequireTenantTx`, `RequireTenantTxScoped` y rutas DCIM.
- Ejecución del linter estático: 221 hallazgos, exit code `1`.
- Comparación de policies versionadas contra `pg_policies` real.
- `git diff --check` se ejecutará antes del commit.

## Gate solicitado

Se requiere decisión arquitectónica sobre los cuatro bloques anteriores antes de escribir SQL activable, cambiar credenciales/runtime o habilitar RLS en STAGING.
