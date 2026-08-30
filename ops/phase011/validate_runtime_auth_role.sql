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
    SELECT 1 FROM pg_auth_members m JOIN pg_roles inherited_role ON inherited_role.oid=m.roleid
    WHERE m.member=(SELECT oid FROM pg_roles WHERE rolname='skia_runtime')
      AND (inherited_role.rolsuper OR inherited_role.rolcreatedb OR inherited_role.rolcreaterole OR inherited_role.rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'skia_runtime inherits a privileged role';
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
             ('floors','SELECT'),('zones','SELECT'),('technical_rooms','SELECT'),
             ('mdf_idf','SELECT'),('mdf_idf','INSERT'),('racks','SELECT'),('racks','INSERT'),
             ('switches','SELECT'),('switches','INSERT'),('ups','SELECT'),('ups','INSERT'),
             ('pdus','SELECT'),('pdus','INSERT'),('patch_panels','SELECT'),('patch_panels','INSERT'),
             ('backbone_links','SELECT'),('backbone_links','INSERT'),('nodes','SELECT'),('nodes','INSERT'),
             ('assets','SELECT'),('assets','INSERT'),('assets','UPDATE'),('assets','DELETE'),
             ('asset_logs','SELECT'),('asset_logs','INSERT')
    ), actual AS (
      SELECT table_name, privilege_type FROM information_schema.role_table_grants
      WHERE grantee='skia_runtime' AND table_schema='public'
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
    SELECT 1 FROM information_schema.role_usage_grants
    WHERE grantee='skia_runtime' AND object_type='SEQUENCE'
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
     OR NOT has_function_privilege('skia_runtime','public.complete_import_row_commit(bigint,bigint,uuid,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('skia_runtime','public.fail_import_row_commit(bigint,bigint,uuid,uuid,text)','EXECUTE')
     OR NOT has_function_privilege('skia_runtime','public.recompute_inventory_import_state(bigint,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('skia_runtime','public.list_import_rows_for_commit(bigint,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('skia_runtime','public.fail_import_row_after_rollback(bigint,bigint,uuid,uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'skia_runtime secure staging function EXECUTE contract differs';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_roles o ON o.oid=p.proowner
    WHERE n.nspname='public' AND p.proname IN ('validate_import_row_for_commit','claim_import_row_for_commit','complete_import_row_commit','fail_import_row_commit','recompute_inventory_import_state','list_import_rows_for_commit','fail_import_row_after_rollback')
      AND (o.rolname<>'skia_migrator' OR NOT p.prosecdef OR NOT COALESCE(p.proconfig,'{}'::text[]) @> ARRAY['search_path=pg_catalog, pg_temp'])
  ) THEN
    RAISE EXCEPTION 'secure staging function metadata is unsafe';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
      LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
    WHERE n.nspname='public' AND p.proname IN ('validate_import_row_for_commit','claim_import_row_for_commit','complete_import_row_commit','fail_import_row_commit','recompute_inventory_import_state','list_import_rows_for_commit','fail_import_row_after_rollback')
      AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC must not execute secure staging functions';
  END IF;
  IF NOT has_function_privilege('skia_runtime','public.read_active_system_naming_presets(text[])','EXECUTE') THEN
    RAISE EXCEPTION 'skia_runtime secure preset reader EXECUTE is missing';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE grantee='skia_runtime' AND specific_schema='public'
      AND routine_name NOT IN ('assets_count_in_location_all_branches','read_active_system_naming_presets',
        'validate_import_row_for_commit','claim_import_row_for_commit','complete_import_row_commit',
        'fail_import_row_commit','recompute_inventory_import_state','list_import_rows_for_commit',
        'fail_import_row_after_rollback')
  ) THEN
    RAISE EXCEPTION 'skia_runtime has unexpected routine privileges';
  END IF;
END $$;

SELECT 'RUNTIME_AUTH_ROLE_VALIDATION=APPROVED' AS result;
