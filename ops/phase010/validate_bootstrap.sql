\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(name, ', ') INTO missing
  FROM (VALUES ('tenants'),('users'),('branches'),('assets'),('asset_logs'),
    ('asset_relationships'),('inventory_imports'),('inventory_import_rows'),
    ('import_jobs'),('import_items'),('import_sessions'),('imported_assets'),
    ('import_errors'),('import_warnings'),('inventory_clear_logs'),
    ('capex_projects'),('capex_line_items'),('cert_evaluations'),('ai_chat_history')) v(name)
  WHERE to_regclass('public.' || name) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'missing tables: %', missing; END IF;
END $$;

DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(name, ', ') INTO missing
  FROM (VALUES ('buildings'),('floors'),('zones'),('technical_rooms'),('internal_areas'),
    ('locations'),('mdf_idf'),('naming_rules'),('nomenclature_counters'),
    ('nomenclature_branch_counters'),('system_naming_presets')) v(name)
  WHERE to_regclass('public.' || name) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'missing physical-model tables: %', missing; END IF;
END $$;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_constraint c
  JOIN pg_class t ON t.oid=c.conrelid
  JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=ANY(c.conkey)
  WHERE t.relname='import_jobs' AND a.attname='user_id' AND c.contype='f';
  IF n <> 1 THEN RAISE EXCEPTION 'import_jobs.user_id FK count %, expected 1', n; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    WHERE t.relname='import_jobs' AND c.confdeltype IN ('n','c')
      AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY (user_id)%'
  ) THEN RAISE EXCEPTION 'import_jobs.user_id is not restrictive'; END IF;
END $$;

DO $$
DECLARE job_id bigint;
BEGIN
  INSERT INTO tenants(id,name) VALUES
    ('10000000-0000-4000-8000-000000000001','BOOTSTRAP A'),
    ('10000000-0000-4000-8000-000000000002','BOOTSTRAP B');
  INSERT INTO branches(id,tenant_id,name) VALUES
    ('11000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','A1'),
    ('11000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','B1');
  PERFORM set_config('app.tenant_id','10000000-0000-4000-8000-000000000001',true);
  PERFORM set_config('app.branch_id','11000000-0000-4000-8000-000000000001',true);
  INSERT INTO buildings(id,tenant_id,branch_id,code,name) VALUES
    ('13000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','SITE','Bootstrap Site');
  INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,code,name) VALUES
    ('14000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','AREA','Bootstrap Area');
  BEGIN
    INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,status)
    VALUES ('15000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Invalid MDF','MDF','active');
    RAISE EXCEPTION 'MDF location without internal area unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,status,internal_area_id)
  VALUES ('15000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Valid MDF','MDF','active','14000000-0000-4000-8000-000000000001');
  INSERT INTO users(id,email,name,password_hash) VALUES
    ('12000000-0000-4000-8000-000000000001','bootstrap-validation@invalid','validator','not-a-login-secret');
  INSERT INTO import_jobs(job_uuid,tenant_id,branch_id,user_id,file_name,file_type)
  VALUES ('bootstrap-valid','10000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','x.csv','csv')
  RETURNING id INTO job_id;
  INSERT INTO import_items(import_job_id,tenant_id,branch_id,name)
  VALUES (job_id,'10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','row');

  BEGIN
    DELETE FROM users WHERE id='12000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'user deletion unexpectedly bypassed RESTRICT';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO import_jobs(job_uuid,tenant_id,branch_id,user_id,file_name,file_type)
    VALUES ('bootstrap-cross-tenant','10000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001','x.csv','csv');
    RAISE EXCEPTION 'cross-tenant branch unexpectedly accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  DELETE FROM import_jobs WHERE id=job_id;
  IF EXISTS (SELECT 1 FROM import_items WHERE import_job_id=job_id) THEN
    RAISE EXCEPTION 'child row did not cascade with job';
  END IF;
END $$;

SELECT 'BOOTSTRAP_SCHEMA_OK' AS result;
ROLLBACK;
