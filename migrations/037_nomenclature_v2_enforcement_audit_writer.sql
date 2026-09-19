-- Phase 1.2F-B2b: structural nomenclature V2 enforcement and narrow audit authority.
-- The canonical bootstrap runner executes this artifact and its ledger insert in
-- one transaction. This migration intentionally publishes no preset rows.

CREATE OR REPLACE FUNCTION public.nomenclature_acceptance_snapshot_is_valid(p_snapshot jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path=pg_catalog,pg_temp
AS $function$
  SELECT p_snapshot IS NOT NULL
    AND pg_catalog.jsonb_typeof(p_snapshot)='object'
    AND (SELECT pg_catalog.count(*)=6 FROM pg_catalog.jsonb_object_keys(p_snapshot))
    AND p_snapshot ?& ARRAY['schema_version','user_id','tenant_id','role','email','name']
    AND pg_catalog.jsonb_typeof(p_snapshot->'schema_version')='number'
    AND p_snapshot->'schema_version'='1'::jsonb
    AND pg_catalog.jsonb_typeof(p_snapshot->'user_id')='string'
    AND (p_snapshot->>'user_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND pg_catalog.jsonb_typeof(p_snapshot->'tenant_id')='string'
    AND (p_snapshot->>'tenant_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND pg_catalog.jsonb_typeof(p_snapshot->'role')='string'
    AND p_snapshot->>'role' IN ('admin','super_admin')
    AND pg_catalog.jsonb_typeof(p_snapshot->'email')='string'
    AND p_snapshot->>'email'=pg_catalog.lower(pg_catalog.btrim(p_snapshot->>'email'))
    AND pg_catalog.btrim(p_snapshot->>'email')<>''
    AND pg_catalog.jsonb_typeof(p_snapshot->'name')='string'
    AND pg_catalog.btrim(p_snapshot->>'name')<>'';
$function$;
REVOKE ALL ON FUNCTION public.nomenclature_acceptance_snapshot_is_valid(jsonb) FROM PUBLIC;

-- Administrative compatibility scans must see every tenant while the migrator
-- remains NOBYPASSRLS. FORCE is suspended only inside this migration
-- transaction and restored before any new authority becomes callable.
LOCK TABLE public.naming_rules,public.assets,public.locations,public.buildings,
  public.floors,public.zones,public.mdf_idf,public.racks,
  public.nomenclature_counters,public.nomenclature_branch_counters
  IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE nomenclature_v2_rls_state ON COMMIT DROP AS
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('naming_rules','assets','locations','buildings','floors','zones',
    'mdf_idf','racks','nomenclature_counters','nomenclature_branch_counters');
ALTER TABLE public.naming_rules NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.assets NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.locations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.buildings NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.floors NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.zones NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mdf_idf NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.racks NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.nomenclature_counters NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.nomenclature_branch_counters NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.assets DISABLE TRIGGER USER;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.naming_rules
    WHERE source_type IN ('PRESET','DERIVED_FROM_PRESET')
      AND (NOT public.nomenclature_acceptance_snapshot_is_valid(accepted_by_snapshot)
        OR accepted_by_snapshot->>'tenant_id'<>tenant_id::text
        OR (accepted_by IS NOT NULL AND accepted_by_snapshot->>'user_id'<>accepted_by::text))
  ) THEN
    RAISE EXCEPTION 'malformed_existing_nomenclature_acceptance_snapshot';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.assets a
    LEFT JOIN public.naming_rules nr ON nr.id=a.nomenclature_id AND nr.tenant_id=a.tenant_id
    LEFT JOIN public.asset_types at ON at.id=a.asset_type_id AND at.code=nr.asset_type_code
    WHERE (a.nomenclature_id IS NULL) <> (a.nomenclature_sequence IS NULL)
       OR (a.nomenclature_id IS NOT NULL AND (nr.id IS NULL OR at.id IS NULL OR a.nomenclature_sequence<=0))
  ) THEN
    RAISE EXCEPTION 'invalid_existing_managed_asset_identity';
  END IF;
END
$preflight$;

-- Persist the scope that made an issued number unique. It is derived from the
-- immutable rule and canonical physical authority, never accepted from HTTP.
ALTER TABLE public.assets
  ADD COLUMN nomenclature_sequence_scope varchar(24),
  ADD COLUMN nomenclature_sequence_scope_location_id uuid;

UPDATE public.assets a
SET nomenclature_sequence_scope=nr.sequence_scope,
    nomenclature_sequence_scope_location_id=CASE
      WHEN nr.sequence_scope IN ('PLACEMENT','DISTRIBUTION') THEN a.location_id
      ELSE NULL
    END
FROM public.naming_rules nr
WHERE nr.id=a.nomenclature_id AND nr.tenant_id=a.tenant_id;

ALTER TABLE public.assets ENABLE TRIGGER USER;

ALTER TABLE public.assets ADD CONSTRAINT assets_nomenclature_scope_coherence CHECK (
  (nomenclature_id IS NULL AND nomenclature_sequence IS NULL
    AND nomenclature_sequence_scope IS NULL AND nomenclature_sequence_scope_location_id IS NULL)
  OR
  (nomenclature_id IS NOT NULL AND nomenclature_sequence IS NOT NULL
    AND nomenclature_sequence>0
    AND nomenclature_sequence_scope IN ('BRANCH','PLACEMENT','DISTRIBUTION')
    AND ((nomenclature_sequence_scope='BRANCH' AND nomenclature_sequence_scope_location_id IS NULL)
      OR (nomenclature_sequence_scope IN ('PLACEMENT','DISTRIBUTION')
        AND nomenclature_sequence_scope_location_id IS NOT NULL)))
);
ALTER TABLE public.assets ADD CONSTRAINT assets_nomenclature_scope_location_fk
  FOREIGN KEY(nomenclature_sequence_scope_location_id,tenant_id,branch_id)
  REFERENCES public.locations(id,tenant_id,branch_id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX uq_assets_nomenclature_branch_scope_sequence
  ON public.assets(nomenclature_id,branch_id,nomenclature_sequence)
  WHERE nomenclature_id IS NOT NULL AND nomenclature_sequence_scope='BRANCH';
CREATE UNIQUE INDEX uq_assets_nomenclature_location_scope_sequence
  ON public.assets(nomenclature_id,branch_id,nomenclature_sequence_scope,
                   nomenclature_sequence_scope_location_id,nomenclature_sequence)
  WHERE nomenclature_id IS NOT NULL
    AND nomenclature_sequence_scope IN ('PLACEMENT','DISTRIBUTION');

ALTER TABLE public.naming_rules DROP CONSTRAINT naming_rules_provenance_coherence;
ALTER TABLE public.naming_rules ADD CONSTRAINT naming_rules_provenance_coherence CHECK (
  (source_type='LEGACY_UNATTRIBUTED'
    AND source_preset_id IS NULL AND source_preset_version IS NULL
    AND accepted_by IS NULL AND accepted_at IS NULL AND accepted_by_snapshot IS NULL
    AND NOT customized_after_acceptance)
  OR
  (source_type='CUSTOM'
    AND source_preset_id IS NULL AND source_preset_version IS NULL
    AND accepted_by IS NULL AND accepted_at IS NULL AND accepted_by_snapshot IS NULL
    AND NOT customized_after_acceptance)
  OR
  (source_type='PRESET'
    AND source_preset_id IS NOT NULL AND source_preset_version IS NOT NULL
    AND accepted_at IS NOT NULL
    AND public.nomenclature_acceptance_snapshot_is_valid(accepted_by_snapshot)
    AND accepted_by_snapshot->>'tenant_id'=tenant_id::text
    AND (accepted_by IS NULL OR accepted_by_snapshot->>'user_id'=accepted_by::text)
    AND NOT customized_after_acceptance)
  OR
  (source_type='DERIVED_FROM_PRESET'
    AND source_preset_id IS NOT NULL AND source_preset_version IS NOT NULL
    AND accepted_at IS NOT NULL
    AND public.nomenclature_acceptance_snapshot_is_valid(accepted_by_snapshot)
    AND accepted_by_snapshot->>'tenant_id'=tenant_id::text
    AND (accepted_by IS NULL OR accepted_by_snapshot->>'user_id'=accepted_by::text)
    AND customized_after_acceptance)
);

-- last_seq is only a compatibility high-water mark. Scoped counters and actual
-- assets are also issuance authorities.
CREATE OR REPLACE FUNCTION public.naming_rule_is_issued(p_rule_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path=pg_catalog,pg_temp
AS $function$
  SELECT EXISTS(SELECT 1 FROM public.assets a WHERE a.nomenclature_id=p_rule_id)
      OR EXISTS(SELECT 1 FROM public.nomenclature_branch_counters c WHERE c.nomenclature_id=p_rule_id AND c.last_seq>0)
      OR EXISTS(SELECT 1 FROM public.nomenclature_counters c WHERE c.nomenclature_id=p_rule_id AND c.last_seq>0);
$function$;
REVOKE ALL ON FUNCTION public.naming_rule_is_issued(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.enforce_naming_rule_v2_immutability()
RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp
AS $function$
DECLARE issued boolean;
BEGIN
  IF NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_preset_id IS DISTINCT FROM OLD.source_preset_id
     OR NEW.source_preset_version IS DISTINCT FROM OLD.source_preset_version
     OR (NEW.accepted_by IS DISTINCT FROM OLD.accepted_by
         AND NOT (OLD.accepted_by IS NOT NULL AND NEW.accepted_by IS NULL))
     OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
     OR NEW.accepted_by_snapshot IS DISTINCT FROM OLD.accepted_by_snapshot
     OR NEW.customized_after_acceptance IS DISTINCT FROM OLD.customized_after_acceptance THEN
    RAISE EXCEPTION 'naming_rule_provenance_immutable' USING ERRCODE='23514';
  END IF;
  issued:=public.naming_rule_is_issued(OLD.id);
  IF issued AND (
     NEW.prefix IS DISTINCT FROM OLD.prefix
     OR NEW.separator IS DISTINCT FROM OLD.separator
     OR NEW.include_branch IS DISTINCT FROM OLD.include_branch
     OR NEW.include_location IS DISTINCT FROM OLD.include_location
     OR NEW.seq_digits IS DISTINCT FROM OLD.seq_digits
     OR NEW.reset_per_location IS DISTINCT FROM OLD.reset_per_location
     OR NEW.custom_segment_1 IS DISTINCT FROM OLD.custom_segment_1
     OR NEW.custom_segment_2 IS DISTINCT FROM OLD.custom_segment_2
     OR NEW.custom_segment_1_label IS DISTINCT FROM OLD.custom_segment_1_label
     OR NEW.custom_segment_2_label IS DISTINCT FROM OLD.custom_segment_2_label
     OR NEW.include_placement IS DISTINCT FROM OLD.include_placement
     OR NEW.include_site IS DISTINCT FROM OLD.include_site
     OR NEW.include_internal_area IS DISTINCT FROM OLD.include_internal_area
     OR NEW.context_mode IS DISTINCT FROM OLD.context_mode
     OR NEW.include_zone IS DISTINCT FROM OLD.include_zone
     OR NEW.include_floor IS DISTINCT FROM OLD.include_floor
     OR NEW.include_distribution IS DISTINCT FROM OLD.include_distribution
     OR NEW.include_housing IS DISTINCT FROM OLD.include_housing
     OR NEW.sequence_scope IS DISTINCT FROM OLD.sequence_scope) THEN
    RAISE EXCEPTION 'normative_version_required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.enforce_naming_rule_v2_immutability() FROM PUBLIC;

-- Immediate checks do not reproduce Go's string builder. They validate only
-- persisted identity, rule, canonical authority and counter state.
CREATE OR REPLACE FUNCTION public.enforce_asset_nomenclature()
RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp
AS $function$
DECLARE
  required boolean; rule_row public.naming_rules%ROWTYPE; type_code text;
  scope_location uuid; counter_value integer; zone_count integer;
BEGIN
  SELECT at.requires_nomenclature,at.code INTO required,type_code
  FROM public.asset_types at WHERE at.id=NEW.asset_type_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_asset_type' USING ERRCODE='23514'; END IF;

  IF TG_OP='UPDATE' AND OLD.nomenclature_id IS NULL AND OLD.nomenclature_sequence IS NULL
     AND NEW.nomenclature_id IS NULL AND NEW.nomenclature_sequence IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(required,false) AND (NEW.nomenclature_id IS NULL OR NEW.nomenclature_sequence IS NULL) THEN
    RAISE EXCEPTION 'nomenclature_required' USING ERRCODE='23514';
  END IF;
  IF NEW.nomenclature_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.nomenclature_id IS NOT NULL AND (
       NEW.nomenclature_id IS DISTINCT FROM OLD.nomenclature_id
       OR NEW.nomenclature_sequence IS DISTINCT FROM OLD.nomenclature_sequence
       OR NEW.internal_code IS DISTINCT FROM OLD.internal_code
       OR NEW.nomenclature_sequence_scope IS DISTINCT FROM OLD.nomenclature_sequence_scope
       OR NEW.nomenclature_sequence_scope_location_id IS DISTINCT FROM OLD.nomenclature_sequence_scope_location_id) THEN
    RAISE EXCEPTION 'managed_asset_identity_immutable' USING ERRCODE='23514';
  END IF;
  SELECT nr.* INTO rule_row FROM public.naming_rules nr
  WHERE nr.id=NEW.nomenclature_id AND nr.tenant_id=NEW.tenant_id
    AND nr.asset_type_code=type_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_asset_nomenclature' USING ERRCODE='23514'; END IF;
  IF NOT rule_row.active AND (TG_OP='INSERT' OR OLD.nomenclature_id IS NULL) THEN
    RAISE EXCEPTION 'inactive_asset_nomenclature' USING ERRCODE='23514';
  END IF;
  IF NEW.nomenclature_sequence<=0 OR NEW.nomenclature_sequence>=pg_catalog.power(10,rule_row.seq_digits) THEN
    RAISE EXCEPTION 'invalid_nomenclature_sequence' USING ERRCODE='23514';
  END IF;
  IF pg_catalog.octet_length(NEW.internal_code)>100 THEN
    RAISE EXCEPTION 'nomenclature_code_exceeds_100_bytes' USING ERRCODE='22001';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=NEW.branch_id AND b.tenant_id=NEW.tenant_id AND b.status='active') THEN
    RAISE EXCEPTION 'invalid_asset_nomenclature_branch' USING ERRCODE='23514';
  END IF;

  IF rule_row.context_mode='CANONICAL_ZONE' THEN
    SELECT count(*) INTO zone_count FROM public.locations l
    JOIN public.zones z ON z.id=l.zone_id AND z.tenant_id=l.tenant_id AND z.branch_id=l.branch_id AND z.status='active'
    LEFT JOIN public.buildings b ON b.id=z.building_id AND b.tenant_id=z.tenant_id AND b.branch_id=z.branch_id AND b.status='active'
    LEFT JOIN public.floors f ON f.id=z.floor_id AND f.tenant_id=z.tenant_id AND f.building_id=z.building_id
    WHERE l.id=NEW.location_id AND l.tenant_id=NEW.tenant_id AND l.branch_id=NEW.branch_id AND l.status='active'
      AND (NOT rule_row.include_site OR b.id IS NOT NULL)
      AND (NOT rule_row.include_floor OR f.id IS NOT NULL);
    IF zone_count<>1 THEN RAISE EXCEPTION 'invalid_asset_zone_context' USING ERRCODE='23514'; END IF;
  ELSIF rule_row.context_mode='CANONICAL_HOUSING' THEN
    IF NEW.housing_rack_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.racks r
      JOIN public.assets ra ON ra.id=r.asset_id AND ra.tenant_id=r.tenant_id AND ra.branch_id=r.branch_id AND ra.status='active'
      JOIN public.asset_types rat ON rat.id=ra.asset_type_id AND rat.code='RACK'
      JOIN public.mdf_idf m ON m.id=r.mdf_idf_id AND m.tenant_id=r.tenant_id AND m.branch_id=r.branch_id
      JOIN public.assets da ON da.id=m.asset_id AND da.tenant_id=m.tenant_id AND da.branch_id=m.branch_id
      WHERE r.id=NEW.housing_rack_id AND r.tenant_id=NEW.tenant_id AND r.branch_id=NEW.branch_id
        AND r.housing_type IN ('RACK','CABINET') AND ra.location_id=NEW.location_id
        AND da.location_id=ra.location_id
    ) THEN RAISE EXCEPTION 'invalid_asset_housing_context' USING ERRCODE='23514'; END IF;
  ELSIF rule_row.context_mode NOT IN ('LEGACY_INTERNAL_AREA','CANONICAL_DISTRIBUTION') THEN
    RAISE EXCEPTION 'invalid_naming_context_mode' USING ERRCODE='23514';
  END IF;
  IF rule_row.include_placement AND NOT EXISTS(
    SELECT 1 FROM public.locations l WHERE l.id=NEW.location_id
      AND l.tenant_id=NEW.tenant_id AND l.branch_id=NEW.branch_id AND l.status='active'
  ) THEN RAISE EXCEPTION 'invalid_asset_placement' USING ERRCODE='23514'; END IF;

  scope_location:=CASE WHEN rule_row.sequence_scope IN ('PLACEMENT','DISTRIBUTION') THEN NEW.location_id END;
  NEW.nomenclature_sequence_scope:=rule_row.sequence_scope;
  NEW.nomenclature_sequence_scope_location_id:=scope_location;
  IF rule_row.sequence_scope='BRANCH' THEN
    SELECT c.last_seq INTO counter_value FROM public.nomenclature_branch_counters c
    WHERE c.nomenclature_id=rule_row.id AND c.tenant_id=NEW.tenant_id AND c.branch_id=NEW.branch_id;
  ELSE
    SELECT c.last_seq INTO counter_value FROM public.nomenclature_counters c
    WHERE c.nomenclature_id=rule_row.id AND c.tenant_id=NEW.tenant_id AND c.branch_id=NEW.branch_id
      AND c.placement_id=scope_location;
  END IF;
  IF counter_value IS NULL OR counter_value<NEW.nomenclature_sequence THEN
    RAISE EXCEPTION 'nomenclature_counter_incoherent' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.enforce_asset_nomenclature() FROM PUBLIC;

DROP TRIGGER trg_enforce_asset_nomenclature ON public.assets;
CREATE TRIGGER trg_enforce_asset_nomenclature
  BEFORE INSERT ON public.assets FOR EACH ROW EXECUTE FUNCTION public.enforce_asset_nomenclature();
DROP TRIGGER trg_enforce_asset_nomenclature_update ON public.assets;
CREATE TRIGGER trg_enforce_asset_nomenclature_update
  BEFORE UPDATE OF tenant_id,branch_id,asset_type_id,location_id,housing_rack_id,
    nomenclature_id,nomenclature_sequence,internal_code,nomenclature_sequence_scope,
    nomenclature_sequence_scope_location_id
  ON public.assets FOR EACH ROW EXECUTE FUNCTION public.enforce_asset_nomenclature();

CREATE OR REPLACE FUNCTION public.assert_asset_nomenclature_v2(p_asset_id uuid)
RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp
AS $function$
DECLARE a public.assets%ROWTYPE; nr public.naming_rules%ROWTYPE; type_code text; counter_value integer;
BEGIN
  SELECT x.* INTO a FROM public.assets x WHERE x.id=p_asset_id;
  IF NOT FOUND OR a.nomenclature_id IS NULL THEN RETURN; END IF;
  SELECT r.* INTO STRICT nr FROM public.naming_rules r WHERE r.id=a.nomenclature_id AND r.tenant_id=a.tenant_id;
  SELECT at.code INTO STRICT type_code FROM public.asset_types at WHERE at.id=a.asset_type_id;
  IF nr.asset_type_code<>type_code THEN RAISE EXCEPTION 'invalid_asset_nomenclature' USING ERRCODE='23514'; END IF;

  IF nr.context_mode='CANONICAL_DISTRIBUTION' THEN
    IF type_code<>'RACK' OR NOT EXISTS(
      SELECT 1 FROM public.racks r
      JOIN public.mdf_idf m ON m.id=r.mdf_idf_id AND m.tenant_id=r.tenant_id AND m.branch_id=r.branch_id
      JOIN public.assets da ON da.id=m.asset_id AND da.tenant_id=m.tenant_id AND da.branch_id=m.branch_id AND da.status='active'
      JOIN public.locations l ON l.id=da.location_id AND l.tenant_id=da.tenant_id AND l.branch_id=da.branch_id AND l.status='active'
      WHERE r.asset_id=a.id AND r.tenant_id=a.tenant_id AND r.branch_id=a.branch_id
        AND a.location_id=l.id AND a.nomenclature_sequence_scope_location_id=l.id
    ) THEN RAISE EXCEPTION 'invalid_asset_distribution_context' USING ERRCODE='23514'; END IF;
  ELSIF nr.context_mode='CANONICAL_HOUSING' THEN
    IF a.housing_rack_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.racks r JOIN public.assets ra ON ra.id=r.asset_id
      WHERE r.id=a.housing_rack_id AND r.tenant_id=a.tenant_id AND r.branch_id=a.branch_id
        AND ra.tenant_id=a.tenant_id AND ra.branch_id=a.branch_id AND ra.location_id=a.location_id
    ) THEN RAISE EXCEPTION 'invalid_asset_housing_context' USING ERRCODE='23514'; END IF;
  END IF;
  IF nr.sequence_scope='BRANCH' THEN
    SELECT last_seq INTO counter_value FROM public.nomenclature_branch_counters
    WHERE nomenclature_id=nr.id AND tenant_id=a.tenant_id AND branch_id=a.branch_id;
  ELSE
    SELECT last_seq INTO counter_value FROM public.nomenclature_counters
    WHERE nomenclature_id=nr.id AND tenant_id=a.tenant_id AND branch_id=a.branch_id
      AND placement_id=a.nomenclature_sequence_scope_location_id;
  END IF;
  IF counter_value IS NULL OR counter_value<a.nomenclature_sequence THEN
    RAISE EXCEPTION 'nomenclature_counter_incoherent' USING ERRCODE='23514';
  END IF;
END
$function$;
REVOKE ALL ON FUNCTION public.assert_asset_nomenclature_v2(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.enforce_asset_nomenclature_v2_final_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $function$
DECLARE affected uuid;
BEGIN
  IF TG_TABLE_NAME='assets' THEN
    PERFORM public.assert_asset_nomenclature_v2(CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END);
  ELSIF TG_TABLE_NAME='racks' THEN
    PERFORM public.assert_asset_nomenclature_v2(CASE WHEN TG_OP='DELETE' THEN OLD.asset_id ELSE NEW.asset_id END);
    FOR affected IN SELECT a.id FROM public.assets a
      WHERE a.housing_rack_id=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END
    LOOP PERFORM public.assert_asset_nomenclature_v2(affected); END LOOP;
  ELSIF TG_TABLE_NAME='mdf_idf' THEN
    FOR affected IN SELECT a.id FROM public.racks r JOIN public.assets a ON a.id=r.asset_id
      WHERE r.mdf_idf_id=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END
    LOOP PERFORM public.assert_asset_nomenclature_v2(affected); END LOOP;
  ELSIF TG_TABLE_NAME='locations' THEN
    FOR affected IN SELECT a.id FROM public.assets a
      WHERE a.location_id=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END
    LOOP PERFORM public.assert_asset_nomenclature_v2(affected); END LOOP;
  END IF;
  RETURN NULL;
END
$function$;
ALTER FUNCTION public.enforce_asset_nomenclature_v2_final_state() OWNER TO skia_migrator;
REVOKE ALL ON FUNCTION public.enforce_asset_nomenclature_v2_final_state() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER trg_assets_nomenclature_v2_final
AFTER INSERT OR UPDATE ON public.assets DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_asset_nomenclature_v2_final_state();
CREATE CONSTRAINT TRIGGER trg_racks_nomenclature_v2_final
AFTER INSERT OR UPDATE OR DELETE ON public.racks DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_asset_nomenclature_v2_final_state();
CREATE CONSTRAINT TRIGGER trg_mdf_idf_nomenclature_v2_final
AFTER INSERT OR UPDATE OR DELETE ON public.mdf_idf DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_asset_nomenclature_v2_final_state();
CREATE CONSTRAINT TRIGGER trg_locations_nomenclature_v2_final
AFTER UPDATE OR DELETE ON public.locations DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_asset_nomenclature_v2_final_state();

CREATE TYPE public.nomenclature_onboarding_audit_action AS ENUM (
  'NOMENCLATURE_PRESET_ACCEPTED',
  'NOMENCLATURE_PRESET_UPDATE_ACCEPTED',
  'NOMENCLATURE_RULE_CUSTOMIZED',
  'NOMENCLATURE_PRESET_PRESERVED_CONFLICT'
);

CREATE UNIQUE INDEX uq_audit_nomenclature_operation_action
ON public.audit_logs(tenant_id,action,((changes->>'operation_id')))
WHERE entity_type='naming_rule'
  AND action IN ('NOMENCLATURE_PRESET_ACCEPTED','NOMENCLATURE_PRESET_UPDATE_ACCEPTED',
                 'NOMENCLATURE_RULE_CUSTOMIZED','NOMENCLATURE_PRESET_PRESERVED_CONFLICT');

CREATE FUNCTION public.write_nomenclature_onboarding_audit(
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
  rule_row public.naming_rules%ROWTYPE; preset_row public.system_naming_presets%ROWTYPE;
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
  IF actor_role IS NULL THEN RAISE EXCEPTION 'nomenclature_audit_actor_forbidden' USING ERRCODE='42501'; END IF;

  SELECT * INTO rule_row FROM public.naming_rules WHERE id=p_rule_id AND tenant_id=tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'nomenclature_audit_rule_not_found' USING ERRCODE='23503'; END IF;
  SELECT * INTO preset_row FROM public.system_naming_presets
  WHERE id=p_preset_id AND asset_type_code=rule_row.asset_type_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'nomenclature_audit_preset_not_found' USING ERRCODE='23503'; END IF;

  IF p_action IN ('NOMENCLATURE_PRESET_ACCEPTED','NOMENCLATURE_PRESET_UPDATE_ACCEPTED')
     AND NOT (rule_row.source_type='PRESET' AND rule_row.source_preset_id=preset_row.id
       AND rule_row.source_preset_version=preset_row.preset_version) THEN
    RAISE EXCEPTION 'nomenclature_audit_state_mismatch' USING ERRCODE='23514';
  ELSIF p_action='NOMENCLATURE_RULE_CUSTOMIZED'
     AND NOT (rule_row.source_type='DERIVED_FROM_PRESET' AND rule_row.source_preset_id=preset_row.id
       AND rule_row.customized_after_acceptance) THEN
    RAISE EXCEPTION 'nomenclature_audit_state_mismatch' USING ERRCODE='23514';
  ELSIF p_action='NOMENCLATURE_PRESET_PRESERVED_CONFLICT'
     AND NOT (rule_row.source_type IN ('CUSTOM','DERIVED_FROM_PRESET')
       OR public.naming_rule_is_issued(rule_row.id)) THEN
    RAISE EXCEPTION 'nomenclature_audit_state_mismatch' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.audit_logs(user_id,tenant_id,action,entity_type,entity_id,changes)
  VALUES(actor,tenant,p_action::text,'naming_rule',rule_row.id::text,
    pg_catalog.jsonb_build_object(
      'operation_id',p_operation_id,'rule_id',rule_row.id,'rule_version',rule_row.rule_version,
      'source_type',rule_row.source_type,'preset_id',preset_row.id,'preset_code',preset_row.preset_code,
      'preset_version',preset_row.preset_version,'action',p_action::text,'result','RECORDED'))
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

DO $restore_rls$
DECLARE state record;
BEGIN
  FOR state IN SELECT * FROM pg_temp.nomenclature_v2_rls_state LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.%I %s ROW LEVEL SECURITY',state.relname,
      CASE WHEN state.relrowsecurity THEN 'ENABLE' ELSE 'DISABLE' END);
    EXECUTE pg_catalog.format('ALTER TABLE public.%I %s FORCE ROW LEVEL SECURITY',state.relname,
      CASE WHEN state.relforcerowsecurity THEN '' ELSE 'NO' END);
  END LOOP;
END
$restore_rls$;

DO $verification$
BEGIN
  IF EXISTS(SELECT 1 FROM public.system_naming_presets WHERE preset_code IN
      ('MDF_V1','IDF_V1','RACK_V1','SWITCH_V1','UPS_V1','PDU_V1','PATCH_PANEL_V1','NODE_V1','FIREWALL_V1','SERVER_V1','CCTV_V1','AC_UNIT_V1')) THEN
    RAISE EXCEPTION '037 must not activate or seed the Phase 1.2F catalog';
  END IF;
  IF NOT has_function_privilege('skia_runtime','public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action)','EXECUTE')
     OR has_function_privilege('skia_onboarding','public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action)','EXECUTE')
     OR has_table_privilege('skia_runtime','public.audit_logs','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('skia_runtime','public.system_naming_presets','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION '037 runtime privilege contract differs';
  END IF;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_temp.nomenclature_v2_rls_state s ON s.relname=c.relname
    WHERE n.nspname='public'
      AND (c.relrowsecurity<>s.relrowsecurity OR c.relforcerowsecurity<>s.relforcerowsecurity)
  ) THEN RAISE EXCEPTION '037 did not restore the pre-migration RLS/FORCE state'; END IF;
END
$verification$;
