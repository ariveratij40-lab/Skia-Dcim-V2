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

-- Preserve only the three tables governed by the canonical PHASE-005 RLS
-- lifecycle; revoke every other public-table grant before applying the exact
-- authentication/session contract.
SELECT format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM skia_runtime', n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p')
  AND c.relname NOT IN ('assets','asset_logs','asset_relationships') \gexec
SELECT 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM skia_runtime'
WHERE to_regclass('public.users') IS NOT NULL \gexec
SELECT 'GRANT SELECT ON TABLE public.users, public.user_tenants, public.tenants, public.user_branches, public.branches, public.user_roles, public.roles, public.role_permissions, public.permissions TO skia_runtime'
WHERE to_regclass('public.permissions') IS NOT NULL \gexec
SELECT 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sessions TO skia_runtime'
WHERE to_regclass('public.sessions') IS NOT NULL \gexec

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
