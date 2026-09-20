\set ON_ERROR_STOP on

DO $$
DECLARE
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='skia_runtime' AND rolcanlogin
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'skia_runtime role attributes are unsafe';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles inherited_role
    WHERE inherited_role.rolname<>'skia_runtime'
      AND pg_has_role('skia_runtime',inherited_role.oid,'MEMBER')
      AND (inherited_role.rolsuper OR inherited_role.rolcreatedb OR inherited_role.rolcreaterole OR inherited_role.rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'skia_runtime inherits a privileged role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND pg_has_role('skia_runtime',c.relowner,'USAGE')) THEN
    RAISE EXCEPTION 'skia_runtime must not own or inherit ownership of application relations';
  END IF;
  IF NOT has_database_privilege('skia_runtime','skia_prod','CONNECT')
     OR has_database_privilege('skia_runtime','skia_prod','CREATE')
     OR NOT has_schema_privilege('skia_runtime','public','USAGE')
     OR has_schema_privilege('skia_runtime','public','CREATE') THEN
    RAISE EXCEPTION 'skia_runtime database/schema privileges differ';
  END IF;

  IF EXISTS (
    WITH required(table_name, privilege_type) AS (
      VALUES ('users','SELECT'),('user_tenants','SELECT'),('tenants','SELECT'),
             ('user_branches','SELECT'),('branches','SELECT'),
             ('sessions','SELECT'),('sessions','INSERT'),('sessions','UPDATE'),('sessions','DELETE'),
             ('user_roles','SELECT'),('roles','SELECT'),('role_permissions','SELECT'),('permissions','SELECT'),
             ('asset_types','SELECT'),('naming_rules','SELECT'),('naming_rules','INSERT'),('naming_rules','UPDATE'),
             ('locations','SELECT'),('locations','INSERT'),('locations','UPDATE'),
             ('nomenclature_counters','SELECT'),('nomenclature_counters','INSERT'),('nomenclature_counters','UPDATE'),
             ('nomenclature_branch_counters','SELECT'),('nomenclature_branch_counters','INSERT'),('nomenclature_branch_counters','UPDATE'),
             ('buildings','SELECT'),('buildings','INSERT'),('buildings','UPDATE'),
             ('internal_areas','SELECT'),('internal_areas','INSERT'),('internal_areas','UPDATE'),
             ('floors','SELECT'),('floors','INSERT'),('zones','SELECT'),('zones','INSERT'),('technical_rooms','SELECT'),
             ('mdf_idf','SELECT'),('mdf_idf','INSERT'),('racks','SELECT'),('racks','INSERT'),
             ('switches','SELECT'),('switches','INSERT'),('ups','SELECT'),('ups','INSERT'),
             ('pdus','SELECT'),('pdus','INSERT'),('patch_panels','SELECT'),('patch_panels','INSERT'),
             ('backbone_links','SELECT'),('backbone_links','INSERT'),('nodes','SELECT'),('nodes','INSERT'),
             ('assets','SELECT'),('assets','INSERT'),('assets','UPDATE'),('assets','DELETE'),
             ('asset_logs','SELECT'),('asset_logs','INSERT')
    ), actual AS (
      SELECT c.relname AS table_name, privilege_type
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) AS priv(privilege_type)
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
        AND has_table_privilege('skia_runtime',c.oid,privilege_type)
    )
    (SELECT * FROM required EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM required)
  ) THEN
    RAISE EXCEPTION 'skia_runtime table grants differ from exact contract';
  END IF;

  IF NOT (
    SELECT bool_and(c.relrowsecurity AND c.relforcerowsecurity)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('assets','asset_logs','asset_relationships')
  ) THEN
    RAISE EXCEPTION 'canonical protected tables must retain RLS/FORCE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='S'
      AND CASE WHEN c.relkind='S' THEN has_sequence_privilege('skia_runtime',c.oid,'SELECT,USAGE,UPDATE') ELSE false END
  ) THEN
    RAISE EXCEPTION 'skia_runtime must not have sequence privileges';
  END IF;
  IF has_table_privilege('skia_runtime','public.system_naming_presets','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'skia_runtime must not have direct preset table privileges';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ('inventory_imports'),('inventory_import_rows'),('import_jobs'),('import_items')) AS s(name)
    WHERE has_table_privilege('skia_runtime','public.'||s.name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  ) THEN
    RAISE EXCEPTION 'skia_runtime must not have direct staging table privileges';
  END IF;
  IF NOT has_function_privilege('skia_runtime','public.validate_import_row_for_commit(bigint,bigint,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('skia_runtime','public.claim_import_row_for_commit(bigint,bigint,uuid,uuid,text)','EXECUTE')
     OR NOT has_function_privilege('skia_runtime','public.complete_import_row_commit(bigint,bigint,uuid,uuid,text,uuid)','EXECUTE')
     OR NOT has_function_privilege('skia_runtime','public.fail_import_row_commit(bigint,bigint,uuid,uuid,text)','EXECUTE')
     OR NOT has_function_privilege('skia_runtime','public.recompute_inventory_import_state(bigint,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('skia_runtime','public.list_import_rows_for_commit(bigint,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('skia_runtime','public.fail_import_row_after_rollback(bigint,bigint,uuid,uuid,text,text)','EXECUTE')
     OR NOT has_function_privilege('skia_runtime','public.create_inventory_import_staging(text,text,text,text,uuid)','EXECUTE')
     OR NOT has_function_privilege('skia_runtime','public.stage_inventory_import_row(bigint,integer,jsonb,text,text,text,text)','EXECUTE')
     OR NOT has_function_privilege('skia_runtime','public.update_inventory_import_progress(bigint,integer,integer,integer,integer)','EXECUTE')
     OR NOT has_function_privilege('skia_runtime','public.finalize_inventory_import_staging(bigint)','EXECUTE')
     OR (EXISTS (SELECT 1 FROM public.production_bootstrap_migrations WHERE path='migrations/034_canonical_infrastructure_housing_governance.sql')
         AND NOT COALESCE(has_function_privilege('skia_runtime',to_regprocedure('public.assert_canonical_asset_housing(uuid)'),'EXECUTE'),false)) THEN
    RAISE EXCEPTION 'skia_runtime secure staging function EXECUTE contract differs';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_roles o ON o.oid=p.proowner
    WHERE n.nspname='public' AND p.proname IN ('validate_import_row_for_commit','claim_import_row_for_commit','complete_import_row_commit','fail_import_row_commit','recompute_inventory_import_state','list_import_rows_for_commit','fail_import_row_after_rollback','create_inventory_import_staging','stage_inventory_import_row','update_inventory_import_progress','finalize_inventory_import_staging')
      AND (o.rolname<>'skia_migrator' OR NOT p.prosecdef OR NOT COALESCE(p.proconfig,'{}'::text[]) @> ARRAY['search_path=pg_catalog, pg_temp'])
  ) THEN
    RAISE EXCEPTION 'secure staging function metadata is unsafe';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
      LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
    WHERE n.nspname='public' AND p.proname IN ('validate_import_row_for_commit','claim_import_row_for_commit','complete_import_row_commit','fail_import_row_commit','recompute_inventory_import_state','list_import_rows_for_commit','fail_import_row_after_rollback','create_inventory_import_staging','stage_inventory_import_row','update_inventory_import_progress','finalize_inventory_import_staging')
      AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC must not execute secure staging functions';
  END IF;
  IF NOT has_function_privilege('skia_runtime','public.read_active_system_naming_presets(text[])','EXECUTE') THEN
    RAISE EXCEPTION 'skia_runtime secure preset reader EXECUTE is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.production_bootstrap_migrations WHERE path='migrations/036_nomenclature_v2_foundation.sql')
     AND (NOT has_function_privilege('skia_runtime','public.read_active_system_naming_presets_v2(text[])','EXECUTE')
          OR has_function_privilege('skia_onboarding','public.read_active_system_naming_presets_v2(text[])','EXECUTE')) THEN
    RAISE EXCEPTION 'skia_runtime V2 preset reader EXECUTE contract differs';
  END IF;
  IF EXISTS (SELECT 1 FROM public.production_bootstrap_migrations WHERE path='migrations/037_nomenclature_v2_enforcement_audit_writer.sql')
     AND (NOT has_function_privilege('skia_runtime','public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action)','EXECUTE')
          OR has_function_privilege('skia_onboarding','public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action)','EXECUTE')
          OR has_table_privilege('skia_runtime','public.audit_logs','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) THEN
    RAISE EXCEPTION 'skia_runtime nomenclature audit writer contract differs';
  END IF;
  IF EXISTS (SELECT 1 FROM public.production_bootstrap_migrations WHERE path='migrations/038_nomenclature_v2_acceptance_function_contract.sql')
     AND (NOT has_function_privilege('skia_runtime','public.read_system_naming_preset_v2(text,integer)','EXECUTE')
          OR NOT has_function_privilege('skia_runtime','public.nomenclature_acceptance_snapshot_is_valid(jsonb)','EXECUTE')
          OR NOT has_function_privilege('skia_runtime','public.naming_rule_is_issued(uuid)','EXECUTE')
          OR has_function_privilege('skia_onboarding','public.read_system_naming_preset_v2(text,integer)','EXECUTE')) THEN
    RAISE EXCEPTION 'skia_runtime exact V2 preset reader EXECUTE contract differs';
  END IF;
  -- Effective EXECUTE includes PUBLIC, defaults and inherited grants. Preserve
  -- existing uuid-ossp helpers and trigger entrypoints by exact signature only;
  -- no new privilege is granted here, and no overload inherits admission.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND has_function_privilege('skia_runtime',p.oid,'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM (VALUES
          ('public.assets_count_in_location_all_branches(uuid,uuid)'),
          ('public.read_active_system_naming_presets(text[])'),
          ('public.read_active_system_naming_presets_v2(text[])'),
          ('public.read_system_naming_preset_v2(text,integer)'),
          ('public.nomenclature_acceptance_snapshot_is_valid(jsonb)'),
          ('public.naming_rule_is_issued(uuid)'),
          ('public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action)'),
          ('public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action,text)'),
          ('public.read_nomenclature_customization_operation(uuid,text)'),
          ('public.validate_import_row_for_commit(bigint,bigint,uuid,uuid)'),
          ('public.claim_import_row_for_commit(bigint,bigint,uuid,uuid,text)'),
          ('public.complete_import_row_commit(bigint,bigint,uuid,uuid,text,uuid)'),
          ('public.fail_import_row_commit(bigint,bigint,uuid,uuid,text)'),
          ('public.recompute_inventory_import_state(bigint,uuid,uuid)'),
          ('public.list_import_rows_for_commit(bigint,uuid,uuid)'),
          ('public.fail_import_row_after_rollback(bigint,bigint,uuid,uuid,text,text)'),
          ('public.create_inventory_import_staging(text,text,text,text,uuid)'),
          ('public.stage_inventory_import_row(bigint,integer,jsonb,text,text,text,text)'),
          ('public.update_inventory_import_progress(bigint,integer,integer,integer,integer)'),
          ('public.finalize_inventory_import_staging(bigint)'),
          ('public.assert_canonical_asset_housing(uuid)'),
          ('public.uuid_nil()'),
          ('public.uuid_ns_dns()'),
          ('public.uuid_ns_url()'),
          ('public.uuid_ns_oid()'),
          ('public.uuid_ns_x500()'),
          ('public.uuid_generate_v1()'),
          ('public.uuid_generate_v1mc()'),
          ('public.uuid_generate_v3(uuid,text)'),
          ('public.uuid_generate_v4()'),
          ('public.uuid_generate_v5(uuid,text)'),
          ('public.update_updated_at_column()'),
          ('public.enforce_naming_rule_normative_history()'),
          ('public.enforce_asset_placement_scope()'),
          ('public.ensure_branch_canonical_code()'),
          ('public.ensure_site_canonical_code()'),
          ('public.normalize_internal_area_code()'),
          ('public.enforce_naming_rule_version_lineage()'),
          ('public.enforce_location_dual_reference_consistency()'),
          ('public.derive_legacy_system_naming_preset_foundation()'),
          ('public.enforce_system_naming_preset_version_immutability()'),
          ('public.derive_legacy_naming_rule_sequence_scope()')
        ) AS allowed(signature)
        WHERE to_regprocedure(allowed.signature)=p.oid
      )
  ) THEN
    RAISE EXCEPTION 'skia_runtime has unexpected effective routine signature';
  END IF;
  IF EXISTS (SELECT 1 FROM public.production_bootstrap_migrations
             WHERE path='migrations/039_nomenclature_operation_binding.sql') THEN
    IF EXISTS (
      SELECT 1 FROM (VALUES
        ('public.read_nomenclature_customization_operation(uuid,text)'),
        ('public.write_nomenclature_onboarding_audit(uuid,uuid,uuid,public.nomenclature_onboarding_audit_action,text)')
      ) AS required(signature)
      LEFT JOIN pg_proc p ON p.oid=to_regprocedure(required.signature)
      WHERE p.oid IS NULL OR NOT has_function_privilege('skia_runtime',p.oid,'EXECUTE')
        OR has_function_privilege('skia_onboarding',p.oid,'EXECUTE')
        OR p.proowner<>(SELECT oid FROM pg_roles WHERE rolname='skia_migrator')
        OR NOT p.prosecdef
        OR NOT COALESCE(p.proconfig,'{}') @> ARRAY['search_path=pg_catalog, pg_temp']
        OR EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
                   WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')
    ) THEN RAISE EXCEPTION 'HF1 operation binding security contract differs'; END IF;
  END IF;
END $$;

SELECT 'RUNTIME_AUTH_ROLE_VALIDATION=APPROVED' AS result;
