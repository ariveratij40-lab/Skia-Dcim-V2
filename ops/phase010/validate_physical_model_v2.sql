\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee='skia_runtime' AND table_schema='public'
      AND table_name='system_naming_presets'
      AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'runtime access to system_naming_presets is deferred';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE grantee='PUBLIC' AND table_schema='public'
      AND table_name='system_naming_presets'
      AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'PUBLIC must not access system_naming_presets';
  END IF;
END $$;

DO $$
DECLARE
  fn oid := to_regprocedure('public.read_active_system_naming_presets(text[])');
  owner_name text;
  secure boolean;
  config text[];
  result_type text;
BEGIN
  IF fn IS NULL THEN
    RAISE EXCEPTION 'secure system naming preset reader is missing';
  END IF;
  SELECT r.rolname,p.prosecdef,p.proconfig,pg_get_function_result(p.oid)
    INTO owner_name,secure,config,result_type
  FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=fn;
  IF owner_name <> 'skia_migrator' OR NOT secure THEN
    RAISE EXCEPTION 'secure preset reader owner/security differ: %/%', owner_name,secure;
  END IF;
  IF config IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp'] THEN
    RAISE EXCEPTION 'secure preset reader search_path differs: %',config;
  END IF;
  IF result_type <> 'TABLE(asset_type_code character varying, preset_version integer, prefix character varying, separator character varying, include_branch boolean, include_placement boolean, seq_digits smallint)' THEN
    RAISE EXCEPTION 'secure preset reader result differs: %',result_type;
  END IF;
  IF NOT has_function_privilege('skia_runtime',fn,'EXECUTE')
     OR has_function_privilege('skia_onboarding',fn,'EXECUTE')
     OR EXISTS (SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid=fn)) WHERE grantee=0 AND privilege_type='EXECUTE') THEN
    RAISE EXCEPTION 'secure preset reader execute contract differs';
  END IF;
END $$;

DO $$
DECLARE
  tenant_a UUID := '21000000-0000-4000-8000-000000000001';
  tenant_b UUID := '21000000-0000-4000-8000-000000000002';
  branch_a UUID := '22000000-0000-4000-8000-000000000001';
  branch_a2 UUID := '22000000-0000-4000-8000-000000000002';
  branch_b UUID := '22000000-0000-4000-8000-000000000003';
  building_a UUID := '23000000-0000-4000-8000-000000000001';
  building_a2 UUID := '23000000-0000-4000-8000-000000000002';
  floor_a UUID := '24000000-0000-4000-8000-000000000001';
  zone_branch UUID := '25000000-0000-4000-8000-000000000001';
  zone_building UUID := '25000000-0000-4000-8000-000000000002';
  zone_floor UUID := '25000000-0000-4000-8000-000000000003';
  area_a UUID := '26000000-0000-4000-8000-000000000001';
  location_legacy UUID := '27000000-0000-4000-8000-000000000001';
  location_v2 UUID := '27000000-0000-4000-8000-000000000002';
  asset_id UUID := '28000000-0000-4000-8000-000000000001';
  rack_id UUID := '29000000-0000-4000-8000-000000000001';
  naming_rule_id UUID := '2a000000-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO tenants(id,name) VALUES(tenant_a,'V2 A'),(tenant_b,'V2 B');
  INSERT INTO branches(id,tenant_id,code,name) VALUES
    (branch_a,tenant_a,'A1','A1'),(branch_a2,tenant_a,'A2','A2'),(branch_b,tenant_b,'B1','B1');
  PERFORM set_config('app.tenant_id',tenant_a::text,true);
  PERFORM set_config('app.branch_id',branch_a::text,true);
  INSERT INTO buildings(id,tenant_id,branch_id,code,name) VALUES
    (building_a,tenant_a,branch_a,'BA','Building A');
  PERFORM set_config('app.branch_id',branch_a2::text,true);
  INSERT INTO buildings(id,tenant_id,branch_id,code,name) VALUES
    (building_a2,tenant_a,branch_a2,'BA2','Building A2');
  PERFORM set_config('app.branch_id',branch_a::text,true);
  INSERT INTO floors(id,tenant_id,building_id,name) VALUES(floor_a,tenant_a,building_a,'Floor A');

  INSERT INTO zones(id,tenant_id,branch_id,code,name) VALUES(zone_branch,tenant_a,branch_a,'DIRECT','Direct');
  INSERT INTO zones(id,tenant_id,branch_id,building_id,code,name) VALUES(zone_building,tenant_a,branch_a,building_a,'BLDG','Building');
  INSERT INTO zones(id,tenant_id,branch_id,building_id,floor_id,code,name) VALUES(zone_floor,tenant_a,branch_a,building_a,floor_a,'FLOOR','Floor');

  BEGIN
    INSERT INTO zones(tenant_id,branch_id,floor_id,code,name) VALUES(tenant_a,branch_a,floor_a,'NO-BUILDING','Invalid');
    RAISE EXCEPTION 'floor without building accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO zones(tenant_id,branch_id,building_id,code,name) VALUES(tenant_a,branch_a,building_a2,'CROSS-BRANCH','Invalid');
    RAISE EXCEPTION 'cross-branch building accepted';
  EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO zones(tenant_id,branch_id,building_id,code,name) VALUES(tenant_b,branch_b,building_a,'CROSS-TENANT','Invalid');
    RAISE EXCEPTION 'cross-tenant building accepted';
  EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN NULL; END;

  INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,code,name)
  VALUES(area_a,tenant_a,branch_a,building_a,'AREA','Legacy Area');
  INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,status,internal_area_id)
  VALUES(location_legacy,tenant_a,branch_a,'Legacy MDF','MDF','active',area_a);
  IF (SELECT zone_id IS NOT NULL FROM locations WHERE id=location_legacy) THEN
    RAISE EXCEPTION 'legacy location was modified';
  END IF;
  INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,status,zone_id)
  VALUES(location_v2,tenant_a,branch_a,'V2 placement','WAREHOUSE','active',zone_branch);
  BEGIN
    INSERT INTO locations(tenant_id,branch_id,name,placement_type,status,zone_id)
    VALUES(tenant_a,branch_a2,'Cross branch','WAREHOUSE','active',zone_branch);
    RAISE EXCEPTION 'cross-branch location accepted';
  EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN NULL; END;

  INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_location,seq_digits,last_seq,active)
  VALUES(naming_rule_id,tenant_a,'SERVER','SRV','-',true,false,4,0,true);
  INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,nomenclature_id,nomenclature_sequence,name)
  SELECT asset_id,tenant_a,branch_a,id,'SRV-A1-0001',naming_rule_id,1,'Housing test' FROM asset_types WHERE code='SERVER';
  INSERT INTO racks(id,asset_id,tenant_id,branch_id) VALUES(rack_id,asset_id,tenant_a,branch_a);
  IF (SELECT housing_type FROM racks WHERE id=rack_id) <> 'RACK' THEN
    RAISE EXCEPTION 'legacy rack default differs';
  END IF;
  UPDATE racks SET housing_type='CABINET' WHERE id=rack_id;
  BEGIN
    UPDATE racks SET housing_type='INVALID' WHERE id=rack_id;
    RAISE EXCEPTION 'invalid housing accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  UPDATE asset_types SET asset_class='ACTIVE_EQUIPMENT',placement_policy='HOUSING' WHERE code='SERVER';
  BEGIN
    UPDATE asset_types SET asset_class='INVALID' WHERE code='SERVER';
    RAISE EXCEPTION 'invalid asset class accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE asset_types SET placement_policy='INVALID' WHERE code='SERVER';
    RAISE EXCEPTION 'invalid placement policy accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO system_naming_presets(asset_type_code,preset_version,prefix) VALUES('SERVER',1,'SRV');
  BEGIN
    INSERT INTO system_naming_presets(asset_type_code,preset_version,prefix) VALUES('SERVER',2,'SERVER');
    RAISE EXCEPTION 'second active preset accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  UPDATE system_naming_presets SET active=false WHERE asset_type_code='SERVER' AND preset_version=1;
  INSERT INTO system_naming_presets(asset_type_code,preset_version,prefix) VALUES('SERVER',2,'SERVER');
  BEGIN
    INSERT INTO system_naming_presets(asset_type_code,preset_version,prefix,active) VALUES('SERVER',2,'X',false);
    RAISE EXCEPTION 'duplicate preset version accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

SELECT 'PHYSICAL_MODEL_V2_SCHEMA_VALIDATION=APPROVED' AS result;
ROLLBACK;
