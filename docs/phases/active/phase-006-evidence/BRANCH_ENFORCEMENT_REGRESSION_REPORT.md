# PHASE-006 — Branch Enforcement Regression Report

## Resultado

- Fecha: `2026-08-14`.
- Gate: `ARCHITECT_DECISION_BRANCH_ENFORCEMENT_REGRESSION_GATE.md`.
- Rama: `phase/006-runtime-role-context`.
- Corrección local: `APROBADA`.
- Limpieza exacta STAGING: `APROBADA`.
- Deploy/cutover: `NO EJECUTADO / PROHIBIDO POR ESTE GATE`.
- RLS: permaneció deshabilitado.

## Causa raíz

La implementación PHASE-004 aprobada existe en `01efd5099758d8ad85fc4bcdf4720c5e23e59270`, pero ese commit no pertenece a la ascendencia de PHASE-006. El `merge-base` entre PHASE-004 y la rama actual es `5b4f01e028508b1045aef1ecbb386947d627aac3`; `git branch --contains` ubica el fix solamente en `phase/004-branch-context-enforcement` y su remoto.

Por ello PHASE-006 heredó el handler anterior. Esa versión comprobaba únicamente que la branch perteneciera al tenant:

`branches.id = branch solicitado AND branches.tenant_id = tenant de sesión`

No exigía el mapping del usuario en `user_branches` y actualizaba la sesión solo por token. A-OPERATOR podía seleccionar A2 porque A2 pertenece a Tenant A, aunque no estuviera asignada al actor. La regresión fue una omisión de integración/ascendencia, no un efecto de la separación migrador/runtime.

## Corrección

Se restauró la semántica fail-closed aprobada en PHASE-004 con el cambio mínimo:

1. cargar simultáneamente `user_id` y `tenant_id` desde la sesión vigente;
2. autorizar solo si existe un JOIN `branches`/`user_branches` para el tuple exacto `(user_id, tenant_id, branch_id)`;
3. no ejecutar UPDATE cuando la verificación devuelve falso o error;
4. proteger el UPDATE contra carreras repitiendo sesión vigente, user, tenant y mapping exacto en la misma sentencia;
5. exigir `rows_affected=1`; cero filas produce `403`;
6. no consultar ni aceptar nombre de rol como bypass;
7. dejar de registrar token/branch en errores del UPDATE.

El handler continúa usando el pool runtime global configurado por PHASE-006. Solo requiere SELECT/UPDATE ordinarios y no depende de ownership, SUPERUSER, BYPASSRLS ni de la conexión migradora.

## Pruebas de regresión

Archivo agregado: `backend/select_branch_test.go`.

Casos cubiertos:

- A-OPERATOR A1 permitido;
- A-OPERATOR A2 denegado;
- denegación A2 no invoca UPDATE y preserva A1;
- A-MULTI A1 y A2 permitidos;
- branch cross-tenant denegada;
- nombre de rol no puede sustituir el mapping;
- error de autorización falla cerrado;
- UPDATE que afecta cero filas por carrera devuelve `403` y no altera el contexto observado.

## Limpieza exacta STAGING

El precheck read-only confirmó exactamente una sesión que cumplía todas las condiciones autorizadas:

- actor: `phase002-a-operator@test.invalid`;
- tenant almacenado: Tenant A canónico;
- branch almacenada: A2 canónica;
- A2 ausente de `user_branches` para el actor;
- conteo: `1`.

La eliminación se ejecutó en transacción explícita y abortaba salvo `rows_affected=1`.

- `rows_affected=1`;
- sesiones TEST restantes fuera de mappings tenant/branch: `0`;
- COMMIT: aprobado.

No se leyeron ni mostraron tokens/IDs. No se eliminaron otras sesiones, usuarios, mappings o datos.

## Validación local

| Validación | Resultado |
|---|---|
| `gofmt` en código/pruebas modificados | APROBADO |
| `go test -run '^TestSelectBranch' ./...` | APROBADO |
| `go build -o /private/tmp/skia-phase006-branch-fix .` | APROBADO |
| Gate estático tenant DB, `GO111MODULE=off` | APROBADO: sin hallazgos |
| `git diff --check` | APROBADO |
| Suite completa `go test ./...` | FALLIDO por hallazgo preexistente |

El primer intento del gate estático no ejecutó el análisis porque `go run` intentó resolver `golang.org/x/sys` por red y DNS no estaba disponible. Se repitió de forma local segura con `GO111MODULE=off`, apropiado porque el linter importa solo biblioteca estándar, y aprobó sin hallazgos.

La suite completa conserva el panic preexistente de `TestHandleInventoryImportRoutes_DetailValid`: `db == nil` en `ExtractSessionContextSecure`. Duración aproximada `0.53 s`. El fallo no se ocultó ni se corrigió fuera de alcance.

## Conclusión

La causa raíz y la regresión quedan corregidas localmente; la sesión TEST inválida fue eliminada de forma exacta. No se realizó deploy, cutover, activación RLS ni CAMPAÑA B. Se requiere una nueva decisión arquitectónica antes de desplegar y volver a validar en STAGING.
