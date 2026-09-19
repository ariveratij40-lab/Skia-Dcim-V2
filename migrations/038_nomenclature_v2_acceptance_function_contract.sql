-- Phase 1.2F-B2c: exact preset lookup and CUSTOM audit alignment.
-- No catalog rows are published by this migration.

CREATE OR REPLACE FUNCTION public.read_system_naming_preset_v2(
  p_asset_type_code text,
  p_preset_version integer
) RETURNS TABLE(
  lookup_status text,
  id uuid, preset_code varchar(100), asset_type_code varchar(50), preset_version integer,
  prefix varchar(20), separator varchar(5), include_branch boolean,
  include_building boolean, include_floor boolean, include_zone boolean,
  include_distribution boolean, include_housing boolean, include_placement boolean,
  context_mode varchar(32), sequence_scope varchar(24), seq_digits smallint,
  custom_segment_1 varchar(50), custom_segment_2 varchar(50),
  custom_segment_1_label varchar(100), custom_segment_2_label varchar(100),
  description text, active boolean
)
LANGUAGE sql STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $function$
  WITH requested AS (
    SELECT pg_catalog.upper(pg_catalog.btrim(p_asset_type_code)) AS code,
           p_preset_version AS version
  ), found AS (
    SELECT p.* FROM public.system_naming_presets p, requested r
    WHERE r.code IN ('MDF','IDF','RACK','SWITCH','UPS','PDU','PATCH_PANEL','NODE',
                     'FIREWALL','SERVER','CCTV','AC_UNIT')
      AND r.version>0
      AND p.asset_type_code=r.code AND p.preset_version=r.version
  )
  SELECT CASE WHEN f.active THEN 'FOUND_ACTIVE' ELSE 'FOUND_INACTIVE' END,
         f.id,f.preset_code,f.asset_type_code,f.preset_version,f.prefix,f.separator,
         f.include_branch,f.include_building,f.include_floor,f.include_zone,
         f.include_distribution,f.include_housing,f.include_placement,
         f.context_mode,f.sequence_scope,f.seq_digits,f.custom_segment_1,
         f.custom_segment_2,f.custom_segment_1_label,f.custom_segment_2_label,
         f.description,f.active
  FROM found f
  UNION ALL
  SELECT 'NOT_FOUND',NULL::uuid,NULL::varchar(100),NULL::varchar(50),NULL::integer,
         NULL::varchar(20),NULL::varchar(5),NULL::boolean,NULL::boolean,NULL::boolean,
         NULL::boolean,NULL::boolean,NULL::boolean,NULL::boolean,NULL::varchar(32),
         NULL::varchar(24),NULL::smallint,NULL::varchar(50),NULL::varchar(50),
         NULL::varchar(100),NULL::varchar(100),NULL::text,NULL::boolean
  WHERE NOT EXISTS(SELECT 1 FROM found);
$function$;

ALTER FUNCTION public.read_system_naming_preset_v2(text,integer) OWNER TO skia_migrator;
REVOKE ALL ON FUNCTION public.read_system_naming_preset_v2(text,integer) FROM PUBLIC,skia_onboarding;
GRANT EXECUTE ON FUNCTION public.read_system_naming_preset_v2(text,integer) TO skia_runtime;

-- The restricted runtime inserts accepted rules directly. PostgreSQL checks
-- EXECUTE on functions referenced by CHECK constraints, so this exact pure
-- validator is required for the insert path (no table authority is added).
REVOKE ALL ON FUNCTION public.nomenclature_acceptance_snapshot_is_valid(jsonb) FROM PUBLIC,skia_onboarding;
GRANT EXECUTE ON FUNCTION public.nomenclature_acceptance_snapshot_is_valid(jsonb) TO skia_runtime;
REVOKE ALL ON FUNCTION public.naming_rule_is_issued(uuid) FROM PUBLIC,skia_onboarding;
GRANT EXECUTE ON FUNCTION public.naming_rule_is_issued(uuid) TO skia_runtime;

CREATE OR REPLACE FUNCTION public.write_nomenclature_onboarding_audit(
  p_operation_id uuid,
  p_rule_id uuid,
  p_preset_id uuid,
  p_action public.nomenclature_onboarding_audit_action
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $function$
DECLARE
  tenant uuid; actor uuid; actor_role text; event_id uuid;
  rule_row public.naming_rules%ROWTYPE;
  preset_row public.system_naming_presets%ROWTYPE;
  preset_required boolean;
BEGIN
  tenant:=NULLIF(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
  actor:=NULLIF(pg_catalog.current_setting('app.user_id',true),'')::uuid;
  IF tenant IS NULL OR actor IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'nomenclature_audit_identity_required' USING ERRCODE='42501';
  END IF;
  SELECT r.name INTO actor_role
  FROM public.users u
  JOIN public.user_tenants ut ON ut.user_id=u.id AND ut.tenant_id=tenant
  JOIN public.tenants t ON t.id=ut.tenant_id AND t.status='active'
  JOIN public.user_roles ur ON ur.user_id=u.id AND ur.tenant_id=tenant
  JOIN public.roles r ON r.id=ur.role_id
  WHERE u.id=actor AND u.status='active' AND r.name IN ('admin','super_admin')
    AND (r.tenant_id=tenant OR (r.tenant_id IS NULL AND r.is_global AND r.name='super_admin'))
  ORDER BY CASE r.name WHEN 'super_admin' THEN 0 ELSE 1 END LIMIT 1;
  IF actor_role IS NULL THEN
    RAISE EXCEPTION 'nomenclature_audit_actor_forbidden' USING ERRCODE='42501';
  END IF;

  SELECT * INTO rule_row FROM public.naming_rules WHERE id=p_rule_id AND tenant_id=tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nomenclature_audit_rule_not_found' USING ERRCODE='23503';
  END IF;

  preset_required:=NOT (p_action='NOMENCLATURE_RULE_CUSTOMIZED'
                         AND rule_row.source_type='CUSTOM');
  IF preset_required AND p_preset_id IS NULL THEN
    RAISE EXCEPTION 'nomenclature_audit_preset_required' USING ERRCODE='23514';
  END IF;
  IF NOT preset_required AND p_preset_id IS NOT NULL THEN
    RAISE EXCEPTION 'nomenclature_custom_audit_preset_must_be_null' USING ERRCODE='23514';
  END IF;
  IF preset_required THEN
    SELECT * INTO preset_row FROM public.system_naming_presets
    WHERE id=p_preset_id AND asset_type_code=rule_row.asset_type_code;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'nomenclature_audit_preset_not_found' USING ERRCODE='23503';
    END IF;
  END IF;

  IF p_action IN ('NOMENCLATURE_PRESET_ACCEPTED','NOMENCLATURE_PRESET_UPDATE_ACCEPTED')
     AND NOT (rule_row.source_type='PRESET' AND rule_row.source_preset_id=preset_row.id
       AND rule_row.source_preset_version=preset_row.preset_version) THEN
    RAISE EXCEPTION 'nomenclature_audit_state_mismatch' USING ERRCODE='23514';
  ELSIF p_action='NOMENCLATURE_RULE_CUSTOMIZED'
     AND NOT ((rule_row.source_type='CUSTOM' AND p_preset_id IS NULL)
       OR (rule_row.source_type='DERIVED_FROM_PRESET'
         AND rule_row.source_preset_id=preset_row.id
         AND rule_row.source_preset_version=preset_row.preset_version
         AND rule_row.customized_after_acceptance)) THEN
    RAISE EXCEPTION 'nomenclature_audit_state_mismatch' USING ERRCODE='23514';
  ELSIF p_action='NOMENCLATURE_PRESET_PRESERVED_CONFLICT'
     AND NOT (rule_row.source_type IN ('CUSTOM','DERIVED_FROM_PRESET')
       OR public.naming_rule_is_issued(rule_row.id)) THEN
    RAISE EXCEPTION 'nomenclature_audit_state_mismatch' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.audit_logs(user_id,tenant_id,action,entity_type,entity_id,changes)
  VALUES(actor,tenant,p_action::text,'naming_rule',rule_row.id::text,
    pg_catalog.jsonb_build_object(
      'operation_id',p_operation_id,'rule_id',rule_row.id,
      'rule_version',rule_row.rule_version,'source_type',rule_row.source_type,
      'preset_id',CASE WHEN preset_required THEN preset_row.id ELSE NULL END,
      'preset_code',CASE WHEN preset_required THEN preset_row.preset_code ELSE NULL END,
      'preset_version',CASE WHEN preset_required THEN preset_row.preset_version ELSE NULL END,
      'action',p_action::text,'result','RECORDED'))
  ON CONFLICT DO NOTHING RETURNING id INTO event_id;
  IF event_id IS NULL THEN
    SELECT id INTO event_id FROM public.audit_logs
    WHERE tenant_id=tenant AND action=p_action::text AND entity_type='naming_rule'
      AND changes->>'operation_id'=p_operation_id::text;
  END IF;
  RETURN event_id;
END
$function$;

ALTER FUNCTION public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action) OWNER TO skia_migrator;
REVOKE ALL ON FUNCTION public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action) FROM PUBLIC,skia_onboarding;
GRANT EXECUTE ON FUNCTION public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action) TO skia_runtime;

DO $verification$
BEGIN
  IF EXISTS(SELECT 1 FROM public.system_naming_presets WHERE preset_code IN
      ('MDF_V1','IDF_V1','RACK_V1','SWITCH_V1','UPS_V1','PDU_V1','PATCH_PANEL_V1',
       'NODE_V1','FIREWALL_V1','SERVER_V1','CCTV_V1','AC_UNIT_V1')) THEN
    RAISE EXCEPTION '038 must not activate or seed the Phase 1.2F catalog';
  END IF;
  IF NOT has_function_privilege('skia_runtime','public.read_system_naming_preset_v2(text,integer)','EXECUTE')
     OR NOT has_function_privilege('skia_runtime','public.nomenclature_acceptance_snapshot_is_valid(jsonb)','EXECUTE')
     OR NOT has_function_privilege('skia_runtime','public.naming_rule_is_issued(uuid)','EXECUTE')
     OR has_function_privilege('skia_onboarding','public.read_system_naming_preset_v2(text,integer)','EXECUTE')
     OR has_table_privilege('skia_runtime','public.system_naming_presets','SELECT')
     OR has_table_privilege('skia_runtime','public.audit_logs','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION '038 runtime privilege contract differs';
  END IF;
END
$verification$;
