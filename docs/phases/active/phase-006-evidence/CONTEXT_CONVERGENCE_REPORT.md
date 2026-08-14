# PHASE-006 — Context Convergence Report

## Etapa C

- Estado LOCAL: `COMPLETA`.
- Decisión aplicada: `ARCHITECT_DECISION_TENANT_WIDE_AND_JOB_CONTEXT.md`.

## Operación tenant-wide

`handleClearInventory` ahora se ejecuta mediante `RequireTenantTxScoped` y solo permite la operación cuando coinciden sesión/tenant válidos, rol efectivo `admin`, `branch_scope_all=true` y `ADMIN_PASSWORD` configurado/correcto. El password por defecto fue eliminado: ausencia de configuración falla cerrado. Las eliminaciones y el log usan el mismo `TenantDB` y conservan `WHERE tenant_id = tenant de sesión`.

## Handlers branch-scoped

Las rutas de infraestructura y layout de racks se registran con `RequireTenantTx`. Sus accesos a `assets` y tablas satélite comparten la transacción contextual; el layout ya no abre una transacción paralela sin variables y suma filtros tenant en verificaciones relacionadas.

## Jobs

`JobTenantContext` exige tenant y, para importaciones, branch. `BranchScopeAll` es falso por defecto y nunca se deriva de branch vacío. `processImportFileAsync`, `ProcessImportAsync` y los helpers de deduplicación/upsert ejecutan accesos objetivo en su propia transacción runtime contextual; contexto incompleto falla antes de acceder.

No se introdujo `SET ROLE`, pool migrador en handlers/jobs, bypass, cambio RLS, esquema ni privilegio nuevo.
