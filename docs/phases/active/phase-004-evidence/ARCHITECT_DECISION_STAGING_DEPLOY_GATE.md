# ARCHITECT DECISION — PHASE-004 Controlled STAGING Deploy Gate

## Estado

- Decisión: AUTORIZADO CONDICIONALMENTE.
- Entorno: STAGING exclusivamente.
- Commit de implementación autorizado: `01efd5099758d8ad85fc4bcdf4720c5e23e59270`.
- Alcance: desplegar únicamente la corrección PHASE-004 del backend y validar el defecto cross-branch observado en CAMPAÑA A.

## Fundamento

La revisión del commit autorizado confirma que `/api/auth/select-branch` ahora valida explícitamente la asociación `user_branches` para el usuario y tenant de la sesión activa antes de mutar `branch_id`. El `UPDATE` repite la condición de autorización para evitar una carrera entre validación y escritura. Las pruebas locales específicas PHASE-004 y el build Go fueron aprobados; la falla de la suite completa corresponde a un panic preexistente y documentado en un test de importación, fuera del alcance de esta fase.

## Precondiciones obligatorias

Antes de modificar STAGING:

1. Confirmar que el commit remoto exacto de implementación es `01efd5099758d8ad85fc4bcdf4720c5e23e59270` y que el checkout usado para construir está limpio.
2. Capturar el estado previo del backend activo: imagen/contenedor, release path, health check y SHA/runtime identificable.
3. Confirmar que no se modificará frontend, PostgreSQL, Redis, Nginx, RLS, migraciones ni esquema.
4. Confirmar que los fixtures PHASE-002 permanecen presentes e íntegros y que el manifest externo sigue protegido.
5. Tener un rollback operativo limitado al backend: restaurar exactamente la imagen/release backend previo si el health check o la validación funcional falla. El rollback no debe tocar datos ni fixtures.

## Deploy autorizado

- Construir/publicar únicamente el backend correspondiente a `01efd5099758d8ad85fc4bcdf4720c5e23e59270` usando el mecanismo de releases de STAGING ya existente.
- Actualizar únicamente `skia_api_staging` para ejecutar ese backend.
- No ejecutar migraciones manuales ni alterar variables de entorno salvo las estrictamente necesarias para reproducir la configuración backend existente, sin cambiar sus valores funcionales.
- No reiniciar ni reconstruir frontend, PostgreSQL, Redis, pgAdmin o Nginx.
- Registrar el release path, imagen y SHA efectivos sin revelar secretos.

## Validación inmediata post-deploy

Antes de reanudar CAMPAÑA A completa, ejecutar únicamente estas comprobaciones:

1. `/api/health` interno y público: deben responder HTTP 200.
2. Login TEST de `A-OPERATOR` usando credenciales externas protegidas.
3. Seleccionar tenant A.
4. Seleccionar branch A1: esperado HTTP 200.
5. Intentar seleccionar branch A2 con el mismo actor, que solo está mapeado a A1: esperado HTTP 403.
6. Verificar mediante PostgreSQL read-only que la sesión conserva `branch_id=A1` y que no existe contexto A2 para ese actor.
7. Validar actor MULTI-BRANCH del tenant A: A1 y A2 deben seguir permitidas (HTTP 200) y el contexto debe actualizarse correctamente.
8. Confirmar que no se creó ninguna sesión con branch fuera de `user_branches` entre los actores TEST.

Si cualquiera de estas comprobaciones falla, detenerse. No corregir en caliente. Aplicar únicamente rollback del backend al release previo si el fallo implica indisponibilidad o regresión funcional del backend; de lo contrario conservar evidencia y solicitar nueva decisión.

## Criterio de aprobación de PHASE-004 en STAGING

PHASE-004 puede considerarse técnicamente corregida en STAGING solo si:

- health checks siguen aprobados;
- A-OPERATOR A1→A1 = permitido;
- A-OPERATOR A1→A2 = denegado;
- la denegación no muta el contexto previo;
- MULTI-BRANCH conserva acceso válido a A1 y A2;
- no aparecen sesiones TEST con branch fuera de `user_branches`.

## No autorizado

Este gate NO autoriza:

- CAMPAÑA A completa de PHASE-002;
- CAMPAÑA B;
- cambios RLS;
- migraciones;
- cambios de esquema;
- cambios Nginx/DNS;
- deploy de frontend;
- merge a `main`;
- producción.

Después de la validación post-deploy, detenerse y presentar evidencia para decidir si PHASE-004 se cierra y PHASE-002 puede reanudar CAMPAÑA A.