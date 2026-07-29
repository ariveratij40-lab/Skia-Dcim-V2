package main

import (
	"database/sql"
	"fmt"
	"log"
)

// runMigrations aplica todas las migraciones pendientes al arrancar el servidor.
// Usa una tabla schema_migrations para rastrear qué versiones ya se aplicaron.
func runMigrations(db *sql.DB) error {
	// Crear tabla de control de migraciones si no existe
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version     VARCHAR(100) PRIMARY KEY,
			applied_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return fmt.Errorf("error creando schema_migrations: %w", err)
	}

	// Lista de migraciones en orden
	migrations := []struct {
		version string
		sql     string
	}{
		{
			version: "006_config_admin_schema",
			sql: `
-- Extensión UUID (puede ya existir)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla de configuración por tenant (clave-valor JSON)
CREATE TABLE IF NOT EXISTS tenant_config (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  section     VARCHAR(100) NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(tenant_id, section)
);

-- Tabla de integraciones por tenant
CREATE TABLE IF NOT EXISTS tenant_integrations (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_code   VARCHAR(100) NOT NULL,
  name               VARCHAR(200) NOT NULL,
  status             VARCHAR(50) DEFAULT 'disconnected',
  config             JSONB DEFAULT '{}',
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, integration_code)
);

-- Tabla de API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  key_hash    VARCHAR(500) NOT NULL,
  key_prefix  VARCHAR(20) NOT NULL,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  last_used   TIMESTAMP,
  expires_at  TIMESTAMP,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de lectores RFID
CREATE TABLE IF NOT EXISTS rfid_readers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  location    VARCHAR(300),
  ip_address  VARCHAR(50),
  status      VARCHAR(50) DEFAULT 'offline',
  last_seen   TIMESTAMP,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de proyectos / sitios
CREATE TABLE IF NOT EXISTS projects (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(300) NOT NULL,
  description  TEXT,
  status       VARCHAR(50) DEFAULT 'active',
  responsible  VARCHAR(200),
  start_date   DATE,
  modules      JSONB DEFAULT '[]',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de integradores
CREATE TABLE IF NOT EXISTS integrators (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(300) NOT NULL,
  contact_name  VARCHAR(200),
  email         VARCHAR(300),
  phone         VARCHAR(50),
  specialties   JSONB DEFAULT '[]',
  rating        INTEGER DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de roles de usuario
CREATE TABLE IF NOT EXISTS user_roles (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role       VARCHAR(50) NOT NULL DEFAULT 'viewer',
  PRIMARY KEY (user_id, tenant_id)
);

-- Seed de integraciones por defecto para todos los tenants existentes
INSERT INTO tenant_integrations (tenant_id, integration_code, name, status)
SELECT t.id, i.code, i.name, 'disconnected'
FROM tenants t
CROSS JOIN (VALUES
  ('fluke',            'Fluke DSX'),
  ('panduit',          'Panduit'),
  ('active_directory', 'Active Directory'),
  ('slack',            'Slack'),
  ('jira',             'Jira'),
  ('teams',            'Microsoft Teams')
) AS i(code, name)
ON CONFLICT (tenant_id, integration_code) DO NOTHING;
`,
		},
		{
			version: "007_fix_password_hashes",
			sql: `
-- Corregir hashes de contraseña inválidos en usuarios demo
-- Contraseña: demo123456 (argon2id real, m=65536,t=1,p=4)
UPDATE users
SET password_hash = '$argon2id$v=19$m=65536,t=1,p=4$a4HjH1zO6q3vrRU32GQCYA$MccUyox8HrDlUhj+uA8NP9LKbPS2zRm9EaGMRKiHoTg'
WHERE password_hash LIKE '%$$hash'
   OR password_hash = ''
   OR password_hash IS NULL;
`,
		},
			{
				version: "008_fix_user_roles_schema",
				sql: `
-- La migración 006 creó user_roles con columna 'role' (string)
-- pero el schema original (001_init.sql) usa role_id (UUID FK a roles)
-- Agregar columna role_id si no existe, para compatibilidad
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_roles' AND column_name = 'role_id'
  ) THEN
    ALTER TABLE user_roles ADD COLUMN role_id UUID REFERENCES roles(id) ON DELETE CASCADE;
  END IF;
END;
$$;
-- Migrar datos existentes: convertir role string a role_id UUID
-- Solo si la columna 'role' existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_roles' AND column_name = 'role'
  ) THEN
    UPDATE user_roles ur
    SET role_id = r.id
    FROM roles r
    WHERE r.tenant_id = ur.tenant_id
      AND r.name = ur.role
      AND ur.role_id IS NULL;
  END IF;
END;
$$;
`,
			},
		{
			version: "009_capex_schema",
			sql: `
-- ============================================================
-- CAPEX: Presupuestos de Capital para infraestructura de red
-- ============================================================

-- Tabla principal de proyectos CAPEX
CREATE TABLE IF NOT EXISTS capex_projects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
  code            VARCHAR(100) NOT NULL,
  name            VARCHAR(300) NOT NULL,
  description     TEXT,
  category        VARCHAR(100) NOT NULL DEFAULT 'infraestructura',
  status          VARCHAR(50)  NOT NULL DEFAULT 'planificado',
  priority        VARCHAR(50)  NOT NULL DEFAULT 'media',
  responsible     VARCHAR(200),
  responsible_email VARCHAR(300),
  department      VARCHAR(200),
  cost_center     VARCHAR(100),
  budget_usd      NUMERIC(14,2) NOT NULL DEFAULT 0,
  spent_usd       NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(10)  NOT NULL DEFAULT 'USD',
  exchange_rate   NUMERIC(10,4) NOT NULL DEFAULT 1,
  fiscal_year     INTEGER,
  quarter         VARCHAR(10),
  start_date      DATE,
  end_date        DATE,
  po_number       VARCHAR(100),
  invoice_number  VARCHAR(100),
  integrator      VARCHAR(200),
  justification   TEXT,
  roi_months      INTEGER,
  observations    TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capex_projects_tenant ON capex_projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_capex_projects_status ON capex_projects(status);
CREATE INDEX IF NOT EXISTS idx_capex_projects_fiscal_year ON capex_projects(fiscal_year);

-- Partidas / líneas de costo dentro de un proyecto CAPEX
CREATE TABLE IF NOT EXISTS capex_line_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  capex_id        UUID NOT NULL REFERENCES capex_projects(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  description     VARCHAR(400) NOT NULL,
  category        VARCHAR(100),
  quantity        NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit            VARCHAR(50),
  unit_cost_usd   NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_usd       NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_cost_usd) STORED,
  supplier        VARCHAR(200),
  part_number     VARCHAR(200),
  status          VARCHAR(50) DEFAULT 'pendiente',
  notes           TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capex_items_capex ON capex_line_items(capex_id);
CREATE INDEX IF NOT EXISTS idx_capex_items_tenant ON capex_line_items(tenant_id);
`,
		},
				{
			version: "011_password_reset_tokens",
			sql: `
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(128) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
`,
		},
		// 012: Corrige tipo de imported_assets.tenant_id de VARCHAR a UUID con FK real
		// Elimina registros legacy con tenant_id placeholder '1' (F-AST-01 / INV-DCM-0012)
		// Esquema real de imported_assets: id, import_id, tenant_id, asset_type, nombre, metadata,
		//   created_by, updated_by, created_at, updated_at (NO tiene branch_id)
		{
			version: "012_fix_imported_assets_tenant_type",
			sql: `
-- Limpiar registros con tenant_id no-UUID (placeholders legacy como '1')
DELETE FROM imported_assets
WHERE tenant_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Agregar columna UUID temporal para tenant_id
ALTER TABLE imported_assets
  ADD COLUMN IF NOT EXISTS tenant_id_new UUID;

-- Copiar datos UUID válidos
UPDATE imported_assets
SET tenant_id_new = tenant_id::UUID
WHERE tenant_id IS NOT NULL
  AND tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Eliminar columna VARCHAR antigua
ALTER TABLE imported_assets DROP COLUMN IF EXISTS tenant_id;

-- Renombrar columna nueva
ALTER TABLE imported_assets RENAME COLUMN tenant_id_new TO tenant_id;

-- NOT NULL en tenant_id
ALTER TABLE imported_assets ALTER COLUMN tenant_id SET NOT NULL;

-- FK real hacia tenants(id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_imported_assets_tenant'
    AND table_name = 'imported_assets'
  ) THEN
    ALTER TABLE imported_assets
      ADD CONSTRAINT fk_imported_assets_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE;
  END IF;
END $$;

-- Índice para consultas filtradas por tenant (cierra F-AST-01)
CREATE INDEX IF NOT EXISTS idx_imported_assets_tenant
  ON imported_assets(tenant_id);

-- Limpiar tabla legacy huérfana
TRUNCATE TABLE inventory_imports_legacy;
`,
		},
	}

	for _, m := range migrations {
		// Verificar si ya se aplicó
		var count int
		err := db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version = $1`, m.version).Scan(&count)
		if err != nil {
			return fmt.Errorf("error verificando migración %s: %w", m.version, err)
		}
		if count > 0 {
			log.Printf("⏭  Migración %s ya aplicada, saltando", m.version)
			continue
		}

		// Aplicar migración
		log.Printf("🔄 Aplicando migración %s...", m.version)
		_, err = db.Exec(m.sql)
		if err != nil {
			return fmt.Errorf("error aplicando migración %s: %w", m.version, err)
		}

		// Registrar como aplicada
		_, err = db.Exec(`INSERT INTO schema_migrations (version) VALUES ($1)`, m.version)
		if err != nil {
			return fmt.Errorf("error registrando migración %s: %w", m.version, err)
		}
		log.Printf("✅ Migración %s aplicada exitosamente", m.version)
	}

	return nil
}
