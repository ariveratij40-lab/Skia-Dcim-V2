-- Canonical MDF/IDF physical identity. Legacy rows intentionally remain NULL.
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS physical_identity text,
  ADD COLUMN IF NOT EXISTS physical_identity_governed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS normalized_physical_identity text
    GENERATED ALWAYS AS (btrim(regexp_replace(regexp_replace(translate(btrim(physical_identity), 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), E'[ \t\n\r\f\v]+', '-', 'g'), '-+', '-', 'g'), '-')) STORED;

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_mdf_idf_physical_identity_format;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_mdf_idf_physical_identity_format CHECK (
    (physical_identity IS NULL AND physical_identity_governed = false) OR (
      physical_identity_governed = true AND
      placement_type IN ('MDF', 'IDF') AND
      zone_id IS NOT NULL AND
      btrim(physical_identity) <> '' AND
      normalized_physical_identity ~ '^[A-Z0-9._/-]+$'
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_mdf_idf_physical_identity_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  old_normalized text;
  new_normalized text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.physical_identity_governed THEN
    old_normalized := btrim(regexp_replace(regexp_replace(translate(btrim(OLD.physical_identity), 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), E'[ \t\n\r\f\v]+', '-', 'g'), '-+', '-', 'g'), '-');
    new_normalized := CASE WHEN NEW.physical_identity IS NULL THEN NULL ELSE btrim(regexp_replace(regexp_replace(translate(btrim(NEW.physical_identity), 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), E'[ \t\n\r\f\v]+', '-', 'g'), '-+', '-', 'g'), '-') END;
    IF new_normalized IS NULL OR new_normalized <> old_normalized THEN
      RAISE EXCEPTION 'managed MDF/IDF physical identity is write-once' USING ERRCODE = '23514';
    END IF;
    IF NEW.asset_id IS DISTINCT FROM OLD.asset_id THEN
      RAISE EXCEPTION 'managed MDF/IDF asset attachment is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.placement_type IS DISTINCT FROM OLD.placement_type THEN
      RAISE EXCEPTION 'managed MDF/IDF placement type is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.physical_identity_governed IS DISTINCT FROM OLD.physical_identity_governed THEN
      RAISE EXCEPTION 'managed MDF/IDF governance cannot be downgraded' USING ERRCODE = '23514';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
      RAISE EXCEPTION 'managed MDF/IDF tenant and branch scope are immutable' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.physical_identity_governed THEN
    IF NEW.asset_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.assets AS a
      JOIN public.asset_types AS at ON at.id = a.asset_type_id
      JOIN public.mdf_idf AS m
        ON m.asset_id = a.id
       AND m.tenant_id = a.tenant_id
       AND m.branch_id = a.branch_id
       AND m.type = at.code
      WHERE a.id = NEW.asset_id
        AND a.tenant_id = NEW.tenant_id
        AND a.branch_id = NEW.branch_id
        AND at.code = NEW.placement_type
    ) THEN
      RAISE EXCEPTION 'physical identity requires its canonical MDF/IDF asset attachment' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_mdf_idf_physical_identity_lifecycle() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_mdf_idf_physical_identity_lifecycle ON public.locations;
CREATE TRIGGER trg_enforce_mdf_idf_physical_identity_lifecycle
BEFORE INSERT OR UPDATE OF physical_identity, physical_identity_governed, asset_id, placement_type, tenant_id, branch_id, zone_id
ON public.locations
FOR EACH ROW EXECUTE FUNCTION public.enforce_mdf_idf_physical_identity_lifecycle();

CREATE OR REPLACE FUNCTION public.enforce_mdf_idf_physical_identity_final_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  current_location public.locations%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.physical_identity IS NOT DISTINCT FROM OLD.physical_identity
     AND NEW.physical_identity_governed IS NOT DISTINCT FROM OLD.physical_identity_governed
     AND NEW.asset_id IS NOT DISTINCT FROM OLD.asset_id
     AND NEW.placement_type IS NOT DISTINCT FROM OLD.placement_type
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
     AND NEW.zone_id IS NOT DISTINCT FROM OLD.zone_id THEN
    RETURN NULL;
  END IF;

  SELECT * INTO current_location FROM public.locations WHERE id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF current_location.placement_type IN ('MDF','IDF') THEN
    IF NOT current_location.physical_identity_governed
       OR current_location.physical_identity IS NULL
       OR current_location.normalized_physical_identity IS NULL
       OR current_location.asset_id IS NULL
       OR current_location.zone_id IS NULL THEN
      RAISE EXCEPTION 'new MDF/IDF location must commit in governed state' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.assets AS a
      JOIN public.asset_types AS at ON at.id = a.asset_type_id
      JOIN public.mdf_idf AS m ON m.asset_id=a.id AND m.tenant_id=a.tenant_id AND m.branch_id=a.branch_id AND m.type=at.code
      WHERE a.id=current_location.asset_id AND a.tenant_id=current_location.tenant_id
        AND a.branch_id=current_location.branch_id AND at.code=current_location.placement_type
    ) THEN
      RAISE EXCEPTION 'governed MDF/IDF final graph is invalid' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_mdf_idf_physical_identity_final_state() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_enforce_mdf_idf_physical_identity_final_state ON public.locations;
CREATE CONSTRAINT TRIGGER trg_enforce_mdf_idf_physical_identity_final_state
AFTER INSERT OR UPDATE ON public.locations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_mdf_idf_physical_identity_final_state();

CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_mdf_idf_physical_identity
  ON public.locations (
    tenant_id,
    branch_id,
    zone_id,
    placement_type,
    normalized_physical_identity
  )
  WHERE placement_type IN ('MDF', 'IDF')
    AND zone_id IS NOT NULL
    AND normalized_physical_identity IS NOT NULL;

COMMENT ON COLUMN public.locations.physical_identity IS
  'Operator/customer supplied MDF/IDF physical identity; NULL only for legacy rows.';
COMMENT ON COLUMN public.locations.normalized_physical_identity IS
  'Server/DB normalized MDF/IDF physical identity used for scoped duplicate authority.';
COMMENT ON COLUMN public.locations.physical_identity_governed IS
  'False only for pre-contract legacy rows; every new canonical MDF/IDF must commit true.';
