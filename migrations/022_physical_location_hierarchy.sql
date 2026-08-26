-- Canonical physical hierarchy: tenant -> branch -> site(buildings) -> internal_area -> MDF/IDF.
-- The canonical bootstrap runner wraps every manifest entry in one transaction.

ALTER TABLE branches ADD COLUMN IF NOT EXISTS code VARCHAR(20);
WITH candidates AS (
  SELECT id, tenant_id,
         LEFT(UPPER(REGEXP_REPLACE(COALESCE(NULLIF(city,''),name),'[^A-Za-z0-9]','','g')),3) base,
         ROW_NUMBER() OVER (PARTITION BY tenant_id, LEFT(UPPER(REGEXP_REPLACE(COALESCE(NULLIF(city,''),name),'[^A-Za-z0-9]','','g')),3) ORDER BY created_at,id) ordinal
  FROM branches WHERE code IS NULL OR BTRIM(code)=''
)
UPDATE branches b SET code = c.base || CASE WHEN c.ordinal=1 THEN '' ELSE c.ordinal::text END
FROM candidates c WHERE b.id=c.id;
ALTER TABLE branches ALTER COLUMN code SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE branches ADD CONSTRAINT branches_code_not_blank CHECK (code IS NULL OR BTRIM(code)<>'') NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_tenant_code ON branches(tenant_id,code) WHERE code IS NOT NULL;

CREATE OR REPLACE FUNCTION ensure_branch_canonical_code() RETURNS TRIGGER AS $$
BEGIN
  IF NULLIF(BTRIM(NEW.code),'') IS NULL THEN
    NEW.code := LEFT(UPPER(REGEXP_REPLACE(COALESCE(NULLIF(BTRIM(NEW.city),''),NEW.name),'[^A-Za-z0-9]','','g')),3);
  ELSE
    NEW.code := UPPER(BTRIM(NEW.code));
  END IF;
  IF NEW.code !~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' THEN RAISE EXCEPTION 'branch_code_required' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.code IS NOT NULL AND NEW.code IS DISTINCT FROM OLD.code THEN RAISE EXCEPTION 'branch_code_immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_ensure_branch_canonical_code ON branches;
CREATE TRIGGER trg_ensure_branch_canonical_code BEFORE INSERT OR UPDATE OF code,city,name ON branches
FOR EACH ROW EXECUTE FUNCTION ensure_branch_canonical_code();

ALTER TABLE buildings ADD COLUMN IF NOT EXISTS code VARCHAR(30);
WITH candidates AS (
  SELECT id, tenant_id, branch_id,
         LEFT(UPPER(REGEXP_REPLACE(name,'[^A-Za-z0-9]','','g')),20) base,
         ROW_NUMBER() OVER (PARTITION BY tenant_id,branch_id,LEFT(UPPER(REGEXP_REPLACE(name,'[^A-Za-z0-9]','','g')),20) ORDER BY created_at,id) ordinal
  FROM buildings WHERE code IS NULL OR BTRIM(code)=''
)
UPDATE buildings b SET code=c.base || CASE WHEN c.ordinal=1 THEN '' ELSE c.ordinal::text END
FROM candidates c WHERE b.id=c.id;
ALTER TABLE buildings ALTER COLUMN code SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE buildings ADD CONSTRAINT buildings_code_not_blank CHECK (code IS NULL OR BTRIM(code)<>'') NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_buildings_tenant_branch_code ON buildings(tenant_id,branch_id,code) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_buildings_identity_scope ON buildings(id,tenant_id,branch_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_floors_identity_scope ON floors(id,tenant_id,building_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_zones_identity_scope ON zones(id,tenant_id,floor_id);

CREATE OR REPLACE FUNCTION ensure_site_canonical_code() RETURNS TRIGGER AS $$
BEGIN
  IF NULLIF(BTRIM(NEW.code),'') IS NULL THEN
    NEW.code := UPPER(REGEXP_REPLACE(NEW.name,'[^A-Za-z0-9]','','g'));
  ELSE
    NEW.code := UPPER(BTRIM(NEW.code));
  END IF;
  IF NEW.code !~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' THEN RAISE EXCEPTION 'site_code_required' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.code IS NOT NULL AND NEW.code IS DISTINCT FROM OLD.code THEN RAISE EXCEPTION 'site_code_immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_ensure_site_canonical_code ON buildings;
CREATE TRIGGER trg_ensure_site_canonical_code BEFORE INSERT OR UPDATE OF code,name ON buildings
FOR EACH ROW EXECUTE FUNCTION ensure_site_canonical_code();

CREATE TABLE IF NOT EXISTS internal_areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  site_id UUID NOT NULL,
  floor_id UUID,
  zone_id UUID,
  code VARCHAR(30) NOT NULL CHECK (BTRIM(code)<>''),
  name VARCHAR(255) NOT NULL CHECK (BTRIM(name)<>''),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT internal_areas_site_scope_fk FOREIGN KEY(site_id,tenant_id,branch_id)
    REFERENCES buildings(id,tenant_id,branch_id) ON DELETE RESTRICT,
  CONSTRAINT internal_areas_floor_scope_fk FOREIGN KEY(floor_id,tenant_id,site_id)
    REFERENCES floors(id,tenant_id,building_id) ON DELETE RESTRICT,
  CONSTRAINT internal_areas_zone_scope_fk FOREIGN KEY(zone_id,tenant_id,floor_id)
    REFERENCES zones(id,tenant_id,floor_id) ON DELETE RESTRICT,
  CONSTRAINT internal_areas_zone_requires_floor CHECK(zone_id IS NULL OR floor_id IS NOT NULL),
  UNIQUE(id,tenant_id,branch_id),
  UNIQUE(site_id,code)
);
ALTER TABLE internal_areas ADD COLUMN IF NOT EXISTS floor_id UUID;
ALTER TABLE internal_areas ADD COLUMN IF NOT EXISTS zone_id UUID;
DO $$ BEGIN
  ALTER TABLE internal_areas ADD CONSTRAINT internal_areas_floor_scope_fk
    FOREIGN KEY(floor_id,tenant_id,site_id) REFERENCES floors(id,tenant_id,building_id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE internal_areas ADD CONSTRAINT internal_areas_zone_scope_fk
    FOREIGN KEY(zone_id,tenant_id,floor_id) REFERENCES zones(id,tenant_id,floor_id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE internal_areas ADD CONSTRAINT internal_areas_zone_requires_floor CHECK(zone_id IS NULL OR floor_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_internal_areas_scope ON internal_areas(tenant_id,branch_id,site_id);

CREATE OR REPLACE FUNCTION normalize_internal_area_code() RETURNS TRIGGER AS $$
BEGIN
  NEW.code := UPPER(BTRIM(NEW.code));
  IF NEW.code !~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' THEN
    RAISE EXCEPTION 'invalid_internal_area_code' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.code IS NOT NULL AND NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'internal_area_code_immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_normalize_internal_area_code ON internal_areas;
CREATE TRIGGER trg_normalize_internal_area_code BEFORE INSERT OR UPDATE OF code ON internal_areas
FOR EACH ROW EXECUTE FUNCTION normalize_internal_area_code();

ALTER TABLE locations ADD COLUMN IF NOT EXISTS internal_area_id UUID;
DO $$ BEGIN
  ALTER TABLE locations ADD CONSTRAINT locations_internal_area_scope_fk
    FOREIGN KEY(internal_area_id,tenant_id,branch_id)
    REFERENCES internal_areas(id,tenant_id,branch_id) ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE locations ADD CONSTRAINT managed_location_requires_internal_area
    CHECK (placement_type NOT IN ('MDF','IDF') OR internal_area_id IS NOT NULL) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE naming_rules
  ADD COLUMN IF NOT EXISTS include_site BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS include_internal_area BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE naming_rules SET include_site=TRUE,include_internal_area=TRUE
WHERE asset_type_code IN ('MDF','IDF');

CREATE TABLE IF NOT EXISTS nomenclature_branch_counters (
  nomenclature_id UUID NOT NULL REFERENCES naming_rules(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  last_seq INTEGER NOT NULL DEFAULT 0 CHECK(last_seq>=0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(nomenclature_id,branch_id)
);
INSERT INTO nomenclature_branch_counters(nomenclature_id,tenant_id,branch_id,last_seq)
SELECT nomenclature_id,tenant_id,branch_id,MAX(nomenclature_sequence)
FROM assets WHERE nomenclature_id IS NOT NULL AND nomenclature_sequence IS NOT NULL
GROUP BY nomenclature_id,tenant_id,branch_id
ON CONFLICT(nomenclature_id,branch_id) DO UPDATE
SET last_seq=GREATEST(nomenclature_branch_counters.last_seq,EXCLUDED.last_seq);

DROP INDEX IF EXISTS uq_assets_nomenclature_sequence_unplaced;
CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_nomenclature_branch_sequence_unplaced
  ON assets(nomenclature_id,branch_id,nomenclature_sequence)
  WHERE nomenclature_id IS NOT NULL AND location_id IS NULL;

ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS buildings_tenant_branch_isolation ON buildings;
CREATE POLICY buildings_tenant_branch_isolation ON buildings
  USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND branch_id=NULLIF(current_setting('app.branch_id',true),'')::uuid)
  WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND branch_id=NULLIF(current_setting('app.branch_id',true),'')::uuid);
ALTER TABLE floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS floors_tenant_branch_isolation ON floors;
CREATE POLICY floors_tenant_branch_isolation ON floors
  USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND EXISTS (
    SELECT 1 FROM buildings b WHERE b.id=floors.building_id AND b.tenant_id=floors.tenant_id
      AND b.branch_id=NULLIF(current_setting('app.branch_id',true),'')::uuid));
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS zones_tenant_branch_isolation ON zones;
CREATE POLICY zones_tenant_branch_isolation ON zones
  USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND EXISTS (
    SELECT 1 FROM floors f JOIN buildings b ON b.id=f.building_id AND b.tenant_id=f.tenant_id
    WHERE f.id=zones.floor_id AND f.tenant_id=zones.tenant_id
      AND b.branch_id=NULLIF(current_setting('app.branch_id',true),'')::uuid));
ALTER TABLE technical_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE technical_rooms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS technical_rooms_tenant_branch_isolation ON technical_rooms;
CREATE POLICY technical_rooms_tenant_branch_isolation ON technical_rooms
  USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND EXISTS (
    SELECT 1 FROM zones z JOIN floors f ON f.id=z.floor_id AND f.tenant_id=z.tenant_id
      JOIN buildings b ON b.id=f.building_id AND b.tenant_id=f.tenant_id
    WHERE z.id=technical_rooms.zone_id AND z.tenant_id=technical_rooms.tenant_id
      AND b.branch_id=NULLIF(current_setting('app.branch_id',true),'')::uuid));
ALTER TABLE internal_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_areas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS internal_areas_tenant_branch_isolation ON internal_areas;
CREATE POLICY internal_areas_tenant_branch_isolation ON internal_areas
  USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND branch_id=NULLIF(current_setting('app.branch_id',true),'')::uuid)
  WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND branch_id=NULLIF(current_setting('app.branch_id',true),'')::uuid);
ALTER TABLE nomenclature_branch_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE nomenclature_branch_counters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nomenclature_branch_counters_tenant_branch_isolation ON nomenclature_branch_counters;
CREATE POLICY nomenclature_branch_counters_tenant_branch_isolation ON nomenclature_branch_counters
  USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND branch_id=NULLIF(current_setting('app.branch_id',true),'')::uuid)
  WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND branch_id=NULLIF(current_setting('app.branch_id',true),'')::uuid);

CREATE OR REPLACE FUNCTION enforce_asset_nomenclature() RETURNS TRIGGER AS $$
DECLARE required BOOLEAN; rule_active BOOLEAN; rule_prefix TEXT; rule_separator TEXT;
 rule_seq_digits INTEGER; rule_include_branch BOOLEAN; rule_include_placement BOOLEAN;
 rule_include_site BOOLEAN; rule_include_area BOOLEAN; rule_custom_1 TEXT; rule_custom_2 TEXT;
 branch_component TEXT; placement_component TEXT; site_component TEXT; area_component TEXT; expected_code TEXT;
BEGIN
 SELECT requires_nomenclature INTO required FROM asset_types WHERE id=NEW.asset_type_id;
 IF TG_OP='UPDATE' AND OLD.nomenclature_id IS NULL AND OLD.nomenclature_sequence IS NULL AND NEW.nomenclature_id IS NULL AND NEW.nomenclature_sequence IS NULL THEN RETURN NEW; END IF;
 IF COALESCE(required,FALSE) AND (NEW.nomenclature_id IS NULL OR NEW.nomenclature_sequence IS NULL) THEN RAISE EXCEPTION 'nomenclature_required' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.nomenclature_id IS NOT NULL AND (NEW.nomenclature_id IS DISTINCT FROM OLD.nomenclature_id OR NEW.nomenclature_sequence IS DISTINCT FROM OLD.nomenclature_sequence OR NEW.internal_code IS DISTINCT FROM OLD.internal_code) THEN RAISE EXCEPTION 'managed_asset_identity_immutable' USING ERRCODE='23514'; END IF;
 SELECT nr.active,nr.prefix,nr.separator,nr.seq_digits,nr.include_branch,nr.include_placement,nr.include_site,nr.include_internal_area,COALESCE(nr.custom_segment_1,''),COALESCE(nr.custom_segment_2,'')
 INTO rule_active,rule_prefix,rule_separator,rule_seq_digits,rule_include_branch,rule_include_placement,rule_include_site,rule_include_area,rule_custom_1,rule_custom_2
 FROM naming_rules nr JOIN asset_types at ON at.code=nr.asset_type_code WHERE nr.id=NEW.nomenclature_id AND nr.tenant_id=NEW.tenant_id AND at.id=NEW.asset_type_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_asset_nomenclature' USING ERRCODE='23514'; END IF;
 IF NOT rule_active AND (TG_OP='INSERT' OR OLD.nomenclature_id IS NULL) THEN RAISE EXCEPTION 'inactive_asset_nomenclature' USING ERRCODE='23514'; END IF;
 IF rule_include_branch THEN SELECT code INTO branch_component FROM branches WHERE id=NEW.branch_id AND tenant_id=NEW.tenant_id AND status='active'; IF NOT FOUND OR branch_component IS NULL THEN RAISE EXCEPTION 'invalid_asset_nomenclature_branch' USING ERRCODE='23514'; END IF; END IF;
 IF rule_include_site OR rule_include_area THEN
   SELECT b.code,ia.code INTO site_component,area_component FROM locations l JOIN internal_areas ia ON ia.id=l.internal_area_id AND ia.tenant_id=l.tenant_id AND ia.branch_id=l.branch_id JOIN buildings b ON b.id=ia.site_id AND b.tenant_id=ia.tenant_id AND b.branch_id=ia.branch_id
   WHERE l.id=NEW.location_id AND l.tenant_id=NEW.tenant_id AND l.branch_id=NEW.branch_id AND l.status='active' AND ia.status='active' AND b.status='active';
   IF NOT FOUND THEN RAISE EXCEPTION 'invalid_asset_physical_context' USING ERRCODE='23514'; END IF;
 END IF;
 IF rule_include_placement THEN SELECT placement_code INTO placement_component FROM locations WHERE id=NEW.location_id AND tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id AND status='active' AND placement_type IN ('MDF','IDF','WAREHOUSE'); IF NOT FOUND THEN RAISE EXCEPTION 'invalid_asset_placement' USING ERRCODE='23514'; END IF; END IF;
 expected_code:=concat_ws(rule_separator,rule_prefix,NULLIF(branch_component,''),CASE WHEN rule_include_site THEN NULLIF(site_component,'') END,CASE WHEN rule_include_area THEN NULLIF(area_component,'') END,NULLIF(placement_component,''),NULLIF(UPPER(REPLACE(rule_custom_1,' ','')),''),NULLIF(UPPER(REPLACE(rule_custom_2,' ','')),''),LPAD(NEW.nomenclature_sequence::text,rule_seq_digits,'0'));
 IF NEW.internal_code IS DISTINCT FROM expected_code THEN RAISE EXCEPTION 'invalid_asset_nomenclature_code' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
