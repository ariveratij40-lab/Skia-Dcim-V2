-- INV-ASSET-LOC-001..003 / INV-ASSET-NOM-009.
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS placement_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS placement_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES assets(id) ON DELETE RESTRICT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='locations'::regclass AND conname='locations_placement_type_check') THEN
    ALTER TABLE locations ADD CONSTRAINT locations_placement_type_check
      CHECK (placement_type IS NULL OR placement_type IN ('MDF','IDF','WAREHOUSE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='locations'::regclass AND conname='locations_status_check') THEN
    ALTER TABLE locations ADD CONSTRAINT locations_status_check CHECK (status IN ('active','inactive'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_tenant_branch_code
  ON locations(tenant_id,branch_id,placement_code) WHERE placement_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_asset
  ON locations(asset_id) WHERE asset_id IS NOT NULL;

ALTER TABLE naming_rules ADD COLUMN IF NOT EXISTS include_placement BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE naming_rules SET include_placement=TRUE
WHERE asset_type_code IN ('SWITCH','RACK','PATCH_PANEL','UPS','PDU','NODE');

CREATE TABLE IF NOT EXISTS nomenclature_counters (
  nomenclature_id UUID NOT NULL REFERENCES naming_rules(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  placement_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  last_seq INTEGER NOT NULL DEFAULT 0 CHECK(last_seq>=0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(nomenclature_id,branch_id,placement_id)
);

DROP INDEX IF EXISTS uq_assets_nomenclature_sequence;
CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_nomenclature_sequence_unplaced
  ON assets(nomenclature_id,nomenclature_sequence)
  WHERE nomenclature_id IS NOT NULL AND location_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_nomenclature_placement_sequence
  ON assets(nomenclature_id,location_id,nomenclature_sequence)
  WHERE nomenclature_id IS NOT NULL AND location_id IS NOT NULL;

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS locations_tenant_branch_isolation ON locations;
CREATE POLICY locations_tenant_branch_isolation ON locations
  USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND branch_id=NULLIF(current_setting('app.branch_id',true),'')::uuid)
  WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND branch_id=NULLIF(current_setting('app.branch_id',true),'')::uuid);

ALTER TABLE nomenclature_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE nomenclature_counters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nomenclature_counters_tenant_branch_isolation ON nomenclature_counters;
CREATE POLICY nomenclature_counters_tenant_branch_isolation ON nomenclature_counters
  USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND branch_id=NULLIF(current_setting('app.branch_id',true),'')::uuid)
  WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND branch_id=NULLIF(current_setting('app.branch_id',true),'')::uuid);

CREATE OR REPLACE FUNCTION enforce_asset_nomenclature() RETURNS TRIGGER AS $$
DECLARE required BOOLEAN; rule_active BOOLEAN; rule_prefix TEXT; rule_separator TEXT;
 rule_seq_digits INTEGER; rule_include_branch BOOLEAN; rule_include_placement BOOLEAN;
 rule_custom_1 TEXT; rule_custom_2 TEXT; branch_component TEXT; placement_component TEXT; expected_code TEXT;
BEGIN
 SELECT requires_nomenclature INTO required FROM asset_types WHERE id=NEW.asset_type_id;
 IF TG_OP='UPDATE' AND OLD.nomenclature_id IS NULL AND OLD.nomenclature_sequence IS NULL AND NEW.nomenclature_id IS NULL AND NEW.nomenclature_sequence IS NULL THEN RETURN NEW; END IF;
 IF COALESCE(required,FALSE) AND (NEW.nomenclature_id IS NULL OR NEW.nomenclature_sequence IS NULL) THEN RAISE EXCEPTION 'nomenclature_required' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.nomenclature_id IS NOT NULL AND (NEW.nomenclature_id IS DISTINCT FROM OLD.nomenclature_id OR NEW.nomenclature_sequence IS DISTINCT FROM OLD.nomenclature_sequence OR NEW.internal_code IS DISTINCT FROM OLD.internal_code) THEN RAISE EXCEPTION 'managed_asset_identity_immutable' USING ERRCODE='23514'; END IF;
 SELECT nr.active,nr.prefix,nr.separator,nr.seq_digits,nr.include_branch,nr.include_placement,COALESCE(nr.custom_segment_1,''),COALESCE(nr.custom_segment_2,'')
 INTO rule_active,rule_prefix,rule_separator,rule_seq_digits,rule_include_branch,rule_include_placement,rule_custom_1,rule_custom_2
 FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.id=NEW.nomenclature_id AND nr.tenant_id=NEW.tenant_id AND at.id=NEW.asset_type_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_asset_nomenclature' USING ERRCODE='23514'; END IF;
 IF NOT rule_active AND (TG_OP='INSERT' OR OLD.nomenclature_id IS NULL) THEN RAISE EXCEPTION 'inactive_asset_nomenclature' USING ERRCODE='23514'; END IF;
 IF rule_include_branch THEN SELECT LEFT(UPPER(REPLACE(COALESCE(NULLIF(city,''),name),' ','')),3) INTO branch_component FROM branches WHERE id=NEW.branch_id AND tenant_id=NEW.tenant_id; IF NOT FOUND THEN RAISE EXCEPTION 'invalid_asset_nomenclature_branch' USING ERRCODE='23514'; END IF; END IF;
 IF rule_include_placement THEN SELECT placement_code INTO placement_component FROM locations WHERE id=NEW.location_id AND tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND status='active' AND placement_type IN ('MDF','IDF','WAREHOUSE'); IF NOT FOUND THEN RAISE EXCEPTION 'invalid_asset_placement' USING ERRCODE='23514'; END IF; END IF;
 expected_code:=concat_ws(rule_separator,rule_prefix,NULLIF(branch_component,''),NULLIF(placement_component,''),NULLIF(UPPER(REPLACE(rule_custom_1,' ','')),''),NULLIF(UPPER(REPLACE(rule_custom_2,' ','')),''),LPAD(NEW.nomenclature_sequence::text,rule_seq_digits,'0'));
 IF NEW.internal_code IS DISTINCT FROM expected_code THEN RAISE EXCEPTION 'invalid_asset_nomenclature_code' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_asset_placement_scope() RETURNS TRIGGER AS $$
DECLARE ptype TEXT; pstatus TEXT;
BEGIN
  IF NEW.location_id IS NULL THEN RETURN NEW; END IF;
  SELECT placement_type,status INTO ptype,pstatus FROM locations
  WHERE id=NEW.location_id AND tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id;
  IF NOT FOUND OR ptype NOT IN ('MDF','IDF','WAREHOUSE') OR pstatus<>'active' THEN
    RAISE EXCEPTION 'invalid_asset_placement' USING ERRCODE='23514';
  END IF;
  IF ptype='WAREHOUSE' THEN NEW.status='inactive'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_enforce_asset_placement_scope ON assets;
CREATE TRIGGER trg_enforce_asset_placement_scope
  BEFORE INSERT OR UPDATE OF tenant_id,branch_id,location_id,status ON assets
  FOR EACH ROW EXECUTE FUNCTION enforce_asset_placement_scope();
