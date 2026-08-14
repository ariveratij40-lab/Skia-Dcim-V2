\set ON_ERROR_STOP on

-- Read-only verification. This script never creates, alters or drops objects.
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, r.rolname AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_roles r ON r.oid=c.relowner
WHERE n.nspname='public'
  AND c.relname IN ('assets','asset_logs','asset_relationships')
ORDER BY c.relname;

SELECT tablename, policyname, permissive, roles, cmd,
       md5(concat_ws('|',policyname,permissive,roles::text,cmd,
                     COALESCE(qual,''),COALESCE(with_check,''))) AS normalized_hash,
       qual = with_check AS symmetric_boundary
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('assets','asset_logs','asset_relationships')
ORDER BY tablename,policyname;

SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolinherit
FROM pg_roles WHERE rolname='skia_runtime';
