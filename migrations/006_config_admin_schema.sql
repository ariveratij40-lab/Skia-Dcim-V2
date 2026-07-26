-- ==========================================
-- Migración 006: Configuración y Administración
-- ==========================================

-- Tabla de configuración por tenant (clave-valor JSON)
CREATE TABLE IF NOT EXISTS tenant_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  section VARCHAR(100) NOT NULL,   -- 'preferencias', 'branding', 'seguridad', 'rfid', 'modulos', 'notificaciones'
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(tenant_id, section)
);

-- Tabla de integraciones por tenant
CREATE TABLE IF NOT EXISTS tenant_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_code VARCHAR(100) NOT NULL,   -- 'fluke', 'panduit', 'active_directory', 'slack', 'jira', 'teams'
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'disconnected', -- 'connected', 'disconnected', 'error'
  config JSONB NOT NULL DEFAULT '{}',        -- credenciales cifradas / config
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, integration_code)
);

-- Tabla de API Keys por tenant
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) NOT NULL UNIQUE,   -- hash del token real
  key_prefix VARCHAR(20) NOT NULL,          -- primeros 12 chars para mostrar
  permissions JSONB DEFAULT '[]',
  active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMP,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de proyectos / sitios por tenant
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',   -- 'active', 'planned', 'archived'
  responsible VARCHAR(255),
  start_date DATE,
  modules JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de integradores (empresas contratistas)
CREATE TABLE IF NOT EXISTS integrators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  specialties JSONB DEFAULT '[]',
  rating SMALLINT DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  projects_count INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de lectores RFID por tenant
CREATE TABLE IF NOT EXISTS rfid_readers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reader_code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45),
  status VARCHAR(50) DEFAULT 'offline',  -- 'online', 'offline'
  reader_type VARCHAR(50) DEFAULT 'fixed',
  location VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, reader_code)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_tenant_config_tenant_section ON tenant_config(tenant_id, section);
CREATE INDEX IF NOT EXISTS idx_tenant_integrations_tenant ON tenant_integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integrators_tenant ON integrators(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rfid_readers_tenant ON rfid_readers(tenant_id);

-- Seed de integraciones disponibles para todos los tenants
INSERT INTO tenant_integrations (tenant_id, integration_code, name, status, config)
SELECT 
  t.id,
  i.code,
  i.name,
  'disconnected',
  i.default_config::jsonb
FROM tenants t
CROSS JOIN (VALUES
  ('fluke',            'Fluke DSX',          '{"endpoint":"https://api.fluke.com/v2","token":""}'),
  ('panduit',          'Panduit',             '{"apiKey":"","orgId":""}'),
  ('active_directory', 'Active Directory',    '{"server":"","baseDN":"","bindUser":""}'),
  ('slack',            'Slack',               '{"webhookUrl":"","channel":"#infraestructura"}'),
  ('jira',             'Jira',                '{"baseUrl":"","token":"","project":"INFRA"}'),
  ('teams',            'Microsoft Teams',     '{"webhookUrl":""}')
) AS i(code, name, default_config)
ON CONFLICT (tenant_id, integration_code) DO NOTHING;
