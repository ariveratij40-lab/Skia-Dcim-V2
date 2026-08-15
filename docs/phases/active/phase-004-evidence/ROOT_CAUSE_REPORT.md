# PHASE-004 — Root Cause Report

## Resultado

- Estado: `APROBADO` para corrección mínima.
- Origen de evidencia: `LOCAL`.
- Alcance: inspección estática del checkout `phase/004-branch-context-enforcement`.

## Causa raíz

El endpoint `POST /api/auth/select-branch` se registra en `backend/main.go` y delega en `handleSelectBranch`.

Antes de PHASE-004, el handler:

1. autenticaba la sesión mediante `session_token`;
2. obtenía únicamente `tenant_id` de la sesión;
3. comprobaba que la branch solicitada existiera en ese tenant;
4. actualizaba `sessions.branch_id` por token.

La consulta de autorización no incluía `user_branches` ni el `user_id` de la sesión. Por ello, cualquier usuario autenticado dentro del tenant podía seleccionar cualquier branch de ese tenant aunque no tuviera un mapping explícito.

La escritura ocurría en `backend/main.go` mediante `UPDATE sessions SET branch_id = ...`. No se encontró bypass basado en nombre de rol en esta ruta; el fallo era la ausencia completa del check por mapping.

## Control reutilizable observado

El repositorio ya expresa la semántica correcta en la resolución segura de contexto y en handlers de importación: el acceso a una branch requiere la combinación usuario, tenant y branch mediante `user_branches`. Ese principio se reutiliza directamente; no se amplían permisos RBAC ni se introduce semántica por nombre de rol.

## Otros mutadores observados

- `handleLogin` y el callback OAuth crean sesiones y pueden asignar una branch inicial a partir de `user_branches`.
- `infraestructura.go` contiene autoasignación de `sessions.branch_id` en rutas de infraestructura. Es un mutador adicional y debe permanecer visible para auditoría, pero corregirlo no es necesario para cerrar la causa confirmada de `/api/auth/select-branch` y queda fuera de esta corrección mínima.
- No se modificó ninguno de esos flujos en PHASE-004.

## Gate

La remediación queda confinada al handler y sus consultas. No requiere cambios de esquema, migraciones, RLS, arquitectura de sesiones ni privilegios globales.
