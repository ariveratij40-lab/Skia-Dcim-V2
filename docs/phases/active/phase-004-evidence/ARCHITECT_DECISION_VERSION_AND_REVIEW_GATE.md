# ARCHITECT DECISION — PHASE-004 Versioning & Review Gate

## Estado

- Decisión: AUTORIZADO.
- Alcance: versionar y publicar la corrección mínima de `select-branch` y su evidencia local para revisión arquitectónica.
- Rama: `phase/004-branch-context-enforcement`.
- Baseline: `8b3377b19684e549989cc57b671a0646a22b9554`.
- Entorno de ejecución: LOCAL únicamente para este gate.

## Resultado aceptado hasta este punto

La causa raíz observada es coherente con el fallo de CAMPAÑA A: `/api/auth/select-branch` validaba que la branch perteneciera al tenant pero no verificaba el mapping explícito `user_branches` para el usuario. La corrección propuesta añade esa validación y la revalida dentro del `UPDATE` para impedir una mutación de contexto no autorizada y reducir condiciones de carrera.

Las pruebas específicas PHASE-004 y el build Go fueron reportados como aprobados. La suite Go completa permanece fallida por el panic preexistente de `TestHandleInventoryImportRoutes_DetailValid`; este fallo no debe ocultarse ni reinterpretarse como regresión PHASE-004 sin evidencia adicional.

## Acciones autorizadas

1. Confirmar que el diff permanece limitado a:
   - `backend/main.go`;
   - `backend/select_branch_test.go`;
   - evidencia bajo `docs/phases/active/phase-004-evidence/`.
2. Ejecutar nuevamente las validaciones locales específicas ya definidas para PHASE-004 si son necesarias para garantizar que el worktree transportado no cambió.
3. Crear un commit único o commits claramente separados que contengan exclusivamente la corrección PHASE-004 y su evidencia.
4. Publicar `phase/004-branch-context-enforcement` en `origin`.
5. Reportar SHA completo, archivos incluidos, resultados de pruebas y `git status` final.

## Condiciones de aceptación

La versión publicada debe demostrar como mínimo:

- selección de branch mapeada al usuario: permitida;
- selección de branch del mismo tenant pero sin `user_branches`: denegada;
- selección cross-tenant: denegada;
- selección rechazada no modifica el contexto previo de sesión;
- ausencia de bypass por nombre de rol;
- sin cambios de esquema, RLS, migraciones o infraestructura.

## No autorizado

Este gate NO autoriza todavía:

- deploy o reinicio de staging;
- modificación directa del checkout/release activo en VPS;
- cambios de base de datos o sesiones existentes;
- cambios RLS;
- migraciones;
- merge a `main`;
- reejecución de CAMPAÑA A contra staging;
- rollback de fixtures;
- producción.

## Siguiente gate

Después de que el commit esté publicado, el Arquitecto Técnico/Auditor revisará el diff remoto. Solo si esa revisión resulta aprobada podrá emitirse una decisión separada para desplegar la corrección en STAGING y ejecutar una validación mínima post-deploy antes de reanudar PHASE-002.