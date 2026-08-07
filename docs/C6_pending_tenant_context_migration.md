# C-6 — checklist de migración a `TenantDB` (RequireTenantTx)

Estado: **listAssets, getAsset, updateAsset, deleteAsset, HandleRFID y
HandleLocationsManage** (`dcim_assets.go`) ya migrados y con pruebas de
integración para `listAssets`/`getAsset` (el resto no tiene aún prueba de
integración dedicada, solo compilación/lectura de código — ver limitación
de entorno más abajo). Antes de migrar estos cuatro últimos se descubrió y
corrigió un hallazgo aparte: `DCIMHandler.getSessionContext` tenía su
propia lógica de resolución de sucursal (fallback si `branch_id` venía
vacío en la sesión), distinta de `ExtractSessionContextSecure` (la que usa
`RequireTenantTx`, que exigía `branch_id` ya presente sin fallback).
Migrar estos handlers tal cual habría sido una regresión real para
usuarios con sesión sin sucursal asignada directamente (p.ej. multi-tenant
sin auto-selección en login). Se corrigió en el origen
(`ExtractSessionContextSecure`, `import_handlers.go`): ahora, si la sesión
no trae `branch_id`, resuelve automáticamente cuando el usuario tiene
exactamente una sucursal autorizada (`user_branches`), exige selección
explícita si tiene varias (`RequireTenantTx` responde `409` con la lista),
y rechaza con `403` si no tiene ninguna. Si la sesión SÍ trae `branch_id`,
ahora también se valida que el usuario esté autorizado para ella (antes
solo se validaba que perteneciera al tenant, no la autorización del
usuario). Ver `session_context_resolution_integration_test.go` (5 pruebas
de `ExtractSessionContextSecure` + 2 de `RequireTenantTx` para los códigos
409/403).

El resto de rutas que tocan `assets`/`asset_logs`/`asset_relationships`
(dashboard.go, ai_chat.go, duplicate_detector.go, import_upload_handlers.go,
infraestructura.go, inventory_clear_handler.go, rack_layout.go) sigue
usando `h.DB`/`db` directo — **no reactivar `FORCE ROW LEVEL SECURITY` en
esas 3 tablas hasta cerrar el resto del Grupo A.**

## Grupo A — bloqueante para reactivar el piloto de RLS (assets/asset_logs/asset_relationships)

Organizado por archivo. Cada línea es, al momento de este commit, una
llamada a `h.DB.*`/`db.*` que tocaría una tabla con RLS.

- **dcim_assets.go — CERRADO en esta ronda**
  - ~~`updateAsset` (PUT /api/dcim/assets/{id})~~: migrado a `TenantDBFromContext`/`TenantIdentityFromContext`.
  - ~~`deleteAsset` (DELETE /api/dcim/assets/{id})~~: migrado.
  - ~~`HandleRFID` (GET, lookup por tag RFID)~~: migrado (8 sitios) y **corregido en la ronda 2026-08-07** para usar `RequireTenantTxScoped` en vez de `RequireTenantTx` -- la política real de `assets` es tenant+sucursal, y la búsqueda por tag es intencionalmente cruzada-de-sucursal para roles autorizados (`globalScopeRoles`, hoy `"admin"`). Sin esta corrección, un escaneo de un activo de otra sucursal habría dado `404` falso en cuanto RLS se reactivara.
  - ~~`HandleLocationsManage`~~: migrado, y **corregido en la ronda 2026-08-07**: la guardia de borrado ahora llama a la función `assets_count_in_location_all_branches` (SECURITY DEFINER, `migrations/016_assets_branch_scope_all.sql`) en vez de un `COUNT` acotado por RLS normal -- es una regla de integridad del tenant completo, no depende del rol ni la sucursal de quien pide el borrado.
  - **`createAsset` (POST) sigue sin entrar en este grupo**: ya usa `BeginTenantTx` propio. Si se decide unificarlo bajo `RequireTenantTx` más adelante, hay que quitarle su `BeginTenantTx`/`Commit`/`Rollback` interno primero (ver nota de "transacciones anidadas" más abajo) — es un cambio de mayor riesgo por la lógica de tablas satélite (`racks`, `switches`, `ups`, `pdus`, `patch_panels`, `mdf_idf`) y no se hizo en este pase.

- **dashboard.go — CERRADO, con corrección en la ronda 2026-08-07.** ~~`handleDashboardStats`: dos `COUNT(*) FROM assets` y el listado de activos críticos~~ migrados a una transacción con contexto de tenant abierta directamente con `BeginTenantTxWithScope` (NO envuelto con `RequireTenantTx`/`RequireTenantTxScoped`: este handler es deliberadamente tolerante a sesiones sin tenant todavía asignado -- muestra el estado de onboarding en vez de `401`/`403`/`409`, algo que esos middlewares no permiten porque exigen resolver tenant+branch antes de invocar al handler). **Corrección 2026-08-07:** la primera versión de este cambio abría la transacción con sucursal vacía y sin `branch_scope_all`, lo que bajo la política real de `assets` (tenant+sucursal) habría subestimado los conteos a solo activos sin sucursal asignada. Ahora resuelve el rol del usuario (`resolveUserRole`) y activa `branch_scope_all` solo para roles en `globalScopeRoles`; el resto de usuarios queda acotado a la sucursal de su propia sesión. El resto de este archivo (`tickets`, `mdf_idf`, `racks`, `switches`, `ups`, `user_tenants`, `sessions`) sigue en `db` directo -- son tablas sin RLS hoy, no requieren migración para este propósito.
  **Nota sobre el lint:** `tools/tenant_db_lint` es agnóstico de tabla (no distingue `db.QueryRow("...FROM tickets...")` de `db.QueryRow("...FROM assets...")`), así que seguirá reportando hallazgos en `dashboard.go` por las consultas a `tickets`/`mdf_idf`/etc. -- son ruido esperado para este archivo, no violaciones de C-6, y requieren revisión manual caso por caso hasta que el lint aprenda a mirar el texto de la consulta (mejora no implementada todavía).
  **Sin prueba de integración dedicada** (a diferencia de `dcim_assets.go`/`session_context_resolution_integration_test.go`): el cambio reutiliza `BeginTenantTx`, ya cubierto por pruebas existentes, pero el flujo de commit/rollback específico de este handler no tiene una prueba propia -- pendiente si se considera necesario.

- **ai_chat.go**: `SELECT COUNT(*) FROM assets` para el contexto que se le pasa al asistente de IA (línea ~87).

- **duplicate_detector.go** (`DetectDuplicates`, `insertAsset`, `updateAsset`): usado por el pipeline de importación para detectar/insertar/actualizar activos (líneas ~56, ~285, ~335). Riesgo: si queda sin migrar y se reactiva RLS, la detección de duplicados dejaría de encontrar duplicados reales (falso negativo, no falso positivo) — y las inserciones vía este camino violarían `WITH CHECK` con error.

- **import_upload_handlers.go**: `INSERT INTO assets` en el flujo de carga masiva (línea ~360).

- **infraestructura.go**: el módulo más grande pendiente — ~15 sitios (líneas ~110, 219, 229, 327, 345, 363, 508, 598, 682, 815, 976, 1110, 1230, 1248, 1302, 1416), mezcla de `INSERT`/`UPDATE`/`COUNT` sobre `assets` para los formularios de infraestructura (MDF/IDF, backbone, etc.).

- **inventory_clear_handler.go**: `COUNT`/`DELETE FROM assets` del botón "vaciar inventario del tenant" (líneas ~95, ~99).

- **rack_layout.go**: validación y guardado de layout de rack — `SELECT`/`UPDATE` sobre `assets` (líneas ~168, ~262, ~276, ~280).

**Antes de reactivar RLS en estas 3 tablas:** migrar (o al menos auditar
explícitamente) cada punto de este grupo, y correr
`go run ./tools/tenant_db_lint backend/*.go` — debe salir limpio para los
archivos de este grupo (se pueden exceptuar con `-allow` los que
deliberadamente se dejen fuera, mencionando por qué).

## Grupo B — hallazgo de alcance, no bloqueante hoy

Al correr una búsqueda amplia de `db.Query*`/`db.Exec*`/`h.DB.Query*`/
`h.DB.Exec*` en todo `backend/*.go` (sin filtrar por tabla), aparecen
**más de 200 sitios en al menos 15 archivos** (`config_admin.go`,
`capex.go`, `cert_evaluations.go`, `google_oauth.go`, `main.go`,
`migrations.go`, `report_generator.go`, los `import_*.go`, etc.). Esto no
es un problema hoy porque **RLS solo existe (y está desactivado) en 3
tablas** — pero es la evidencia concreta de que el objetivo más amplio de
C-2 ("extender RLS a todas las tablas con tenant_id") no se puede lograr
migrando sitio por sitio a mano como se hizo aquí con 2 rutas. A esa
escala, `RequireTenantTx` + el lint estático dejan de ser algo deseable y
pasan a ser prerrequisito: sin un mecanismo sistemático (o una reescritura
más amplia por capas/repositorio), extender RLS tabla por tabla implicará
tocar la mayoría del backend, no un módulo aislado.

## Nota sobre transacciones anidadas (`createAsset`)

`createAsset` seguirá usando su propio `BeginTenantTx(r.Context(), h.DB, ...)`
mientras no se envuelva su ruta con `RequireTenantTx`. **No hay que
envolver `HandleAssets` completo (GET+POST) con `RequireTenantTx`** como se
hizo para `HandleAssetByID`/GET — eso abriría una segunda transacción
desconectada de la primera. Si en el futuro se decide unificar, la función
`createAsset` debe dejar de llamar a `BeginTenantTx`/`tx.Commit()` por su
cuenta y en su lugar tomar el `TenantDB` (más precisamente, en ese caso
convendría exponer también el `*sql.Tx` real desde el contexto para
`generateInternalCode(tx *sql.Tx, ...)`, que hoy depende del tipo concreto,
no de la interfaz `TenantDB`) del contexto que ponga `RequireTenantTx`.

## Rutas de streaming / larga duración (mencionadas, no resueltas aquí)

`report_generator.go` (`GenerateExcelReport`, `GenerateCSVReport`,
`GenerateJSONReport`) no toca las tablas del piloto de RLS hoy, pero si en
el futuro genera reportes de `assets`, no debe envolverse con
`RequireTenantTx` tal cual está escrito (mantendría una transacción abierta
durante todo el streaming del archivo). Estrategia sugerida cuando aplique:
leer los datos necesarios dentro de una transacción corta con contexto de
tenant, cerrarla, y recién empezar a escribir el archivo de salida con los
datos ya en memoria.
