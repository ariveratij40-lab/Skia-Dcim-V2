# ARCHITECT DECISION — PHASE-006 Runtime Credential Provisioning Gate

## Estado

- Decisión: AUTORIZADO CONDICIONALMENTE.
- Alcance: provisionar de forma segura una credencial nueva para `skia_runtime`, configurar separación runtime/migrador en STAGING y reintentar el cutover restringido con RLS todavía deshabilitado.
- Rama: `phase/006-runtime-role-context`.
- Backend mínimo aprobado: `67e5fdd878543b81b98831c5e4a707f6e7405f53`.
- Evidencia de bloqueo: `99900f99318c5ee460e63e9aed9a79ef87b58d4f`.

## Fundamento

El preflight confirmó que `skia_runtime` es apto como identidad runtime: LOGIN, NOSUPERUSER, NOBYPASSRLS, sin ownership de tablas objetivo ni herencia privilegiada, y con grants DML requeridos. El único bloqueo observado es la ausencia de una credencial externa identificable para `skia_runtime` y de una configuración separada `MIGRATOR_DATABASE_URL`.

## Decisión de credenciales

1. Se autoriza generar una contraseña criptográficamente aleatoria nueva para `skia_runtime` fuera del repositorio.
2. Se autoriza cambiar únicamente la contraseña del rol PostgreSQL existente `skia_runtime`; no cambiar atributos, memberships, ownership ni grants.
3. La contraseña nueva no debe imprimirse, registrarse en logs, evidencia, shell history ni Git.
4. Debe almacenarse únicamente en un archivo/configuración externa de STAGING con permisos restrictivos (`0600` o equivalente) y quedar disponible para `DATABASE_URL`.
5. Se autoriza conservar la identidad administrativa actual `skia_user` como migrador y reutilizar de forma opaca su secreto ya configurado para construir `MIGRATOR_DATABASE_URL`, siempre que el valor no sea mostrado, extraído a stdout ni versionado.
6. No se autoriza copiar la contraseña administrativa a `skia_runtime`; las dos identidades deben tener secretos distintos.

## Precondiciones antes de modificar credenciales

- Confirmar nuevamente `skia_runtime` NOSUPERUSER/NOBYPASSRLS y ausencia de ownership/herencia privilegiada.
- Confirmar RLS deshabilitado en `assets`, `asset_logs` y `asset_relationships`.
- Confirmar health interno/público HTTP 200 y fixture PHASE-002 íntegro.
- Confirmar que el release backend a desplegar contiene al menos `67e5fdd878543b81b98831c5e4a707f6e7405f53`.
- Capturar de forma no sensible el estado previo de configuración y release para rollback.

## Operación autorizada

### A. Provisionamiento

- Generar secreto runtime nuevo mediante mecanismo local seguro.
- Ejecutar un cambio de contraseña exclusivamente sobre `skia_runtime` dentro de una operación controlada.
- Validar autenticación de `skia_runtime` sin mostrar el secreto.
- Crear/actualizar configuración externa de STAGING para:
  - `DATABASE_URL` -> `skia_runtime`;
  - `MIGRATOR_DATABASE_URL` -> `skia_user` usando de forma opaca la credencial administrativa vigente;
  - `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true`.
- No modificar otras variables salvo las estrictamente necesarias para este cutover.

### B. Cutover backend

- Desplegar/recrear únicamente el backend STAGING desde un release limpio que contenga el código PHASE-006 aprobado.
- Mantener RLS deshabilitado durante toda esta ronda.
- No reiniciar frontend, PostgreSQL, Redis, pgAdmin ni Nginx salvo que el mecanismo normal de recreación del backend lo requiera estrictamente y sin modificar su configuración.

### C. Validación posterior

Exigir:

- backend healthy, restart count estable;
- health interno y público HTTP 200;
- conexiones runtime observadas como `skia_runtime`;
- `skia_runtime`: NOSUPERUSER, NOBYPASSRLS, sin ownership/herencia privilegiada;
- migraciones/arranque ejecutadas mediante identidad migradora separada, sin que el runtime obtenga DDL;
- A-OPERATOR: A1 permitido y A2 denegado;
- A-MULTI: A1 y A2 permitidos;
- lecturas representativas de activos A/B/C con conteos esperados;
- al menos un flujo de importación/job que use contexto tenant/branch explícito y no produzca acceso fuera de scope;
- cero sesiones TEST fuera de `user_branches`;
- RLS sigue deshabilitado en las tres tablas al finalizar.

## Rollback

Si el backend no inicia o una validación crítica falla:

- restaurar únicamente el release/configuración backend previos;
- `DATABASE_URL` vuelve a la identidad previa;
- retirar/desactivar `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB` si formaba parte del cutover fallido;
- restaurar la configuración migradora previa;
- no cambiar RLS, fixtures ni datos funcionales.

La contraseña nueva de `skia_runtime` puede permanecer provisionada aunque se revierta el backend; no es necesario restaurar una contraseña desconocida previa. Debe permanecer protegida y no usada hasta un siguiente gate.

## No autorizado

Este gate NO autoriza:

- habilitar RLS;
- cambiar policies;
- modificar grants, ownership, memberships o atributos de roles;
- crear/eliminar roles;
- cambiar esquema o constraints;
- CAMPAÑA B;
- producción;
- merge a `main`.

## Autonomía

Dentro de este gate, Codex puede ejecutar de forma autónoma provisionamiento, configuración externa, deploy del backend, validaciones, rollback técnico si es necesario, documentación, commit y push de evidencia. Debe detenerse solo si necesita ampliar privilegios, cambiar esquema/RLS/policies, tocar otros servicios de forma no prevista o si encuentra una divergencia estructural no cubierta por esta decisión.