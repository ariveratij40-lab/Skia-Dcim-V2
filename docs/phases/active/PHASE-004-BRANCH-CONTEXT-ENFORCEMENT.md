# PHASE-004 — Branch Context Authorization Remediation

## Estado y control

- Identificador: `PHASE-004`.
- Estado: `ESPECIFICACIÓN`.
- Entorno autorizado: `STAGING`.
- Rama de especificación: `docs/phase-004-branch-context-enforcement`.
- Origen: hallazgo confirmado en CAMPAÑA A de PHASE-002.
- Producción: fuera de alcance.

## Objetivo

Corregir la autorización de selección de sucursal para impedir que un usuario autenticado establezca en su sesión una `branch` para la cual no posee asociación válida en `user_branches`, preservando el modelo multi-tenant existente y evitando ampliaciones de privilegio por nombre de rol.

## Hallazgo confirmado de entrada

CAMPAÑA A de PHASE-002 demostró que el actor lógico `A-OPERATOR`, asociado únicamente a la branch A1, recibió HTTP `200` al seleccionar A2. La correlación PostgreSQL read-only confirmó una sesión activa con contexto A2 y un conteo de `1` sesión con branch fuera de `user_branches`.

No se confirmó fuga de datos A2 porque no se consultaron activos después de esa mutación. El hallazgo es, por sí mismo, una falla de autorización de contexto y debe corregirse antes de continuar con pruebas de aislamiento.

## Principios obligatorios

1. Fail-closed ante una branch no autorizada.
2. La selección de branch debe validar pertenencia explícita del usuario a `user_branches` dentro del tenant de sesión.
3. No conceder bypass por nombre de rol `admin`, `operator`, `viewer` o `super_admin` salvo una decisión arquitectónica independiente y explícita.
4. La validación debe ocurrir antes de persistir o devolver exitosamente el nuevo contexto de sesión.
5. La corrección no debe depender de RLS para impedir la mutación inválida.
6. No ampliar permisos RBAC normativos para resolver el fallo.
7. No modificar producción.

## Alcance autorizado

### Etapa A — Root-cause trace read-only

- Identificar el handler exacto de `/api/auth/select-branch`.
- Trazar la función que valida tenant, usuario, branch y sesión.
- Identificar dónde se escribe `branch_id` en la sesión persistente.
- Verificar si existe un check reutilizable de `user_branches` y por qué no se aplica en esta ruta.
- Identificar pruebas unitarias/integración existentes para selección de branch.
- Documentar si otros endpoints pueden mutar `branch_id` sin el mismo control.

### Etapa B — Corrección mínima

Después de documentar la causa, implementar únicamente la corrección mínima para que `/api/auth/select-branch`:

- rechace branch inexistente o fuera del tenant autorizado;
- rechace branch del mismo tenant si el usuario no está asociado mediante `user_branches`, salvo una semántica global explícitamente demostrada por código y aprobada;
- conserve el contexto anterior de sesión cuando la selección sea rechazada;
- devuelva código HTTP fail-closed coherente (`403` preferido para branch existente pero no autorizada, `404` solo si la política actual oculta existencia de recursos);
- no filtre IDs o detalles internos innecesarios.

### Etapa C — Pruebas

Agregar/actualizar pruebas para, como mínimo:

1. usuario con A1 selecciona A1 → permitido;
2. usuario con A1 intenta A2 → denegado;
3. usuario con A1 intenta branch B1 de otro tenant → denegado;
4. usuario con A1+A2 selecciona ambas → permitido;
5. selección denegada no muta `branch_id` de la sesión;
6. ausencia de sesión → denegado;
7. tenant/contexto inválido → denegado.

## Fuera de alcance

- Habilitar o modificar RLS.
- Corregir toda la autorización multi-tenant del sistema.
- Cambiar esquema de base de datos salvo que una incompatibilidad crítica impida la corrección y se documente una nueva decisión.
- Reescribir migraciones históricas.
- Cambiar RBAC normativo `dcim:view`.
- Modificar Nginx, DNS o dominios.
- Ejecutar CAMPAÑA B.
- Deploy productivo.

## Validación y evidencia

Crear bajo `docs/phases/active/phase-004-evidence/`:

- `ROOT_CAUSE_REPORT.md`;
- `BRANCH_AUTH_TEST_MATRIX.md`;
- `IMPLEMENTATION_REPORT.md` cuando exista corrección;
- `BLOCKERS.md` cuando aplique.

Clasificar cada validación como `APROBADO`, `FALLIDO`, `BLOQUEADO` o `NO EJECUTADO`.

## Gate de implementación

Esta especificación autoriza Etapa A read-only. La Etapa B puede implementarse sin nueva aprobación si la causa queda confinada a la ruta de selección de branch y la corrección no requiere cambios de esquema, RLS, arquitectura ni permisos globales.

Si la causa requiere modificar sesiones de forma estructural, esquema, RLS, arquitectura o semántica global de roles, detenerse y solicitar nueva decisión arquitectónica antes de escribir.

## Gate de staging

Después de pruebas locales aprobadas, se podrá preparar una validación controlada en staging. Ningún deploy queda autorizado por esta especificación; cualquier actualización del runtime staging requiere autorización separada y trazabilidad SHA explícita.

## Relación con PHASE-002

PHASE-002 queda bloqueada para continuar con aislamiento hasta resolver esta falla y repetir la parte relevante de CAMPAÑA A contra un runtime corregido.

Los fixtures actuales no deben eliminarse todavía; permanecen como datos de prueba controlados mientras se preserve el manifest y no exista autorización de rollback.

## Criterios de aceptación

PHASE-004 puede considerarse técnicamente completada cuando:

- la causa raíz está documentada;
- la ruta de selección de branch aplica autorización explícita por mapping;
- una selección no autorizada no muta sesión;
- las pruebas locales cubren escenarios positivos y negativos;
- no se introducen bypasses por nombre de rol;
- el cambio está versionado y revisado;
- staging puede ser validado posteriormente mediante una autorización separada.
