-- HF1: durable operation binding only. No physical authority, seed or RLS change.
-- Fail closed rather than guess how to reconcile preexisting ambiguous operations.
DO $gate$
BEGIN
  IF EXISTS(SELECT 1 FROM public.audit_logs WHERE entity_type='naming_rule'
    AND changes ? 'operation_id' GROUP BY tenant_id,changes->>'operation_id' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'ambiguous_nomenclature_operation_history';
  END IF;
END $gate$;

CREATE UNIQUE INDEX uq_nomenclature_operation_identity
ON public.audit_logs(tenant_id,((changes->>'operation_id')))
WHERE entity_type='naming_rule' AND changes ? 'operation_id';

CREATE OR REPLACE FUNCTION public.write_nomenclature_onboarding_audit(
  p_operation_id uuid,
  p_rule_id uuid,
  p_preset_id uuid,
  p_action public.nomenclature_onboarding_audit_action,
  p_request_fingerprint text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $function$
DECLARE
  tenant uuid; actor uuid; actor_role text; event_id uuid;
  rule_row public.naming_rules%ROWTYPE;
  preset_row public.system_naming_presets%ROWTYPE;
  preset_required boolean;
  existing public.audit_logs%ROWTYPE;
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

  IF p_request_fingerprint IS NOT NULL AND p_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'nomenclature_operation_fingerprint_invalid' USING ERRCODE='23514';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nomenclature-operation:'||tenant::text||':'||p_operation_id::text,0));
  SELECT * INTO existing FROM public.audit_logs
    WHERE tenant_id=tenant AND entity_type='naming_rule'
      AND changes->>'operation_id'=p_operation_id::text;
  IF FOUND THEN
    IF existing.user_id IS DISTINCT FROM actor
       OR existing.action IS DISTINCT FROM p_action::text
       OR existing.entity_id IS DISTINCT FROM p_rule_id::text
       OR existing.changes->>'preset_id' IS DISTINCT FROM p_preset_id::text
       OR existing.changes->>'request_fingerprint' IS DISTINCT FROM p_request_fingerprint THEN
      RAISE EXCEPTION 'nomenclature_operation_conflict' USING ERRCODE='23505';
    END IF;
    RETURN existing.id;
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
      'operation_id',p_operation_id,'request_fingerprint',p_request_fingerprint,'rule_id',rule_row.id,
      'rule_version',rule_row.rule_version,'source_type',rule_row.source_type,
      'preset_id',CASE WHEN preset_required THEN preset_row.id ELSE NULL END,
      'preset_code',CASE WHEN preset_required THEN preset_row.preset_code ELSE NULL END,
      'preset_version',CASE WHEN preset_required THEN preset_row.preset_version ELSE NULL END,
      'action',p_action::text,'result','RECORDED'))
  RETURNING id INTO event_id;
  RETURN event_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.write_nomenclature_onboarding_audit(
 p_operation_id uuid,p_rule_id uuid,p_preset_id uuid,
 p_action public.nomenclature_onboarding_audit_action)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $function$
 SELECT public.write_nomenclature_onboarding_audit(p_operation_id,p_rule_id,p_preset_id,p_action,NULL::text)
$function$;

CREATE OR REPLACE FUNCTION public.read_nomenclature_customization_operation(p_operation_id uuid,p_request_fingerprint text)
RETURNS TABLE(rule_id uuid,rule_version integer,audit_event_id uuid,has_predecessor boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $function$
DECLARE tenant uuid; actor uuid; actor_role text; existing public.audit_logs%ROWTYPE;
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


  IF p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'nomenclature_operation_fingerprint_invalid' USING ERRCODE='23514';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nomenclature-operation:'||tenant::text||':'||p_operation_id::text,0));
  SELECT * INTO existing FROM public.audit_logs
    WHERE tenant_id=tenant AND entity_type='naming_rule'
      AND changes->>'operation_id'=p_operation_id::text;
  IF NOT FOUND THEN RETURN; END IF;
  IF existing.user_id IS DISTINCT FROM actor
     OR existing.action IS DISTINCT FROM 'NOMENCLATURE_RULE_CUSTOMIZED'
     OR existing.changes->>'request_fingerprint' IS DISTINCT FROM p_request_fingerprint THEN
    RAISE EXCEPTION 'nomenclature_operation_conflict' USING ERRCODE='23505';
  END IF;
  RETURN QUERY SELECT r.id,r.rule_version,existing.id,r.supersedes_rule_id IS NOT NULL
    FROM public.naming_rules r
    WHERE r.tenant_id=tenant AND r.id=existing.entity_id::uuid
      AND r.id::text=existing.changes->>'rule_id'
      AND r.rule_version::text=existing.changes->>'rule_version';
  IF NOT FOUND THEN RAISE EXCEPTION 'nomenclature_operation_result_missing' USING ERRCODE='23514'; END IF;
END
$function$;


ALTER FUNCTION public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action,text) OWNER TO skia_migrator;
REVOKE ALL ON FUNCTION public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action,text) FROM PUBLIC,skia_onboarding;
GRANT EXECUTE ON FUNCTION public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action,text) TO skia_runtime;

ALTER FUNCTION public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action) OWNER TO skia_migrator;
REVOKE ALL ON FUNCTION public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action) FROM PUBLIC,skia_onboarding;
GRANT EXECUTE ON FUNCTION public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action) TO skia_runtime;

ALTER FUNCTION public.read_nomenclature_customization_operation(uuid,text) OWNER TO skia_migrator;
REVOKE ALL ON FUNCTION public.read_nomenclature_customization_operation(uuid,text) FROM PUBLIC,skia_onboarding;
GRANT EXECUTE ON FUNCTION public.read_nomenclature_customization_operation(uuid,text) TO skia_runtime;
