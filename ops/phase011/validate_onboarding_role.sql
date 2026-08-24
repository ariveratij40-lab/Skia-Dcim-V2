\set ON_ERROR_STOP on

DO $$
DECLARE
  required_count integer;
  actual_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='skia_onboarding' AND rolcanlogin
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolinherit AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'skia_onboarding role attributes are unsafe';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='skia_onboarding')) THEN
    RAISE EXCEPTION 'skia_onboarding must not inherit role membership';
  END IF;
  IF NOT has_database_privilege('skia_onboarding','skia_prod','CONNECT')
     OR has_database_privilege('skia_onboarding','skia_prod','CREATE')
     OR NOT has_schema_privilege('skia_onboarding','public','USAGE')
     OR has_schema_privilege('skia_onboarding','public','CREATE') THEN
    RAISE EXCEPTION 'skia_onboarding database/schema privileges differ';
  END IF;

  WITH required(table_name, privilege_type) AS (
    VALUES ('users','SELECT'),('users','INSERT'),('tenants','INSERT'),
           ('branches','INSERT'),('user_tenants','INSERT'),('user_branches','INSERT'),
           ('roles','SELECT'),('roles','INSERT'),('user_roles','INSERT')
  ), actual AS (
    SELECT table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee='skia_onboarding' AND table_schema='public'
  )
  SELECT (SELECT count(*) FROM required), (SELECT count(*) FROM actual)
    INTO required_count, actual_count;
  IF required_count <> 9 OR actual_count <> required_count OR EXISTS (
    WITH required(table_name, privilege_type) AS (
      VALUES ('users','SELECT'),('users','INSERT'),('tenants','INSERT'),
             ('branches','INSERT'),('user_tenants','INSERT'),('user_branches','INSERT'),
             ('roles','SELECT'),('roles','INSERT'),('user_roles','INSERT')
    ), actual AS (
      SELECT table_name, privilege_type FROM information_schema.role_table_grants
      WHERE grantee='skia_onboarding' AND table_schema='public'
    )
    (SELECT * FROM required EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM required)
  ) THEN
    RAISE EXCEPTION 'skia_onboarding table grants differ from exact contract';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_usage_grants
    WHERE grantee='skia_onboarding' AND object_type='SEQUENCE'
  ) THEN
    RAISE EXCEPTION 'skia_onboarding must not have sequence privileges';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname IN ('users','tenants','branches','user_tenants','user_branches','roles','user_roles')
      AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'identity tables unexpectedly require an RLS design decision';
  END IF;
END $$;

-- Prove the exact grants can execute the complete atomic provisioning path.
BEGIN;
SET LOCAL ROLE skia_onboarding;
SELECT id FROM users WHERE email='onboarding-validation@example.invalid';
INSERT INTO tenants(id,name,logo,created_at) VALUES ('10000000-0000-0000-0000-000000000001','Onboarding validation','',NOW());
INSERT INTO users(id,email,name,password_hash,status,created_at) VALUES ('20000000-0000-0000-0000-000000000001','onboarding-validation@example.invalid','Validation','$test$','active',NOW());
INSERT INTO branches(id,tenant_id,name,city,status,created_at) VALUES ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Principal','Principal','active',NOW());
INSERT INTO user_tenants(user_id,tenant_id) VALUES ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
INSERT INTO user_branches(user_id,branch_id) VALUES ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
WITH inserted_role AS (
  INSERT INTO roles(id,tenant_id,name,description,is_global,created_at)
  VALUES ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','admin','Validation',FALSE,NOW())
  ON CONFLICT (tenant_id,name) DO NOTHING RETURNING id
)
SELECT id FROM inserted_role UNION ALL
SELECT id FROM roles WHERE tenant_id='10000000-0000-0000-0000-000000000001' AND name='admin' LIMIT 1;
INSERT INTO user_roles(id,user_id,tenant_id,role_id,created_at) VALUES ('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',NOW());
ROLLBACK;

SELECT 'ONBOARDING_ROLE_VALIDATION=APPROVED' AS result;
