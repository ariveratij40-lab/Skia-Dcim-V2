# PHASE-003 — Profile baseline tooling adaptation

## Control

- Decisión aplicada: `ARCHITECT_DECISION_PROFILE_BASELINE.md` en `origin/phase/003-rbac-baseline-execution`.
- Origen del tooling adaptado: `origin/phase/002-fixture-implementation@26c398e122b0d8c6d1071fdb06b663cb81a0de62`.
- Alcance: adaptación local y validación estática exclusivamente.
- Etapa C, SQL, HTTP staging, fixtures, rollback, RLS y deploy: no ejecutados.

## Baseline consumido

- Las etiquetas lógicas ADMIN, OPERATOR y MULTI-BRANCH no son nombres runtime.
- Los nueve actores comparten semántica runtime neutral `operator` dentro de su tenant.
- Existe un único rol fixture por tenant: tres roles en total.
- ADMIN y MULTI-BRANCH reciben dos asociaciones `user_branches`; OPERATOR recibe una.
- Cada rol recibe únicamente `dcim:view` como metadata normativa `NO ENFORCED`.
- La autorización efectiva de CAMPAÑA A se atribuye a sesión, `user_tenants`, `user_branches` y filtros/contexto de handlers, no a `dcim:view`.

## Cambios del tooling

### Preflight

- Eliminada la dependencia de una pareja real `admin`/`operator` y de clonación de permission sets.
- Exige el nombre neutral exacto `operator`.
- Exige que el checkout corresponda al SHA `d2e9c3519a18915ab3867d6526f0d1100559bd16`, cubierto por la traza de nombres aprobada; cualquier cambio de código bloquea hasta nueva revisión.
- Verifica exactamente una fila `dcim:view`, ID `550e8400-e29b-41d4-a716-446655440401`, no global.
- Verifica compatibilidad read-only de `roles.name` y bloquea constraints no demostradas compatibles.
- Permite únicamente los tres IDs canónicos de rol neutral y bloquea IDs obsoletos, nombres privilegiados, roles globales o tenants inconsistentes.

### Preparación

- Añadido guard de aprobación separada `PHASE003_OPERATOR_BASELINE_APPROVED` y nombre neutral exacto.
- Reducidos los roles canónicos de seis a tres: IDs terminados en `a2`, `b2`, `c2`.
- Los tres actores de cada tenant apuntan al mismo rol `operator`.
- Sustituida la clonación de permisos por asignación exacta de `dcim:view` a los tres roles.
- Postcondición fija: tres roles y tres filas `role_permissions`, sin nombres privilegiados ni permisos adicionales.

### Verificación y rollback

- Verificación adaptada a tres roles neutrales y tres permisos normativos exactos.
- Añadidos checks de ausencia de `admin`, `super_admin` e IDs obsoletos en el rango fixture.
- Manifest de rollback exige exactamente tres roles, alias `operator:*` y los tres IDs autorizados.
- Wrapper exige exactamente tres filas `role_permissions`; no acepta un conteo arbitrario.
- El postcheck completo de rollback por IDs exactos permanece intacto.

### Runner HTTP

No requirió cambios: sus nombres `a_admin`, `a_operator` y equivalentes son aliases lógicos de actores y no asignan ni evalúan nombres runtime. Continúa sin tratar un permission code como evidencia de enforcement.

## Validación local

| Validación | Resultado |
| --- | --- |
| `bash -n` sobre `preflight.sh`, `rollback_fixtures.sh`, `run_isolation_tests.sh` | APROBADO |
| modos ejecutables equivalentes al tooling fuente | APROBADO |
| búsqueda de dependencia/clonación `admin`/`operator` | APROBADO; eliminada del modelo RBAC |
| conteos coherentes prepare/verify/rollback | APROBADO: roles `3`, role_permissions `3` |
| UUIDs de rol neutral y asociaciones por tenant | APROBADO estáticamente: `a2`, `b2`, `c2` |
| `dcim:view` exacto/no global | guardado estáticamente; requiere confirmación en futuro preflight read-only |
| `git diff --check` | APROBADO |
| `shellcheck` | NO EJECUTADO; herramienta no disponible y no se instaló |
| parser/cliente PostgreSQL local | NO EJECUTADO; `psql` no disponible y no se instaló |
| ejecución de scripts/SQL | NO EJECUTADO por restricción explícita |

## Resultado

**ADAPTACIÓN LOCAL COMPLETADA; BLOQUEADA PARA EJECUCIÓN.**

Antes de preparar fixtures se requiere revisión arquitectónica del diff, versionado aprobado del tooling, un nuevo preflight read-only sobre el destino autorizado y una autorización posterior separada. Este documento no autoriza Etapa C ni escrituras.
