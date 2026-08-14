# PHASE-003 — RBAC Baseline & Test Role Definition

## Estado y control

- Identificador: `PHASE-003`.
- Estado: `ESPECIFICACIÓN`.
- Entorno autorizado: `STAGING`.
- Rama de especificación: `docs/phase-003-rbac-baseline`.
- Origen: bloqueo RBAC detectado por el preflight de PHASE-002.
- Producción: fuera de alcance.

## Objetivo

Establecer un baseline RBAC verificable para SKIA staging y definir de forma explícita, mínima y reproducible la semántica de los roles necesarios para las pruebas de aislamiento multi-tenant y multi-branch de PHASE-002, sin inventar privilegios ni ampliar autorizaciones por inferencia.

PHASE-003 debe determinar qué permisos y alcances corresponden a los actores administrativos, operadores limitados por sucursal y operadores multi-branch utilizados exclusivamente para validación controlada en staging.

## Baseline de entrada

El preflight de PHASE-002 quedó `BLOQUEADO` antes de cualquier escritura porque:

- no existe un rol real `operator`;
- el único rol real `admin` observado tiene cero permisos;
- no existe una pareja completa `admin`/`operator` que pueda utilizarse como fuente RBAC;
- no puede determinarse una fuente segura de permisos sin inventar o ampliar privilegios.

El mismo preflight confirmó, sin escritura:

- base `skia_db`;
- PostgreSQL 16.14;
- tablas y FKs requeridas por PHASE-002 compatibles;
- asset type `NODE` disponible;
- ausencia de colisiones con fixtures `TEST-*`;
- PHASE-002 permanece bloqueada únicamente hasta resolver su precondición RBAC y cualquier otro bloqueante que esta fase descubra.

## Principios obligatorios

1. Denegación por defecto.
2. Mínimo privilegio.
3. Separación tenant/branch explícita.
4. Ningún permiso se asigna por similitud de nombre, patrones `LIKE`, intuición o conveniencia de pruebas.
5. Los permisos deben derivarse del comportamiento autorizado de SKIA y de los recursos/endpoints que cada actor necesita utilizar.
6. Los roles de prueba no deben convertirse en una puerta trasera ni en roles globales.
7. Ninguna decisión de PHASE-003 autoriza cambios de RLS.
8. Ninguna decisión de PHASE-003 autoriza producción.

## Alcance autorizado

### 1. Inventario RBAC read-only

Inventariar:

- `roles`;
- `permissions`;
- `role_permissions`;
- `user_roles`;
- `user_tenants`;
- `user_branches`;
- cualquier tabla o campo directamente utilizado por la autorización actual.

Registrar IDs únicamente cuando sean necesarios para evidencia técnica y no sean secretos.

### 2. Trazado código → permiso

Revisar el repositorio canónico para identificar:

- checks RBAC reales del backend;
- middleware/handlers de autorización;
- códigos de permiso realmente consultados;
- rutas críticas utilizadas por PHASE-002;
- relación entre rol, tenant, branch y sesión.

No asumir que un permiso existe o es efectivo solamente porque aparezca en una migración o catálogo histórico.

### 3. Matriz recurso/acción

Construir una matriz explícita para las operaciones mínimas requeridas por CAMPAÑA A de PHASE-002, incluyendo como mínimo:

- autenticación y lectura de identidad propia;
- listado/selección de tenants autorizados;
- listado/selección de branches autorizadas;
- lectura de activos;
- lectura de activos por branch/contexto;
- cualquier endpoint de relaciones realmente disponible;
- logout/sesión cuando corresponda.

Para cada operación registrar:

- endpoint/recurso;
- método;
- check de autorización observado;
- permission code requerido, si existe;
- restricción tenant;
- restricción branch;
- actor mínimo que debe poder ejecutarla.

### 4. Definición de perfiles mínimos de prueba

Definir semánticamente tres perfiles:

#### `TEST-ADMIN`

Administrador limitado a un solo tenant de prueba, con acceso únicamente a las operaciones necesarias para validar el comportamiento administrativo previsto dentro de ese tenant.

No debe ser global ni obtener acceso a otros tenants.

#### `TEST-OPERATOR`

Operador limitado a un tenant y una branch, con permisos mínimos para las operaciones de lectura necesarias por la matriz PHASE-002.

No debe obtener acceso a otra branch por el rol.

#### `TEST-MULTI-BRANCH`

Debe reutilizar exactamente la misma semántica de permisos que `TEST-OPERATOR` y diferenciarse únicamente mediante sus asociaciones explícitas en `user_branches`.

No debe recibir permisos adicionales para conseguir acceso multi-branch.

### 5. Fuente normativa de permisos

PHASE-003 debe producir una definición explícita y revisable de los `permission_id`/permission codes de cada perfil.

La fuente puede ser:

- semántica existente demostrada por código y catálogo actual; o
- una propuesta mínima documentada cuando el sistema carezca de roles correctamente inicializados.

Toda propuesta nueva debe justificar cada permiso individualmente contra una operación requerida. No se permiten conjuntos amplios como `all non-global permissions`.

### 6. Compatibilidad con PHASE-002

Determinar exactamente qué cambios necesita el tooling PHASE-002 para consumir el baseline RBAC aprobado.

Preferencia arquitectónica:

- PHASE-003 define el baseline y, si se autoriza posteriormente implementación, lo deja reproducible;
- PHASE-002 consume esa definición sin inferir permisos.

## Ejecución por etapas

### Etapa A — Auditoría read-only

Autorizada por esta especificación una vez aprobada la fase:

- inspección del código;
- SELECTs read-only necesarios para inventariar RBAC staging;
- correlación código/catálogo;
- generación de evidencia redactada.

No autoriza INSERT/UPDATE/DELETE/DDL.

### Etapa B — Propuesta RBAC

Crear la matriz de permisos y perfiles mínimos. Debe someterse a revisión del Arquitecto Técnico/Auditor antes de cualquier escritura.

### Etapa C — Implementación RBAC de staging

No queda autorizada automáticamente por esta especificación.

Solo podrá ejecutarse después de aprobación explícita de la matriz propuesta y debe limitarse al mecanismo aprobado para staging/test fixtures.

## Fuera de alcance

- Habilitar, deshabilitar o modificar RLS.
- Corregir migraciones históricas no necesarias para este objetivo.
- Reestructurar autenticación.
- Crear roles globales.
- Conceder permisos a usuarios reales para facilitar pruebas.
- Modificar datos empresariales existentes.
- Resolver la divergencia GitHub/VPS.
- Ejecutar PHASE-002 CAMPAÑA A antes de aprobar el baseline RBAC.
- Producción, `skia.mx`, deploy productivo o datos productivos.

## Seguridad

- No registrar passwords, hashes reutilizables, tokens, cookies ni session IDs completos.
- No modificar el usuario real existente durante la auditoría.
- No reutilizar sesiones históricas.
- Los futuros actores PHASE-002 deben seguir siendo temporales y ficticios.
- Toda escritura futura debe ser determinista, reversible y limitada a staging.

## Criterios de aceptación

PHASE-003 puede aprobarse cuando:

1. existe inventario verificable del RBAC efectivo;
2. se identifican los checks de autorización reales para las operaciones PHASE-002;
3. existe matriz recurso/acción/permiso/tenant/branch;
4. `TEST-ADMIN`, `TEST-OPERATOR` y `TEST-MULTI-BRANCH` tienen semántica explícita;
5. cada permiso propuesto está justificado individualmente;
6. no se utilizan inferencias amplias ni permisos globales;
7. se documenta cómo PHASE-002 consumirá el baseline;
8. cualquier incompatibilidad queda `BLOQUEADA` y visible;
9. no se realizaron cambios de RLS ni producción;
10. la evidencia fue revisada antes de autorizar cualquier escritura RBAC.

## Evidencia requerida

Crear bajo `docs/phases/active/phase-003-evidence/` como mínimo:

- `RBAC_BASELINE_REPORT.md`;
- `RBAC_PERMISSION_MATRIX.md`;
- `BLOCKERS.md` cuando existan bloqueantes.

La evidencia debe distinguir claramente:

- `OBSERVADO EN CÓDIGO`;
- `OBSERVADO EN STAGING`;
- `PROPUESTO`;
- `APROBADO`;
- `BLOQUEADO`.

## Relación con PHASE-002

PHASE-002 permanece bloqueada para preparación mientras no exista un baseline RBAC aprobado.

Después de aprobar PHASE-003:

1. adaptar el tooling PHASE-002 únicamente si es necesario para consumir la definición RBAC aprobada;
2. repetir PREFLIGHT read-only;
3. exigir resultado `APROBADO PARA PREPARACIÓN`;
4. solo entonces solicitar autorización para crear fixtures y ejecutar CAMPAÑA A.

## Rollback

La Etapa A no modifica datos y no requiere rollback.

Si posteriormente se autoriza una implementación RBAC en staging, deberá existir antes de la escritura:

- manifest exacto de registros creados/modificados;
- snapshot lógico de valores previos cuando exista modificación;
- checksum externo;
- procedimiento de rollback por IDs exactos;
- postcheck que demuestre restauración del estado previo.

No se autoriza rollback basado únicamente en nombres o prefijos.

## Riesgos

- El catálogo `permissions` puede contener entradas históricas que ya no correspondan al código actual.
- El backend puede aplicar parte de la autorización por filtros/contexto y no exclusivamente por permission codes.
- Crear un rol demasiado amplio produciría falsos positivos en PHASE-002.
- Crear un rol demasiado limitado podría producir falsos negativos y confundir autorización con aislamiento.
- La divergencia del checkout VPS obliga a tratar GitHub como fuente de verdad del código y staging como fuente de verdad del comportamiento operativo observado.

## Entregables

- Baseline RBAC efectivo.
- Matriz de permisos mínima para pruebas.
- Definición formal de perfiles TEST.
- Hallazgos/bloqueantes.
- Recomendación explícita: `APROBADO PARA IMPLEMENTACIÓN RBAC DE STAGING` o `BLOQUEADO`.

## Registro de cierre

- Identificador: `PHASE-003`.
- Rama utilizada: pendiente.
- SHA aprobado: pendiente.
- Fecha de aprobación: pendiente.
- Auditoría read-only: pendiente.
- Matriz RBAC: pendiente.
- Resultado: pendiente.
- Pendientes: pendiente.
