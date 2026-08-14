\set ON_ERROR_STOP on
\if :{?phase002_environment}
\else
  \echo 'BLOCKED: phase002_environment missing'
  \quit 20
\endif
SELECT (:'phase002_environment'='staging') AS authorized \gset
\if :authorized
\else
  \echo 'BLOCKED: verification is staging-only'
  \quit 21
\endif

BEGIN READ ONLY;
SELECT 'tenants' AS check_name, count(*) AS observed, 3 AS expected,
       count(*)=3 AS passed
FROM tenants WHERE id::text LIKE '02000000-0000-4000-8000-%'
UNION ALL
SELECT 'branches',count(*),6,count(*)=6 FROM branches WHERE id::text LIKE '02000000-0000-4000-8100-%'
UNION ALL
SELECT 'users',count(*),9,count(*)=9 FROM users WHERE id::text LIKE '02000000-0000-4000-8200-%'
UNION ALL
SELECT 'roles',count(*),3,count(*)=3 FROM roles WHERE id::text IN ('02000000-0000-4000-8300-0000000000a2','02000000-0000-4000-8300-0000000000b2','02000000-0000-4000-8300-0000000000c2')
UNION ALL
SELECT 'assets',count(*),60,count(*)=60 FROM assets WHERE internal_code LIKE 'TEST-ASSET-%'
UNION ALL
SELECT 'asset_logs',count(*),60,count(*)=60 FROM asset_logs l JOIN assets a ON a.id=l.asset_id WHERE a.internal_code LIKE 'TEST-ASSET-%'
UNION ALL
SELECT 'asset_relationships',count(*),6,count(*)=6 FROM asset_relationships ar JOIN assets a ON a.id=ar.source_asset_id WHERE a.internal_code LIKE 'TEST-ASSET-%';

SELECT t.name AS tenant,b.name AS branch,count(a.id) AS asset_count,
       bool_and(a.specs->>'fixture'='PHASE-002' AND a.specs->>'version'='V1') AS metadata_valid
FROM tenants t JOIN branches b ON b.tenant_id=t.id
JOIN assets a ON a.tenant_id=t.id AND a.branch_id=b.id
WHERE t.id::text LIKE '02000000-0000-4000-8000-%'
GROUP BY t.name,b.name ORDER BY t.name,b.name;

SELECT u.email,r.name AS role,t.name AS tenant,
       array_agg(b.name ORDER BY b.name) AS authorized_branches
FROM users u JOIN user_tenants ut ON ut.user_id=u.id JOIN tenants t ON t.id=ut.tenant_id
JOIN user_roles ur ON ur.user_id=u.id AND ur.tenant_id=t.id JOIN roles r ON r.id=ur.role_id
JOIN user_branches ub ON ub.user_id=u.id JOIN branches b ON b.id=ub.branch_id
WHERE u.id::text LIKE '02000000-0000-4000-8200-%'
GROUP BY u.email,r.name,t.name ORDER BY u.email;

SELECT count(*)=0 AS no_cross_tenant_fk_mismatch
FROM assets a JOIN branches b ON b.id=a.branch_id
WHERE a.internal_code LIKE 'TEST-ASSET-%' AND a.tenant_id<>b.tenant_id;

SELECT count(*)=3 AS exact_neutral_role_count,
       bool_and(r.name='operator' AND NOT r.is_global) AS neutral_role_semantics,
       bool_and(p.code='dcim:view'
                AND p.id='550e8400-e29b-41d4-a716-446655440401'::uuid
                AND NOT p.is_global) AS exact_normative_permission,
       min(md5(p.id::text)) AS permission_set_hash,
       'NO ENFORCED' AS runtime_enforcement
FROM roles r
JOIN role_permissions rp ON rp.role_id=r.id
JOIN permissions p ON p.id=rp.permission_id
WHERE r.id::text LIKE '02000000-0000-4000-8300-%';

SELECT count(*)=0 AS no_privileged_fixture_role_name
FROM roles WHERE id::text LIKE '02000000-0000-4000-8300-%'
  AND name IN ('admin','super_admin');

SELECT count(*)=0 AS no_obsolete_or_noncanonical_fixture_role
FROM roles WHERE id::text LIKE '02000000-0000-4000-8300-%'
  AND id::text NOT IN ('02000000-0000-4000-8300-0000000000a2','02000000-0000-4000-8300-0000000000b2','02000000-0000-4000-8300-0000000000c2');

-- Optional client-side capture for exact session IDs created by the HTTP
-- campaign. It contains no token and must be merged into the external manifest.
\if :{?session_manifest_path}
\copy (SELECT 'sessions' AS table_name,s.id::text AS exact_id,u.email||':session' AS logical_alias FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.id::text LIKE '02000000-0000-4000-8200-%') TO :'session_manifest_path' WITH (FORMAT csv, HEADER true)
\endif
ROLLBACK;
