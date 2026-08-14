# PHASE-003 — Decisión del Arquitecto sobre Etapa B

## Estado

- Etapa A: `APROBADA` como auditoría read-only.
- Etapa B: `REQUIERE VALIDACIÓN DIRIGIDA` antes de aprobar la propuesta RBAC.
- Etapa C: `NO AUTORIZADA`.
- PHASE-002: continúa `BLOQUEADA` para preparación de fixtures.

## Decisión

La propuesta de perfiles `TEST-ADMIN`, `TEST-OPERATOR` y `TEST-MULTI-BRANCH` es conceptualmente correcta en separación de alcance:

- `TEST-ADMIN`: tenant de prueba, dos branches.
- `TEST-OPERATOR`: tenant de prueba, una branch.
- `TEST-MULTI-BRANCH`: misma semántica de permisos que operator, dos asociaciones `user_branches`.

Sin embargo, no se aprueba todavía usar `{dcim:view}` como baseline normativo hasta demostrar en el código canónico si ese permission code participa realmente en la autorización de las rutas usadas por PHASE-002.

La Etapa A observó que la autorización efectiva depende principalmente de sesión, tenant, branch, mappings y filtros contextuales, mientras el catálogo RBAC de staging no está actualmente gobernando esas rutas de forma demostrada.

## Validación dirigida requerida

Codex debe completar únicamente análisis local/read-only y, cuando sea necesario, consultas PostgreSQL read-only. No se autoriza ninguna escritura.

### 1. Trazar `dcim:view`

Buscar todas las referencias reales a `dcim:view` y determinar:

- archivo/función;
- endpoint o handler afectado;
- si el check se ejecuta en runtime;
- comportamiento cuando el usuario no tiene ese permiso;
- relación con tenant/branch/contexto.

Si `dcim:view` no gobierna efectivamente las rutas PHASE-002, no debe presentarse como control de seguridad efectivo.

### 2. Trazar rutas PHASE-002

Para cada operación mínima de la matriz PHASE-002, registrar el mecanismo real de autorización:

- `/api/auth/me`;
- selección/listado de tenants;
- selección/listado de branches;
- `/api/dcim/assets` y detalle de activo;
- logout;
- cualquier ruta adicional realmente usada por ISO-001..ISO-022.

Clasificar cada control observado como:

- `SESSION`;
- `TENANT_MAPPING`;
- `BRANCH_MAPPING`;
- `RBAC_PERMISSION`;
- `HANDLER_FILTER`;
- `RLS`;
- `NO CONTROL OBSERVADO`.

### 3. Definir baseline en dos capas

La propuesta final debe separar explícitamente:

**Capa A — autorización efectiva actual**

Controles realmente utilizados hoy por el backend: sesión, tenant, branch, mappings, filtros y cualquier permission check demostrado.

**Capa B — catálogo RBAC normativo**

Rol/permisos que se registran para consistencia de modelo. Si un permiso no es consultado por el runtime, debe quedar marcado `NO ENFORCED` y no puede contarse como barrera de seguridad.

### 4. Revisar perfiles

Aprobar o corregir los perfiles propuestos según la evidencia:

- `TEST-ADMIN` no puede recibir capacidades de escritura si PHASE-002 solo necesita lectura.
- `TEST-OPERATOR` debe tener exactamente la misma capacidad funcional de lectura necesaria, limitada por una sola branch.
- `TEST-MULTI-BRANCH` debe ser idéntico a operator en permisos y diferir solo por `user_branches`.

### 5. Resultado obligatorio

Actualizar `RBAC_PROFILE_PROPOSAL.md` y `RBAC_PERMISSION_MATRIX.md` con una conclusión explícita:

- `APROBADO PARA IMPLEMENTACIÓN RBAC DE STAGING`, o
- `BLOQUEADO`.

Si se aprueba, debe quedar definido el baseline exacto que PHASE-002 consumirá, sin inferencias y sin depender de roles existentes vacíos.

## Restricciones

- NO ejecutar Etapa C.
- NO INSERT/UPDATE/DELETE/DDL.
- NO modificar usuarios, roles, permissions ni mappings.
- NO modificar RLS.
- NO ejecutar fixtures.
- NO deploy.
- NO usar producción.
- NO corregir `PostgresSessionStore` dentro de PHASE-003; registrar como hallazgo/fase separada.
