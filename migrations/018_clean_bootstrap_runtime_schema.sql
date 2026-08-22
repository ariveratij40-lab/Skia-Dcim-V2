-- PHASE-010 forward-only clean-bootstrap runtime reconciliation.
-- This file does not repair existing STAGING data; it defines empty-DB state.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(100) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_uuid VARCHAR(255) NOT NULL UNIQUE,
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'parsing',
  progress INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  result_json JSONB,
  items_extracted INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, tenant_id, branch_id),
  CONSTRAINT fk_import_jobs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
  CONSTRAINT fk_import_jobs_branch_tenant FOREIGN KEY (branch_id, tenant_id)
    REFERENCES branches(id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS import_items (
  id BIGSERIAL PRIMARY KEY,
  import_job_id BIGINT NOT NULL,
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  name VARCHAR(255), ip_address VARCHAR(64), mac_address VARCHAR(64),
  model VARCHAR(255), brand VARCHAR(255), serial_number VARCHAR(255),
  location VARCHAR(255), category VARCHAR(50), confidence_score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_import_items_job_scope FOREIGN KEY (import_job_id, tenant_id, branch_id)
    REFERENCES import_jobs(id, tenant_id, branch_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS import_sessions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_token VARCHAR(255) NOT NULL UNIQUE,
  upload_id VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_import_sessions_branch_tenant FOREIGN KEY (branch_id, tenant_id)
    REFERENCES branches(id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS imported_assets (
  id BIGSERIAL PRIMARY KEY,
  import_id BIGINT NOT NULL,
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  asset_type VARCHAR(100) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  estado VARCHAR(50) NOT NULL DEFAULT 'activo',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_imported_assets_import_scope FOREIGN KEY (import_id, tenant_id, branch_id)
    REFERENCES inventory_imports(id, tenant_id, branch_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS import_errors (
  id BIGSERIAL PRIMARY KEY, import_id BIGINT NOT NULL, tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL, item_index INTEGER NOT NULL, error_message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (import_id, tenant_id, branch_id)
    REFERENCES inventory_imports(id, tenant_id, branch_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS import_warnings (
  id BIGSERIAL PRIMARY KEY, import_id BIGINT NOT NULL, tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL, item_index INTEGER NOT NULL, warning_message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (import_id, tenant_id, branch_id)
    REFERENCES inventory_imports(id, tenant_id, branch_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_clear_logs (
  id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  user_email VARCHAR(255) NOT NULL, timestamp TIMESTAMPTZ NOT NULL,
  action VARCHAR(100) NOT NULL, details TEXT NOT NULL, status VARCHAR(30) NOT NULL
);

CREATE TABLE IF NOT EXISTS capex_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL, code VARCHAR(100) NOT NULL,
  name VARCHAR(300) NOT NULL, description TEXT, category VARCHAR(100) NOT NULL DEFAULT 'infraestructura',
  status VARCHAR(50) NOT NULL DEFAULT 'planificado', priority VARCHAR(50) NOT NULL DEFAULT 'media',
  responsible VARCHAR(200), responsible_email VARCHAR(300), department VARCHAR(200), cost_center VARCHAR(100),
  budget_usd NUMERIC(14,2) NOT NULL DEFAULT 0, spent_usd NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD', exchange_rate NUMERIC(10,4) NOT NULL DEFAULT 1,
  fiscal_year INTEGER, quarter VARCHAR(10), start_date DATE, end_date DATE, po_number VARCHAR(100),
  invoice_number VARCHAR(100), integrator VARCHAR(200), justification TEXT, roi_months INTEGER,
  observations TEXT, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS capex_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), capex_id UUID NOT NULL REFERENCES capex_projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, description VARCHAR(400) NOT NULL,
  category VARCHAR(100), quantity NUMERIC(10,2) NOT NULL DEFAULT 1, unit VARCHAR(50),
  unit_cost_usd NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_usd NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_cost_usd) STORED,
  supplier VARCHAR(200), part_number VARCHAR(200), status VARCHAR(50) DEFAULT 'pendiente',
  notes TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS cert_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, site_id UUID NOT NULL,
  site_name TEXT NOT NULL, standard TEXT NOT NULL, evaluator TEXT NOT NULL DEFAULT '', eval_date DATE NOT NULL,
  answers JSONB NOT NULL DEFAULT '[]', overall_pct NUMERIC(5,2), badge TEXT NOT NULL DEFAULT 'Encaminado',
  notes TEXT NOT NULL DEFAULT '', report_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS photo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ref_image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE racks ADD COLUMN IF NOT EXISTS mdf_idf_id UUID REFERENCES mdf_idf(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS ai_chat_history (
  id BIGSERIAL PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_message TEXT NOT NULL, assistant_message TEXT NOT NULL, model VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_scope ON import_jobs(tenant_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_items_scope ON import_items(tenant_id, branch_id, import_job_id);
CREATE INDEX IF NOT EXISTS idx_imported_assets_scope ON imported_assets(tenant_id, branch_id, import_id);
CREATE INDEX IF NOT EXISTS idx_capex_projects_tenant ON capex_projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_capex_items_tenant ON capex_line_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_history_actor ON ai_chat_history(tenant_id, user_id, created_at DESC);

-- The file migrations above supersede hidden startup migrations on a clean DB.
INSERT INTO schema_migrations(version) VALUES
 ('006_config_admin_schema'), ('007_fix_password_hashes'), ('008_fix_user_roles_schema'),
 ('009_capex_schema'), ('011_password_reset_tokens'), ('012_fix_imported_assets_tenant_type'),
 ('013_racks_mdf_idf_id'), ('014_cert_evaluations')
ON CONFLICT (version) DO NOTHING;
