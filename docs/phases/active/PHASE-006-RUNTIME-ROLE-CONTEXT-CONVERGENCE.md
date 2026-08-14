# PHASE-006 — Runtime Role & Tenant Context Convergence

## Estado

- Identificador: `PHASE-006`.
- Estado: `ESPECIFICACIÓN`.
- Entorno autorizado: `STAGING`.
- Rama de especificación: `docs/phase-006-runtime-role-context`.
- Fase origen: `PHASE-005`.
- Baseline de evidencia: `c47c2e4ba2165557da5d381952dee4cfac50a938`.
- Backend runtime observado: `01efd5099758d8ad85fc4bcdf4720c5e23e59270`.

## Objetivo

Eliminar los bloqueantes estructurales que impiden aplicar RLS de forma efectiva, separando inequívocamente la identidad de runtime de la identidad propietaria/migradora y convergiendo todos los accesos a `assets`, `asset_logs` y `asset_relationships` hacia un mecanismo explícito de contexto tenant/branch compatible con un rol PostgreSQL sin `BYPASSRLS`.

Esta fase no activa RLS. Su propósito es dejar el backend preparado para que PHASE-005 pueda retomar Etapa C de manera segura y reproducible.

## Decisiones arquitectónicas vinculantes

1. **Separación de identidades DB**
   - El runtime HTTP no debe usar `skia_user` ni ningún rol `SUPERUSER`/`BYPASSRLS`.
   - El candidato runtime es `skia_runtime`, sujeto a validación de grants mínimos.
   - Migraciones/DDL deben ejecutarse por una identidad separada del runtime.
   - El runtime no debe heredar roles con `BYPASSRLS`, ownership ni privilegios DDL innecesarios.

2. **Separación de conexiones**
   - El proceso backend debe disponer conceptualmente de dos capacidades separadas:
     - conexión migradora/administrativa usada exclusivamente durante arranque/migración;
     - pool runtime usado por handlers/jobs después del arranque.
   - No se permite ejecutar migraciones usando el pool runtime restringido.

3. **Contexto obligatorio para tablas protegidas**
   - Todo acceso runtime a `assets`, `asset_logs` y `asset_relationships` debe ocurrir mediante una transacción/contexto explícito que establezca `app.tenant_id` y, cuando aplique, `app.branch_id`.
   - El alcance tenant-wide/multi-branch debe ser explícito; no se infiere por ausencia de branch.
   - `branch_scope_all` solo puede activarse por una decisión/autorización de aplicación explícita y auditada.

4. **Sin bypass por comodidad**
   - No se autoriza usar `SET ROLE` hacia un rol privilegiado desde handlers normales.
   - No se autoriza introducir un segundo runtime con `BYPASSRLS` para rutas difíciles de adaptar.
   - Jobs y operaciones tenant-wide deben recibir un contexto definido, no escapar de RLS.

## Alcance autorizado

### Etapa A — Inventario exacto y clasificación

- Ejecutar el linter existente y convertir los hallazgos relevantes en una matriz por archivo/función/ruta.
- Clasificar cada acceso a tablas objetivo como:
  - `CONTEXT_OK`;
  - `NEEDS_TENANT_TX`;
  - `NEEDS_SCOPED_TX`;
  - `JOB_CONTEXT_REQUIRED`;
  - `MIGRATION_ONLY`;
  - `FALSE_POSITIVE`.
- Identificar todas las rutas HTTP y jobs que usan las tres tablas objetivo.
- Identificar cómo se inicializa hoy `db`, dónde se ejecuta `runMigrations(db)` y qué dependencias usan el objeto global.

### Etapa B — Diseño de separación migrador/runtime

- Diseñar variables/configuración separadas para conexión migradora y runtime sin versionar secretos.
- Mantener compatibilidad con STAGING y rollback de configuración.
- Definir comportamiento fail-closed si falta la conexión runtime restringida.
- Probar localmente que el backend no inicia en modo runtime inseguro cuando el gate de seguridad lo exige.
- No cambiar todavía credenciales reales del VPS.

### Etapa C — Convergencia de acceso contextual

- Adaptar los accesos relevantes de runtime a `RequireTenantTx`, `RequireTenantTxScoped`, `BeginTenantTx` o abstracción equivalente revisada.
- Evitar reescrituras amplias: cambiar solo las rutas/tablas necesarias para habilitar posteriormente RLS.
- Para operaciones tenant-wide, exigir alcance explícito y pruebas que demuestren que no se convierte en bypass cross-tenant.
- Para jobs sin request HTTP, introducir un mecanismo explícito de contexto tenant/branch con entrada validada.
- Mantener la semántica funcional observada en CAMPAÑA A.

### Etapa D — Validación local con rol restringido simulado/controlado

- Ejecutar pruebas unitarias/integración local cuando sea posible usando semántica equivalente a `skia_runtime`.
- Validar que las rutas principales no dependen de ownership, superuser o `BYPASSRLS`.
- Convertir el linter a gate: cero hallazgos no clasificados/relevantes en tablas objetivo.
- Registrar falsos positivos mediante allowlist explícita y revisada, no por exclusión global.

## Política para `asset_logs` y `asset_relationships`

PHASE-006 debe producir una decisión formal antes de cualquier Etapa C de PHASE-005:

- `asset_logs` debe ser branch-scoped por herencia del activo asociado, salvo evidencia funcional que justifique tenant-wide.
- `asset_relationships` debe impedir relaciones o visibilidad cross-branch no autorizadas; source y target deben evaluarse según el modelo de autorización aprobado.
- Si garantizar esta semántica requiere cambiar esquema o constraints, PHASE-006 debe detenerse y proponer una fase de modelo de datos separada. No debe realizar ese cambio por inferencia.

## Pruebas mínimas

- Runtime role candidate: `NOSUPERUSER`, `NOBYPASSRLS`, sin ownership de tablas objetivo.
- Migraciones se ejecutan por conexión separada o mecanismo claramente distinto del runtime.
- Listado/detalle/creación de activos conserva comportamiento esperado con contexto explícito.
- A-OPERATOR no obtiene alcance A2.
- A-MULTI conserva acceso A1/A2 según mappings.
- Operaciones tenant-wide autorizadas no atraviesan tenant.
- Accesos sin contexto a tablas objetivo fallan en pruebas controladas, no silenciosamente.
- Linter/gate sin hallazgos relevantes no clasificados.
- `go build` aprobado.
- Pruebas específicas aprobadas.
- Suite completa: reportar cualquier fallo preexistente sin ocultarlo.

## Fuera de alcance

- Activar RLS en STAGING.
- Modificar policies efectivas en PostgreSQL.
- Modificar esquema, FKs o migraciones históricas.
- Rotar/eliminar credenciales existentes salvo una fase/gate posterior de cutover.
- Deploy a producción.
- Merge a `main`.

## Autonomía de Codex

Codex puede avanzar autónomamente por Etapas A, B, C y D, incluyendo cambios de código, pruebas, commits y push en su rama de trabajo, siempre que permanezca dentro de esta especificación.

Debe detenerse si descubre que la convergencia requiere:

- cambio de esquema o constraints;
- cambio de semántica global de roles/privilegios;
- habilitar RLS;
- modificar credenciales reales de STAGING;
- deploy/cutover del runtime DB;
- una operación destructiva.

## Criterio de aceptación

PHASE-006 queda lista para cierre cuando:

- exista separación implementada y probada entre migrador y runtime;
- el runtime pueda operar con una identidad sin `BYPASSRLS`;
- todos los accesos runtime relevantes a tablas objetivo tengan contexto explícito o clasificación justificada;
- logs/relaciones tengan una decisión formal de scope;
- el linter no reporte hallazgos relevantes sin resolver;
- build y pruebas específicas estén aprobados;
- no se haya activado RLS todavía.

Al cumplir estos criterios, PHASE-005 podrá reanudar Etapa C para cutover controlado del rol runtime y activación RLS en STAGING, seguida de CAMPAÑA B.