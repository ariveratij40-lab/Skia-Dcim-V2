# PHASE-004 — Branch Authorization Test Matrix

| ID | Origen | Escenario | Esperado | Estado |
|---|---|---|---|---|
| BA-001 | LOCAL | Usuario asociado a A1 selecciona A1 | HTTP 200 y actualización A1 | APROBADO |
| BA-002 | LOCAL | Usuario asociado solo a A1 selecciona A2 | HTTP 403, sin actualización | APROBADO |
| BA-003 | LOCAL | Usuario de tenant A selecciona B1 | HTTP 403, sin actualización | APROBADO |
| BA-004 | LOCAL | Usuario asociado a A1 y A2 selecciona ambas | HTTP 200 en ambas | APROBADO |
| BA-005 | LOCAL | Selección rechazada | Contexto anterior intacto | APROBADO |
| BA-006 | LOCAL | Solicitud sin sesión | HTTP 401, sin actualización | APROBADO |
| BA-007 | LOCAL | Sesión sin tenant válido | HTTP 401, sin actualización | APROBADO |
| BA-008 | LOCAL | Error al comprobar autorización | Fail-closed, HTTP 500, sin actualización | APROBADO |
| BA-009 | LOCAL | Branch inexistente | HTTP 403, sin actualización | APROBADO |

La validación de staging requiere autorización separada y no forma parte de esta ejecución local.

Comando ejecutado: `go test -run '^TestSelectBranch' ./...` desde `backend/`, con caché de compilación temporal fuera del repositorio. Resultado: exit code `0`.
