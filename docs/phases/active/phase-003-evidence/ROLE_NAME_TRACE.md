# PHASE-003 — Runtime role-name trace

## Control

- Alcance: traza local/read-only requerida por `ARCHITECT_DECISION_ROLE_NAME_TRACE.md`.
- Código canónico auditado: `d2e9c3519a18915ab3867d6526f0d1100559bd16`.
- Diferencia posterior publicada en la rama remota: únicamente las dos decisiones arquitectónicas de Etapa B; no hay cambios de código entre ese SHA y la referencia remota auditada.
- Escrituras, SQL, HTTP staging, fixtures, RLS y deploy: no ejecutados.

## Conclusión

`ROLE_NAME` está **PARTIALLY ENFORCED** en el backend.

- Para las rutas mínimas de PHASE-002, `ROLE_NAME` está **NOT ENFORCED**: login, identidad, tenant, branch, listado/detalle de activos y logout no comparan nombres de rol.
- Fuera de esa matriz, el nombre exacto `admin` sí cambia autorización o alcance efectivo.
- `operator` y `viewer` aparecen como nombres permitidos para asignación administrativa, pero no se encontró un bypass o ampliación runtime para un actor que tenga esos nombres.
- `super_admin` solo altera la respuesta del sidebar; no se observó como bypass backend de datos o administración.
- Las comparaciones observadas son exactas y sensibles a mayúsculas/minúsculas; no se encontraron variantes de case normalizadas, constantes/enums equivalentes ni comodines.

## Comparaciones backend relevantes

| Nombre | Archivo / función | Ruta o recurso | Efecto runtime | Clasificación |
| --- | --- | --- | --- | --- |
| `admin` | `backend/role_scope.go` — `globalScopeRoles`, `resolveUserRole`, `RequireTenantTxScoped` | actualmente `/api/ai/chat` | activa `app.branch_scope_all=true`; amplía de branch activa a todas las branches del tenant | `ROLE_NAME — ENFORCED` |
| `admin` | `backend/dashboard.go` — `handleDashboardStats` | dashboard | activa alcance de todas las branches para consultas de activos del tenant | `ROLE_NAME — ENFORCED` |
| `admin` | `backend/config_admin.go` — `handleAdminUsers` | `/api/admin/users` y subrutas | cualquier nombre distinto recibe `403`; `admin` puede leer/modificar membresías y roles del tenant | `ROLE_NAME — ENFORCED` |
| `admin`, `super_admin` | `backend/main.go` — `buildSidebar` | `/api/navigation/sidebar` | agrega navegación de infraestructura/administración | `ROLE_NAME — UI/RESPONSE ONLY`; no demuestra autorización de los endpoints |
| `viewer`, `operator`, `admin` | `backend/config_admin.go` — `adminUserRoles`, `resolveRoleID` | cuerpo de PUT `/api/admin/users/{id}` | allowlist de nombres que un actor `admin` puede asignar; no concede capacidades al actor por sí misma | `ROLE_NAME — TARGET VALIDATION` |
| `admin` | `backend/main.go` y `backend/google_oauth.go` — registro/onboarding | creación de tenant | nombre sembrado/asignado durante alta; no es una comparación de autorización | `NOT ENFORCEMENT` |

No se encontraron llamadas no-test adicionales a `RequireTenantTxScoped`: la única ruta registrada actualmente es `/api/ai/chat`. `GET /api/dcim/assets` y su detalle usan `RequireTenantTx`, no la variante scoped.

## Frontend

| Ubicación | Uso del nombre | Clasificación |
| --- | --- | --- |
| `frontend/pages/administracion/index.tsx` | etiquetas, colores, conteos y opciones de edición de rol | presentación/entrada de UI; no enforcement |
| `frontend/components/AppLayout.tsx` | navegación estática incluye administración para cualquier UI montada | no hay guard por rol; no enforcement |
| respuesta backend `buildSidebar` | oculta/muestra elementos por `admin`/`super_admin` | control visual; no sustituye autorización server-side |

Solo los checks backend se consideran enforcement.

## Rutas PHASE-002

| Ruta / operación | SESSION | TENANT_MAPPING | BRANCH_MAPPING | ROLE_NAME | RBAC_PERMISSION | HANDLER_FILTER | RLS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `POST /api/auth/login` | sí | consulta memberships | autoasigna una asociación cuando aplica | `NOT ENFORCED` | no | usuario activo/email | no aplica |
| `GET /api/auth/me` | sí | no revalida | no revalida | `NOT ENFORCED` | no | sesión vigente | no aplica |
| `GET /api/auth/tenants` | sí | sí | no aplica | `NOT ENFORCED` | no | filtra por user ID | no aplica |
| `POST /api/auth/select-tenant` | sí | sí, exacto | actualiza contexto | `NOT ENFORCED` | no | tenant solicitado | no aplica |
| `POST /api/auth/select-branch` | sí | tenant de sesión | no valida mapping en el handler | `NOT ENFORCED` | no | branch debe pertenecer al tenant | no aplica |
| `RequireTenantTx` / contexto protegido | sí | tenant de sesión | sí, `user_branches` | `NOT ENFORCED` | no | fija contexto transaccional | configurado, pero no efectivo en staging observado |
| `GET /api/dcim/assets` | vía middleware | vía contexto | vía contexto | `NOT ENFORCED` | `dcim:view` es `NO ENFORCED` | tenant + branch | no efectivo en staging observado |
| `GET /api/dcim/assets/{id}` | vía middleware | vía contexto | vía contexto | `NOT ENFORCED` | `dcim:view` es `NO ENFORCED` | ID + tenant + branch | no efectivo en staging observado |
| `POST /api/auth/logout` | cookie opcional | no aplica | no aplica | `NOT ENFORCED` | no | token exacto | no aplica |
| logs/relationships | no evaluable | no evaluable | no evaluable | no evaluable | no identificado | endpoint GET no localizado | no evaluable |

## Consecuencia para perfiles TEST

La propuesta previa utilizaba el nombre exacto `admin` para `TEST-ADMIN`. Ese nombre concedería capacidades no requeridas por PHASE-002:

- administración de usuarios/roles del tenant mediante `/api/admin/users`;
- alcance multi-branch implícito en dashboard;
- alcance multi-branch implícito en `/api/ai/chat`.

Aunque las credenciales de campaña deban limitarse a la matriz aprobada, asignar ese nombre ampliaría técnicamente su capacidad y contradiría mínimo privilegio. Las dos branches necesarias ya pueden expresarse mediante `user_branches`; las rutas de activos no necesitan el bypass nominal.

Recomendación para revisión arquitectónica:

1. no usar los nombres runtime especiales `admin` ni `super_admin` para los actores PHASE-002;
2. utilizar nombres deterministas y no especiales, por ejemplo `phase002_test_admin` y `phase002_test_operator`;
3. asignar `phase002_test_operator` tanto a `TEST-OPERATOR` como a `TEST-MULTI-BRANCH`;
4. mantener `{dcim:view}` exclusivamente como catálogo normativo `NO ENFORCED`;
5. diferenciar todos los alcances mediante `user_tenants` y `user_branches`;
6. hacer que el preflight bloquee si cualquiera de los nombres TEST aparece en una allowlist, mapa de bypass o comparación runtime antes de cada campaña.

Esta recomendación corrige el riesgo de nombre, pero todavía es `PROPUESTA`; no modifica la decisión arquitectónica aprobada ni autoriza adaptar PHASE-002.

## Estado

- Traza read-only: `EJECUTADA`.
- Clasificación global: `ROLE_NAME — PARTIALLY ENFORCED`.
- Rutas mínimas PHASE-002: `ROLE_NAME — NOT ENFORCED`.
- Baseline normativo `{dcim:view}`: `NO ENFORCED`.
- Etapa C: `NO AUTORIZADA`.
- PHASE-002: `BLOQUEADA` hasta que el Arquitecto Técnico / Auditor resuelva los nombres de rol y autorice cualquier adaptación.
