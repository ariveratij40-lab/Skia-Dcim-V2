# PHASE-012 — Inventory test panic gate

## Resultado

**BLOCKED**

## Diagnóstico

El `nil *sql.DB` es un defecto de **test setup (clase A)**. El runtime crea el
`db` global antes de registrar `handleInventoryImportRoutes`, pero
`TestHandleInventoryImportRoutes_DetailValid` solo instalaba un
`FakeSessionStore`. Ese store no participa en el contrato de
`ExtractSessionContextSecure`, que consulta PostgreSQL mediante un `*sql.DB`
válido. Los handlers de detalle y filas también consultan ese mismo DB.

El historial confirma que el handler y el test nacieron juntos en `9f9078d` con
esta incompatibilidad. Las pruebas de integración vecinas pasan un DB real a
`ExtractSessionContextSecure`; no existe un modo válido de fabricar contexto ni
de omitir la validación DB-backed.

No se encontró una ruta runtime autorizada donde el handler quede registrado
antes de inicializar `db`. Por tanto, el hallazgo no se clasifica como un fallo
nil-safety productivo ni justifica un bypass o `recover`.

## Corrección mínima aplicada

La prueba afectada ahora instala un `database/sql` mock con expectativas
explícitas para sesión, tenant, branch, importación y errores. También usa el ID
entero `1`, conforme al contrato vigente de `inventory_imports.id`. No se
modificó código runtime ni se redujo ninguna aserción.

Resultado repetido:

- `go test -run '^TestHandleInventoryImportRoutes_DetailValid$' -count=10 .`:
  **APPROVED**.

## Bloqueo descubierto en pruebas relacionadas

La ejecución inmediata del grupo relacionado volvió a producir el mismo panic
en `TestHandleInventoryImportRoutes_RowsValid`, que conserva el setup obsoleto.
La inspección mostró además contratos heredados que requieren decisión fuera de
esta corrección puntual: varios casos usan UUID aunque el contrato actual exige
INTEGER, y `NoPermission` espera un 403 aunque el dispatcher DB-backed no
evalúa permisos en esa ruta.

Conforme al gate, no se amplió unilateralmente el cambio hacia wiring de
autenticación/RBAC ni se reinterpretaron expectativas. Al no aprobar las
pruebas relacionadas, no se ejecutaron como supuestamente finales las demás
validaciones obligatorias y el gate queda **BLOCKED**.

## Impacto de artefactos

El delta funcional está limitado a archivos `_test.go` y una dependencia Go
exclusivamente de prueba. No cambió ningún archivo runtime/frontend, ni el dark
deployment fijado en `92eac07c3931c30d198b8842ee458820bcba18d6`.
