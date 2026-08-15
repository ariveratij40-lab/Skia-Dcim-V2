# ARCHITECT DECISION — PHASE-004 Stale Test Session Cleanup Gate

## Estado

- Decisión: AUTORIZADO CONDICIONALMENTE.
- Entorno: STAGING exclusivamente.
- Alcance: retirar únicamente la sesión TEST preexistente A-OPERATOR/A2 creada antes del deploy PHASE-004 y repetir la validación post-deploy estrictamente necesaria.
- Backend esperado: commit `01efd5099758d8ad85fc4bcdf4720c5e23e59270`.

## Fundamento

La corrección PHASE-004 quedó demostrada para solicitudes nuevas: A-OPERATOR puede seleccionar A1, recibe 403 al intentar A2 y conserva A1; A-MULTI conserva acceso legítimo A1/A2. El único bloqueante restante es una sesión inválida A-OPERATOR/A2 creada antes del deploy. Esa sesión no fue causada por el backend corregido y contamina el criterio absoluto de ausencia de contextos inválidos.

## Precondiciones

1. Versionar/publicar primero `STAGING_DEPLOY_REPORT.md`, `IMPLEMENTATION_REPORT.md` y `BLOCKERS.md` con la evidencia actual.
2. Confirmar read-only que el backend activo sigue en `01efd5099758d8ad85fc4bcdf4720c5e23e59270`, saludable y sin reinicios inesperados.
3. Identificar read-only la sesión TEST preexistente usando atributos no secretos: actor fixture A-OPERATOR, tenant A, branch A2 y creación anterior al deploy PHASE-004.
4. No leer, imprimir ni versionar token, cookie o session secret.
5. La selección debe resolver exactamente una sesión. Si resuelve cero o más de una, detenerse sin escritura.

## Escritura autorizada

Se autoriza una única transacción PostgreSQL para revocar/eliminar exclusivamente esa sesión preexistente.

- Iniciar transacción explícita.
- Revalidar dentro de la misma transacción que el predicado identifica exactamente una fila.
- Eliminar o invalidar únicamente esa fila, según el mecanismo nativo ya utilizado por SKIA para revocación de sesiones.
- Verificar `affected_rows = 1`.
- Si cualquier precondición cambia o el conteo no es exactamente uno, ejecutar `ROLLBACK` y detenerse.
- No tocar usuarios, fixtures, mappings, activos, roles ni otras sesiones.

La evidencia versionada debe registrar únicamente actor lógico, clasificación `predeploy`, conteo antes/después y resultado; nunca el identificador secreto de sesión.

## Validación posterior autorizada

Después de la limpieza:

1. Consulta read-only: sesiones TEST con branch fuera de `user_branches` debe ser `0`.
2. Nuevo login A-OPERATOR: tenant A = 200; A1 = 200; intento A2 = 403; contexto posterior permanece A1.
3. A-MULTI: A1 = 200 y A2 = 200.
4. Confirmar que no aparecieron nuevas sesiones inválidas después del deploy.
5. Health interno/público = 200 y `skia_api_staging` saludable.

Si todo lo anterior aprueba, PHASE-004 puede clasificarse `APROBADA EN STAGING` y debe detenerse para cierre documental. No reejecutar todavía CAMPAÑA A completa bajo esta decisión.

## No autorizado

- rollback de fixtures PHASE-002;
- CAMPAÑA A completa o CAMPAÑA B;
- cambios RLS;
- migraciones o esquema;
- cambios Nginx/DNS/frontend/Redis;
- nuevo deploy;
- merge a `main`;
- producción.
