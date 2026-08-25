\set ON_ERROR_STOP on

DO $$
DECLARE
  protected_grant_count integer;
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
             ('mdf_idf','SELECT'),('mdf_idf','INSERT'),('racks','SELECT'),('racks','INSERT'),
             ('switches','SELECT'),('switches','INSERT'),('ups','SELECT'),('ups','INSERT'),
             ('pdus','SELECT'),('pdus','INSERT'),('patch_panels','SELECT'),('patch_panels','INSERT'),
             ('backbone_links','SELECT'),('backbone_links','INSERT'),('nodes','SELECT'),('nodes','INSERT')
    ), protected(table_name, privilege_type) AS (
      VALUES ('assets','SELECT'),('assets','INSERT'),('assets','UPDATE'),('assets','DELETE'),
             ('asset_logs','SELECT'),('asset_logs','INSERT'),('asset_logs','UPDATE'),('asset_logs','DELETE'),
             ('asset_relationships','SELECT'),('asset_relationships','INSERT'),('asset_relationships','UPDATE'),('asset_relationships','DELETE')
    ), actual AS (
      SELECT table_name, privilege_type FROM information_schema.role_table_grants
      WHERE grantee='skia_runtime' AND table_schema='public'
    )
    (SELECT * FROM required EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT (SELECT * FROM required UNION ALL SELECT * FROM protected))
  ) THEN
    RAISE EXCEPTION 'skia_runtime table grants differ from exact contract';
  END IF;

  SELECT count(*) INTO protected_grant_count
  FROM information_schema.role_table_grants
  WHERE grantee='skia_runtime' AND table_schema='public'
    AND table_name IN ('assets','asset_logs','asset_relationships');
  IF protected_grant_count NOT IN (0,12) THEN
    RAISE EXCEPTION 'skia_runtime protected-table grants are partial';
  END IF;
  IF protected_grant_count=12 AND NOT (
    SELECT bool_and(c.relrowsecurity AND c.relforcerowsecurity)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('assets','asset_logs','asset_relationships')
  ) THEN
    RAISE EXCEPTION 'skia_runtime protected grants exist without canonical RLS/FORCE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_usage_grants
    WHERE grantee='skia_runtime' AND object_type='SEQUENCE'
  ) THEN
    RAISE EXCEPTION 'skia_runtime must not have sequence privileges';
  END IF;
END $$;

SELECT 'RUNTIME_AUTH_ROLE_VALIDATION=APPROVED' AS result;
