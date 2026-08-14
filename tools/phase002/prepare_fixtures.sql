\set ON_ERROR_STOP on
-- Required psql variables (all external): phase002_environment, expected_db,
-- execution_approval, manifest_path, and hash_a_admin ... hash_c_multi.
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
\if :{?repo_root}
\else
  \echo 'BLOCKED: repo_root missing for external-path guard'
  \quit 20
\endif

SELECT (:'phase002_environment' = 'staging'
        AND :'execution_approval' = 'PHASE002_FIXTURE_V1_APPROVED'
        AND current_database() = :'expected_db'
        AND left(:'manifest_path',1) = '/'
        AND position(:'repo_root' in :'manifest_path') <> 1) AS authorized \gset
\if :authorized
\else
  \echo 'BLOCKED: staging/database/approval guard failed'
  \quit 21
\endif

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $guard$
DECLARE missing text;
BEGIN
  SELECT string_agg(x.name, ', ') INTO missing
  FROM (VALUES ('tenants'),('branches'),('users'),('user_tenants'),('user_branches'),
    ('roles'),('permissions'),('role_permissions'),('user_roles'),('sessions'),
    ('asset_types'),('assets'),('asset_logs'),('asset_relationships')) x(name)
  WHERE to_regclass('public.' || x.name) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'schema incompatible: %', missing; END IF;
  IF NOT EXISTS (SELECT 1 FROM asset_types WHERE code = 'NODE') THEN
    RAISE EXCEPTION 'required reference asset type NODE is absent';
  END IF;
  IF EXISTS (SELECT 1 FROM tenants WHERE name IN ('TEST-TENANT-A','TEST-TENANT-B','TEST-TENANT-C') AND id::text NOT LIKE '02000000-0000-4000-8000-%')
     OR EXISTS (SELECT 1 FROM branches WHERE name LIKE 'TEST-BRANCH-%' AND id::text NOT LIKE '02000000-0000-4000-8100-%')
     OR EXISTS (SELECT 1 FROM users WHERE email LIKE 'phase002-%@test.invalid' AND id::text NOT LIKE '02000000-0000-4000-8200-%')
     OR EXISTS (SELECT 1 FROM assets WHERE internal_code LIKE 'TEST-ASSET-%' AND id <> md5('phase002:asset:'||substring(internal_code from 12 for 2)||':'||right(internal_code,3))::uuid) THEN
    RAISE EXCEPTION 'noncanonical TEST collision; inspection required before prepare';
  END IF;
END $guard$;

INSERT INTO tenants (id,name,status) VALUES
 ('02000000-0000-4000-8000-00000000000a','TEST-TENANT-A','active'),
 ('02000000-0000-4000-8000-00000000000b','TEST-TENANT-B','active'),
 ('02000000-0000-4000-8000-00000000000c','TEST-TENANT-C','active') ON CONFLICT DO NOTHING;

INSERT INTO branches (id,tenant_id,name,city,status) VALUES
 ('02000000-0000-4000-8100-0000000000a1','02000000-0000-4000-8000-00000000000a','TEST-BRANCH-A1','TEST CITY A1','active'),
 ('02000000-0000-4000-8100-0000000000a2','02000000-0000-4000-8000-00000000000a','TEST-BRANCH-A2','TEST CITY A2','active'),
 ('02000000-0000-4000-8100-0000000000b1','02000000-0000-4000-8000-00000000000b','TEST-BRANCH-B1','TEST CITY B1','active'),
 ('02000000-0000-4000-8100-0000000000b2','02000000-0000-4000-8000-00000000000b','TEST-BRANCH-B2','TEST CITY B2','active'),
 ('02000000-0000-4000-8100-0000000000c1','02000000-0000-4000-8000-00000000000c','TEST-BRANCH-C1','TEST CITY C1','active'),
 ('02000000-0000-4000-8100-0000000000c2','02000000-0000-4000-8000-00000000000c','TEST-BRANCH-C2','TEST CITY C2','active') ON CONFLICT DO NOTHING;

-- Hash values are generated/delivered outside Git and supplied as psql variables.
INSERT INTO users (id,email,name,password_hash,status) VALUES
 ('02000000-0000-4000-8200-0000000000a1','phase002-a-admin@test.invalid','TEST A ADMIN',:'hash_a_admin','active'),
 ('02000000-0000-4000-8200-0000000000a2','phase002-a-operator@test.invalid','TEST A1 OPERATOR',:'hash_a_operator','active'),
 ('02000000-0000-4000-8200-0000000000a3','phase002-a-multi@test.invalid','TEST A MULTI-BRANCH',:'hash_a_multi','active'),
 ('02000000-0000-4000-8200-0000000000b1','phase002-b-admin@test.invalid','TEST B ADMIN',:'hash_b_admin','active'),
 ('02000000-0000-4000-8200-0000000000b2','phase002-b-operator@test.invalid','TEST B1 OPERATOR',:'hash_b_operator','active'),
 ('02000000-0000-4000-8200-0000000000b3','phase002-b-multi@test.invalid','TEST B MULTI-BRANCH',:'hash_b_multi','active'),
 ('02000000-0000-4000-8200-0000000000c1','phase002-c-admin@test.invalid','TEST C ADMIN',:'hash_c_admin','active'),
 ('02000000-0000-4000-8200-0000000000c2','phase002-c-operator@test.invalid','TEST C1 OPERATOR',:'hash_c_operator','active'),
 ('02000000-0000-4000-8200-0000000000c3','phase002-c-multi@test.invalid','TEST C MULTI-BRANCH',:'hash_c_multi','active') ON CONFLICT DO NOTHING;

WITH actor(user_id,tenant_id) AS (VALUES
 ('02000000-0000-4000-8200-0000000000a1'::uuid,'02000000-0000-4000-8000-00000000000a'::uuid),
 ('02000000-0000-4000-8200-0000000000a2'::uuid,'02000000-0000-4000-8000-00000000000a'::uuid),
 ('02000000-0000-4000-8200-0000000000a3'::uuid,'02000000-0000-4000-8000-00000000000a'::uuid),
 ('02000000-0000-4000-8200-0000000000b1'::uuid,'02000000-0000-4000-8000-00000000000b'::uuid),
 ('02000000-0000-4000-8200-0000000000b2'::uuid,'02000000-0000-4000-8000-00000000000b'::uuid),
 ('02000000-0000-4000-8200-0000000000b3'::uuid,'02000000-0000-4000-8200-00000000000b'::uuid),
 ('02000000-0000-4000-8200-0000000000c1'::uuid,'02000000-0000-4000-8000-00000000000c'::uuid),
 ('02000000-0000-4000-8200-0000000000c2'::uuid,'02000000-0000-4000-8000-00000000000c'::uuid),
 ('02000000-0000-4000-8200-0000000000c3'::uuid,'02000000-0000-4000-8000-00000000000c'::uuid))
INSERT INTO user_tenants(id,user_id,tenant_id)
SELECT md5('phase002:user_tenant:'||user_id)::uuid,user_id,tenant_id FROM actor ON CONFLICT DO NOTHING;

-- Admin and multi actors receive both branches; operator receives branch 1 only.
WITH access(user_id,branch_id) AS (VALUES
 ('02000000-0000-4000-8200-0000000000a1'::uuid,'02000000-0000-4000-8100-0000000000a1'::uuid),('02000000-0000-4000-8200-0000000000a1','02000000-0000-4000-8100-0000000000a2'),
 ('02000000-0000-4000-8200-0000000000a2','02000000-0000-4000-8100-0000000000a1'),('02000000-0000-4000-8200-0000000000a3','02000000-0000-4000-8100-0000000000a1'),('02000000-0000-4000-8200-0000000000a3','02000000-0000-4000-8100-0000000000a2'),
 ('02000000-0000-4000-8200-0000000000b1','02000000-0000-4000-8100-0000000000b1'),('02000000-0000-4000-8200-0000000000b1','02000000-0000-4000-8100-0000000000b2'),
 ('02000000-0000-4000-8200-0000000000b2','02000000-0000-4000-8100-0000000000b1'),('02000000-0000-4000-8200-0000000000b3','02000000-0000-4000-8100-0000000000b1'),('02000000-0000-4000-8200-0000000000b3','02000000-0000-4000-8100-0000000000b2'),
 ('02000000-0000-4000-8200-0000000000c1','02000000-0000-4000-8100-0000000000c1'),('02000000-0000-4000-8200-0000000000c1','02000000-0000-4000-8100-0000000000c2'),
 ('02000000-0000-4000-8200-0000000000c2','02000000-0000-4000-8100-0000000000c1'),('02000000-0000-4000-8200-0000000000c3','02000000-0000-4000-8100-0000000000c1'),('02000000-0000-4000-8200-0000000000c3','02000000-0000-4000-8100-0000000000c2'))
INSERT INTO user_branches(id,user_id,branch_id)
SELECT md5('phase002:user_branch:'||user_id||':'||branch_id)::uuid,user_id,branch_id FROM access ON CONFLICT DO NOTHING;

WITH role_seed(tenant_id,suffix,name,description) AS (VALUES
 ('02000000-0000-4000-8000-00000000000a'::uuid,'a1','TEST-ADMIN','PHASE-002 tenant admin'),('02000000-0000-4000-8000-00000000000a','a2','TEST-OPERATOR','PHASE-002 branch operator'),('02000000-0000-4000-8000-00000000000a','a3','TEST-MULTI-BRANCH','PHASE-002 multi-branch actor'),
 ('02000000-0000-4000-8000-00000000000b','b1','TEST-ADMIN','PHASE-002 tenant admin'),('02000000-0000-4000-8000-00000000000b','b2','TEST-OPERATOR','PHASE-002 branch operator'),('02000000-0000-4000-8000-00000000000b','b3','TEST-MULTI-BRANCH','PHASE-002 multi-branch actor'),
 ('02000000-0000-4000-8000-00000000000c','c1','TEST-ADMIN','PHASE-002 tenant admin'),('02000000-0000-4000-8000-00000000000c','c2','TEST-OPERATOR','PHASE-002 branch operator'),('02000000-0000-4000-8000-00000000000c','c3','TEST-MULTI-BRANCH','PHASE-002 multi-branch actor'))
INSERT INTO roles(id,tenant_id,name,description,is_global)
SELECT ('02000000-0000-4000-8300-0000000000'||suffix)::uuid,tenant_id,name,description,false FROM role_seed ON CONFLICT DO NOTHING;

WITH assignment(user_id,tenant_id,role_id) AS (VALUES
 ('02000000-0000-4000-8200-0000000000a1'::uuid,'02000000-0000-4000-8000-00000000000a'::uuid,'02000000-0000-4000-8300-0000000000a1'::uuid),('02000000-0000-4000-8200-0000000000a2','02000000-0000-4000-8000-00000000000a','02000000-0000-4000-8300-0000000000a2'),('02000000-0000-4000-8200-0000000000a3','02000000-0000-4000-8000-00000000000a','02000000-0000-4000-8300-0000000000a3'),
 ('02000000-0000-4000-8200-0000000000b1','02000000-0000-4000-8000-00000000000b','02000000-0000-4000-8300-0000000000b1'),('02000000-0000-4000-8200-0000000000b2','02000000-0000-4000-8000-00000000000b','02000000-0000-4000-8300-0000000000b2'),('02000000-0000-4000-8200-0000000000b3','02000000-0000-4000-8000-00000000000b','02000000-0000-4000-8300-0000000000b3'),
 ('02000000-0000-4000-8200-0000000000c1','02000000-0000-4000-8000-00000000000c','02000000-0000-4000-8300-0000000000c1'),('02000000-0000-4000-8200-0000000000c2','02000000-0000-4000-8000-00000000000c','02000000-0000-4000-8300-0000000000c2'),('02000000-0000-4000-8200-0000000000c3','02000000-0000-4000-8000-00000000000c','02000000-0000-4000-8300-0000000000c3'))
INSERT INTO user_roles(id,user_id,tenant_id,role_id)
SELECT md5('phase002:user_role:'||user_id)::uuid,user_id,tenant_id,role_id FROM assignment ON CONFLICT DO NOTHING;

-- Permissions are existing reference data. Admin gets all non-global permissions;
-- operator and multi-branch get read/view permissions only.
INSERT INTO role_permissions(id,role_id,permission_id)
SELECT md5('phase002:rp:'||r.id||':'||p.id)::uuid,r.id,p.id
FROM roles r JOIN permissions p ON
  (r.name='TEST-ADMIN' AND NOT p.is_global)
  OR (r.name IN ('TEST-OPERATOR','TEST-MULTI-BRANCH') AND (p.code LIKE '%view%' OR p.code LIKE '%read%'))
WHERE r.id::text LIKE '02000000-0000-4000-8300-%' ON CONFLICT DO NOTHING;

WITH fixture_branches(tenant_id,branch_id,code) AS (VALUES
 ('02000000-0000-4000-8000-00000000000a'::uuid,'02000000-0000-4000-8100-0000000000a1'::uuid,'A1'),('02000000-0000-4000-8000-00000000000a','02000000-0000-4000-8100-0000000000a2','A2'),
 ('02000000-0000-4000-8000-00000000000b','02000000-0000-4000-8100-0000000000b1','B1'),('02000000-0000-4000-8000-00000000000b','02000000-0000-4000-8100-0000000000b2','B2'),
 ('02000000-0000-4000-8000-00000000000c','02000000-0000-4000-8100-0000000000c1','C1'),('02000000-0000-4000-8000-00000000000c','02000000-0000-4000-8100-0000000000c2','C2')),
node_type AS (SELECT id FROM asset_types WHERE code='NODE')
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name,status,observations,specs)
SELECT md5('phase002:asset:'||b.code||':'||lpad(n::text,3,'0'))::uuid,
       b.tenant_id,b.branch_id,t.id,'TEST-ASSET-'||b.code||'-'||lpad(n::text,3,'0'),
       'PHASE-002 TEST asset '||b.code||'-'||lpad(n::text,3,'0'),'active',
       'TEST fixture V1; no production data',jsonb_build_object('fixture','PHASE-002','version','V1','branch',b.code,'sequence',n)
FROM fixture_branches b CROSS JOIN generate_series(1,10) n CROSS JOIN node_type t ON CONFLICT DO NOTHING;

-- One log per asset and one intra-branch relationship (001 -> 002) per branch.
INSERT INTO asset_logs(id,tenant_id,asset_id,event_type,new_value,notes,metadata)
SELECT md5('phase002:log:'||a.internal_code)::uuid,a.tenant_id,a.id,'created','TEST','PHASE-002 fixture V1',
       jsonb_build_object('fixture','PHASE-002','version','V1')
FROM assets a WHERE a.internal_code LIKE 'TEST-ASSET-%' ON CONFLICT DO NOTHING;

INSERT INTO asset_relationships(id,tenant_id,source_asset_id,target_asset_id,relationship_type,notes)
SELECT md5('phase002:relationship:'||left(s.internal_code,13))::uuid,s.tenant_id,s.id,t.id,'depends_on','PHASE-002 fixture V1'
FROM assets s JOIN assets t ON t.tenant_id=s.tenant_id AND t.branch_id=s.branch_id
 AND right(s.internal_code,3)='001' AND right(t.internal_code,3)='002'
WHERE s.internal_code LIKE 'TEST-ASSET-%' ON CONFLICT DO NOTHING;

DO $fixture_postcondition$
BEGIN
  IF (SELECT count(*) FROM tenants WHERE id::text LIKE '02000000-0000-4000-8000-%')<>3
    OR (SELECT count(*) FROM branches WHERE id::text LIKE '02000000-0000-4000-8100-%')<>6
    OR (SELECT count(*) FROM users WHERE id::text LIKE '02000000-0000-4000-8200-%')<>9
    OR (SELECT count(*) FROM roles WHERE id::text LIKE '02000000-0000-4000-8300-%')<>9
    OR (SELECT count(*) FROM user_tenants ut JOIN users u ON u.id=ut.user_id WHERE u.id::text LIKE '02000000-0000-4000-8200-%')<>9
    OR (SELECT count(*) FROM user_branches ub JOIN users u ON u.id=ub.user_id WHERE u.id::text LIKE '02000000-0000-4000-8200-%')<>15
    OR (SELECT count(*) FROM user_roles ur JOIN users u ON u.id=ur.user_id WHERE u.id::text LIKE '02000000-0000-4000-8200-%')<>9
    OR (SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.id::text LIKE '02000000-0000-4000-8300-%')=0
    OR (SELECT count(*) FROM assets WHERE internal_code LIKE 'TEST-ASSET-%')<>60
    OR (SELECT count(*) FROM asset_logs l JOIN assets a ON a.id=l.asset_id WHERE a.internal_code LIKE 'TEST-ASSET-%')<>60
    OR (SELECT count(*) FROM asset_relationships ar JOIN assets a ON a.id=ar.source_asset_id WHERE a.internal_code LIKE 'TEST-ASSET-%')<>6 THEN
    RAISE EXCEPTION 'fixture postcondition failed; transaction will roll back';
  END IF;
END $fixture_postcondition$;

-- Client-side manifest: path must be outside the repository and outside the DB.
\copy (SELECT 'tenants' AS table_name,id::text AS exact_id,name AS logical_alias FROM tenants WHERE id::text LIKE '02000000-0000-4000-8000-%' UNION ALL SELECT 'branches',id::text,name FROM branches WHERE id::text LIKE '02000000-0000-4000-8100-%' UNION ALL SELECT 'users',id::text,email FROM users WHERE id::text LIKE '02000000-0000-4000-8200-%' UNION ALL SELECT 'roles',id::text,name||':'||tenant_id FROM roles WHERE id::text LIKE '02000000-0000-4000-8300-%' UNION ALL SELECT 'user_tenants',id::text,user_id||':'||tenant_id FROM user_tenants WHERE user_id::text LIKE '02000000-0000-4000-8200-%' UNION ALL SELECT 'user_branches',id::text,user_id||':'||branch_id FROM user_branches WHERE user_id::text LIKE '02000000-0000-4000-8200-%' UNION ALL SELECT 'user_roles',id::text,user_id||':'||role_id FROM user_roles WHERE user_id::text LIKE '02000000-0000-4000-8200-%' UNION ALL SELECT 'role_permissions',rp.id::text,rp.role_id||':'||rp.permission_id FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.id::text LIKE '02000000-0000-4000-8300-%' UNION ALL SELECT 'assets',id::text,internal_code FROM assets WHERE internal_code LIKE 'TEST-ASSET-%' UNION ALL SELECT 'asset_logs',l.id::text,a.internal_code||':log' FROM asset_logs l JOIN assets a ON a.id=l.asset_id WHERE a.internal_code LIKE 'TEST-ASSET-%' UNION ALL SELECT 'asset_relationships',ar.id::text,s.internal_code||'->'||t.internal_code FROM asset_relationships ar JOIN assets s ON s.id=ar.source_asset_id JOIN assets t ON t.id=ar.target_asset_id WHERE s.internal_code LIKE 'TEST-ASSET-%') TO :'manifest_path' WITH (FORMAT csv, HEADER true)

COMMIT;
\echo 'Fixture V1 prepared. Compute and retain an external checksum before testing.'
