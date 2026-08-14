\set ON_ERROR_STOP on

-- PHASE-005 canonical RLS activation. Execution in STAGING requires a future,
-- explicit gate. This file never changes data, roles, grants or ownership.
\if :{?phase005_environment}
\else
  \echo 'BLOCKED: phase005_environment is required'
  SELECT 1/0 AS blocked_missing_environment;
\endif
\if :{?expected_database}
\else
  \echo 'BLOCKED: expected_database is required'
  SELECT 1/0 AS blocked_missing_database;
\endif
\if :{?execution_approval}
\else
  \echo 'BLOCKED: execution_approval is required'
  SELECT 1/0 AS blocked_missing_approval;
\endif

SELECT :'phase005_environment' = 'staging'
   AND :'execution_approval' = 'PHASE005_CANONICAL_RLS_ACTIVATION_APPROVED'
   AND current_database() = :'expected_database' AS authorized \gset
\if :authorized
\else
  \echo 'BLOCKED: environment/database/approval guard failed'
  SELECT 1/0 AS blocked_authorization_mismatch;
\endif

SELECT
  to_regclass('public.assets') IS NOT NULL
  AND to_regclass('public.asset_logs') IS NOT NULL
  AND to_regclass('public.asset_relationships') IS NOT NULL
  AND (SELECT count(*) = 10 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (table_name, column_name, data_type, is_nullable) IN (
           ('assets','id','uuid','NO'),
           ('assets','tenant_id','uuid','NO'),
           ('assets','branch_id','uuid','NO'),
           ('asset_logs','id','uuid','NO'),
           ('asset_logs','tenant_id','uuid','NO'),
           ('asset_logs','asset_id','uuid','NO'),
           ('asset_relationships','id','uuid','NO'),
           ('asset_relationships','tenant_id','uuid','NO'),
           ('asset_relationships','source_asset_id','uuid','NO'),
           ('asset_relationships','target_asset_id','uuid','NO')
         ))
  AND EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conname = 'asset_logs_asset_id_fkey'
      AND c.contype = 'f'
      AND c.conrelid = 'public.asset_logs'::regclass
      AND c.confrelid = 'public.assets'::regclass
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                            WHERE attrelid='public.asset_logs'::regclass
                              AND attname='asset_id' AND NOT attisdropped)]::smallint[]
      AND c.confkey = ARRAY[(SELECT attnum FROM pg_attribute
                             WHERE attrelid='public.assets'::regclass
                               AND attname='id' AND NOT attisdropped)]::smallint[]
      AND c.confmatchtype = 's' AND c.confupdtype = 'a' AND c.confdeltype = 'c'
      AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
  )
  AND EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conname = 'asset_relationships_source_asset_id_fkey'
      AND c.contype = 'f'
      AND c.conrelid = 'public.asset_relationships'::regclass
      AND c.confrelid = 'public.assets'::regclass
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                            WHERE attrelid='public.asset_relationships'::regclass
                              AND attname='source_asset_id' AND NOT attisdropped)]::smallint[]
      AND c.confkey = ARRAY[(SELECT attnum FROM pg_attribute
                             WHERE attrelid='public.assets'::regclass
                               AND attname='id' AND NOT attisdropped)]::smallint[]
      AND c.confmatchtype = 's' AND c.confupdtype = 'a' AND c.confdeltype = 'c'
      AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
  )
  AND EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conname = 'asset_relationships_target_asset_id_fkey'
      AND c.contype = 'f'
      AND c.conrelid = 'public.asset_relationships'::regclass
      AND c.confrelid = 'public.assets'::regclass
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                            WHERE attrelid='public.asset_relationships'::regclass
                              AND attname='target_asset_id' AND NOT attisdropped)]::smallint[]
      AND c.confkey = ARRAY[(SELECT attnum FROM pg_attribute
                             WHERE attrelid='public.assets'::regclass
                               AND attname='id' AND NOT attisdropped)]::smallint[]
      AND c.confmatchtype = 's' AND c.confupdtype = 'a' AND c.confdeltype = 'c'
      AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
  ) AS schema_compatible \gset
\if :schema_compatible
\else
  \echo 'BLOCKED: protected schema/FK baseline differs'
  SELECT 1/0 AS blocked_schema_mismatch;
\endif

SELECT EXISTS (
  SELECT 1 FROM pg_roles
  WHERE rolname = 'skia_runtime' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
) AND NOT EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('assets','asset_logs','asset_relationships')
    AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = 'skia_runtime')
) AND (SELECT count(*) = 12 FROM information_schema.role_table_grants
       WHERE grantee = 'skia_runtime' AND table_schema = 'public'
         AND table_name IN ('assets','asset_logs','asset_relationships')
         AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')) AS runtime_safe \gset
\if :runtime_safe
\else
  \echo 'BLOCKED: skia_runtime attributes, ownership or grants differ'
  SELECT 1/0 AS blocked_runtime_mismatch;
\endif

SELECT
  (SELECT count(*) FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('assets','asset_logs','asset_relationships')) = 3
  AND (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,
                    COALESCE(qual,''),COALESCE(with_check,'')))
       FROM pg_policies WHERE schemaname='public' AND tablename='assets'
         AND policyname='assets_tenant_branch_isolation') = 'f39b9225e6e95b3e654e3161748f5c1a'
  AND (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,
                    COALESCE(qual,''),COALESCE(with_check,'')))
       FROM pg_policies WHERE schemaname='public' AND tablename='asset_logs'
         AND policyname='asset_logs_tenant_isolation') = '4acd83f5389f69069dedf6f93fffca8b'
  AND (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,
                    COALESCE(qual,''),COALESCE(with_check,'')))
       FROM pg_policies WHERE schemaname='public' AND tablename='asset_relationships'
         AND policyname='asset_relationships_tenant_isolation') = '14a883076b3bc7bd6a2fc4491659c6bd'
  AND (SELECT bool_and(NOT c.relrowsecurity AND c.relforcerowsecurity)
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname IN
         ('assets','asset_logs','asset_relationships')) AS exact_prestate \gset

-- These hashes are filled from an ephemeral PostgreSQL 16 execution and are
-- also checked by verify_canonical_rls.sql and rollback_canonical_rls.sql.
SELECT
  (SELECT count(*) FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('assets','asset_logs','asset_relationships')) = 3
  AND (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,
                    COALESCE(qual,''),COALESCE(with_check,'')))
       FROM pg_policies WHERE schemaname='public' AND tablename='assets'
         AND policyname='assets_tenant_branch_isolation') = '16283f38465792bdb7cba3cc265570cd'
  AND (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,
                    COALESCE(qual,''),COALESCE(with_check,'')))
       FROM pg_policies WHERE schemaname='public' AND tablename='asset_logs'
         AND policyname='asset_logs_tenant_branch_isolation') = '6f7ecd60e4d50630fc35fb5cc6184f7f'
  AND (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,
                    COALESCE(qual,''),COALESCE(with_check,'')))
       FROM pg_policies WHERE schemaname='public' AND tablename='asset_relationships'
         AND policyname='asset_relationships_tenant_branch_isolation') = '6e7ce93697090bc0ce92e3984c779771'
  AND (SELECT bool_and(c.relrowsecurity AND c.relforcerowsecurity)
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname IN
         ('assets','asset_logs','asset_relationships')) AS exact_canonical_state \gset

\if :exact_canonical_state
  \echo 'APPROVED: canonical RLS state already present; no changes required'
\else
  \if :exact_prestate
  \else
    \echo 'BLOCKED: policies or RLS flags do not match exact authorized pre-state'
    SELECT 1/0 AS blocked_policy_state_mismatch;
  \endif

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.assets, public.asset_logs, public.asset_relationships IN ACCESS EXCLUSIVE MODE;

-- Re-check the exact snapshot while holding table locks so a concurrent DDL
-- change cannot be overwritten between the external guard and convergence.
DO $locked_prestate_guard$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
       AND tablename IN ('assets','asset_logs','asset_relationships')) <> 3
     OR (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,
                       COALESCE(qual,''),COALESCE(with_check,'')))
         FROM pg_policies WHERE schemaname='public' AND tablename='assets'
           AND policyname='assets_tenant_branch_isolation') <> 'f39b9225e6e95b3e654e3161748f5c1a'
     OR (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,
                       COALESCE(qual,''),COALESCE(with_check,'')))
         FROM pg_policies WHERE schemaname='public' AND tablename='asset_logs'
           AND policyname='asset_logs_tenant_isolation') <> '4acd83f5389f69069dedf6f93fffca8b'
     OR (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,
                       COALESCE(qual,''),COALESCE(with_check,'')))
         FROM pg_policies WHERE schemaname='public' AND tablename='asset_relationships'
           AND policyname='asset_relationships_tenant_isolation') <> '14a883076b3bc7bd6a2fc4491659c6bd'
     OR EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public'
         AND c.relname IN ('assets','asset_logs','asset_relationships')
         AND (c.relrowsecurity OR NOT c.relforcerowsecurity)
     ) THEN
    RAISE EXCEPTION 'locked pre-state diverged; refusing policy convergence';
  END IF;
END $locked_prestate_guard$;

DROP POLICY assets_tenant_branch_isolation ON public.assets;
CREATE POLICY assets_tenant_branch_isolation ON public.assets
  AS PERMISSIVE FOR ALL TO skia_runtime
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (
      branch_id IS NULL
      OR branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid
      OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true'
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (
      branch_id IS NULL
      OR branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid
      OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true'
    )
  );

DROP POLICY asset_logs_tenant_isolation ON public.asset_logs;
CREATE POLICY asset_logs_tenant_branch_isolation ON public.asset_logs
  AS PERMISSIVE FOR ALL TO skia_runtime
  USING (
    asset_logs.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = asset_logs.asset_id
        AND a.tenant_id = asset_logs.tenant_id
        AND a.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        AND (
          a.branch_id IS NULL
          OR a.branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid
          OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true'
        )
    )
  )
  WITH CHECK (
    asset_logs.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = asset_logs.asset_id
        AND a.tenant_id = asset_logs.tenant_id
        AND a.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        AND (
          a.branch_id IS NULL
          OR a.branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid
          OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true'
        )
    )
  );

DROP POLICY asset_relationships_tenant_isolation ON public.asset_relationships;
CREATE POLICY asset_relationships_tenant_branch_isolation ON public.asset_relationships
  AS PERMISSIVE FOR ALL TO skia_runtime
  USING (
    asset_relationships.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM public.assets source_asset
      WHERE source_asset.id = asset_relationships.source_asset_id
        AND source_asset.tenant_id = asset_relationships.tenant_id
        AND source_asset.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        AND (
          source_asset.branch_id IS NULL
          OR source_asset.branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid
          OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true'
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.assets target_asset
      WHERE target_asset.id = asset_relationships.target_asset_id
        AND target_asset.tenant_id = asset_relationships.tenant_id
        AND target_asset.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        AND (
          target_asset.branch_id IS NULL
          OR target_asset.branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid
          OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true'
        )
    )
  )
  WITH CHECK (
    asset_relationships.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM public.assets source_asset
      WHERE source_asset.id = asset_relationships.source_asset_id
        AND source_asset.tenant_id = asset_relationships.tenant_id
        AND source_asset.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        AND (
          source_asset.branch_id IS NULL
          OR source_asset.branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid
          OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true'
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.assets target_asset
      WHERE target_asset.id = asset_relationships.target_asset_id
        AND target_asset.tenant_id = asset_relationships.tenant_id
        AND target_asset.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        AND (
          target_asset.branch_id IS NULL
          OR target_asset.branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid
          OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true'
        )
    )
  );

-- Definitions must converge before RLS is enabled.
DO $post_policy_guard$
DECLARE
  assets_hash text;
  logs_hash text;
  relationships_hash text;
BEGIN
  SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,
                       COALESCE(qual,''),COALESCE(with_check,'')))
    INTO assets_hash FROM pg_policies WHERE schemaname='public'
      AND tablename='assets' AND policyname='assets_tenant_branch_isolation';
  SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,
                       COALESCE(qual,''),COALESCE(with_check,'')))
    INTO logs_hash FROM pg_policies WHERE schemaname='public'
      AND tablename='asset_logs' AND policyname='asset_logs_tenant_branch_isolation';
  SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,
                       COALESCE(qual,''),COALESCE(with_check,'')))
    INTO relationships_hash FROM pg_policies WHERE schemaname='public'
      AND tablename='asset_relationships'
      AND policyname='asset_relationships_tenant_branch_isolation';
  IF assets_hash <> '16283f38465792bdb7cba3cc265570cd'
     OR logs_hash <> '6f7ecd60e4d50630fc35fb5cc6184f7f'
     OR relationships_hash <> '6e7ce93697090bc0ce92e3984c779771' THEN
    RAISE EXCEPTION 'canonical policy hash verification failed before RLS enable';
  END IF;
END $post_policy_guard$;

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_relationships ENABLE ROW LEVEL SECURITY;

DO $post_state_guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relname IN ('assets','asset_logs','asset_relationships')
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION 'RLS/FORCE post-state verification failed';
  END IF;
END $post_state_guard$;

COMMIT;
\endif
