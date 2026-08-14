# PHASE-003 — Observed authorization matrix

## Control

Estado: **ETAPA A OBSERVADA + ETAPA B PROPUESTA — NO APROBADA**. La matriz separa controles runtime de catálogo normativo conforme a `ARCHITECT_DECISION_ETAPA_B.md`.

| Operación PHASE-002 | Endpoint | Método | Check observado en código | Permission code efectivo | Restricción tenant | Restricción branch | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Login | `/api/auth/login` | POST | usuario activo + verificación de password | ninguno | memberships devueltos desde `user_tenants` | autoasigna primera branch si hay tenant único | OBSERVADO EN CÓDIGO |
| Identidad propia | `/api/auth/me` | GET | cookie + sesión vigente | ninguno | contexto leído desde sesión | contexto leído desde sesión | OBSERVADO EN CÓDIGO |
| Listar tenants | `/api/auth/tenants` | GET | cookie + sesión vigente | ninguno | JOIN `user_tenants` | no aplica | OBSERVADO EN CÓDIGO |
| Seleccionar tenant | `/api/auth/select-tenant` | POST | membresía exacta en `user_tenants` | ninguno | validación explícita | limpia/actualiza contexto de sesión según implementación | OBSERVADO EN CÓDIGO |
| Seleccionar branch | `/api/auth/select-branch` | POST | branch pertenece al tenant de sesión | ninguno | validación explícita | **no valida `user_branches` en este handler** | OBSERVADO EN CÓDIGO / HALLAZGO |
| Resolver contexto protegido | middleware `RequireTenantTx` | — | `ExtractSessionContextSecure` | ninguno | tenant debe existir y provenir de sesión | exige asociación en `user_branches`; fail-closed | OBSERVADO EN CÓDIGO |
| Listar activos | `/api/dcim/assets` | GET | `RequireTenantTx` + `TenantDB` | ninguno | filtro `tenant_id` | filtro `branch_id` | OBSERVADO EN CÓDIGO |
| Leer activo | `/api/dcim/assets/{id}` | GET | `RequireTenantTx` + `TenantDB` | ninguno | filtro ID + tenant | filtro branch | OBSERVADO EN CÓDIGO |
| Manipular `tenant_id`/`branch_id` en query | `/api/dcim/assets?...` | GET | handler ignora esos parámetros para contexto | ninguno | contexto de sesión | contexto de sesión | OBSERVADO EN CÓDIGO |
| Relaciones/logs | sin endpoint read-only específico detectado | GET | no disponible para la matriz completa | ninguno identificado | no evaluable | no evaluable | BLOQUEADO |
| Logout | `/api/auth/logout` | POST | cookie; elimina token si existe | ninguno | no aplica | no aplica | OBSERVADO EN CÓDIGO |
| Alcance todas las branches | rutas envueltas en `RequireTenantTxScoped` | — | nombre exacto de rol en `globalScopeRoles` | ninguno | tenant de sesión | `admin` activa `branch_scope_all` | OBSERVADO EN CÓDIGO |
| Administración de usuarios | `/api/admin/users` | varios | nombre exacto `admin` | ninguno | tenant de sesión | alcance tenant | OBSERVADO EN CÓDIGO |
| Importar inventario | `/api/import/inventory` | POST | llamada a `validatePermission` | literal `import:inventory:create`, pero función retorna `true` | contexto de sesión | contexto de sesión | OBSERVADO / CHECK INEFECTIVO |

## Códigos de catálogo versus consumo

| Código staging | Encontrado como check efectivo para matriz PHASE-002 | Observación |
| --- | --- | --- |
| `dcim:view` | no | las rutas GET de activos no lo consultan |
| `dcim:asset:create` | no para las operaciones read-only | catálogo declarativo |
| `dcim:asset:edit` | no para las operaciones read-only | catálogo declarativo |
| `dcim:asset:delete` | no para las operaciones read-only | catálogo declarativo |
| `admin:users` | no | `/api/admin/users` comprueba nombre de rol `admin` |
| `admin:roles` | no | no observado como check de la matriz mínima |
| `import:inventory:create` | código sí, catálogo no | check actual inefectivo por `return true` |

## Perfiles solicitados por la fase

| Perfil | Estado tras Etapa A | Evidencia disponible |
| --- | --- | --- |
| `TEST-ADMIN` | BLOQUEADO PARA DEFINICIÓN | nombre `admin` tiene semántica especial, pero su permission set staging está vacío |
| `TEST-OPERATOR` | BLOQUEADO PARA DEFINICIÓN | nombre permitido en código administrativo, inexistente en staging y sin permission set normativo |
| `TEST-MULTI-BRANCH` | BLOQUEADO PARA DEFINICIÓN | debe compartir semántica con operator; la diferencia por `user_branches` sí está demostrada por código |

La Etapa A dejó estos perfiles bloqueados para definición. Las secciones siguientes registran la validación dirigida y la propuesta de Etapa B sin convertirla en aprobación.

## Validación dirigida de `dcim:view`

| Archivo/función | Endpoint afectado | Check runtime | Comportamiento sin permiso | Relación con contexto |
| --- | --- | --- | --- | --- |
| `migrations/002_seed.sql` | ninguno | no; solo inserta catálogo | sin cambio demostrado | ninguna |
| `backend/session_context.go` — `requireSessionContextWithStore` | ninguno de PHASE-002 registrado con esta abstracción | podría comprobar un `requiredPermission` no vacío, pero no recibe `dcim:view` en las rutas auditadas | no aplicable a PHASE-002 | además consulta una abstracción incompatible con staging según P003-A-002 |
| `backend/session_context.go` — `requirePermission` | ninguno de PHASE-002 | helper disponible, sin llamada con `dcim:view` | no aplicable | ninguna ejecución demostrada |
| `backend/dcim_assets.go` — `HandleAssets`, `HandleAssetByID` | `/api/dcim/assets`, `/api/dcim/assets/{id}` | no consulta permission code | el resultado es idéntico con o sin `dcim:view` si sesión/contexto son válidos | usa `RequireTenantTx`, mappings y filtros |

Conclusión: `dcim:view` está **NO ENFORCED** en las rutas de PHASE-002. No es un control de seguridad efectivo actual.

## Capa A — autorización efectiva actual por operación

| Operación / endpoint | SESSION | TENANT_MAPPING | BRANCH_MAPPING | RBAC_PERMISSION | HANDLER_FILTER | RLS | Conclusión |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Login `/api/auth/login` | sí: usuario activo/password; crea sesión | lista memberships y autoasigna tenant único | selecciona una asociación si hay tenant único | no | consulta por email/status | no aplica | control de autenticación; no RBAC |
| Identidad `/api/auth/me` | sí: token vigente | no revalida mapping | no revalida mapping | no | contexto devuelto desde sesión | no aplica | sesión válida basta |
| Listar `/api/auth/tenants` | sí | sí: JOIN `user_tenants` | no aplica | no | limita por user ID | no aplica | tenant filtrado por mapping |
| Seleccionar `/api/auth/select-tenant` | sí | sí: `EXISTS user_tenants` | limpia/actualiza contexto según handler | no | igualdad exacta de tenant solicitado | no aplica | cruce tenant rechazado |
| Seleccionar `/api/auth/select-branch` | sí | indirecto: usa tenant de sesión | **no en el handler** | no | verifica branch pertenece al tenant | no aplica | puede aceptar branch no asignada; acceso posterior debe fallar |
| Resolver `RequireTenantTx` | sí: `ExtractSessionContextSecure` | tenant proviene de sesión y debe existir | sí: JOIN `user_branches`; 0/ambigüedad/no autorizada fallan cerrados | no | fija identidad y contexto de transacción | configurado por transacción, pero no efectivo en staging observado | barrera previa real de rutas protegidas |
| Listar `/api/dcim/assets` | sí, vía middleware | sí, vía contexto | sí, vía contexto | no | `WHERE tenant_id=$1 AND branch_id=$2` | no efectivo en staging observado | aislamiento depende de aplicación/filtro |
| Detalle `/api/dcim/assets/{id}` | sí, vía middleware | sí, vía contexto | sí, vía contexto | no | `WHERE id=$1 AND tenant_id=$2 AND branch_id=$3` | no efectivo en staging observado | aislamiento depende de aplicación/filtro |
| Logout `/api/auth/logout` | cookie opcional; elimina sesión si existe | no aplica | no aplica | no | token exacto | no aplica | revocación de sesión, no RBAC |
| Logs/relationships | no evaluable | no evaluable | no evaluable | no identificado | endpoint GET no localizado | no evaluable | BLOQUEADO |

Para ISO-006/009 y cualquier selección de branch no autorizada, el resultado solo puede evaluarse mediante la secuencia `select-branch → endpoint protegido`; un `2xx` del selector aislado no es aprobación.

## Capa B — catálogo RBAC normativo propuesto

| Perfil | Rol exacto | Conjunto exacto | Enforcement runtime | Diferenciador de alcance | Estado |
| --- | --- | --- | --- | --- | --- |
| `TEST-ADMIN` | `admin` | `{dcim:view}` | `NO ENFORCED` | tenant único + dos `user_branches`; nombre `admin` conserva semántica en rutas scoped | PROPUESTO |
| `TEST-OPERATOR` | `operator` | `{dcim:view}` | `NO ENFORCED` | tenant único + una `user_branches` | PROPUESTO |
| `TEST-MULTI-BRANCH` | `operator` | `{dcim:view}` | `NO ENFORCED` | tenant único + dos `user_branches` | PROPUESTO |

Los permission codes `dcim:asset:create`, `dcim:asset:edit`, `dcim:asset:delete`, `admin:users` y `admin:roles` quedan excluidos. La campaña solo necesita lectura y no autoriza ampliar capacidades.

## Conclusión de Etapa B

**BLOQUEADO.** La matriz dirigida y el baseline exacto propuesto están completos, pero no constituyen aprobación arquitectónica. PHASE-002 y cualquier Etapa C permanecen bloqueadas hasta aprobación explícita del Arquitecto Técnico / Auditor.
