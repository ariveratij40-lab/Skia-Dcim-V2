# PHASE-005 — RLS Policy Matrix

## Matriz efectiva de STAGING

| Tabla | Owner | RLS | FORCE | Política | USING / WITH CHECK resumido | Evaluación |
|---|---|---:|---:|---|---|---|
| `assets` | `skia_user` | false | true | `assets_tenant_branch_isolation` | tenant igual a `app.tenant_id`; branch nula, igual a `app.branch_id` o `app.branch_scope_all=true` | Correcta para filas no nulas y contexto explícito; inefectiva mientras RLS esté apagado y el runtime tenga BYPASSRLS |
| `asset_logs` | `skia_user` | false | true | `asset_logs_tenant_isolation` | tenant igual a `app.tenant_id` | Incompleta para aislamiento branch heredado |
| `asset_relationships` | `skia_user` | false | true | `asset_relationships_tenant_isolation` | tenant igual a `app.tenant_id` | Incompleta para aislamiento branch de source/target |

Todas son políticas `PERMISSIVE`, comando `ALL`, rol `PUBLIC`, con expresiones equivalentes en `USING` y `WITH CHECK`.

## Divergencia versionada

- `migrations/015_assets_rls.sql` define `assets` con branch nula o branch de contexto.
- `migrations/016_assets_branch_scope_all.sql` añade el escape explícito `app.branch_scope_all=true`, que coincide con STAGING.
- `ops/2026-08-05_convergence_runtime_role_and_rls_pilot.sql` contiene una versión más restrictiva anterior para `assets` y también administra roles/grants.

Ningún archivo histórico debe reescribirse. Una futura activación necesita un artefacto operativo nuevo y canónico, con precondiciones y hashes de estado, después de resolver los bloqueantes.

## Tablas usadas por PHASE-002

| Flujo | Tablas principales | Contexto DB |
|---|---|---|
| login/sesión | `users`, `sessions`, `user_tenants`, `tenants`, `user_branches`, `branches` | filtros SQL directos; sin RLS |
| selección tenant/branch | `sessions`, mappings y `branches` | autorización explícita de aplicación; sin RLS |
| listado/detalle de activos | `assets` y catálogos | `RequireTenantTx`, tenant/branch transaccional |
| creación de activo/log | `assets`, `asset_logs` | `BeginTenantTx`, tenant/branch transaccional |
| relaciones | `asset_relationships` | endpoint read-only ausente en CAMPAÑA A |

## Decisiones pendientes

1. Definir si logs y relaciones son tenant-wide o branch-scoped por herencia.
2. Si son branch-scoped, aprobar políticas con validación de los activos referenciados o un cambio de esquema explícito.
3. Definir el artefacto operativo canónico sin modificar migraciones históricas.

## Matriz canónica aprobada para implementación local

La decisión `ARCHITECT_DECISION_RLS_POLICY_CANONICALIZATION_GATE.md` resolvió
las decisiones anteriores. El artefacto nuevo conserva `assets` y converge:

| Tabla | Policy canónica | Límite `USING` / `WITH CHECK` |
|---|---|---|
| `assets` | `assets_tenant_branch_isolation` | tenant actual y branch actual, branch neutral o scope-all explícito |
| `asset_logs` | `asset_logs_tenant_branch_isolation` | tenant actual y activo referenciado visible bajo la misma regla |
| `asset_relationships` | `asset_relationships_tenant_branch_isolation` | tenant actual y source/target visibles simultáneamente bajo la misma regla |

Las tres policies son `PERMISSIVE`, `ALL`, exclusivas de `skia_runtime`, con
fronteras simétricas de lectura/escritura. Su activación en STAGING permanece
bloqueada hasta un gate posterior.
