-- ============================================================
-- MIGRACIÓN: 012_fix_imported_assets_tenant_type.sql
-- DESCRIPCIÓN: Corrige el tipo de dato de imported_assets.tenant_id
--              de VARCHAR(255) a UUID con FK real hacia tenants(id).
--              También corrige branch_id, created_by y updated_by.
-- CONTEXTO: Los registros con tenant_id = '1' (string placeholder)
--           son datos de prueba del pipeline legacy. Con la BD limpia,
--           se trunca la tabla y se reconstruye el esquema correctamente.
-- RELACIONADO: F-AST-01 (fuga cross-tenant en listAssets), INV-DCM-0012
-- FECHA: 2026-07-29
-- ============================================================

-- PASO 1: Limpiar datos legacy con tenant_id inválido (no UUID)
-- Esto elimina los 2,397 registros con tenant_id = '1' (placeholder)
-- y cualquier otro registro con tenant_id que no sea un UUID válido.
-- NOTA: En ambiente de producción real, hacer backup antes de ejecutar.
DELETE FROM imported_assets
WHERE tenant_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- PASO 2: Agregar columnas UUID temporales
ALTER TABLE imported_assets
  ADD COLUMN IF NOT EXISTS tenant_id_new UUID,
  ADD COLUMN IF NOT EXISTS branch_id_new UUID,
  ADD COLUMN IF NOT EXISTS created_by_new UUID,
  ADD COLUMN IF NOT EXISTS updated_by_new UUID;

-- PASO 3: Copiar datos válidos a las columnas UUID
-- (Solo los registros que sobrevivieron al DELETE del paso 1)
UPDATE imported_assets
SET 
  tenant_id_new  = tenant_id::UUID,
  branch_id_new  = CASE WHEN branch_id  ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN branch_id::UUID  ELSE NULL END,
  created_by_new = CASE WHEN created_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN created_by::UUID ELSE NULL END,
  updated_by_new = CASE WHEN updated_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN updated_by::UUID ELSE NULL END
WHERE tenant_id IS NOT NULL;

-- PASO 4: Eliminar columnas VARCHAR antiguas
ALTER TABLE imported_assets
  DROP COLUMN IF EXISTS tenant_id,
  DROP COLUMN IF EXISTS branch_id,
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS updated_by;

-- PASO 5: Renombrar columnas nuevas
ALTER TABLE imported_assets
  RENAME COLUMN tenant_id_new  TO tenant_id;
ALTER TABLE imported_assets
  RENAME COLUMN branch_id_new  TO branch_id;
ALTER TABLE imported_assets
  RENAME COLUMN created_by_new TO created_by;
ALTER TABLE imported_assets
  RENAME COLUMN updated_by_new TO updated_by;

-- PASO 6: Agregar NOT NULL a tenant_id (columna crítica de aislamiento)
-- branch_id y created_by pueden ser NULL para registros legacy sin branch
ALTER TABLE imported_assets
  ALTER COLUMN tenant_id SET NOT NULL;

-- PASO 7: Agregar FK real hacia tenants(id)
-- Esto convierte el tipo en un guardia de integridad a nivel de BD:
-- si el código intenta insertar un tenant_id inválido, la BD lo rechaza.
ALTER TABLE imported_assets
  ADD CONSTRAINT fk_imported_assets_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES tenants(id)
    ON DELETE CASCADE;

-- PASO 8: Agregar índice para consultas filtradas por tenant (F-AST-01)
CREATE INDEX IF NOT EXISTS idx_imported_assets_tenant_branch
  ON imported_assets(tenant_id, branch_id);

-- PASO 9: Limpiar tabla inventory_imports_legacy (tabla huérfana)
-- No hay código activo que escriba en ella. Los datos son todos de prueba.
-- Se trunca en lugar de DROP para preservar el esquema por si se necesita
-- referencia histórica, pero sin datos que puedan confundir.
TRUNCATE TABLE inventory_imports_legacy;

-- ============================================================
-- VERIFICACIÓN POST-MIGRACIÓN
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'imported_assets' ORDER BY ordinal_position;
-- → tenant_id debe ser uuid, no character varying
--
-- SELECT COUNT(*) FROM imported_assets WHERE tenant_id::text = '1';
-- → Debe retornar 0
--
-- SELECT constraint_name FROM information_schema.table_constraints
-- WHERE table_name = 'imported_assets' AND constraint_type = 'FOREIGN KEY';
-- → Debe incluir fk_imported_assets_tenant
-- ============================================================
