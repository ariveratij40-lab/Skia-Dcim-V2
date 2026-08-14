\set ON_ERROR_STOP on
-- This SQL is invoked only by rollback_fixtures.sh after a real SHA-256 match.
\if :{?wrapper_checksum_verified}
\else
  \echo 'BLOCKED: checksum wrapper attestation missing'
  \quit 20
\endif
\if :{?phase002_environment}
\else
  \echo 'BLOCKED: phase002_environment missing'
  \quit 20
\endif
\if :{?expected_db}
\else
  \echo 'BLOCKED: expected_db missing'
  \quit 20
\endif
\if :{?execution_approval}
\else
  \echo 'BLOCKED: execution_approval missing'
  \quit 20
\endif
\if :{?manifest_path}
\else
  \echo 'BLOCKED: manifest_path missing'
  \quit 20
\endif
\if :{?expected_role_permission_count}
\else
  \echo 'BLOCKED: expected_role_permission_count missing'
  \quit 20
\endif
\if :{?expected_session_count}
\else
  \echo 'BLOCKED: expected_session_count missing'
  \quit 20
\endif

SELECT (:'wrapper_checksum_verified'='SHA256_MATCHED_BY_ROLLBACK_WRAPPER'
        AND :'phase002_environment'='staging'
        AND :'execution_approval'='PHASE002_ROLLBACK_V1_APPROVED'
        AND current_database()=:'expected_db'
        AND :'expected_role_permission_count' ~ '^[1-9][0-9]*$'
        AND :'expected_session_count' ~ '^[0-9]+$') AS authorized \gset
\if :authorized
\else
  \echo 'BLOCKED: rollback authorization/database guard failed'
  \quit 21
\endif

BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT set_config('phase002.expected_role_permission_count',:'expected_role_permission_count',true);
SELECT set_config('phase002.expected_session_count',:'expected_session_count',true);
CREATE TEMP TABLE phase002_manifest(table_name text, exact_id uuid, logical_alias text) ON COMMIT DROP;
\copy phase002_manifest(table_name,exact_id,logical_alias) FROM :'manifest_path' WITH (FORMAT csv, HEADER true)

DO $manifest_guard$
DECLARE
  table_key text;
  expected_count integer;
  observed_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM phase002_manifest WHERE table_name IS NULL OR logical_alias IS NULL OR logical_alias='') THEN
    RAISE EXCEPTION 'manifest contains empty required fields';
  END IF;
  IF EXISTS (SELECT exact_id FROM phase002_manifest GROUP BY exact_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'manifest contains duplicate exact IDs';
  END IF;
  IF EXISTS (SELECT 1 FROM phase002_manifest WHERE table_name NOT IN
    ('tenants','branches','users','roles','user_tenants','user_branches','user_roles',
     'role_permissions','sessions','assets','asset_logs','asset_relationships')) THEN
    RAISE EXCEPTION 'manifest contains unauthorized tables';
  END IF;

  FOR table_key,expected_count IN SELECT * FROM (VALUES
    ('tenants',3),('branches',6),('users',9),('roles',6),('user_tenants',9),
    ('user_branches',15),('user_roles',9),
    ('role_permissions',current_setting('phase002.expected_role_permission_count')::integer),
    ('sessions',current_setting('phase002.expected_session_count')::integer),
    ('assets',60),('asset_logs',60),('asset_relationships',6)) expected(table_name,n)
  LOOP
    SELECT count(*) INTO observed_count FROM phase002_manifest WHERE table_name=table_key;
    IF observed_count<>expected_count THEN
      RAISE EXCEPTION 'manifest count mismatch for %: expected %, observed %',table_key,expected_count,observed_count;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM phase002_manifest WHERE
       (table_name='tenants' AND (exact_id::text NOT LIKE '02000000-0000-4000-8000-%' OR logical_alias !~ '^TEST-TENANT-[ABC]$'))
    OR (table_name='branches' AND (exact_id::text NOT LIKE '02000000-0000-4000-8100-%' OR logical_alias !~ '^TEST-BRANCH-[ABC][12]$'))
    OR (table_name='users' AND (exact_id::text NOT LIKE '02000000-0000-4000-8200-%' OR logical_alias !~ '^phase002-[abc]-(admin|operator|multi)@test[.]invalid$'))
    OR (table_name='roles' AND (exact_id::text NOT LIKE '02000000-0000-4000-8300-%' OR logical_alias !~ '^(admin|operator):'))
    OR (table_name='assets' AND logical_alias !~ '^TEST-ASSET-[ABC][12]-[0-9]{3}$')
    OR (table_name='asset_logs' AND logical_alias !~ '^TEST-ASSET-[ABC][12]-[0-9]{3}:log$')
    OR (table_name='asset_relationships' AND logical_alias !~ '^TEST-ASSET-[ABC][12]-001->TEST-ASSET-[ABC][12]-002$')
    OR (table_name='sessions' AND logical_alias !~ '^phase002-[abc]-(admin|operator|multi)@test[.]invalid:session$')) THEN
    RAISE EXCEPTION 'manifest ID/alias coherence check failed';
  END IF;
END $manifest_guard$;

-- Exact manifest IDs only, in child-to-parent FK order.
DELETE FROM sessions x USING phase002_manifest m WHERE m.table_name='sessions' AND x.id=m.exact_id;
DELETE FROM asset_relationships x USING phase002_manifest m WHERE m.table_name='asset_relationships' AND x.id=m.exact_id;
DELETE FROM asset_logs x USING phase002_manifest m WHERE m.table_name='asset_logs' AND x.id=m.exact_id;
DELETE FROM role_permissions x USING phase002_manifest m WHERE m.table_name='role_permissions' AND x.id=m.exact_id;
DELETE FROM user_roles x USING phase002_manifest m WHERE m.table_name='user_roles' AND x.id=m.exact_id;
DELETE FROM user_branches x USING phase002_manifest m WHERE m.table_name='user_branches' AND x.id=m.exact_id;
DELETE FROM user_tenants x USING phase002_manifest m WHERE m.table_name='user_tenants' AND x.id=m.exact_id;
DELETE FROM assets x USING phase002_manifest m WHERE m.table_name='assets' AND x.id=m.exact_id;
DELETE FROM roles x USING phase002_manifest m WHERE m.table_name='roles' AND x.id=m.exact_id;
DELETE FROM users x USING phase002_manifest m WHERE m.table_name='users' AND x.id=m.exact_id;
DELETE FROM branches x USING phase002_manifest m WHERE m.table_name='branches' AND x.id=m.exact_id;
DELETE FROM tenants x USING phase002_manifest m WHERE m.table_name='tenants' AND x.id=m.exact_id;

DO $postcheck$
DECLARE target_table text; survivor boolean;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['tenants','branches','users','roles','user_tenants',
    'user_branches','user_roles','role_permissions','sessions','assets','asset_logs','asset_relationships']
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I x JOIN phase002_manifest m ON m.exact_id=x.id WHERE m.table_name=$1)',target_table)
      INTO survivor USING target_table;
    IF survivor THEN RAISE EXCEPTION 'ROLLBACK FAILED: surviving exact manifest ID in %',target_table; END IF;
  END LOOP;
END $postcheck$;
COMMIT;
\echo 'Rollback succeeded: zero surviving manifest IDs in every authorized table.'
