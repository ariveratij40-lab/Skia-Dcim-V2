# PHASE-002 — Architect Decision: Fixture Preparation Gate

## Estado

- Fase: `PHASE-002 — Multi-Tenant Isolation Test Fixtures`.
- Rama: `phase/002-fixture-implementation`.
- Preflight definitivo: `APROBADO` según ejecución read-only reportada sobre staging.
- Backend runtime observado: `d155910c231e96446672508534ccec83bf0d830f`.
- Frontend runtime SHA: `UNKNOWN/BLOQUEADO`; no invalida por sí mismo la preparación DB, pero debe permanecer visible para la futura campaña HTTP.
- Esta decisión autoriza únicamente la preparación controlada y su verificación inmediata. No autoriza todavía CAMPAÑA A HTTP.

## Decisión

La preparación de `SKIA-PHASE-002-FIXTURE-V1` queda **AUTORIZADA CONDICIONALMENTE** en STAGING, únicamente si antes de la primera escritura se cumplen todas las precondiciones siguientes.

## Precondiciones obligatorias antes de escribir

1. El reporte `FINAL_PREFLIGHT_REPORT.md` debe ser preservado y versionado en esta rama sin incluir secretos.
2. El runtime backend activo debe seguir resolviendo a `d155910c231e96446672508534ccec83bf0d830f`.
3. Debe repetirse el guard de procedencia inmediatamente antes de la preparación; cualquier divergencia bloquea.
4. Debe existir un respaldo verificable de la base `skia_db` realizado para esta campaña o una evidencia equivalente de restaurabilidad aprobada por el operador. El respaldo no debe almacenarse en Git.
5. Debe definirse una ruta externa absoluta para el manifest, fuera del repositorio, con permisos restrictivos.
6. Debe calcularse y conservarse externamente el checksum SHA-256 del manifest después de la preparación.
7. Las nueve credenciales temporales deben proporcionarse fuera de Git. Solo hashes necesarios para SQL pueden entrar mediante variables externas; plaintext únicamente en archivo temporal `0600` para una futura campaña HTTP y no es necesario generarlo en esta ronda si no se ejecutará HTTP.
8. Deben usarse exactamente las aprobaciones/guards previstos por el tooling publicado. No se permite editar scripts en el VPS para hacerlos pasar.
9. El entorno debe seguir siendo inequívocamente STAGING y la base `skia_db`.
10. Debe confirmarse que el rango canónico de fixtures sigue vacío o coincide exactamente con Fixture V1 en modo idempotente. Cualquier colisión no canónica bloquea.

## Escritura autorizada

Se autoriza exclusivamente ejecutar el mecanismo publicado de preparación para crear el fixture V1 definido por PHASE-002:

- 3 tenants TEST;
- 6 branches TEST;
- 9 actores TEST;
- 3 roles tenant-local con nombre runtime neutral `operator`;
- 3 asociaciones normativas `role_permissions` a `dcim:view`, explícitamente `NO ENFORCED`;
- mappings `user_tenants`, `user_branches`, `user_roles` definidos;
- 60 activos TEST;
- logs, relaciones y metadata exactamente contemplados por el tooling publicado.

La preparación debe ser transaccional, determinista e idempotente según el tooling aprobado. No se autoriza modificar datos preexistentes ajenos al fixture.

## Verificación inmediata obligatoria

Inmediatamente después de una preparación exitosa debe ejecutarse únicamente `verify_fixtures.sql` en modo read-only y registrar:

- conteos exactos por entidad;
- IDs/aliases canónicos esperados;
- coherencia tenant/branch;
- 3 roles neutrales;
- 3 `role_permissions` normativos;
- 60 activos;
- logs y relaciones esperados;
- ausencia de roles `admin`/`super_admin` dentro del fixture;
- ausencia de duplicados o colisiones.

Si la verificación falla, no iniciar CAMPAÑA A. Conservar el manifest y solicitar decisión de rollback.

## No autorizado en esta decisión

- CAMPAÑA A HTTP.
- Login con actores TEST.
- Creación manual de sesiones fuera del flujo normal.
- Pruebas ISO-001–ISO-022.
- Cambios de RLS o políticas.
- Cambios de esquema o migraciones.
- Cambios de autenticación, handlers, RBAC runtime o permisos efectivos.
- Deploy, rebuild, restart o modificación de contenedores.
- Nginx/Docker/Redis changes.
- Producción.
- Rollback, salvo que una preparación falle y se emita autorización específica posterior o el tooling ejecute un rollback automático ya contemplado dentro de la misma transacción antes de commit.

## Evidencia requerida al finalizar

Crear un reporte no sensible, por ejemplo `FIXTURE_PREPARATION_REPORT.md`, que incluya:

- SHA exacto del tooling ejecutado;
- SHA runtime backend observado;
- fecha/hora y origen de ejecución;
- resultado del guard/preflight inmediato;
- confirmación de respaldo verificable sin ruta/credenciales sensibles;
- estado de preparación (`APROBADO`, `FALLIDO` o `BLOQUEADO`);
- conteos creados;
- resultado de `verify_fixtures.sql`;
- checksum del manifest y conteos por tabla, sin contenido completo del manifest;
- cualquier warning o desviación.

No registrar passwords, hashes reutilizables, tokens, cookies, DSN completos ni contenido del manifest.

## Criterio para la siguiente autorización

CAMPAÑA A solo podrá autorizarse después de que:

1. Fixture V1 haya sido creado sin errores;
2. verificación read-only sea completamente satisfactoria;
3. manifest externo y checksum estén confirmados;
4. evidencia de preparación sea versionada y revisada;
5. exista un mecanismo seguro para entregar las credenciales temporales de los actores TEST.

Hasta entonces, PHASE-002 queda `AUTORIZADA SOLO PARA PREPARACIÓN Y VERIFICACIÓN`, no para campaña funcional.
