-- Canonical physical hierarchy provisioning.
-- Existing incomplete rows remain explicitly ungoverned; every new row must
-- commit as a complete governed graph.

CREATE UNIQUE INDEX IF NOT EXISTS uq_buildings_id_tenant
  ON public.buildings(id,tenant_id);

DO $$ BEGIN
  ALTER TABLE public.buildings ADD CONSTRAINT buildings_branch_tenant_fk
    FOREIGN KEY(branch_id,tenant_id)
    REFERENCES public.branches(id,tenant_id) ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.buildings VALIDATE CONSTRAINT buildings_branch_tenant_fk;

ALTER TABLE public.floors
  ADD COLUMN IF NOT EXISTS code varchar(30),
  ADD COLUMN IF NOT EXISTS hierarchy_governed boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.floors ADD CONSTRAINT floors_building_tenant_fk
    FOREIGN KEY(building_id,tenant_id)
    REFERENCES public.buildings(id,tenant_id) ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.floors VALIDATE CONSTRAINT floors_building_tenant_fk;

DO $$ BEGIN
  ALTER TABLE public.floors ADD CONSTRAINT floors_governed_complete CHECK (
    NOT hierarchy_governed OR (
      building_id IS NOT NULL AND code IS NOT NULL AND btrim(code) <> ''
      AND code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'
    )
  ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_floors_tenant_building_code
  ON public.floors(tenant_id,building_id,code)
  WHERE code IS NOT NULL;

ALTER TABLE public.zones
  ADD COLUMN IF NOT EXISTS hierarchy_governed boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  ALTER TABLE public.zones ADD CONSTRAINT zones_governed_complete CHECK (
    NOT hierarchy_governed OR (
      branch_id IS NOT NULL AND building_id IS NOT NULL AND floor_id IS NOT NULL
      AND code IS NOT NULL AND btrim(code) <> ''
    )
  ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.internal_areas
  ADD COLUMN IF NOT EXISTS hierarchy_governed boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  ALTER TABLE public.internal_areas ADD CONSTRAINT internal_areas_governed_complete CHECK (
    NOT hierarchy_governed OR (
      site_id IS NOT NULL AND floor_id IS NOT NULL AND zone_id IS NOT NULL
      AND code IS NOT NULL AND btrim(code) <> ''
    )
  ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.enforce_canonical_hierarchy_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.hierarchy_governed THEN
    IF NOT NEW.hierarchy_governed THEN
      RAISE EXCEPTION 'canonical hierarchy governance cannot be downgraded' USING ERRCODE='23514';
    END IF;
    IF TG_TABLE_NAME = 'floors' AND (
      NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
      NEW.building_id IS DISTINCT FROM OLD.building_id OR
      NEW.code IS DISTINCT FROM OLD.code
    ) THEN
      RAISE EXCEPTION 'governed Floor identity is immutable' USING ERRCODE='23514';
    ELSIF TG_TABLE_NAME = 'zones' AND (
      NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
      NEW.branch_id IS DISTINCT FROM OLD.branch_id OR
      NEW.building_id IS DISTINCT FROM OLD.building_id OR
      NEW.floor_id IS DISTINCT FROM OLD.floor_id OR
      NEW.code IS DISTINCT FROM OLD.code
    ) THEN
      RAISE EXCEPTION 'governed Zone identity is immutable' USING ERRCODE='23514';
    ELSIF TG_TABLE_NAME = 'internal_areas' AND (
      NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
      NEW.branch_id IS DISTINCT FROM OLD.branch_id OR
      NEW.site_id IS DISTINCT FROM OLD.site_id OR
      NEW.floor_id IS DISTINCT FROM OLD.floor_id OR
      NEW.zone_id IS DISTINCT FROM OLD.zone_id OR
      NEW.code IS DISTINCT FROM OLD.code
    ) THEN
      RAISE EXCEPTION 'governed Internal Area identity is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.enforce_canonical_hierarchy_lifecycle() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_floor_hierarchy_lifecycle ON public.floors;
CREATE TRIGGER trg_floor_hierarchy_lifecycle
BEFORE UPDATE OF tenant_id,building_id,code,hierarchy_governed ON public.floors
FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_hierarchy_lifecycle();

DROP TRIGGER IF EXISTS trg_zone_hierarchy_lifecycle ON public.zones;
CREATE TRIGGER trg_zone_hierarchy_lifecycle
BEFORE UPDATE OF tenant_id,branch_id,building_id,floor_id,code,hierarchy_governed ON public.zones
FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_hierarchy_lifecycle();

DROP TRIGGER IF EXISTS trg_internal_area_hierarchy_lifecycle ON public.internal_areas;
CREATE TRIGGER trg_internal_area_hierarchy_lifecycle
BEFORE UPDATE OF tenant_id,branch_id,site_id,floor_id,zone_id,code,hierarchy_governed ON public.internal_areas
FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_hierarchy_lifecycle();

CREATE OR REPLACE FUNCTION public.enforce_canonical_hierarchy_final_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE governed boolean; complete boolean;
BEGIN
  IF TG_TABLE_NAME = 'floors' THEN
    SELECT f.hierarchy_governed,
           f.building_id IS NOT NULL AND f.code IS NOT NULL AND btrim(f.code) <> ''
      INTO governed,complete FROM public.floors f WHERE f.id=NEW.id;
  ELSIF TG_TABLE_NAME = 'zones' THEN
    SELECT z.hierarchy_governed,
           z.branch_id IS NOT NULL AND z.building_id IS NOT NULL AND z.floor_id IS NOT NULL
           AND z.code IS NOT NULL AND btrim(z.code) <> ''
      INTO governed,complete FROM public.zones z WHERE z.id=NEW.id;
  ELSE
    SELECT ia.hierarchy_governed,
           ia.site_id IS NOT NULL AND ia.floor_id IS NOT NULL AND ia.zone_id IS NOT NULL
           AND ia.code IS NOT NULL AND btrim(ia.code) <> ''
      INTO governed,complete FROM public.internal_areas ia WHERE ia.id=NEW.id;
  END IF;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- The application write role may only create canonical rows. Privileged
  -- migration/repair sessions retain the explicit ability to load legacy
  -- evidence without pretending that it is canonical.
  IF TG_OP='INSERT' AND NOT governed AND current_user='skia_runtime' THEN
    RAISE EXCEPTION 'new physical hierarchy row must be governed' USING ERRCODE='23514';
  END IF;
  IF governed AND NOT complete THEN
    RAISE EXCEPTION 'governed physical hierarchy row is incomplete' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END
$function$;
REVOKE ALL ON FUNCTION public.enforce_canonical_hierarchy_final_state() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_floor_hierarchy_final_state ON public.floors;
CREATE CONSTRAINT TRIGGER trg_floor_hierarchy_final_state
AFTER INSERT OR UPDATE ON public.floors DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_hierarchy_final_state();

DROP TRIGGER IF EXISTS trg_zone_hierarchy_final_state ON public.zones;
CREATE CONSTRAINT TRIGGER trg_zone_hierarchy_final_state
AFTER INSERT OR UPDATE ON public.zones DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_hierarchy_final_state();

DROP TRIGGER IF EXISTS trg_internal_area_hierarchy_final_state ON public.internal_areas;
CREATE CONSTRAINT TRIGGER trg_internal_area_hierarchy_final_state
AFTER INSERT OR UPDATE ON public.internal_areas DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_hierarchy_final_state();

COMMENT ON COLUMN public.floors.hierarchy_governed IS
  'False for legacy/import-repair evidence; runtime-created Floors must commit with canonical Building scope and code.';
COMMENT ON COLUMN public.zones.hierarchy_governed IS
  'False for legacy/import-repair evidence; runtime-created Zones must commit with canonical Branch, Building and Floor scope.';
COMMENT ON COLUMN public.internal_areas.hierarchy_governed IS
  'False for legacy/import-repair evidence; runtime-created Internal Areas must commit with canonical Site, Floor and Zone scope.';
