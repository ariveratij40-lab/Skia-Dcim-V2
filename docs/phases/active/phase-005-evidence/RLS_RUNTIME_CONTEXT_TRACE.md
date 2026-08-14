# PHASE-005 — Runtime Context Trace

## Mecanismo correcto existente

`BeginTenantTx` abre una transacción y ejecuta `set_config('app.tenant_id', ..., true)` y, cuando existe, `set_config('app.branch_id', ..., true)`. El flag `true` limita las variables a la transacción.

`BeginTenantTxWithScope` añade `app.branch_scope_all=true` únicamente cuando `RequireTenantTxScoped` resuelve un rol incluido en `globalScopeRoles`. Actualmente esa lista contiene `admin`; no se añadió ni modificó semántica de roles en PHASE-005.

`RequireTenantTx` valida la sesión, abre la transacción contextual, inyecta `TenantDB` y hace COMMIT/ROLLBACK según el resultado HTTP. Las rutas principales de listado y detalle de `/api/dcim/assets` usan este mecanismo. `createAsset` abre su propia transacción contextual.

## Cobertura incompleta

La misma tabla `assets` es consultada o modificada directamente desde rutas y helpers que no establecen las variables en la conexión usada:

- `infraestructura.go`: consultas, inserciones y actualizaciones de activos;
- `rack_layout.go`: verificación y actualización de activos;
- `inventory_clear_handler.go`: conteo y borrado tenant-wide;
- diversos procesos/importadores y handlers señalados por el lint heurístico.

Con RLS activo y `skia_runtime`, una consulta directa sin contexto no vería filas y una escritura fallaría. Algunas operaciones tenant-wide también necesitan una semántica explícita equivalente a `branch_scope_all` o una operación privilegiada de propósito limitado; no debe inferirse alcance global por ausencia de branch.

## Identidad runtime

La API despliega actualmente `DATABASE_URL` con usuario `skia_user`. Este rol evade RLS por ser superuser y `BYPASSRLS`. Por tanto:

- activar RLS sin cambiar el usuario sería un control aparente, no efectivo;
- cambiar solo el usuario a `skia_runtime` rompería rutas sin contexto;
- el arranque ejecuta migraciones con la misma conexión, mientras `skia_runtime` carece deliberadamente de DDL; se requiere separar o decidir explícitamente el mecanismo migrador.

No se mostró el DSN ni su password.

## Resultado

El contexto existe y es adecuado en parte del backend, pero no está establecido inequívocamente para todas las rutas que acceden a las tablas objetivo. Etapa C queda bloqueada.
