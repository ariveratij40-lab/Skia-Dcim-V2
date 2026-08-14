# PHASE-005 — RLS Baseline Report

## Resultado ejecutivo

- Etapa: `A — AUDITORÍA READ-ONLY`.
- Entorno: `STAGING`.
- Estado: `FALLIDO / BLOQUEANTE ESTRUCTURAL` para activar RLS.
- Backend observado: `01efd5099758d8ad85fc4bcdf4720c5e23e59270`.
- Evidencia de entrada PHASE-002: `16f5b34f83e723c2ca66dff43dbf5dab18293b29`.

RLS no puede activarse de forma segura bajo el estado actual. El contenedor API usa `skia_user`, rol `SUPERUSER` y `BYPASSRLS`; por ello las políticas no serían una defensa para el runtime. Existe `skia_runtime` con atributos restringidos y grants DML, pero no es la identidad efectiva de la aplicación.

Además, el análisis estático detectó accesos a tablas protegidas fuera de `RequireTenantTx`/`BeginTenantTx`. Al cambiar la API al rol restringido y activar RLS, esas rutas quedarían sin `app.tenant_id`/`app.branch_id` y fallarían cerradas o perderían funcionalidad legítima.

## Identidad y atributos

| Elemento | Observado | Estado |
|---|---|---|
| Usuario efectivo de `DATABASE_URL` API | `skia_user` | FALLIDO |
| Host/base API | `skia_postgres_staging` / `skia_db` | APROBADO |
| `skia_user` | superuser, BYPASSRLS, CREATEROLE, CREATEDB | BLOQUEANTE |
| `skia_runtime` | LOGIN, no superuser, no BYPASSRLS, no CREATEROLE/CREATEDB | APROBADO como rol candidato |
| Membresía entre ambos roles | ninguna | APROBADO |
| Owner de tablas RLS | `skia_user` | DOCUMENTADO |
| Grants DML `skia_runtime` | presentes en tablas auditadas | APROBADO |

## Estado de tablas y políticas

- Políticas existentes: `3`, sobre `assets`, `asset_logs` y `asset_relationships`.
- `relrowsecurity`: `false` en las tres.
- `relforcerowsecurity`: `true` en las tres.
- Sin contexto y con `SET LOCAL ROLE skia_runtime`, PostgreSQL devolvió 62 activos porque `relrowsecurity=false`; el fail-closed todavía no está activo.
- `tenants`, `branches`, `users`, `user_tenants`, `user_branches` y `sessions` no tienen RLS.

## Integridad relacionada

`asset_logs` tiene `tenant_id` y FK independiente a `assets(id)`, pero no una restricción compuesta que pruebe que el tenant del log coincide con el tenant/branch del activo. `asset_relationships` presenta el mismo patrón para source/target. Sus políticas actuales son tenant-only y no derivan autorización de branch desde los activos relacionados.

## Lint estático

Comando local:

`GO111MODULE=off go run tools/tenant_db_lint/main.go -- 'backend/*.go'`

Resultado: exit code `1`, 221 llamadas sospechosas a `db`/`h.DB`. El linter es heurístico y contiene falsos positivos por tablas no protegidas, pero confirmó accesos directos a `assets` en `infraestructura.go`, `rack_layout.go`, `inventory_clear_handler.go` y otros flujos. Activar RLS después del cutover de rol sin resolverlos supone riesgo de indisponibilidad funcional.

Los dos primeros intentos de invocar el linter no ejecutaron el análisis: uno partió desde la raíz sin `go.mod`; el segundo omitió `--` y Go interpretó el glob como fuente. El tercer comando ejecutó el linter correctamente.

## Gate

La causa exige decisiones sobre identidad runtime, estrategia de migraciones/DDL, cobertura transaccional de handlers y semántica branch de tablas relacionadas. No se ejecutó Etapa C ni se modificó PostgreSQL.
