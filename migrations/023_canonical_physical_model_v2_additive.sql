-- PHASE 1.2C: additive physical-model V2 schema capability.
-- V1 remains authoritative until the compatibility backend is deployed.

CREATE UNIQUE INDEX IF NOT EXISTS uq_buildings_identity_scope
  ON buildings(id,tenant_id,branch_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_floors_identity_scope
  ON floors(id,tenant_id,building_id);

ALTER TABLE zones
  ADD COLUMN IF NOT EXISTS branch_id UUID,
  ADD COLUMN IF NOT EXISTS building_id UUID,
  ADD COLUMN IF NOT EXISTS code VARCHAR(30),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE zones z
SET building_id=f.building_id,
    branch_id=b.branch_id
FROM floors f
JOIN buildings b ON b.id=f.building_id AND b.tenant_id=f.tenant_id
WHERE z.floor_id=f.id AND z.tenant_id=f.tenant_id
  AND (z.building_id IS NULL OR z.branch_id IS NULL);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM zones WHERE branch_id IS NULL OR building_id IS NULL) THEN
    RAISE EXCEPTION 'zone_scope_backfill_incomplete';
  END IF;
END $$;

WITH candidates AS (
  SELECT id,
         LEFT(COALESCE(NULLIF(UPPER(REGEXP_REPLACE(name,'[^A-Za-z0-9]','','g')),''),'ZONE'),24) AS base,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id,branch_id,
             LEFT(COALESCE(NULLIF(UPPER(REGEXP_REPLACE(name,'[^A-Za-z0-9]','','g')),''),'ZONE'),24)
           ORDER BY created_at,id
         ) AS ordinal
  FROM zones WHERE code IS NULL OR BTRIM(code)=''
)
UPDATE zones z
SET code=c.base || CASE WHEN c.ordinal=1 THEN '' ELSE '-' || c.ordinal::text END
FROM candidates c WHERE c.id=z.id;

ALTER TABLE zones ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE zones ALTER COLUMN code SET NOT NULL;
ALTER TABLE zones ALTER COLUMN floor_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_zones_tenant_branch_code
  ON zones(tenant_id,branch_id,code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_zones_v2_identity_scope
  ON zones(id,tenant_id,branch_id);
CREATE INDEX IF NOT EXISTS idx_zones_tenant_branch_status
  ON zones(tenant_id,branch_id,status);
CREATE INDEX IF NOT EXISTS idx_zones_building_v2 ON zones(building_id) WHERE building_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_zones_floor_v2 ON zones(floor_id) WHERE floor_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE zones ADD CONSTRAINT zones_v2_branch_scope_fk
    FOREIGN KEY(branch_id,tenant_id) REFERENCES branches(id,tenant_id) ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE zones ADD CONSTRAINT zones_v2_building_scope_fk
    FOREIGN KEY(building_id,tenant_id,branch_id)
    REFERENCES buildings(id,tenant_id,branch_id) ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE zones ADD CONSTRAINT zones_v2_floor_scope_fk
    FOREIGN KEY(floor_id,tenant_id,building_id)
    REFERENCES floors(id,tenant_id,building_id) ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE zones ADD CONSTRAINT zones_v2_floor_requires_building
    CHECK(floor_id IS NULL OR building_id IS NOT NULL) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE zones ADD CONSTRAINT zones_v2_code_format
    CHECK(code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$') NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE zones VALIDATE CONSTRAINT zones_v2_branch_scope_fk;
ALTER TABLE zones VALIDATE CONSTRAINT zones_v2_building_scope_fk;
ALTER TABLE zones VALIDATE CONSTRAINT zones_v2_floor_scope_fk;
ALTER TABLE zones VALIDATE CONSTRAINT zones_v2_floor_requires_building;
ALTER TABLE zones VALIDATE CONSTRAINT zones_v2_code_format;

ALTER TABLE locations ADD COLUMN IF NOT EXISTS zone_id UUID;
CREATE INDEX IF NOT EXISTS idx_locations_tenant_branch_zone
  ON locations(tenant_id,branch_id,zone_id) WHERE zone_id IS NOT NULL;
DO $$ BEGIN
  ALTER TABLE locations ADD CONSTRAINT locations_v2_zone_scope_fk
    FOREIGN KEY(zone_id,tenant_id,branch_id)
    REFERENCES zones(id,tenant_id,branch_id) ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE locations VALIDATE CONSTRAINT locations_v2_zone_scope_fk;

ALTER TABLE racks ADD COLUMN IF NOT EXISTS housing_type VARCHAR(10) NOT NULL DEFAULT 'RACK';
DO $$ BEGIN
  ALTER TABLE racks ADD CONSTRAINT racks_housing_type_check
    CHECK(housing_type IN ('RACK','CABINET')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE racks VALIDATE CONSTRAINT racks_housing_type_check;
CREATE INDEX IF NOT EXISTS idx_racks_tenant_branch_housing_type
  ON racks(tenant_id,branch_id,housing_type);

ALTER TABLE asset_types
  ADD COLUMN IF NOT EXISTS asset_class VARCHAR(32),
  ADD COLUMN IF NOT EXISTS placement_policy VARCHAR(32);
DO $$ BEGIN
  ALTER TABLE asset_types ADD CONSTRAINT asset_types_asset_class_check CHECK(
    asset_class IS NULL OR asset_class IN (
      'PHYSICAL_CONTAINER','PASSIVE_INFRASTRUCTURE','ACTIVE_EQUIPMENT',
      'ENDPOINT','RELATIONSHIP','OTHER'
    )
  ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE asset_types ADD CONSTRAINT asset_types_placement_policy_check CHECK(
    placement_policy IS NULL OR placement_policy IN (
      'BRANCH','ZONE','MDF_IDF','HOUSING','FREE_PLACEMENT','RELATIONSHIP_ONLY'
    )
  ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE asset_types VALIDATE CONSTRAINT asset_types_asset_class_check;
ALTER TABLE asset_types VALIDATE CONSTRAINT asset_types_placement_policy_check;

CREATE TABLE IF NOT EXISTS system_naming_presets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_type_code VARCHAR(50) NOT NULL REFERENCES asset_types(code) ON DELETE RESTRICT,
  preset_version INTEGER NOT NULL CHECK(preset_version > 0),
  prefix VARCHAR(20) NOT NULL CHECK(BTRIM(prefix)<>''),
  separator VARCHAR(5) NOT NULL DEFAULT '-',
  include_branch BOOLEAN NOT NULL DEFAULT TRUE,
  include_building BOOLEAN NOT NULL DEFAULT FALSE,
  include_floor BOOLEAN NOT NULL DEFAULT FALSE,
  include_zone BOOLEAN NOT NULL DEFAULT FALSE,
  include_distribution BOOLEAN NOT NULL DEFAULT FALSE,
  include_housing BOOLEAN NOT NULL DEFAULT FALSE,
  include_placement BOOLEAN NOT NULL DEFAULT FALSE,
  seq_digits SMALLINT NOT NULL DEFAULT 4 CHECK(seq_digits BETWEEN 2 AND 6),
  custom_segment_1 VARCHAR(50),
  custom_segment_2 VARCHAR(50),
  custom_segment_1_label VARCHAR(100),
  custom_segment_2_label VARCHAR(100),
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(asset_type_code,preset_version)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_naming_presets_active_type
  ON system_naming_presets(asset_type_code) WHERE active;

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS zones_tenant_branch_isolation ON zones;
CREATE POLICY zones_tenant_branch_isolation ON zones
  USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND branch_id=NULLIF(current_setting('app.branch_id',true),'')::uuid
  )
  WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND branch_id=NULLIF(current_setting('app.branch_id',true),'')::uuid
  );

REVOKE ALL PRIVILEGES ON TABLE system_naming_presets FROM PUBLIC;

COMMENT ON TABLE system_naming_presets IS
  'Global versioned recommendations only; tenant acceptance and asset creation authority remain in naming_rules.';
COMMENT ON COLUMN locations.zone_id IS
  'Canonical V2 physical Zone; nullable while internal_area_id remains the V1 compatibility authority.';
