-- Narrow, read-only interface for global system naming recommendations.
-- The runtime role deliberately retains no table privileges on
-- system_naming_presets and can execute only this fixed projection.

DO $$
BEGIN
  IF has_table_privilege('skia_runtime','public.system_naming_presets','SELECT') THEN
    RAISE EXCEPTION 'skia_runtime direct preset SELECT must be absent before 024';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.read_active_system_naming_presets(
  p_asset_type_codes text[]
) RETURNS TABLE(
  asset_type_code varchar(50),
  preset_version integer,
  prefix varchar(20),
  separator varchar(5),
  include_branch boolean,
  include_placement boolean,
  seq_digits smallint
)
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT p.asset_type_code, p.preset_version, p.prefix, p.separator,
         p.include_branch, p.include_placement, p.seq_digits
  FROM public.system_naming_presets AS p
  WHERE p.active
    AND pg_catalog.cardinality(p_asset_type_codes) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(p_asset_type_codes) AS requested(code)
      WHERE pg_catalog.upper(pg_catalog.btrim(requested.code)) NOT IN (
        'MDF','IDF','RACK','SWITCH','UPS','PDU','PATCH_PANEL','NODE',
        'BACKBONE','FIREWALL','SERVER','CCTV','AC_UNIT'
      )
    )
    AND p.asset_type_code = ANY (
      ARRAY(
        SELECT pg_catalog.upper(pg_catalog.btrim(requested.code))
        FROM pg_catalog.unnest(p_asset_type_codes) AS requested(code)
      )
    )
  ORDER BY p.asset_type_code, p.preset_version;
$function$;

ALTER FUNCTION public.read_active_system_naming_presets(text[]) OWNER TO skia_migrator;
REVOKE ALL ON FUNCTION public.read_active_system_naming_presets(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_active_system_naming_presets(text[]) FROM skia_onboarding;
GRANT EXECUTE ON FUNCTION public.read_active_system_naming_presets(text[]) TO skia_runtime;

DO $$
BEGIN
  IF has_table_privilege('skia_runtime','public.system_naming_presets','SELECT') THEN
    RAISE EXCEPTION '024 must not grant direct preset SELECT';
  END IF;
  IF NOT has_function_privilege('skia_runtime','public.read_active_system_naming_presets(text[])','EXECUTE') THEN
    RAISE EXCEPTION 'skia_runtime secure preset reader EXECUTE is missing';
  END IF;
END $$;
