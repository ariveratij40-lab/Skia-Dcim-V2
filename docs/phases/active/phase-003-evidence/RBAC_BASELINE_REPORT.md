# PHASE-003 — RBAC baseline report

## Control de etapa

- Fase: `PHASE-003 — RBAC Baseline & Test Role Definition`.
- Etapa ejecutada: `ETAPA A — AUDITORÍA READ-ONLY`.
- Código auditado: `origin/docs/phase-003-rbac-baseline` (fuente publicada en GitHub).
- Entorno observado: `STAGING`.
- PostgreSQL: `skia_db`, PostgreSQL 16.14, rol efectivo `skia_user`.
- Escrituras, DDL, login HTTP, cambios RLS y deploy: no ejecutados.

## Resultado de Etapa A

**ETAPA A EJECUTADA CON BLOQUEANTES DOCUMENTADOS.**

La evidencia es suficiente para inventariar el baseline actual, pero no existe todavía una definición RBAC aprobable para implementación. PHASE-003 debe continuar por separado con Etapa B; esta auditoría no autoriza escrituras ni resuelve automáticamente los hallazgos.

## OBSERVADO EN STAGING — catálogo efectivo

### Roles y asignaciones

- Roles no globales `admin`: 1.
- Roles `operator`: 0.
- Roles `viewer`: 0.
- El único `admin` pertenece al tenant de prueba `a759321e-bc47-47b8-abe8-dc9e0fe23306`.
- Rol observado: `b42862e2-4391-4e63-95b1-d6c1c508451d`.
- `role_permissions` del rol: 0.
- Usuarios con `user_tenants`: 1.
- Usuarios con `user_branches`: 1, asociado a una sola branch.
- Usuarios con `user_roles`: 1, asignado al único rol `admin`.

### Catálogo de permisos

| Permission code | Módulo | Global | Asignado efectivamente |
| --- | --- | --- | --- |
| `admin:roles` | admin | no | no |
| `admin:users` | admin | no | no |
| `dcim:asset:create` | dcim | no | no |
| `dcim:asset:delete` | dcim | no | no |
| `dcim:asset:edit` | dcim | no | no |
| `dcim:view` | dcim | no | no |

Los seis códigos existen como catálogo histórico, pero ninguno está conectado a un rol mediante `role_permissions`.

### Tablas de autorización

| Tabla | Estado staging | Uso observado en código |
| --- | --- | --- |
| `roles` | presente | resolución por nombre y tenant |
| `permissions` | presente | catálogo; sin consumo efectivo en las rutas mínimas auditadas |
| `role_permissions` | presente, sin filas para el rol actual | modelo declarativo |
| `user_roles` | presente | resolución de nombre de rol |
| `user_tenants` | presente | autorización de tenant |
| `user_branches` | presente | autorización de branch en contexto seguro |
| `sessions` | presente | autenticación y contexto activo |
| `user_permissions` | ausente | consultada por `PostgresSessionStore.LoadPermissions` |
| `user_branch_access` | ausente | consultada por `PostgresSessionStore.UserHasBranchAccess` |

## OBSERVADO EN CÓDIGO — mecanismos efectivos

### Autenticación y contexto

- `POST /api/auth/login` valida usuario/password y crea una sesión PostgreSQL.
- `GET /api/auth/tenants` deriva tenants desde `user_tenants`.
- `POST /api/auth/select-tenant` comprueba explícitamente `user_tenants` antes de actualizar la sesión.
- `POST /api/auth/select-branch` comprueba que la branch pertenezca al tenant de la sesión, pero **no comprueba `user_branches` en ese handler**.
- `ExtractSessionContextSecure` sí valida posteriormente que la branch de la sesión pertenezca al tenant y esté autorizada para el usuario mediante `user_branches`.
- Una sesión sin branch se resuelve únicamente si existe una sola branch autorizada; cero produce rechazo y múltiples requieren selección explícita.
- `GET /api/auth/me` valida token/expiración, pero no exige permission code.
- `POST /api/auth/logout` elimina la sesión; no exige permission code.

### Activos y aislamiento

- `GET /api/dcim/assets` y `GET /api/dcim/assets/{id}` pasan por `RequireTenantTx`.
- `RequireTenantTx` exige sesión válida y tenant; abre una transacción con tenant/branch y proporciona `TenantDB` al handler.
- El listado filtra explícitamente `assets.tenant_id` y `assets.branch_id`.
- El detalle filtra explícitamente por ID, tenant y branch.
- Estas rutas no consultan `permissions.code` ni `role_permissions`.
- El rol `admin` solo recibe alcance multi-branch donde una ruta usa explícitamente `RequireTenantTxScoped`; las rutas de activos auditadas usan `RequireTenantTx`, no la variante scoped.

### Roles por nombre

- `role_scope.go` concede `branch_scope_all` únicamente al nombre exacto `admin` en rutas que usan `RequireTenantTxScoped`.
- `buildSidebar` expone navegación ampliada para nombres `admin` y `super_admin`.
- `/api/admin/users` exige nombre exacto `admin`; su allowlist reconoce `viewer`, `operator` y `admin`.
- Los nombres de rol tienen semántica efectiva independiente del catálogo `permissions`.

### Abstracción de permisos no alineada

- `PostgresSessionStore.LoadRoles` consulta `user_roles.role_name`, columna que no corresponde al modelo staging observado (`user_roles.role_id`).
- `PostgresSessionStore.LoadPermissions` consulta `user_permissions`, tabla ausente.
- `PostgresSessionStore.UserHasBranchAccess` consulta `user_branch_access`, tabla ausente.
- `session_context.go` puede exigir un permission code mediante `requiredPermission`, pero no se observó una ruta mínima PHASE-002 que use esa abstracción.
- El único código de permiso literal encontrado en handlers no-test fue `import:inventory:create`; no existe en el catálogo staging y `validatePermission` retorna actualmente `true` de forma incondicional, por lo que ese check no implementa RBAC efectivo.

## Correlación código/catálogo

1. Para las operaciones mínimas de PHASE-002, el control efectivo actual está formado por sesión + `user_tenants` + `user_branches` + contexto tenant/branch + filtros/RLS, no por el catálogo de seis permisos.
2. El nombre `admin` sí altera comportamiento en rutas concretas; `operator` aparece como nombre permitido en administración, pero no existe en staging.
3. Asignar `dcim:view` a un rol no cambiaría por sí solo las rutas de lectura de activos observadas, porque esas rutas no consultan ese código.
4. Clonar los seis permisos históricos no demostraría semántica efectiva y podría ampliar privilegios sin justificación.

## Estado de PHASE-002

PHASE-002 permanece `BLOQUEADA` para preparación. No existe una pareja fuente real `admin`/`operator` y el modelo efectivo combina checks por nombre con checks de contexto que no están representados fielmente por `role_permissions`.

## Límite de esta evidencia

Este documento no propone todavía el conjunto final de permisos para `TEST-ADMIN`, `TEST-OPERATOR` o `TEST-MULTI-BRANCH`. Esa definición pertenece a Etapa B y requiere revisión arquitectónica antes de cualquier implementación.
