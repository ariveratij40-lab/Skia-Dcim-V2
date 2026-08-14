# PHASE-002 — Staging read-only preflight report
## Resultado global

**BLOQUEADO** para preparación de fixtures.

La estructura PostgreSQL requerida es compatible y no se detectaron colisiones TEST, pero no existe una equivalencia RBAC segura: staging contiene un único rol real `admin` sin permisos asociados y ningún rol real `operator`. Por diseño fail-closed, no se puede seleccionar una pareja fuente ni clonar conjuntos de `permission_id`.

Este resultado no autoriza preparación. No se ejecutaron `prepare_fixtures.sql`, rollback, migraciones, cambios RLS, login HTTP ni escrituras PostgreSQL.

## Identidad y origen de evidencia

- Origen: `STAGING VPS` y `POSTGRES STAGING`.
- Fecha observada: `2026-08-13 20:13:23 PDT`.
- Hostname: `ubuntu`.
- Usuario SSH: `alvaro`.
- Ruta esperada y encontrada: `/opt/apps/skia/staging`.
- Rama del checkout VPS: `main`.
- SHA del checkout VPS: `cc80606e744bf64e1534c4b6818d0ff2e29b5031`.
- Estado del checkout: no limpio; 27 entradas modificadas, 2 agregadas al índice y 66 no rastreadas.
- `tools/phase002/preflight.sh` en el checkout VPS: ausente.
- Fuente del procedimiento reproducido: rama local aprobada `phase/002-fixture-implementation`, commit `26c398e122b0d8c6d1071fdb06b663cb81a0de62`.

El checkout del VPS se utilizó solo para localizar la instalación. No se ejecutó tooling desde ese árbol divergente ni se hizo `pull`, `checkout`, `reset`, escritura o modificación.

## PostgreSQL staging

- Base esperada según configuración interna del contenedor: `skia_db`.
- Base real: `skia_db`.
- Coincidencia: sí.
- `current_user`: `skia_user`.
- Versión: PostgreSQL `16.14` sobre Alpine.
- Todas las consultas se ejecutaron dentro de `BEGIN READ ONLY` y finalizaron con `ROLLBACK` o con cierre de conexión sin escritura.
- No se imprimió `DATABASE_URL`, password ni otro secreto.

## Tablas requeridas

Presentes las 14 tablas requeridas:

- `tenants`
- `branches`
- `users`
- `user_tenants`
- `user_branches`
- `roles`
- `permissions`
- `role_permissions`
- `user_roles`
- `sessions`
- `asset_types`
- `assets`
- `asset_logs`
- `asset_relationships`

Tablas requeridas ausentes: ninguna.

## Compatibilidad de esquema

Resultado: **compatible para los campos actualmente usados por el tooling**, sujeto al bloqueante RBAC.

- No se encontraron columnas ausentes ni diferencias de tipo entre staging y las columnas utilizadas por `prepare_fixtures.sql`.
- Los campos UUID preparados son compatibles con las PK/FK UUID reales.
- Las columnas obligatorias omitidas por el INSERT tienen default cuando corresponde: timestamps, `photo_url`, `ref_image_url` y otros campos auditados.
- `NODE` existe en `asset_types` con ID `a0000000-0000-0000-0000-000000000008`.
- `active`, `created` y `depends_on`, usados por el fixture, están permitidos por los `CHECK` reales.
- Las restricciones únicas esperadas existen para mappings, roles, sesiones, activos y relationships.

Se observaron 27 FKs relevantes y compatibles, incluyendo:

- branch → tenant;
- user-tenant → user/tenant;
- user-branch → user/branch;
- role → tenant;
- role-permission → role/permission;
- user-role → user/tenant/role;
- session → user;
- asset → tenant/branch/asset type;
- asset log → tenant/asset;
- relationship → tenant/source asset/target asset.

La base no impone mediante FK compuesta que todos los pares tenant/branch coincidan; esa coherencia sigue dependiendo de los postchecks explícitos del tooling.

## Preflight RBAC

### Roles reales detectados

| Rol | Roles reales | Variantes de permission set | Permission count | Permission-set hash | Sets vacíos |
| --- | ---: | ---: | ---: | --- | ---: |
| `admin` | 1 | 1 | 0 | `d41d8cd98f00b204e9800998ecf8427e` | 1 |
| `operator` | 0 | 0 | N/A | N/A | 0 |

- Tenant del único `admin`: `a759321e-bc47-47b8-abe8-dc9e0fe23306`.
- Rol `admin` observado: `b42862e2-4391-4e63-95b1-d6c1c508451d`.
- Tenant fuente RBAC seleccionado: **ninguno**.
- Pareja completa `admin`/`operator`: inexistente.

El hash de `admin` corresponde al conjunto vacío; no representa un conjunto de privilegios utilizable. El preflight aprobado exige conjuntos no vacíos, una pareja completa y equivalencia inequívoca. Por ello debe bloquear antes de cualquier preparación.

## Colisiones TEST

| Entidad | Canónicas | No canónicas |
| --- | ---: | ---: |
| tenants | 0 | 0 |
| branches | 0 | 0 |
| users | 0 | 0 |
| assets | 0 | 0 |

No existe FIXTURE V1 previo ni colisión ajena detectable bajo los aliases/IDs auditados.

## Bloqueantes

### P002-PF-001 — Fuente RBAC inexistente

- Origen: `POSTGRES STAGING`.
- Estado: `BLOQUEADO`.
- Evidencia: no existe rol real `operator`; el único `admin` tiene cero `role_permissions`; no hay tenant con pareja completa.
- Riesgo: preparar fixtures requeriría inventar o ampliar semántica RBAC, expresamente prohibido.
- Recomendación: definir y aprobar en una fase separada la taxonomía RBAC real de staging, poblar roles/permisos canónicos de forma autorizada y repetir este preflight.
- Fase correctiva sugerida: fase RBAC específica, separada de PHASE-002 y sin correcciones RLS implícitas.

## Criterio de salida

PHASE-002 permanece **BLOQUEADA**. Para reevaluar preparación deben cumplirse como mínimo:

1. existencia de roles reales no globales `admin` y `operator` en un mismo tenant;
2. conjuntos de permisos no vacíos;
3. una sola variante inequívoca por nombre de rol, o una decisión arquitectónica que determine la fuente exacta;
4. repetición aprobada del preflight read-only sin nuevos bloqueantes.
