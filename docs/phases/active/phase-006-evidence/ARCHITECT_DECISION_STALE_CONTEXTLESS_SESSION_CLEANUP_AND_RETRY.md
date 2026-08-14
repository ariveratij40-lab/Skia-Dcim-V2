# ARCHITECT DECISION — PHASE-006 Stale Contextless Session Cleanup and Runtime Cutover Retry

## Estado

- Decisión: AUTORIZADO CONDICIONALMENTE.
- Entorno: STAGING exclusivamente.
- Alcance: limpiar exactamente una sesión TEST obsoleta y reintentar una vez el cutover de runtime restringido con RLS deshabilitado.
- Backend funcional mínimo: `67e5fdd878543b81b98831c5e4a707f6e7405f53`.
- Evidencia de entrada: `be6530994b8d0750f254204a07ab656fc2052afb`.

## Fundamento

El intento anterior demostró que el backend puede arrancar y permanecer healthy usando `skia_runtime` con conexión migradora separada. El gate se detuvo exclusivamente porque existe una sesión TEST residual de `phase002-a-admin@test.invalid` sin `tenant_id` ni `branch_id`. Esa fila fue creada antes del cutover, no está asociada a un contexto válido y bloquea el criterio de cero sesiones TEST fuera de mappings.

La corrección no requiere cambios de código, esquema, RLS, roles, grants ni fixture. Se autoriza eliminar únicamente esa sesión TEST residual bajo identificación exacta y volver a ejecutar el cutover aislando todavía la variable de identidad runtime.

## Parte A — limpieza controlada de sesión TEST

Antes de escribir:

1. Confirmar API en estado rollback previo: healthy, health interno/público `200`, identidad efectiva `skia_user` y RLS deshabilitado en las tres tablas objetivo.
2. Localizar read-only sesiones activas del usuario `phase002-a-admin@test.invalid` con `tenant_id IS NULL` y `branch_id IS NULL`.
3. No leer, imprimir ni versionar token/session ID.
4. Exigir que el conteo exacto sea `1`.
5. Confirmar que la fila fue creada antes del intento de cutover documentado en `be653099...` y que no corresponde a una sesión nueva válida.

Solo si todas las condiciones anteriores se cumplen:

- abrir transacción explícita;
- eliminar exclusivamente esa fila usando condiciones que incluyan el usuario TEST y ambos contextos nulos, más cualquier identificador interno obtenido de forma no sensible si es necesario;
- verificar `rows_affected=1`;
- confirmar inmediatamente que el conteo de sesiones activas TEST sin tenant/branch quedó en `0`;
- COMMIT.

Si el conteo previo no es exactamente `1`, si la fila no puede distinguirse inequívocamente o si `rows_affected != 1`, ejecutar ROLLBACK y detenerse.

No se autoriza eliminar otras sesiones, usuarios, mappings o datos.

## Parte B — reintento único de cutover restringido

Después de una limpieza aprobada:

1. Repetir las precondiciones del gate de runtime:
   - `skia_runtime` LOGIN, NOSUPERUSER, NOBYPASSRLS;
   - sin ownership ni herencia privilegiada;
   - grants DML requeridos presentes;
   - fixture 3 tenants / 6 branches / 60 activos íntegro;
   - health interno/público `200`;
   - RLS `relrowsecurity=false` en `assets`, `asset_logs`, `asset_relationships`.
2. Reutilizar únicamente la credencial nueva ya provisionada para `skia_runtime` y la configuración migrador/runtime protegida por el gate anterior. No generar otra contraseña si la existente valida correctamente.
3. No mostrar ni versionar valores de `DATABASE_URL`, `MIGRATOR_DATABASE_URL`, passwords o secretos.
4. Desplegar exclusivamente el backend PHASE-006 con:
   - `DATABASE_URL` autenticando como `skia_runtime`;
   - `MIGRATOR_DATABASE_URL` autenticando como identidad migradora distinta;
   - `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true`.
5. Mantener RLS deshabilitado durante toda la validación.

## Validación obligatoria post-cutover

En este orden:

1. contenedor backend healthy, restart count `0`;
2. health interno y público HTTP `200`;
3. `pg_stat_activity`/consulta equivalente confirma que la API opera como `skia_runtime`;
4. runtime continúa NOSUPERUSER/NOBYPASSRLS/sin ownership privilegiado;
5. cero sesiones TEST fuera de `user_tenants`;
6. cero sesiones TEST fuera de `user_branches`;
7. A-OPERATOR: login y tenant válidos, A1 `200`, intento A2 `403`, contexto final válido;
8. A-MULTI: A1 y A2 `200`;
9. lecturas de activos A/B/C devuelven únicamente el conjunto esperado por tenant/branch;
10. ejecutar al menos un flujo de importación/job autorizado con tenant/branch explícitos y confirmar que completa bajo `skia_runtime` sin acceso fuera de contexto;
11. confirmar nuevamente que RLS sigue deshabilitado.

## Política de fallo y rollback

Ante cualquier fallo crítico en identidad runtime, health, sesiones/mappings, aislamiento, import/job o arranque:

- detener la matriz inmediatamente;
- no activar RLS;
- restaurar únicamente release/configuración backend previos;
- confirmar identidad API `skia_user`, health `200` y RLS todavía deshabilitado;
- conservar la credencial `skia_runtime` protegida salvo que el fallo implique específicamente compromiso de secreto;
- documentar y publicar evidencia; no reintentar otra vez bajo esta decisión.

## Éxito

El reintento se declara `APROBADO` solo si toda la validación obligatoria completa sin fallos y la API permanece operando como `skia_runtime` al final.

Si aprueba, PHASE-006 podrá considerarse lista para cierre operativo y PHASE-005 podrá reanudarse para preparar la activación controlada de RLS.

## No autorizado

Esta decisión NO autoriza:

- habilitar RLS;
- modificar policies;
- CAMPAÑA B;
- cambios de esquema/constraints;
- cambios de grants, memberships, ownership o atributos de roles;
- frontend/Nginx/Redis;
- producción;
- merge a `main`.
