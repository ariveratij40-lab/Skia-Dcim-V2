-- INV-ASSET-NOM-001..005: authoritative nomenclature for new managed assets.
-- Existing assets remain untouched and are classified as legacy until remediated.

ALTER TABLE naming_rules
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE asset_types
  ADD COLUMN IF NOT EXISTS requires_nomenclature BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE asset_types SET requires_nomenclature=TRUE
WHERE code IN ('MDF','IDF','RACK','SWITCH','UPS','PDU','PATCH_PANEL','NODE','BACKBONE');

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS nomenclature_id UUID REFERENCES naming_rules(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS nomenclature_sequence INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_nomenclature_sequence
  ON assets(nomenclature_id, nomenclature_sequence)
  WHERE nomenclature_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assets_nomenclature_id
  ON assets(nomenclature_id)
  WHERE nomenclature_id IS NOT NULL;

COMMENT ON COLUMN assets.nomenclature_id IS
  'Authoritative naming rule used by the backend to generate internal_code; NULL identifies legacy rows only.';
COMMENT ON COLUMN assets.nomenclature_sequence IS
  'Sequence reserved transactionally from naming_rules.last_seq for this asset.';

CREATE OR REPLACE FUNCTION enforce_asset_nomenclature()
RETURNS TRIGGER AS $$
DECLARE
  required BOOLEAN;
BEGIN
  SELECT requires_nomenclature INTO required FROM asset_types WHERE id=NEW.asset_type_id;
  IF COALESCE(required,FALSE) AND (NEW.nomenclature_id IS NULL OR NEW.nomenclature_sequence IS NULL) THEN
    RAISE EXCEPTION 'nomenclature_required' USING ERRCODE='23514';
  END IF;
  IF NEW.nomenclature_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code
    WHERE nr.id=NEW.nomenclature_id AND nr.tenant_id=NEW.tenant_id
      AND nr.active AND at.id=NEW.asset_type_id
  ) THEN
    RAISE EXCEPTION 'invalid_asset_nomenclature' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_asset_nomenclature ON assets;
CREATE TRIGGER trg_enforce_asset_nomenclature
  BEFORE INSERT ON assets FOR EACH ROW EXECUTE FUNCTION enforce_asset_nomenclature();

-- The runtime role reads and reserves only rules belonging to its tenant.
ALTER TABLE naming_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE naming_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS naming_rules_tenant_isolation ON naming_rules;
CREATE POLICY naming_rules_tenant_isolation ON naming_rules
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Satellite records carry tenant and branch explicitly. Protect direct reads
-- as well as inserts; API joins are not the security boundary.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['mdf_idf','racks','switches','ups','pdus','patch_panels','backbone_links','nodes']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_tenant_branch_isolation', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid AND branch_id = NULLIF(current_setting(''app.branch_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid AND branch_id = NULLIF(current_setting(''app.branch_id'', true), '''')::uuid)',
      table_name || '_tenant_branch_isolation', table_name
    );
  END LOOP;
END $$;
