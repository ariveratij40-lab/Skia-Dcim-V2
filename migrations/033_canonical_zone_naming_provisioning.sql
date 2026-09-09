-- PHASE 1.2D-B3B5C-A1-HF3: canonical Zone naming for MDF/IDF.
-- The bootstrap runner applies this file and its ledger write atomically.

CREATE OR REPLACE FUNCTION public.provision_canonical_zone_naming_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  previous_tenant text := current_setting('app.tenant_id', true);
BEGIN
  -- Bootstrap/test fixtures commonly create tenants as the migrator. Existing
  -- tenants are handled by the migration below; this trigger is the narrow
  -- forward authority for application-created tenants only.
  IF session_user NOT IN ('skia_onboarding','skia_runtime') THEN
    RETURN NEW;
  END IF;
  PERFORM pg_catalog.set_config('app.tenant_id', NEW.id::text, true);
  INSERT INTO public.naming_rules (
    tenant_id, asset_type_code, prefix, separator, include_branch,
    include_location, seq_digits, reset_per_location, last_seq, active,
    include_placement, include_site, include_internal_area,
    context_mode, include_zone, rule_version, supersedes_rule_id,
    description
  )
  SELECT NEW.id, kind, kind, '-', true, false, 3, false, 0, true,
         false, false, false, 'CANONICAL_ZONE', true, 1, NULL,
         'Norma canónica por Sucursal y Zona'
  FROM (VALUES ('MDF'::varchar), ('IDF'::varchar)) AS required(kind)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.naming_rules nr
    WHERE nr.tenant_id=NEW.id AND nr.asset_type_code=required.kind
  );
  PERFORM pg_catalog.set_config('app.tenant_id', COALESCE(previous_tenant,''), true);
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.provision_canonical_zone_naming_rules() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_provision_canonical_zone_naming_rules ON public.tenants;
CREATE TRIGGER trg_provision_canonical_zone_naming_rules
AFTER INSERT ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.provision_canonical_zone_naming_rules();

DO $migration$
DECLARE
  tenant record;
  kind varchar;
  current_rule public.naming_rules%ROWTYPE;
  previous_tenant text := current_setting('app.tenant_id', true);
BEGIN
  FOR tenant IN SELECT id FROM public.tenants ORDER BY id LOOP
    PERFORM pg_catalog.set_config('app.tenant_id', tenant.id::text, true);
    FOREACH kind IN ARRAY ARRAY['MDF'::varchar,'IDF'::varchar] LOOP
      SELECT * INTO current_rule
      FROM public.naming_rules
      WHERE tenant_id=tenant.id AND asset_type_code=kind AND active
      FOR UPDATE;

      IF FOUND THEN
        IF current_rule.context_mode='CANONICAL_ZONE' THEN
          IF current_rule.prefix<>kind OR NOT current_rule.include_branch
             OR current_rule.include_site OR NOT current_rule.include_zone
             OR current_rule.include_internal_area OR current_rule.include_placement
             OR current_rule.include_location OR current_rule.reset_per_location
             OR current_rule.separator IS NULL OR btrim(current_rule.separator)=''
             OR current_rule.seq_digits NOT BETWEEN 2 AND 6 THEN
            RAISE EXCEPTION 'malformed active canonical naming rule for tenant %, type %', tenant.id, kind
              USING ERRCODE='23514';
          END IF;
          CONTINUE;
        END IF;

        IF current_rule.context_mode<>'LEGACY_INTERNAL_AREA' THEN
          RAISE EXCEPTION 'unsupported active naming context for tenant %, type %', tenant.id, kind
            USING ERRCODE='23514';
        END IF;
        IF EXISTS (SELECT 1 FROM public.naming_rules WHERE supersedes_rule_id=current_rule.id) THEN
          RAISE EXCEPTION 'active legacy naming rule already has a successor for tenant %, type %', tenant.id, kind
            USING ERRCODE='23514';
        END IF;

        UPDATE public.naming_rules SET active=false, updated_at=now()
        WHERE id=current_rule.id;
        INSERT INTO public.naming_rules (
          tenant_id, asset_type_code, prefix, separator, include_branch,
          include_location, seq_digits, reset_per_location, last_seq, active,
          include_placement, include_site, include_internal_area,
          context_mode, include_zone, rule_version, supersedes_rule_id,
          description
        ) VALUES (
          tenant.id, kind, kind,
          CASE WHEN current_rule.separator IS NULL OR btrim(current_rule.separator)='' THEN '-' ELSE current_rule.separator END,
          true, false,
          CASE WHEN current_rule.seq_digits BETWEEN 2 AND 6 THEN current_rule.seq_digits ELSE 3 END,
          false, 0, true, false, false, false,
          'CANONICAL_ZONE', true, current_rule.rule_version+1, current_rule.id,
          'Norma canónica por Sucursal y Zona'
        );
      ELSE
        IF EXISTS (SELECT 1 FROM public.naming_rules WHERE tenant_id=tenant.id AND asset_type_code=kind) THEN
          RAISE EXCEPTION 'naming history without active rule for tenant %, type %', tenant.id, kind
            USING ERRCODE='23514';
        END IF;
        INSERT INTO public.naming_rules (
          tenant_id, asset_type_code, prefix, separator, include_branch,
          include_location, seq_digits, reset_per_location, last_seq, active,
          include_placement, include_site, include_internal_area,
          context_mode, include_zone, rule_version, supersedes_rule_id,
          description
        ) VALUES (
          tenant.id, kind, kind, '-', true, false, 3, false, 0, true,
          false, false, false, 'CANONICAL_ZONE', true, 1, NULL,
          'Norma canónica por Sucursal y Zona'
        );
      END IF;
    END LOOP;
  END LOOP;
  PERFORM pg_catalog.set_config('app.tenant_id', COALESCE(previous_tenant,''), true);
END
$migration$;

COMMENT ON FUNCTION public.provision_canonical_zone_naming_rules() IS
  'Provisions canonical MDF/IDF Zone naming roots for every newly created tenant.';
