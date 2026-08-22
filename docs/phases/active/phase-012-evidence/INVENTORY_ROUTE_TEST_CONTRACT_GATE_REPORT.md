# PHASE-012 — Inventory route test contract gate

## Resultado

**READY FOR MAIN MERGE GATE**

## Convergencia del contrato

Todos los tests directamente relacionados con `handleInventoryImportRoutes`
usan ahora un fixture `database/sql` determinista con `sqlmock`, restauran el
DB global al terminar y verifican todas las expectativas SQL. No cambió ningún
handler ni se agregó enforcement RBAC.

Los IDs legacy UUID fueron sustituidos por INTEGER donde la ruta espera
`inventory_imports.id`. La expectativa heredada de 403 por ausencia de
`inventory.import.read` fue reemplazada por un test explícito del contrato
vigente: esta ruta aplica sesión, tenant, branch y queries scopeadas, pero no
consulta ese permiso. Otros endpoints sí lo usan; este dispatcher no lo
referencia ni tiene middleware obligatorio que lo haga.

La matriz cubre éxito de detail/rows, sesión ausente o inválida, tenant
inexistente, branch no autorizada, aislamiento cross-tenant/cross-branch,
import inexistente, ID no entero, routing/método y ausencia del permiso no
aplicado. La matriz completa aprobó 10 ejecuciones consecutivas.

## Revalidación limpia

Checkout detached limpio validado:
`61a4fbc29518c046e48a6380b8209979915c537d`.

| Control | Resultado |
|---|---|
| `go test ./...` | APPROVED; cero fallos y cero panic |
| Go build `-trimpath` | APPROVED |
| `npm ci` | APPROVED |
| TypeScript `--noEmit` | APPROVED |
| Imports internos no resueltos (`TS2307`) | 0 |
| Next.js production build | APPROVED; 29 páginas |
| Bootstrap PostgreSQL 16, ejecución 1 | `BOOTSTRAP_SCHEMA_OK` |
| Bootstrap PostgreSQL 16, ejecución 2 | `BOOTSTRAP_SCHEMA_OK` |
| Ledger bootstrap | 10 |
| Matriz RLS canónica PostgreSQL 16 | `PHASE005_LOCAL_VALIDATION=APPROVED` |
| `git diff --check` | APPROVED |

`npm audit` informó 7 vulnerabilidades heredadas (1 moderate, 6 high); no se
ejecutó corrección automática porque está fuera del gate y no invalidó el
build reproducible autorizado.

## Equivalencia con dark production

El delta no documental desde el candidato funcional
`92eac07c3931c30d198b8842ee458820bcba18d6` contiene exclusivamente:

- `backend/go.mod` y `backend/go.sum`, por la dependencia test-only `sqlmock`;
- `backend/import_routes_handlers_test.go`;
- `backend/import_routes_db_fixture_test.go`.

No existe diff en código runtime, frontend, migraciones u `ops`. Los binarios
Go construidos con `-trimpath` desde el candidato dark y desde el candidato de
tests son byte-identical, ambos con SHA-256
`e2af6983345ab1e811fe3b7d1cb993fe7329ee7609f5de32ec1d48ea4bb5b69b`.
Por tanto, el dark deployment fijado en `92eac07c…` conserva equivalencia
funcional. No fue reconstruido ni redesplegado.
