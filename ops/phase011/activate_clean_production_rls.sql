\set ON_ERROR_STOP on
\if :{?phase011_environment}\else
 SELECT 1/0 AS blocked_missing_environment;
\endif
\if :{?expected_database}\else
 SELECT 1/0 AS blocked_missing_database;
\endif
\if :{?execution_approval}\else
 SELECT 1/0 AS blocked_missing_approval;
\endif
SELECT :'phase011_environment'='production'
 AND :'execution_approval'='PHASE011_CLEAN_RLS_BOOTSTRAP_APPROVED'
 AND current_database()=:'expected_database' AS authorized \gset
\if :authorized\else
 SELECT 1/0 AS blocked_authorization;
\endif

-- Static structural and identity guard shared by clean and final states.
SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='skia_runtime' AND rolcanlogin
 AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls)
 AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('assets','asset_logs','asset_relationships')
  AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname='skia_runtime'))
 AND EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='asset_logs_asset_id_fkey'
  AND c.contype='f' AND c.conrelid='public.asset_logs'::regclass AND c.confrelid='public.assets'::regclass
  AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.asset_logs'::regclass AND attname='asset_id' AND NOT attisdropped)]::smallint[]
  AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.assets'::regclass AND attname='id' AND NOT attisdropped)]::smallint[]
  AND c.confmatchtype='s' AND c.confupdtype='a' AND c.confdeltype='c' AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred)
 AND EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='asset_relationships_source_asset_id_fkey'
  AND c.contype='f' AND c.conrelid='public.asset_relationships'::regclass AND c.confrelid='public.assets'::regclass
  AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.asset_relationships'::regclass AND attname='source_asset_id' AND NOT attisdropped)]::smallint[]
  AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.assets'::regclass AND attname='id' AND NOT attisdropped)]::smallint[]
  AND c.confmatchtype='s' AND c.confupdtype='a' AND c.confdeltype='c' AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred)
 AND EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='asset_relationships_target_asset_id_fkey'
  AND c.contype='f' AND c.conrelid='public.asset_relationships'::regclass AND c.confrelid='public.assets'::regclass
  AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.asset_relationships'::regclass AND attname='target_asset_id' AND NOT attisdropped)]::smallint[]
  AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.assets'::regclass AND attname='id' AND NOT attisdropped)]::smallint[]
  AND c.confmatchtype='s' AND c.confupdtype='a' AND c.confdeltype='c' AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred) AS structural_safe \gset
\if :structural_safe\else
 SELECT 1/0 AS blocked_structure;
\endif

-- Provisioning is the sole authority for runtime grants. The RLS activator
-- accepts only the exact PR23 allow-list and never expands it.
WITH expected(table_name,privilege_type) AS (
 VALUES ('assets','SELECT'),('assets','INSERT'),('assets','UPDATE'),('assets','DELETE'),
        ('asset_logs','SELECT'),('asset_logs','INSERT')
), actual AS (
 SELECT table_name,privilege_type FROM information_schema.role_table_grants
 WHERE grantee='skia_runtime' AND table_schema='public'
   AND table_name IN ('assets','asset_logs','asset_relationships')
)
SELECT NOT EXISTS ((SELECT * FROM expected EXCEPT SELECT * FROM actual)
                   UNION ALL
                   (SELECT * FROM actual EXCEPT SELECT * FROM expected)) AS runtime_grants_exact \gset
\if :runtime_grants_exact\else
 SELECT 1/0 AS blocked_runtime_grant_contract;
\endif

SELECT (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('assets','asset_logs','asset_relationships'))=0
 AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
  AND c.relname IN ('assets','asset_logs','asset_relationships') AND (c.relrowsecurity OR c.relforcerowsecurity)) AS clean_state \gset
SELECT (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('assets','asset_logs','asset_relationships'))=3
 AND (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,coalesce(qual,''),coalesce(with_check,''))) FROM pg_policies WHERE schemaname='public' AND tablename='assets' AND policyname='assets_tenant_branch_isolation')='16283f38465792bdb7cba3cc265570cd'
 AND (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,coalesce(qual,''),coalesce(with_check,''))) FROM pg_policies WHERE schemaname='public' AND tablename='asset_logs' AND policyname='asset_logs_tenant_branch_isolation')='6f7ecd60e4d50630fc35fb5cc6184f7f'
 AND (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,coalesce(qual,''),coalesce(with_check,''))) FROM pg_policies WHERE schemaname='public' AND tablename='asset_relationships' AND policyname='asset_relationships_tenant_branch_isolation')='6e7ce93697090bc0ce92e3984c779771'
 AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
  AND c.relname IN ('assets','asset_logs','asset_relationships') AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)) AS final_state \gset
\if :final_state
 \echo 'APPROVED: exact final state already present'
\else
 \if :clean_state\else
  SELECT 1/0 AS blocked_third_state;
 \endif
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
LOCK TABLE public.assets,public.asset_logs,public.asset_relationships IN ACCESS EXCLUSIVE MODE;
DO $locked$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('assets','asset_logs','asset_relationships'))
 OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('assets','asset_logs','asset_relationships') AND (c.relrowsecurity OR c.relforcerowsecurity))
 THEN RAISE EXCEPTION 'locked clean prestate diverged'; END IF;
 IF EXISTS (
   WITH expected(table_name,privilege_type) AS (
    VALUES ('assets','SELECT'),('assets','INSERT'),('assets','UPDATE'),('assets','DELETE'),
           ('asset_logs','SELECT'),('asset_logs','INSERT')
   ), actual AS (
    SELECT table_name,privilege_type FROM information_schema.role_table_grants
    WHERE grantee='skia_runtime' AND table_schema='public'
      AND table_name IN ('assets','asset_logs','asset_relationships')
   )
   (SELECT * FROM expected EXCEPT SELECT * FROM actual)
   UNION ALL
   (SELECT * FROM actual EXCEPT SELECT * FROM expected)
 ) THEN RAISE EXCEPTION 'locked runtime grant contract diverged'; END IF;
END $locked$;

CREATE POLICY assets_tenant_branch_isolation ON public.assets AS PERMISSIVE FOR ALL TO skia_runtime
 USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid AND (branch_id IS NULL OR branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true'))
 WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid AND (branch_id IS NULL OR branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true'));
CREATE POLICY asset_logs_tenant_branch_isolation ON public.asset_logs AS PERMISSIVE FOR ALL TO skia_runtime
 USING (asset_logs.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid AND EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_logs.asset_id AND a.tenant_id = asset_logs.tenant_id AND a.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid AND (a.branch_id IS NULL OR a.branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true')))
 WITH CHECK (asset_logs.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid AND EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_logs.asset_id AND a.tenant_id = asset_logs.tenant_id AND a.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid AND (a.branch_id IS NULL OR a.branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true')));
CREATE POLICY asset_relationships_tenant_branch_isolation ON public.asset_relationships AS PERMISSIVE FOR ALL TO skia_runtime
 USING (asset_relationships.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid AND EXISTS (SELECT 1 FROM public.assets source_asset WHERE source_asset.id = asset_relationships.source_asset_id AND source_asset.tenant_id = asset_relationships.tenant_id AND source_asset.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid AND (source_asset.branch_id IS NULL OR source_asset.branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true')) AND EXISTS (SELECT 1 FROM public.assets target_asset WHERE target_asset.id = asset_relationships.target_asset_id AND target_asset.tenant_id = asset_relationships.tenant_id AND target_asset.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid AND (target_asset.branch_id IS NULL OR target_asset.branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true')))
 WITH CHECK (asset_relationships.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid AND EXISTS (SELECT 1 FROM public.assets source_asset WHERE source_asset.id = asset_relationships.source_asset_id AND source_asset.tenant_id = asset_relationships.tenant_id AND source_asset.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid AND (source_asset.branch_id IS NULL OR source_asset.branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true')) AND EXISTS (SELECT 1 FROM public.assets target_asset WHERE target_asset.id = asset_relationships.target_asset_id AND target_asset.tenant_id = asset_relationships.tenant_id AND target_asset.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid AND (target_asset.branch_id IS NULL OR target_asset.branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true')));
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY; ALTER TABLE public.assets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.asset_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE public.asset_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.asset_relationships ENABLE ROW LEVEL SECURITY; ALTER TABLE public.asset_relationships FORCE ROW LEVEL SECURITY;
DO $post$ BEGIN
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('assets','asset_logs','asset_relationships'))<>3
 OR (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,coalesce(qual,''),coalesce(with_check,''))) FROM pg_policies WHERE schemaname='public' AND tablename='assets' AND policyname='assets_tenant_branch_isolation')<>'16283f38465792bdb7cba3cc265570cd'
 OR (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,coalesce(qual,''),coalesce(with_check,''))) FROM pg_policies WHERE schemaname='public' AND tablename='asset_logs' AND policyname='asset_logs_tenant_branch_isolation')<>'6f7ecd60e4d50630fc35fb5cc6184f7f'
 OR (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,coalesce(qual,''),coalesce(with_check,''))) FROM pg_policies WHERE schemaname='public' AND tablename='asset_relationships' AND policyname='asset_relationships_tenant_branch_isolation')<>'6e7ce93697090bc0ce92e3984c779771'
 OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('assets','asset_logs','asset_relationships') AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity))
 OR EXISTS (
   WITH expected(table_name,privilege_type) AS (
    VALUES ('assets','SELECT'),('assets','INSERT'),('assets','UPDATE'),('assets','DELETE'),
           ('asset_logs','SELECT'),('asset_logs','INSERT')
   ), actual AS (
    SELECT table_name,privilege_type FROM information_schema.role_table_grants
    WHERE grantee='skia_runtime' AND table_schema='public'
      AND table_name IN ('assets','asset_logs','asset_relationships')
   )
   (SELECT * FROM expected EXCEPT SELECT * FROM actual)
   UNION ALL
   (SELECT * FROM actual EXCEPT SELECT * FROM expected)
 )
 THEN RAISE EXCEPTION 'canonical final verification failed'; END IF;
END $post$;
COMMIT;
\endif
