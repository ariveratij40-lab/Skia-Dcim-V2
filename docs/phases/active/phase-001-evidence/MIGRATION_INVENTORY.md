# PHASE-001 — Inventario de migraciones (ronda 1)

## Mecanismos observados

### M-001 — Inicialización SQL por PostgreSQL/Compose

- Origen de evidencia: `LOCAL`.
- Estado: `APROBADO`.
- Evidencia resumida: `docker-compose.yml` monta `./migrations` en `/docker-entrypoint-initdb.d`; PostgreSQL ejecuta estos archivos al inicializar un volumen vacío, en orden lexicográfico.
- Riesgo: alto; no aplica automáticamente SQL nuevos a volúmenes ya inicializados.
- Recomendación: documentar explícitamente el proceso canónico para bases nuevas y existentes.
- Fase correctiva sugerida: `PHASE-CORR-MIGRATION-GOVERNANCE`.

Archivos observados:

1. `001_init.sql`
2. `002_seed.sql`
3. `003_rbac_validation_data.sql`
4. `004_dcim_inventory_schema.sql`
5. `005_dcim_seed.sql`
6. `006_config_admin_schema.sql`
7. `007_fix_password_hashes.sql`
8. `009_add_unique_branches_constraint.sql`
9. `010_create_inventory_imports_schema.sql`
10. `011_password_reset_tokens.sql`
11. `012_fix_imported_assets_tenant_type.sql`
12. `013_dcim_assets_phase1_expand.sql`
13. `014_dcim_assets_phase1_seed.sql`
14. `015_assets_rls.sql`
15. `015_naming_rules_custom_segments.sql`
16. `016_assets_branch_scope_all.sql`

### M-002 — Migraciones embebidas al arrancar el backend

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO`.
- Evidencia resumida: `backend/main.go` invoca `runMigrations(db)`; `backend/migrations.go` controla versiones en `schema_migrations` y contiene versiones `006`, `007`, `008`, `009`, `011`, `012`, `013` y `014` con DDL propio.
- Riesgo: crítico; el proceso corre con la conexión normal de la aplicación y solapa numeración/responsabilidades con los SQL externos.
- Recomendación: definir mecanismo canónico, propietario de privilegios y matriz de equivalencia antes de modificar migraciones.
- Fase correctiva sugerida: `PHASE-CORR-MIGRATION-GOVERNANCE`.

### M-003 — SQL adicional fuera del montaje de Compose

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO`.
- Evidencia resumida: `backend/migrations/010_enterprise_import_schema.sql` existe fuera de `migrations/` y no está montado por Compose ni referenciado estáticamente por `runMigrations`.
- Riesgo: alto; su mecanismo efectivo de aplicación no es evidente.
- Recomendación: documentar procedencia, estado aplicado y mecanismo autorizado.
- Fase correctiva sugerida: `PHASE-CORR-MIGRATION-GOVERNANCE`.

### M-004 — SQL operativo de roles y RLS

- Origen de evidencia: `LOCAL`.
- Estado: `APROBADO`.
- Evidencia resumida: `ops/2026-08-05_convergence_runtime_role_and_rls_pilot.sql` separa operaciones privilegiadas del runtime e incluye `ENABLE/FORCE ROW LEVEL SECURITY` y políticas.
- Riesgo: alto; su presencia no demuestra que haya sido ejecutado en PostgreSQL staging.
- Recomendación: verificar estado efectivo mediante acceso `POSTGRES STAGING` autorizado.
- Fase correctiva sugerida: según resultado de validación.

### M-005 — Prefijo duplicado `015`

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO`.
- Evidencia resumida: coexisten `015_assets_rls.sql` y `015_naming_rules_custom_segments.sql`; el orden depende del nombre completo, no de una versión única.
- Riesgo: alto; ambigüedad de trazabilidad y orden.
- Recomendación: no renombrar ni reescribir; resolver mediante decisión arquitectónica y fase autorizada.
- Fase correctiva sugerida: `PHASE-CORR-MIGRATION-GOVERNANCE`.

### M-006 — Estado efectivo de migraciones y RLS

- Origen de evidencia: `POSTGRES STAGING`.
- Estado: `BLOQUEADO`.
- Evidencia resumida: no hay acceso autorizado a PostgreSQL staging.
- Riesgo: crítico; se desconoce qué SQL/versiones/políticas están realmente aplicados.
- Recomendación: consultar `schema_migrations`, catálogo de políticas, atributos del rol y esquema con acceso autorizado de solo lectura.
- Fase correctiva sugerida: según hallazgos.
