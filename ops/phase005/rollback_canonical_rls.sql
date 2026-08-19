\set ON_ERROR_STOP on

-- Restores the exact 2026-08-14 pre-activation policy snapshot. A future
-- activation gate must provide this rollback its own explicit approval.
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
\if :{?rollback_approval}
\else
  \echo 'BLOCKED: rollback_approval is required'
  SELECT 1/0 AS blocked_missing_approval;
\endif

SELECT :'phase005_environment'='staging'
   AND :'rollback_approval'='PHASE005_CANONICAL_RLS_ROLLBACK_APPROVED'
   AND current_database()=:'expected_database' AS authorized \gset
\if :authorized
\else
  \echo 'BLOCKED: environment/database/rollback approval guard failed'
  SELECT 1/0 AS blocked_authorization_mismatch;
\endif

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

\if :exact_prestate
  \echo 'APPROVED: exact pre-activation snapshot already restored; no changes required'
\else
  \if :exact_canonical_state
  \else
    \echo 'BLOCKED: state is neither exact canonical nor exact rollback target'
    SELECT 1/0 AS blocked_policy_state_mismatch;
  \endif

BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
LOCK TABLE public.assets, public.asset_logs, public.asset_relationships IN ACCESS EXCLUSIVE MODE;

DO $locked_canonical_guard$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
       AND tablename IN ('assets','asset_logs','asset_relationships')) <> 3
     OR (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,
                       COALESCE(qual,''),COALESCE(with_check,'')))
         FROM pg_policies WHERE schemaname='public' AND tablename='assets'
           AND policyname='assets_tenant_branch_isolation') <> '16283f38465792bdb7cba3cc265570cd'
     OR (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,
                       COALESCE(qual,''),COALESCE(with_check,'')))
         FROM pg_policies WHERE schemaname='public' AND tablename='asset_logs'
           AND policyname='asset_logs_tenant_branch_isolation') <> '6f7ecd60e4d50630fc35fb5cc6184f7f'
     OR (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,
                       COALESCE(qual,''),COALESCE(with_check,'')))
         FROM pg_policies WHERE schemaname='public' AND tablename='asset_relationships'
           AND policyname='asset_relationships_tenant_branch_isolation') <> '6e7ce93697090bc0ce92e3984c779771'
     OR EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public'
         AND c.relname IN ('assets','asset_logs','asset_relationships')
         AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
     ) THEN
    RAISE EXCEPTION 'locked canonical state diverged; refusing rollback';
  END IF;
END $locked_canonical_guard$;

ALTER TABLE public.assets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_relationships DISABLE ROW LEVEL SECURITY;

DROP POLICY assets_tenant_branch_isolation ON public.assets;
CREATE POLICY assets_tenant_branch_isolation ON public.assets
  AS PERMISSIVE FOR ALL TO PUBLIC
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

DROP POLICY asset_logs_tenant_branch_isolation ON public.asset_logs;
CREATE POLICY asset_logs_tenant_isolation ON public.asset_logs
  AS PERMISSIVE FOR ALL TO PUBLIC
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY asset_relationships_tenant_branch_isolation ON public.asset_relationships;
CREATE POLICY asset_relationships_tenant_isolation ON public.asset_relationships
  AS PERMISSIVE FOR ALL TO PUBLIC
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DO $rollback_guard$
DECLARE policy_count integer;
BEGIN
  SELECT count(*) INTO policy_count FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('assets','asset_logs','asset_relationships');
  IF policy_count <> 3 OR EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relname IN ('assets','asset_logs','asset_relationships')
      AND (c.relrowsecurity OR NOT c.relforcerowsecurity)
  ) OR (SELECT md5(concat_ws('|',policyname,permissive,roles::text,cmd,
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
  THEN RAISE EXCEPTION 'exact rollback snapshot verification failed'; END IF;
END $rollback_guard$;

COMMIT;
\endif
