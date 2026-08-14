# PHASE-006 — Access Classification Matrix

## Resultado de Etapa A

- Estado: `COMPLETA`.
- Linter: 221 hallazgos heurísticos sobre `db`/`h.DB`.
- Hallazgos relevantes a `assets`, `asset_logs`, `asset_relationships`: requieren clasificación y cambios focalizados.
- Resultado global: `BLOQUEADO` para convergencia automática por semántica tenant-wide no resuelta.

## Matriz por componente

| Componente | Acceso objetivo | Clasificación | Evidencia / acción |
|---|---|---|---|
| `tenant_context.go` | variables de contexto | `CONTEXT_OK` | `BeginTenantTx` establece tenant/branch con `set_config(..., true)` |
| `tenant_middleware.go` | transacción por request | `CONTEXT_OK` | inyecta `TenantDB`, COMMIT/ROLLBACK controlado |
| `role_scope.go` | alcance tenant-wide | `CONTEXT_OK` condicionado | `branch_scope_all` solo para rol global `admin` |
| `dcim_assets.go` listado/detalle/update/delete | `assets`, logs en RFID | `CONTEXT_OK` | rutas envueltas por `RequireTenantTx` y uso de `TenantDB` |
| `dcim_assets.go` creación | `assets`, `asset_logs` | `CONTEXT_OK` | usa `BeginTenantTx` explícito |
| `dashboard.go` | agregados de `assets` tenant-wide | `NEEDS_SCOPED_TX` parcialmente resuelto | usa `BeginTenantTxWithScope`; requiere conservar decisión de rol global |
| `infraestructura.go` | múltiples SELECT/INSERT/UPDATE de `assets` | `NEEDS_TENANT_TX` | usa conexión global y mezclaría transacciones si solo se envolviera la ruta |
| `rack_layout.go` | SELECT/UPDATE de `assets` | `NEEDS_TENANT_TX` | conexión global y transacción propia sin variables RLS |
| `inventory_clear_handler.go` | COUNT/DELETE tenant-wide de `assets` | `NEEDS_SCOPED_TX` — BLOQUEANTE | autorización actual por password global, sin decisión de rol para scope multi-branch |
| `duplicate_detector.go` | SELECT/INSERT/UPDATE `assets` | `JOB_CONTEXT_REQUIRED` / revisar receptor | varias funciones reciben DB/tx; debe fijarse tenant/branch en la transacción real |
| `import_upload_handlers.go` y helpers | INSERT de `assets` en background | `JOB_CONTEXT_REQUIRED` | el job conserva IDs explícitos, pero no establece variables PostgreSQL en su conexión |
| `background_processor.go` | procesamiento asíncrono | `JOB_CONTEXT_REQUIRED` | no existe request/middleware que provea contexto |
| `migrations.go` y SQL versionado | DDL/RLS | `MIGRATION_ONLY` | debe usar conexión migradora separada |
| catálogos/configuración sin tablas objetivo | otras tablas | `FALSE_POSITIVE` | el linter actual no inspecciona el SQL y sobrerreporta |
| `asset_relationships` runtime | sin endpoint funcional observado | `FALSE_POSITIVE` para rutas; diseño pendiente | existe tabla/policy/fixture, pero no handler read-only cubierto por CAMPAÑA A |

## Límite estructural

`handleClearInventory` opera sobre todas las branches de un tenant. Bajo RLS necesitaría `app.branch_scope_all=true`. El endpoint no demuestra pertenencia al rol `admin`; valida una contraseña global. Otorgar scope global por esa contraseña, o comenzar a exigir rol `admin`, cambia la semántica global de autorización. PHASE-006 prohíbe inferir ese cambio.

No se modificó el endpoint ni se creó un bypass.
