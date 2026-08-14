# ARCHITECT DECISION — PHASE-006 Tenant-wide Authorization and Job Context

## Estado

- Decisión: APROBADA PARA REANUDAR ETAPA C/D.
- Entorno de implementación: LOCAL / rama PHASE-006.
- STAGING: sin cutover, sin cambios de credenciales y sin RLS bajo esta decisión.

## Fundamento

La Etapa A/B de PHASE-006 confirmó que la convergencia a un rol runtime restringido está bloqueada por dos contratos sin resolver: operaciones tenant-wide y ejecución asíncrona. Esta decisión fija ambos contratos sin ampliar privilegios existentes.

## Decisión 1 — `handleClearInventory`

`handleClearInventory` es una operación tenant-wide destructiva. No se autoriza derivar `branch_scope_all` únicamente de `ADMIN_PASSWORD`.

La operación deberá exigir simultáneamente:

1. sesión válida;
2. tenant válido;
3. rol efectivo `admin` dentro del tenant actual, usando la misma semántica de rol global ya existente para `branch_scope_all`;
4. `ADMIN_PASSWORD` válido mientras este segundo factor heredado continúe existiendo;
5. transacción contextual con `app.tenant_id` y `app.branch_scope_all=true`.

Esta decisión **endurece** la autorización actual; no amplía privilegios. Un actor que conozca `ADMIN_PASSWORD` pero no sea `admin` deberá recibir denegación fail-closed. No se elimina ni redefine `ADMIN_PASSWORD` en PHASE-006.

La operación debe continuar limitada al tenant de la sesión y nunca cruzar tenant.

## Decisión 2 — jobs/importaciones/background

Todo trabajo asíncrono que acceda a `assets`, `asset_logs` o `asset_relationships` deberá ejecutar con un contexto explícito e inmutable capturado al crear el job.

Contrato mínimo:

- `tenant_id`: obligatorio;
- `branch_id`: obligatorio para jobs branch-scoped;
- `branch_scope_all`: `false` por defecto;
- `branch_scope_all=true` solo cuando el actor/flujo originador haya sido autorizado explícitamente para alcance tenant-wide por una capacidad ya aprobada;
- nunca inferir tenant-wide por `branch_id` vacío;
- el job debe abrir su propia transacción runtime contextual y ejecutar todos los accesos objetivo dentro de esa transacción;
- workers no pueden usar la conexión migradora ni un rol con BYPASSRLS;
- el contexto capturado no puede ser ampliado durante procesamiento o reintentos.

Para importaciones de inventario que ya conocen tenant y branch, conservar ese alcance branch-scoped. Si un flujo no puede demostrar tenant/branch autorizados, deberá fallar cerrado antes de acceder a tablas objetivo.

## Decisión 3 — separación migrador/runtime

Se aprueba implementar el diseño ya documentado:

- `MIGRATOR_DATABASE_URL`: solo arranque/migraciones y cierre posterior;
- `DATABASE_URL`: pool runtime para stores, handlers y jobs;
- gate de arranque para exigir runtime `NOSUPERUSER`, `NOBYPASSRLS`, sin ownership de tablas objetivo y sin herencia privilegiada cuando se active el modo restringido;
- ningún handler o worker debe conservar referencia al pool migrador.

No se autoriza todavía cambiar las credenciales reales de STAGING.

## Decisión 4 — convergencia de accesos

Codex queda autorizado para migrar los accesos relevantes de `infraestructura.go`, `rack_layout.go`, `inventory_clear_handler.go`, importadores/background y otros hallazgos confirmados sobre las tres tablas objetivo hacia transacciones contextualizadas.

El linter de 221 hallazgos deberá refinarse mediante clasificación/allowlist revisable; no es requisito llevar el número global a cero si los restantes son falsos positivos o tablas fuera del alcance. Sí es requisito que no queden accesos directos no justificados a `assets`, `asset_logs` o `asset_relationships` en rutas/jobs dentro del alcance.

## Pruebas mínimas obligatorias

Antes de declarar Etapa C/D completa:

- `handleClearInventory`: admin + password correcto permitido; no-admin + password correcto denegado; admin + password incorrecto denegado; tenant A nunca borra tenant B;
- contexto branch-scoped de handlers relevantes;
- jobs branch-scoped no ven/escriben otra branch;
- job sin tenant/branch requerido falla cerrado;
- tenant-wide solo con `branch_scope_all=true` explícito y autorizado;
- inicialización con runtime superuser/BYPASSRLS rechazada cuando el gate restringido esté activo;
- migraciones usan únicamente la conexión migradora en pruebas de wiring;
- build Go y pruebas focales aprobadas;
- suite completa reportada sin ocultar fallos preexistentes.

## Autonomía autorizada

Codex puede continuar Etapa C y D, modificar código, agregar pruebas, actualizar documentación, committear y publicar la rama sin pedir aprobación adicional mientras permanezca dentro de esta decisión.

## Límites de detención

Detenerse únicamente si la implementación requiere:

- cambio de esquema, FK o constraints;
- creación/modificación de policies RLS;
- modificación de roles/grants reales de PostgreSQL;
- uso de credenciales reales de STAGING;
- cutover de `DATABASE_URL` en STAGING;
- deploy;
- activación de RLS;
- ampliar privilegios tenant-wide más allá de lo definido aquí.

En cualquiera de esos casos se requiere un gate posterior explícito.