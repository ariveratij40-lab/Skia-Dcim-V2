\set ON_ERROR_STOP on
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
  \echo 'BLOCKED: external manifest_path missing'
  \quit 20
\endif
\if :{?manifest_sha256}
\else
  \echo 'BLOCKED: externally verified manifest_sha256 missing'
  \quit 20
\endif
\if :{?repo_root}
\else
  \echo 'BLOCKED: repo_root missing for external-path guard'
  \quit 20
\endif

SELECT (:'phase002_environment'='staging'
        AND :'execution_approval'='PHASE002_ROLLBACK_V1_APPROVED'
        AND current_database()=:'expected_db'
        AND length(:'manifest_sha256')=64
        AND left(:'manifest_path',1)='/'
        AND position(:'repo_root' in :'manifest_path')<>1) AS authorized \gset
\if :authorized
\else
  \echo 'BLOCKED: rollback staging/database/approval/checksum guard failed'
  \quit 21
\endif

BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TEMP TABLE phase002_manifest(table_name text, exact_id uuid, logical_alias text) ON COMMIT DROP;
\copy phase002_manifest(table_name,exact_id,logical_alias) FROM :'manifest_path' WITH (FORMAT csv, HEADER true)

DO $manifest_guard$
DECLARE n integer; bad integer;
BEGIN
  SELECT count(*) INTO n FROM phase002_manifest;
  IF n < 177 THEN RAISE EXCEPTION 'manifest incomplete (% rows)',n; END IF;
  SELECT count(*) INTO bad FROM phase002_manifest
   WHERE table_name NOT IN ('tenants','branches','users','roles','user_tenants','user_branches',
     'user_roles','role_permissions','sessions','assets','asset_logs','asset_relationships');
  IF bad<>0 THEN RAISE EXCEPTION 'manifest contains unauthorized tables'; END IF;
  IF EXISTS (SELECT exact_id FROM phase002_manifest GROUP BY exact_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'manifest contains duplicate IDs';
  END IF;
END $manifest_guard$;

-- Child-to-parent FK order. Every target is joined to an exact manifest ID.
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
BEGIN
  IF EXISTS (
    SELECT 1 FROM phase002_manifest m
    WHERE (m.table_name='tenants' AND EXISTS (SELECT 1 FROM tenants x WHERE x.id=m.exact_id))
       OR (m.table_name='branches' AND EXISTS (SELECT 1 FROM branches x WHERE x.id=m.exact_id))
       OR (m.table_name='users' AND EXISTS (SELECT 1 FROM users x WHERE x.id=m.exact_id))
       OR (m.table_name='assets' AND EXISTS (SELECT 1 FROM assets x WHERE x.id=m.exact_id))
  ) THEN RAISE EXCEPTION 'rollback postcondition failed'; END IF;
END $postcheck$;
COMMIT;
\echo 'Rollback complete; retain checksum and nonsensitive summary as evidence.'
