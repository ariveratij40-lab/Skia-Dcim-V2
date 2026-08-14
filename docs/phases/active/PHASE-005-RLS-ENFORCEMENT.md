# PHASE-005 — PostgreSQL RLS Enforcement & Defense in Depth

## Estado y control

- Identificador: `PHASE-005`.
- Estado: `ESPECIFICACIÓN`.
- Entorno autorizado: `STAGING`.
- Rama de especificación: `docs/phase-005-rls-enforcement`.
- Baseline funcional de entrada: CAMPAÑA A PHASE-002 publicada en `16f5b34f83e723c2ca66dff43dbf5dab18293b29`.
- Backend runtime observado: `01efd5099758d8ad85fc4bcdf4720c5e23e59270`.
- Product Owner: pendiente de registrar.
- Arquitecto Técnico / Auditor: pendiente de registrar.
- Ingeniero de Implementación / Codex: pendiente de registrar.

## Objetivo

Activar y validar Row Level Security (RLS) en las tablas multi-tenant relevantes de SKIA como segunda línea de defensa, preservando el comportamiento fail-closed demostrado por la aplicación en CAMPAÑA A y sin ampliar privilegios del rol runtime.

La fase debe demostrar que la aplicación continúa funcionando correctamente para contextos autorizados y que PostgreSQL rechaza accesos fuera de tenant/branch incluso si una capa de aplicación fallara o fuera omitida.

## Evidencia de entrada

CAMPAÑA A PHASE-002 completó con:

- `CAMPAIGN_EXECUTION_STATUS=COMPLETE`;
- cross-tenant leak `false`;
- cross-branch leak `false`;
- A-OPERATOR → A2: HTTP `403`;
- mappings tenant inválidos: `0`;
- mappings branch inválidos: `0`;
- runtime `01efd5099758d8ad85fc4bcdf4720c5e23e59270`;
- health interno/público HTTP `200`;
- RLS relevante deshabilitado.

Esta fase no reinterpreta como aprobadas las cinco comprobaciones bloqueadas de PHASE-002; permanecen pendientes según su evidencia.

## Alcance autorizado

### Etapa A — Auditoría RLS read-only

- Inventariar todas las tablas con políticas RLS existentes.
- Registrar `relrowsecurity`, `relforcerowsecurity`, políticas, roles, expresiones `USING` y `WITH CHECK`.
- Identificar exactamente qué tablas multi-tenant usa el backend runtime en los flujos de PHASE-002.
- Confirmar rol efectivo de la API (`skia_runtime` u otro observado) y sus atributos `SUPERUSER`/`BYPASSRLS`.
- Trazar cómo se suministran tenant y branch al contexto PostgreSQL, incluyendo variables de sesión, `SET LOCAL`, funciones helper o filtros SQL directos.
- Detectar cualquier tabla donde activar RLS rompería rutas porque el contexto DB requerido no se establece.
- No ejecutar `ALTER TABLE`, `CREATE POLICY`, `DROP POLICY`, `GRANT`, `REVOKE` ni cambios de datos en Etapa A.

### Etapa B — Diseño y validación local

Si Etapa A demuestra que las políticas existentes son correctas y el backend suministra contexto suficiente:

- preparar la modificación mínima para habilitar RLS en las tablas cubiertas;
- no renombrar ni reescribir migraciones históricas;
- preferir un SQL operativo/versionado o una nueva migración explícita según el mecanismo canónico determinado;
- asegurar idempotencia y rollback claramente definido;
- validar sintaxis, dependencias, rol runtime, `USING`/`WITH CHECK` y comportamiento esperado;
- documentar cualquier tabla que deba excluirse y por qué.

Si Etapa A detecta que las políticas son incompletas, ambiguas o dependen de un contexto inexistente, detenerse antes de Etapa C y emitir decisión arquitectónica adicional.

### Etapa C — Activación controlada en STAGING

Solo después de gate arquitectónico explícito posterior a Etapa B:

- respaldar estado relevante;
- habilitar RLS únicamente en las tablas autorizadas;
- no modificar datos funcionales;
- no ampliar privilegios del runtime;
- verificar inmediatamente `relrowsecurity=true` y estado de `FORCE RLS` conforme al diseño;
- health interno/público debe permanecer HTTP `200`.

### Etapa D — CAMPAÑA B

Después de RLS habilitado y verificado:

- reutilizar el mismo Fixture V1 y la misma matriz PHASE-002 cuando sea posible;
- mantener constantes SHA de aplicación, fixture, roles y matriz para aislar causalmente el efecto de RLS;
- ejecutar CAMPAÑA B completa;
- comparar CAMPAÑA A vs B;
- confirmar que accesos autorizados siguen funcionando y cruces tenant/branch siguen fail-closed;
- añadir pruebas PostgreSQL directas controladas con el rol runtime para demostrar defensa en profundidad, sin usar superusuario como evidencia de enforcement.

## Restricciones

- STAGING exclusivamente.
- No producción.
- No merge a `main` sin autorización explícita.
- No deploy frontend.
- No cambios Nginx, Redis o pgAdmin.
- No modificar esquema funcional salvo lo estrictamente requerido para RLS y aprobado por gate.
- No conceder `BYPASSRLS`, superusuario ni privilegios equivalentes al rol runtime.
- No ocultar fallos funcionales introducidos por RLS.
- No eliminar fixtures antes de CAMPAÑA B.

## Criterios de aceptación

PHASE-005 solo puede aprobarse si:

1. La arquitectura RLS efectiva está completamente documentada.
2. El rol runtime no es superusuario ni `BYPASSRLS`.
3. RLS queda habilitado en todas las tablas autorizadas de alcance y las políticas correctas están activas.
4. Health interno y público permanecen HTTP `200`.
5. CAMPAÑA B completa sin fugas cross-tenant ni cross-branch.
6. Los accesos autorizados de CAMPAÑA A siguen funcionando bajo RLS.
7. Pruebas PostgreSQL con rol runtime demuestran rechazo fuera de contexto autorizado.
8. No se amplían privilegios ni se introducen bypasses.
9. Todos los fallos/bloqueos quedan visibles.

## Rollback

Antes de activar RLS debe existir un rollback explícito y revisado que restaure únicamente el estado RLS/políticas modificado por PHASE-005. El rollback no debe eliminar fixtures, usuarios ni datos funcionales de PHASE-002.

Si RLS causa pérdida de disponibilidad, fallos de rutas críticas o inconsistencias de contexto, detener CAMPAÑA B y ejecutar solo el rollback previamente autorizado.

## Entregables

- `RLS_BASELINE_REPORT.md`
- `RLS_POLICY_MATRIX.md`
- `RLS_RUNTIME_CONTEXT_TRACE.md`
- `RLS_IMPLEMENTATION_PLAN.md`
- `RLS_STAGING_ACTIVATION_REPORT.md`
- comparación CAMPAÑA A vs CAMPAÑA B
- registro de rollback o evidencia de que no fue necesario
- decisión final de cierre PHASE-005

## Autonomía de ejecución

Codex puede proceder autónomamente durante Etapa A y Etapa B para inspección read-only, documentación, validación local, commits y push dentro de la rama correspondiente.

Debe detenerse antes de cualquier activación RLS en STAGING si:

- el contexto PostgreSQL requerido no está establecido de manera inequívoca;
- una política existente es contradictoria o incompleta;
- se requiere cambiar esquema, privilegios globales o arquitectura de sesiones;
- se detecta riesgo de pérdida de acceso legítimo no cubierto por rollback.

La activación RLS en STAGING requiere un gate arquitectónico explícito posterior a la evidencia de Etapa A/B.