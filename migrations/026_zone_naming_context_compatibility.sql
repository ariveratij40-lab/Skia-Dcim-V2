-- PHASE 1.2D-B1C: additive Zone-only MDF/IDF capability and versioned
-- tenant naming context. Existing rules remain active legacy version 1.

ALTER TABLE naming_rules
  ADD COLUMN IF NOT EXISTS rule_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supersedes_rule_id UUID,
  ADD COLUMN IF NOT EXISTS context_mode VARCHAR(32) NOT NULL DEFAULT 'LEGACY_INTERNAL_AREA',
  ADD COLUMN IF NOT EXISTS include_zone BOOLEAN NOT NULL DEFAULT FALSE;

DO $$ BEGIN
  ALTER TABLE naming_rules ADD CONSTRAINT naming_rules_rule_version_positive
    CHECK(rule_version>0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE naming_rules VALIDATE CONSTRAINT naming_rules_rule_version_positive;

DO $$ BEGIN
  ALTER TABLE naming_rules ADD CONSTRAINT naming_rules_context_mode_check CHECK(
    (context_mode='LEGACY_INTERNAL_AREA' AND include_zone=FALSE)
    OR
    (context_mode='CANONICAL_ZONE' AND include_zone=TRUE AND include_internal_area=FALSE)
  ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE naming_rules VALIDATE CONSTRAINT naming_rules_context_mode_check;

CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_rules_identity_scope
  ON naming_rules(id,tenant_id,asset_type_code);

DO $$
DECLARE old_unique TEXT;
BEGIN
  SELECT c.conname INTO old_unique
  FROM pg_constraint c
  WHERE c.conrelid='naming_rules'::regclass AND c.contype='u'
    AND pg_get_constraintdef(c.oid)='UNIQUE (tenant_id, asset_type_code)';
  IF old_unique IS NOT NULL THEN
    EXECUTE format('ALTER TABLE naming_rules DROP CONSTRAINT %I',old_unique);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_rules_tenant_type_version
  ON naming_rules(tenant_id,asset_type_code,rule_version);
CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_rules_active_tenant_type
  ON naming_rules(tenant_id,asset_type_code) WHERE active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_rules_linear_successor
  ON naming_rules(supersedes_rule_id) WHERE supersedes_rule_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE naming_rules ADD CONSTRAINT naming_rules_supersedes_scope_fk
    FOREIGN KEY(supersedes_rule_id,tenant_id,asset_type_code)
    REFERENCES naming_rules(id,tenant_id,asset_type_code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION enforce_naming_rule_version_lineage()
RETURNS TRIGGER AS $$
DECLARE parent_version INTEGER;
BEGIN
  IF NEW.supersedes_rule_id IS NULL THEN
    IF NEW.rule_version<>1 THEN
      RAISE EXCEPTION 'root_naming_rule_version_must_be_one' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.supersedes_rule_id=NEW.id THEN
    RAISE EXCEPTION 'naming_rule_cannot_supersede_itself' USING ERRCODE='23514';
  END IF;
  SELECT rule_version INTO parent_version FROM naming_rules
  WHERE id=NEW.supersedes_rule_id AND tenant_id=NEW.tenant_id
    AND asset_type_code=NEW.asset_type_code;
  IF NOT FOUND OR NEW.rule_version<>parent_version+1 THEN
    RAISE EXCEPTION 'invalid_naming_rule_version_lineage' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_naming_rule_version_lineage ON naming_rules;
CREATE TRIGGER trg_enforce_naming_rule_version_lineage
  BEFORE INSERT OR UPDATE OF rule_version,supersedes_rule_id,tenant_id,asset_type_code
  ON naming_rules FOR EACH ROW EXECUTE FUNCTION enforce_naming_rule_version_lineage();

CREATE OR REPLACE FUNCTION enforce_naming_rule_normative_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.last_seq<>0 THEN
    RAISE EXCEPTION 'naming_rule_sequence_must_start_at_zero' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.asset_type_code IS DISTINCT FROM OLD.asset_type_code
       OR NEW.rule_version IS DISTINCT FROM OLD.rule_version
       OR NEW.supersedes_rule_id IS DISTINCT FROM OLD.supersedes_rule_id THEN
      RAISE EXCEPTION 'naming_rule_scope_immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.last_seq<OLD.last_seq THEN
      RAISE EXCEPTION 'naming_rule_sequence_cannot_decrease' USING ERRCODE='23514';
    END IF;
    IF OLD.last_seq>0 AND (
      NEW.prefix IS DISTINCT FROM OLD.prefix OR
      NEW.separator IS DISTINCT FROM OLD.separator OR
      NEW.include_branch IS DISTINCT FROM OLD.include_branch OR
      NEW.include_location IS DISTINCT FROM OLD.include_location OR
      NEW.seq_digits IS DISTINCT FROM OLD.seq_digits OR
      NEW.reset_per_location IS DISTINCT FROM OLD.reset_per_location OR
      NEW.custom_segment_1 IS DISTINCT FROM OLD.custom_segment_1 OR
      NEW.custom_segment_2 IS DISTINCT FROM OLD.custom_segment_2 OR
      NEW.custom_segment_1_label IS DISTINCT FROM OLD.custom_segment_1_label OR
      NEW.custom_segment_2_label IS DISTINCT FROM OLD.custom_segment_2_label OR
      NEW.include_placement IS DISTINCT FROM OLD.include_placement OR
      NEW.include_site IS DISTINCT FROM OLD.include_site OR
      NEW.include_internal_area IS DISTINCT FROM OLD.include_internal_area OR
      NEW.context_mode IS DISTINCT FROM OLD.context_mode OR
      NEW.include_zone IS DISTINCT FROM OLD.include_zone
    ) THEN
      RAISE EXCEPTION 'normative_version_required' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

ALTER TABLE locations DROP CONSTRAINT IF EXISTS managed_location_requires_internal_area;
ALTER TABLE locations ADD CONSTRAINT managed_location_requires_physical_authority
  CHECK(placement_type NOT IN ('MDF','IDF') OR zone_id IS NOT NULL OR internal_area_id IS NOT NULL)
  NOT VALID;

CREATE OR REPLACE FUNCTION enforce_location_dual_reference_consistency()
RETURNS TRIGGER AS $$
DECLARE area_zone UUID;
BEGIN
  IF NEW.placement_type NOT IN ('MDF','IDF')
     OR NEW.zone_id IS NULL OR NEW.internal_area_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT ia.zone_id INTO area_zone FROM internal_areas ia
  WHERE ia.id=NEW.internal_area_id AND ia.tenant_id=NEW.tenant_id
    AND ia.branch_id=NEW.branch_id;
  IF NOT FOUND OR area_zone IS NULL OR area_zone<>NEW.zone_id THEN
    RAISE EXCEPTION 'inconsistent_location_zone_internal_area' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_location_dual_reference_consistency ON locations;
CREATE CONSTRAINT TRIGGER trg_location_dual_reference_consistency
  AFTER INSERT OR UPDATE ON locations
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION enforce_location_dual_reference_consistency();

CREATE OR REPLACE FUNCTION enforce_asset_nomenclature() RETURNS TRIGGER AS $$
DECLARE required BOOLEAN; rule_active BOOLEAN; rule_prefix TEXT; rule_separator TEXT;
 rule_seq_digits INTEGER; rule_include_branch BOOLEAN; rule_include_placement BOOLEAN;
 rule_include_site BOOLEAN; rule_include_area BOOLEAN; rule_include_zone BOOLEAN;
 rule_context TEXT; rule_custom_1 TEXT; rule_custom_2 TEXT;
 branch_component TEXT; placement_component TEXT; site_component TEXT;
 area_component TEXT; zone_component TEXT; expected_code TEXT;
BEGIN
 SELECT requires_nomenclature INTO required FROM asset_types WHERE id=NEW.asset_type_id;
 IF TG_OP='UPDATE' AND OLD.nomenclature_id IS NULL AND OLD.nomenclature_sequence IS NULL AND NEW.nomenclature_id IS NULL AND NEW.nomenclature_sequence IS NULL THEN RETURN NEW; END IF;
 IF COALESCE(required,FALSE) AND (NEW.nomenclature_id IS NULL OR NEW.nomenclature_sequence IS NULL) THEN RAISE EXCEPTION 'nomenclature_required' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.nomenclature_id IS NOT NULL AND (NEW.nomenclature_id IS DISTINCT FROM OLD.nomenclature_id OR NEW.nomenclature_sequence IS DISTINCT FROM OLD.nomenclature_sequence OR NEW.internal_code IS DISTINCT FROM OLD.internal_code) THEN RAISE EXCEPTION 'managed_asset_identity_immutable' USING ERRCODE='23514'; END IF;
 SELECT nr.active,nr.prefix,nr.separator,nr.seq_digits,nr.include_branch,nr.include_placement,nr.include_site,nr.include_internal_area,nr.context_mode,nr.include_zone,COALESCE(nr.custom_segment_1,''),COALESCE(nr.custom_segment_2,'')
 INTO rule_active,rule_prefix,rule_separator,rule_seq_digits,rule_include_branch,rule_include_placement,rule_include_site,rule_include_area,rule_context,rule_include_zone,rule_custom_1,rule_custom_2
 FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.id=NEW.nomenclature_id AND nr.tenant_id=NEW.tenant_id AND at.id=NEW.asset_type_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_asset_nomenclature' USING ERRCODE='23514'; END IF;
 IF NOT rule_active AND (TG_OP='INSERT' OR OLD.nomenclature_id IS NULL) THEN RAISE EXCEPTION 'inactive_asset_nomenclature' USING ERRCODE='23514'; END IF;
 IF rule_include_branch THEN SELECT code INTO branch_component FROM branches WHERE id=NEW.branch_id AND tenant_id=NEW.tenant_id AND status='active'; IF NOT FOUND OR branch_component IS NULL THEN RAISE EXCEPTION 'invalid_asset_nomenclature_branch' USING ERRCODE='23514'; END IF; END IF;
 IF rule_context='LEGACY_INTERNAL_AREA' AND (rule_include_site OR rule_include_area) THEN
   SELECT b.code,ia.code INTO site_component,area_component FROM locations l JOIN internal_areas ia ON ia.id=l.internal_area_id AND ia.tenant_id=l.tenant_id AND ia.branch_id=l.branch_id JOIN buildings b ON b.id=ia.site_id AND b.tenant_id=ia.tenant_id AND b.branch_id=ia.branch_id
   WHERE l.id=NEW.location_id AND l.tenant_id=NEW.tenant_id AND l.branch_id=NEW.branch_id AND l.status='active' AND ia.status='active' AND b.status='active';
   IF NOT FOUND THEN RAISE EXCEPTION 'invalid_asset_physical_context' USING ERRCODE='23514'; END IF;
 ELSIF rule_context='CANONICAL_ZONE' THEN
   SELECT z.code,b.code INTO zone_component,site_component FROM locations l JOIN zones z ON z.id=l.zone_id AND z.tenant_id=l.tenant_id AND z.branch_id=l.branch_id LEFT JOIN buildings b ON b.id=z.building_id AND b.tenant_id=z.tenant_id AND b.branch_id=z.branch_id
   WHERE l.id=NEW.location_id AND l.tenant_id=NEW.tenant_id AND l.branch_id=NEW.branch_id AND l.status='active' AND z.status='active';
   IF NOT FOUND OR NULLIF(BTRIM(zone_component),'') IS NULL OR (rule_include_site AND NULLIF(BTRIM(site_component),'') IS NULL) THEN RAISE EXCEPTION 'invalid_asset_zone_context' USING ERRCODE='23514'; END IF;
 ELSIF rule_context NOT IN ('LEGACY_INTERNAL_AREA','CANONICAL_ZONE') THEN
   RAISE EXCEPTION 'invalid_naming_context_mode' USING ERRCODE='23514';
 END IF;
 IF rule_include_placement THEN SELECT placement_code INTO placement_component FROM locations WHERE id=NEW.location_id AND tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND status='active' AND placement_type IN ('MDF','IDF','WAREHOUSE'); IF NOT FOUND THEN RAISE EXCEPTION 'invalid_asset_placement' USING ERRCODE='23514'; END IF; END IF;
 expected_code:=concat_ws(rule_separator,rule_prefix,NULLIF(branch_component,''),CASE WHEN rule_include_site THEN NULLIF(site_component,'') END,CASE WHEN rule_include_zone THEN NULLIF(zone_component,'') END,CASE WHEN rule_include_area THEN NULLIF(area_component,'') END,NULLIF(placement_component,''),NULLIF(UPPER(REPLACE(rule_custom_1,' ','')),''),NULLIF(UPPER(REPLACE(rule_custom_2,' ','')),''),LPAD(NEW.nomenclature_sequence::text,rule_seq_digits,'0'));
 IF NEW.internal_code IS DISTINCT FROM expected_code THEN RAISE EXCEPTION 'invalid_asset_nomenclature_code' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM naming_rules WHERE rule_version<>1 OR context_mode<>'LEGACY_INTERNAL_AREA' OR include_zone) THEN
    RAISE EXCEPTION 'existing_naming_rule_compatibility_backfill_failed';
  END IF;
END $$;
