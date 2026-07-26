-- ============================================================
-- SCHEMA EMPRESARIAL DE IMPORTACIÓN
-- Fase 1: Nuevas tablas para arquitectura completa
-- ============================================================

-- ============================================================
-- 1. TABLA: inventory_import_rows
-- Almacena cada fila importada con su estado
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_import_rows (
    id BIGSERIAL PRIMARY KEY,
    import_id BIGINT NOT NULL REFERENCES inventory_imports(id) ON DELETE CASCADE,
    row_number INT NOT NULL,
    
    -- Datos extraídos del documento
    raw_data JSONB NOT NULL DEFAULT '{}',
    
    -- Datos normalizados
    normalized_data JSONB NOT NULL DEFAULT '{}',
    
    -- Estado de la fila
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- Estados: pending, correct, warning, error, duplicate, corrected, accepted, rejected
    
    -- Información de validación
    validation_errors TEXT[] DEFAULT '{}',
    validation_warnings TEXT[] DEFAULT '{}',
    
    -- Duplicado detectado
    duplicate_asset_id UUID,
    duplicate_match_fields TEXT[] DEFAULT '{}',
    
    -- Correcciones del usuario
    user_corrections JSONB DEFAULT '{}',
    corrected_by UUID,
    corrected_at TIMESTAMP,
    
    -- Auditoría
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_status CHECK (status IN ('pending', 'correct', 'warning', 'error', 'duplicate', 'corrected', 'accepted', 'rejected'))
);

CREATE INDEX idx_import_rows_import_id ON inventory_import_rows(import_id);
CREATE INDEX idx_import_rows_status ON inventory_import_rows(status);
CREATE INDEX idx_import_rows_duplicate_asset_id ON inventory_import_rows(duplicate_asset_id);

-- ============================================================
-- 2. TABLA: import_validation_results
-- Resultado detallado de validaciones por fila
-- ============================================================
CREATE TABLE IF NOT EXISTS import_validation_results (
    id BIGSERIAL PRIMARY KEY,
    import_row_id BIGINT NOT NULL REFERENCES inventory_import_rows(id) ON DELETE CASCADE,
    
    -- Tipo de validación
    validation_type VARCHAR(100) NOT NULL,
    -- Ejemplos: field_required, field_format, field_range, reference_exists, duplicate_check
    
    -- Campo validado
    field_name VARCHAR(100),
    
    -- Resultado
    is_valid BOOLEAN NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'error',
    -- Severidades: info, warning, error
    
    -- Mensaje
    message TEXT NOT NULL,
    
    -- Detalles
    details JSONB DEFAULT '{}',
    
    -- Auditoría
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_severity CHECK (severity IN ('info', 'warning', 'error'))
);

CREATE INDEX idx_validation_results_import_row_id ON import_validation_results(import_row_id);
CREATE INDEX idx_validation_results_validation_type ON import_validation_results(validation_type);

-- ============================================================
-- 3. TABLA: import_duplicates
-- Registro de duplicados detectados
-- ============================================================
CREATE TABLE IF NOT EXISTS import_duplicates (
    id BIGSERIAL PRIMARY KEY,
    import_id BIGINT NOT NULL REFERENCES inventory_imports(id) ON DELETE CASCADE,
    import_row_id BIGINT NOT NULL REFERENCES inventory_import_rows(id) ON DELETE CASCADE,
    
    -- Activo existente que es duplicado
    existing_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    
    -- Campos que coinciden
    match_fields TEXT[] NOT NULL,
    match_confidence DECIMAL(5,2) NOT NULL,
    -- 0-100: porcentaje de coincidencia
    
    -- Acción tomada
    action VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- Acciones: pending, ignore, merge, update, replace
    
    -- Detalles
    details JSONB DEFAULT '{}',
    
    -- Auditoría
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_action CHECK (action IN ('pending', 'ignore', 'merge', 'update', 'replace'))
);

CREATE INDEX idx_duplicates_import_id ON import_duplicates(import_id);
CREATE INDEX idx_duplicates_existing_asset_id ON import_duplicates(existing_asset_id);
CREATE INDEX idx_duplicates_action ON import_duplicates(action);

-- ============================================================
-- 4. TABLA: import_logs
-- Historial completo de importación
-- ============================================================
CREATE TABLE IF NOT EXISTS import_logs (
    id BIGSERIAL PRIMARY KEY,
    import_id BIGINT NOT NULL REFERENCES inventory_imports(id) ON DELETE CASCADE,
    
    -- Tipo de evento
    event_type VARCHAR(50) NOT NULL,
    -- Ejemplos: file_uploaded, parsing_started, parsing_completed, validation_started, validation_completed, preview_generated, user_corrected, import_confirmed, import_completed, import_failed, rollback
    
    -- Descripción
    description TEXT,
    
    -- Datos del evento
    event_data JSONB DEFAULT '{}',
    
    -- Usuario que causó el evento
    user_id UUID,
    
    -- Auditoría
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_logs_import_id ON import_logs(import_id);
CREATE INDEX idx_import_logs_event_type ON import_logs(event_type);
CREATE INDEX idx_import_logs_user_id ON import_logs(user_id);

-- ============================================================
-- 5. TABLA: audit_logs
-- Registro permanente de auditoría
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    
    -- Contexto
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    user_id UUID NOT NULL,
    
    -- Acción
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    
    -- Cambios
    old_values JSONB DEFAULT '{}',
    new_values JSONB DEFAULT '{}',
    
    -- Contexto técnico
    ip_address INET,
    user_agent TEXT,
    
    -- Auditoría
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================
-- 6. ACTUALIZAR TABLA: inventory_imports
-- Agregar nuevos campos para flujo empresarial
-- ============================================================
ALTER TABLE inventory_imports ADD COLUMN IF NOT EXISTS
    workflow_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    -- Estados: pending, parsing, validating, preview, correcting, approved, importing, completed, failed
    CONSTRAINT valid_workflow_status CHECK (workflow_status IN ('pending', 'parsing', 'validating', 'preview', 'correcting', 'approved', 'importing', 'completed', 'failed'));

ALTER TABLE inventory_imports ADD COLUMN IF NOT EXISTS
    total_rows INT DEFAULT 0;

ALTER TABLE inventory_imports ADD COLUMN IF NOT EXISTS
    correct_rows INT DEFAULT 0;

ALTER TABLE inventory_imports ADD COLUMN IF NOT EXISTS
    warning_rows INT DEFAULT 0;

ALTER TABLE inventory_imports ADD COLUMN IF NOT EXISTS
    error_rows INT DEFAULT 0;

ALTER TABLE inventory_imports ADD COLUMN IF NOT EXISTS
    duplicate_rows INT DEFAULT 0;

ALTER TABLE inventory_imports ADD COLUMN IF NOT EXISTS
    approved_by UUID;

ALTER TABLE inventory_imports ADD COLUMN IF NOT EXISTS
    approved_at TIMESTAMP;

ALTER TABLE inventory_imports ADD COLUMN IF NOT EXISTS
    import_started_at TIMESTAMP;

ALTER TABLE inventory_imports ADD COLUMN IF NOT EXISTS
    import_completed_at TIMESTAMP;

ALTER TABLE inventory_imports ADD COLUMN IF NOT EXISTS
    mode VARCHAR(20) DEFAULT 'normal',
    -- Modos: normal, simulation
    CONSTRAINT valid_mode CHECK (mode IN ('normal', 'simulation'));

-- ============================================================
-- 7. TABLA: import_templates
-- Plantillas oficiales para cada tipo de activo
-- ============================================================
CREATE TABLE IF NOT EXISTS import_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identificación
    asset_type_id UUID NOT NULL REFERENCES asset_types(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Campos de la plantilla
    required_fields TEXT[] NOT NULL DEFAULT '{}',
    optional_fields TEXT[] NOT NULL DEFAULT '{}',
    field_mappings JSONB NOT NULL DEFAULT '{}',
    -- Mapea nombres de columnas a campos del sistema
    
    -- Validaciones
    validation_rules JSONB NOT NULL DEFAULT '{}',
    
    -- Ejemplos
    example_data JSONB DEFAULT '{}',
    
    -- Auditoría
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL
);

CREATE INDEX idx_templates_asset_type_id ON import_templates(asset_type_id);

-- ============================================================
-- 8. TABLA: import_reports
-- Reportes generados de importaciones
-- ============================================================
CREATE TABLE IF NOT EXISTS import_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id BIGINT NOT NULL REFERENCES inventory_imports(id) ON DELETE CASCADE,
    
    -- Tipo de reporte
    report_type VARCHAR(20) NOT NULL,
    -- Tipos: pdf, excel, json, csv
    
    -- Contenido
    file_path TEXT NOT NULL,
    file_size BIGINT,
    
    -- Contenido del reporte
    summary JSONB NOT NULL DEFAULT '{}',
    
    -- Auditoría
    generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    generated_by UUID NOT NULL
);

CREATE INDEX idx_reports_import_id ON import_reports(import_id);

-- ============================================================
-- Crear índices adicionales para rendimiento
-- ============================================================
CREATE INDEX idx_assets_tenant_branch ON assets(tenant_id, branch_id);
CREATE INDEX idx_assets_serial_number ON assets(serial_number);
CREATE INDEX idx_assets_internal_code ON assets(internal_code);
CREATE INDEX idx_assets_rfid_tag ON assets(rfid_tag);

-- ============================================================
-- Crear función para actualizar updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a tablas que lo necesitan
DROP TRIGGER IF EXISTS update_inventory_import_rows_updated_at ON inventory_import_rows;
CREATE TRIGGER update_inventory_import_rows_updated_at
    BEFORE UPDATE ON inventory_import_rows
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_import_duplicates_updated_at ON import_duplicates;
CREATE TRIGGER update_import_duplicates_updated_at
    BEFORE UPDATE ON import_duplicates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_import_templates_updated_at ON import_templates;
CREATE TRIGGER update_import_templates_updated_at
    BEFORE UPDATE ON import_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Comentarios de documentación
-- ============================================================
COMMENT ON TABLE inventory_import_rows IS 'Almacena cada fila de una importación con su estado, validaciones y correcciones del usuario';
COMMENT ON TABLE import_validation_results IS 'Resultado detallado de cada validación realizada a una fila';
COMMENT ON TABLE import_duplicates IS 'Registro de duplicados detectados durante la importación';
COMMENT ON TABLE import_logs IS 'Historial de eventos durante el proceso de importación';
COMMENT ON TABLE audit_logs IS 'Registro permanente de auditoría de todas las acciones del sistema';
COMMENT ON TABLE import_templates IS 'Plantillas oficiales para importación de cada tipo de activo';
COMMENT ON TABLE import_reports IS 'Reportes generados automáticamente al finalizar importaciones';
