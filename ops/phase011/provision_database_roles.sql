\set ON_ERROR_STOP on
SELECT format('CREATE ROLE skia_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L', :'migrator_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='skia_migrator') \gexec
SELECT format('CREATE ROLE skia_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS PASSWORD %L', :'runtime_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='skia_runtime') \gexec
SELECT format('CREATE ROLE skia_onboarding LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L', :'onboarding_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='skia_onboarding') \gexec
ALTER ROLE skia_migrator PASSWORD :'migrator_password';
ALTER ROLE skia_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS PASSWORD :'runtime_password';
ALTER ROLE skia_onboarding LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD :'onboarding_password';
ALTER DATABASE skia_prod OWNER TO skia_migrator;

REVOKE ALL PRIVILEGES ON DATABASE skia_prod FROM skia_onboarding;
GRANT CONNECT ON DATABASE skia_prod TO skia_onboarding;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM skia_onboarding;
GRANT USAGE ON SCHEMA public TO skia_onboarding;

REVOKE ALL PRIVILEGES ON DATABASE skia_prod FROM skia_runtime;
GRANT CONNECT ON DATABASE skia_prod TO skia_runtime;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM skia_runtime;
GRANT USAGE ON SCHEMA public TO skia_runtime;

-- Revoke the complete table surface before rebuilding the exact runtime
-- allow-list. RLS/FORCE is necessary for row isolation, but never substitutes
-- for the table privileges required by legitimate operations.
SELECT format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM skia_runtime', n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') \gexec
SELECT 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM skia_runtime'
WHERE to_regclass('public.users') IS NOT NULL \gexec
SELECT 'GRANT SELECT ON TABLE public.users, public.user_tenants, public.tenants, public.user_branches, public.branches, public.user_roles, public.roles, public.role_permissions, public.permissions TO skia_runtime'
WHERE to_regclass('public.permissions') IS NOT NULL \gexec
SELECT 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sessions TO skia_runtime'
WHERE to_regclass('public.sessions') IS NOT NULL \gexec
SELECT 'GRANT SELECT ON TABLE public.asset_types TO skia_runtime'
WHERE to_regclass('public.asset_types') IS NOT NULL \gexec
SELECT 'GRANT SELECT, INSERT, UPDATE ON TABLE public.naming_rules TO skia_runtime'
WHERE to_regclass('public.naming_rules') IS NOT NULL \gexec
SELECT 'GRANT SELECT, INSERT, UPDATE ON TABLE public.locations, public.nomenclature_counters TO skia_runtime'
WHERE to_regclass('public.nomenclature_counters') IS NOT NULL \gexec
SELECT 'GRANT SELECT, INSERT, UPDATE ON TABLE public.buildings, public.internal_areas, public.nomenclature_branch_counters TO skia_runtime'
WHERE to_regclass('public.nomenclature_branch_counters') IS NOT NULL \gexec
SELECT 'GRANT SELECT ON TABLE public.floors, public.zones, public.technical_rooms TO skia_runtime'
WHERE to_regclass('public.internal_areas') IS NOT NULL \gexec
SELECT 'GRANT SELECT, INSERT ON TABLE public.mdf_idf, public.racks, public.switches, public.ups, public.pdus, public.patch_panels, public.backbone_links, public.nodes TO skia_runtime'
WHERE to_regclass('public.nodes') IS NOT NULL \gexec
SELECT 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assets TO skia_runtime'
WHERE to_regclass('public.assets') IS NOT NULL \gexec
SELECT 'GRANT SELECT, INSERT ON TABLE public.asset_logs TO skia_runtime'
WHERE to_regclass('public.asset_logs') IS NOT NULL \gexec
SELECT 'REVOKE ALL ON FUNCTION public.validate_import_row_for_commit(BIGINT,BIGINT,UUID,UUID), public.claim_import_row_for_commit(BIGINT,BIGINT,UUID,UUID,TEXT), public.complete_import_row_commit(BIGINT,BIGINT,UUID,UUID,UUID), public.fail_import_row_commit(BIGINT,BIGINT,UUID,UUID,TEXT), public.recompute_inventory_import_state(BIGINT,UUID,UUID) FROM PUBLIC'
WHERE to_regprocedure('public.recompute_inventory_import_state(bigint,uuid,uuid)') IS NOT NULL \gexec
SELECT 'GRANT EXECUTE ON FUNCTION public.validate_import_row_for_commit(BIGINT,BIGINT,UUID,UUID), public.claim_import_row_for_commit(BIGINT,BIGINT,UUID,UUID,TEXT), public.complete_import_row_commit(BIGINT,BIGINT,UUID,UUID,UUID), public.fail_import_row_commit(BIGINT,BIGINT,UUID,UUID,TEXT), public.recompute_inventory_import_state(BIGINT,UUID,UUID) TO skia_runtime'
WHERE to_regprocedure('public.recompute_inventory_import_state(bigint,uuid,uuid)') IS NOT NULL \gexec

-- The role artifact runs once before and once after clean bootstrap. Apply table
-- grants only after every required identity table exists.
SELECT 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM skia_onboarding'
WHERE (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind IN ('r','p')
         AND c.relname IN ('users','tenants','branches','user_tenants','user_branches','roles','user_roles')) = 7 \gexec
SELECT 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM skia_onboarding'
WHERE to_regclass('public.users') IS NOT NULL \gexec
SELECT 'GRANT SELECT, INSERT ON TABLE public.users TO skia_onboarding'
WHERE to_regclass('public.users') IS NOT NULL \gexec
SELECT 'GRANT INSERT ON TABLE public.tenants, public.branches, public.user_tenants, public.user_branches, public.user_roles TO skia_onboarding'
WHERE to_regclass('public.user_roles') IS NOT NULL \gexec
SELECT 'GRANT SELECT, INSERT ON TABLE public.roles TO skia_onboarding'
WHERE to_regclass('public.roles') IS NOT NULL \gexec
