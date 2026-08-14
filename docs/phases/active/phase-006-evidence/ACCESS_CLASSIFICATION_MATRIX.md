# PHASE-006 — Access Classification Matrix

## Resultado de Etapa A

- Estado: `COMPLETA`.
- Linter: 221 hallazgos heurísticos sobre `db`/`h.DB`.
- Hallazgos relevantes a `assets`, `asset_logs`, `asset_relationships`: requieren clasificación y cambios focalizados.
- Decisión posterior aplicada: `ARCHITECT_DECISION_TENANT_WIDE_AND_JOB_CONTEXT.md`.
- Resultado tras Etapa C: cero accesos directos no clasificados a las tres tablas objetivo según el gate estático refinado.

## Matriz por componente

| Componente | Acceso objetivo | Clasificación | Evidencia / acción |
|---|---|---|---|
| `tenant_context.go` | variables de contexto | `CONTEXT_OK` | `BeginTenantTx` establece tenant/branch con `set_config(..., true)` |
| `tenant_middleware.go` | transacción por request | `CONTEXT_OK` | inyecta `TenantDB`, COMMIT/ROLLBACK controlado |
| `role_scope.go` | alcance tenant-wide | `CONTEXT_OK` condicionado | `branch_scope_all` solo para rol global `admin` |
| `dcim_assets.go` listado/detalle/update/delete | `assets`, logs en RFID | `CONTEXT_OK` | rutas envueltas por `RequireTenantTx` y uso de `TenantDB` |
| `dcim_assets.go` creación | `assets`, `asset_logs` | `CONTEXT_OK` | usa `BeginTenantTx` explícito |
| `dashboard.go` | agregados de `assets` tenant-wide | `NEEDS_SCOPED_TX` parcialmente resuelto | usa `BeginTenantTxWithScope`; requiere conservar decisión de rol global |
| `infraestructura.go` | múltiples SELECT/INSERT/UPDATE de `assets` | `CONTEXT_OK` | rutas envueltas por `RequireTenantTx`; el alias local `db` es el `TenantDB` de la transacción, y tablas satélite/asset comparten la misma unidad atómica |
| `rack_layout.go` | SELECT/UPDATE de `assets` | `CONTEXT_OK` | ruta envuelta por `RequireTenantTx`; eliminada transacción propia y agregados filtros tenant a lecturas/updates relacionados |
| `inventory_clear_handler.go` | COUNT/DELETE tenant-wide de `assets` | `CONTEXT_OK` | `RequireTenantTxScoped`; exige rol efectivo `admin`, scope global explícito y `ADMIN_PASSWORD` configurado/válido; todas las sentencias conservan `tenant_id` |
| `duplicate_detector.go` | SELECT/INSERT/UPDATE `assets` | `CONTEXT_OK` como job | helpers reciben `TenantDB`; los llamadores asíncronos entregan la transacción contextual, no el pool global |
| `import_upload_handlers.go` | INSERT de `assets` en background | `CONTEXT_OK` como job | `JobTenantContext` obligatorio tenant+branch; transacción propia con scope-all falso por defecto |
| `background_processor.go` | procesamiento asíncrono | `CONTEXT_OK` como job | abre `BeginJobTenantTx` antes de consultar/upsert; falta de tenant/branch falla antes de acceso objetivo |
| `migrations.go` y SQL versionado | DDL/RLS | `MIGRATION_ONLY` | debe usar conexión migradora separada |
| catálogos/configuración sin tablas objetivo | otras tablas | `FALSE_POSITIVE` | el linter actual no inspecciona el SQL y sobrerreporta |
| `asset_relationships` runtime | sin endpoint funcional observado | `FALSE_POSITIVE` para rutas; diseño pendiente | existe tabla/policy/fixture, pero no handler read-only cubierto por CAMPAÑA A |

## Gate revisable

`tools/tenant_db_lint` ahora analiza solamente literales SQL que nombran exactamente `assets`, `asset_logs` o `asset_relationships`; evita confundir `imported_assets`. Reconoce el patrón revisado `db, ... := TenantDBFromContext(...)` como alias contextual local. SQL dinámico queda fuera del análisis heurístico y continúa sujeto a revisión; no se observó SQL dinámico sobre tablas objetivo en los flujos modificados.

Resultado local: `tenant_db_lint: sin hallazgos.` No se agregó una exclusión global ni un bypass.
