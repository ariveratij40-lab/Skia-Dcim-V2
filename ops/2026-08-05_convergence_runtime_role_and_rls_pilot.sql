-- ============================================================================
-- SKIA — Commit de convergencia: separación de rol de runtime + piloto RLS
-- Fecha: 2026-08-05
-- Relacionado: C-4 (rol skia_runtime), C-2 (RLS — piloto assets/asset_logs/
--              asset_relationships, ya aplicado ad hoc en staging el 2026-08-04)
--
-- IMPORTANTE — por qué este script NO vive en backend/migrations.go:
-- `runMigrations()` se ejecuta con la conexión normal de la aplicación
-- (DB_USER). Después de C-4, esa conexión es `skia_runtime`: sin SUPERUSER,
-- sin BYPASSRLS, sin CREATEROLE/CREATEDB, y (una vez cerrado A-7) sin ser
-- propietario de las tablas. Ninguna de las sentencias de este script podría
-- ejecutarse con ese rol — CREATE ROLE, ENABLE ROW LEVEL SECURITY y CREATE
-- POLICY exigen ser superusuario o propietario del objeto. Meter esto en
-- runMigrations() haría que el arranque del API falle en cuanto se aplicara
-- el cutover de DB_USER, o forzaría a mantener privilegios elevados en el
-- rol de runtime, anulando el propósito de C-4.
--
-- Este script debe ejecutarse manualmente, una vez por entorno, con un rol
-- privilegiado (skia_user o superusuario equivalente):
--
--   docker exec -i skia_postgres_staging psql -U skia_user -d skia_db \
--     -v runtime_password="'<password fuera de control de versiones>'" \
--     -f ops/2026-08-05_convergence_runtime_role_and_rls_pilot.sql
--
-- Es idempotente: puede correrse varias veces sin efectos destructivos.
--
-- PENDIENTE (fuera de alcance de este script, ver expediente de auditoría):
--   - A-7 / transferencia de propiedad de tablas a un rol de esquema
--     distinto de skia_runtime (declarado "no posee tablas" pero no
--     verificado con una consulta a pg_tables — ver §11.2 del informe).
--   - Extender RLS al resto de tablas con tenant_id/branch_id (C-2 sigue
--     abierto; este script solo formaliza el piloto de 3 tablas).
--   - Prueba negativa cross-tenant explícita y prueba del caso "sin
--     SET LOCAL" (fail-closed) — deben ejecutarse aparte, no las cubre
--     este script.
--   - Decidir el rol que ejecutará futuras migraciones de DDL (¿un
--     skia_migrator dedicado, distinto de skia_runtime y de skia_user?).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Rol de runtime sin privilegios elevados (C-4)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'skia_runtime') THEN
    CREATE ROLE skia_runtime WITH
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS
      CONNECTION LIMIT -1;
    RAISE NOTICE 'Rol skia_runtime creado.';
  ELSE
    RAISE NOTICE 'Rol skia_runtime ya existe; se reafirman sus atributos.';
  END IF;
END
$$;

-- Reafirmar atributos incluso si el rol ya existía (idempotente y defensivo:
-- si alguien lo recreó a mano con otros flags, esto lo vuelve a dejar
-- correcto en la próxima corrida del script).
ALTER ROLE skia_runtime NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- La contraseña se fija por separado, fuera de control de versiones.
-- Si se invoca este script con `-v runtime_password=...`, se aplica aquí;
-- si no se provee la variable, este bloque se omite (no falla el script).
\if :{?runtime_password}
  ALTER ROLE skia_runtime WITH PASSWORD :runtime_password;
\endif

GRANT CONNECT ON DATABASE skia_db TO skia_runtime;
GRANT USAGE ON SCHEMA public TO skia_runtime;

-- Privilegios mínimos necesarios para operar (DML, no DDL):
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO skia_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO skia_runtime;

-- Para que las tablas/secuencias creadas por futuras migraciones (aplicadas
-- por el rol propietario/migrador, no por skia_runtime) también queden
-- accesibles sin tener que volver a correr GRANTs a mano:
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO skia_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO skia_runtime;

-- ----------------------------------------------------------------------------
-- 2. Piloto de Row-Level Security: assets, asset_logs, asset_relationships
--    (formaliza como migración reproducible lo ya verificado en staging el
--    2026-08-04; ver C-2 en el informe de auditoría)
-- ----------------------------------------------------------------------------

-- assets: aislado por tenant_id Y branch_id.
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assets_tenant_branch_isolation ON assets;
CREATE POLICY assets_tenant_branch_isolation ON assets
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid
  );

-- asset_logs: aislado por tenant_id (no tiene branch_id propio).
ALTER TABLE asset_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS asset_logs_tenant_isolation ON asset_logs;
CREATE POLICY asset_logs_tenant_isolation ON asset_logs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- asset_relationships: aislado por tenant_id (no tiene branch_id propio).
ALTER TABLE asset_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_relationships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS asset_relationships_tenant_isolation ON asset_relationships;
CREATE POLICY asset_relationships_tenant_isolation ON asset_relationships
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- NOTA sobre "fail-closed": current_setting(..., true) devuelve NULL si la
-- variable de sesión no fue seteada (p. ej. una transacción que olvidó
-- ejecutar SET LOCAL app.tenant_id). `tenant_id = NULL` evalúa a NULL, no a
-- TRUE, en una cláusula USING/WITH CHECK Postgres trata eso como "no
-- visible / no permitido" -> por diseño esto falla cerrado. Esto es una
-- lectura del comportamiento documentado de Postgres, NO una prueba
-- ejecutada; el punto 3 de "pendiente" arriba sigue abierto hasta que se
-- verifique explícitamente contra el entorno real.

-- ----------------------------------------------------------------------------
-- 3. Verificación (salida informativa, no falla el script)
-- ----------------------------------------------------------------------------
SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
FROM pg_roles WHERE rolname = 'skia_runtime';

SELECT schemaname, tablename, tableowner
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('assets', 'asset_logs', 'asset_relationships');

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('assets', 'asset_logs', 'asset_relationships')
ORDER BY tablename;
