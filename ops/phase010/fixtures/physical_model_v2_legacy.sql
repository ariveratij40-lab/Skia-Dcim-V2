\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('app.tenant_id','41000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.branch_id','42000000-0000-4000-8000-000000000001',true);

INSERT INTO tenants(id,name) VALUES('41000000-0000-4000-8000-000000000001','Legacy tenant');
INSERT INTO branches(id,tenant_id,code,name,city,status) VALUES
  ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','TJ','Tijuana','Tijuana','active');
INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES
  ('43000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','PARQUE','Parque','active');
INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,code,name,status) VALUES
  ('44000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','PROD','Produccion','active');
INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,status,internal_area_id) VALUES
  ('45000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','Legacy MDF','MDF','active','44000000-0000-4000-8000-000000000001');
INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_site,include_internal_area,include_placement,seq_digits,last_seq,active) VALUES
  ('46000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','MDF','MDF','-',true,true,true,false,3,0,true);
INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name)
SELECT '47000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',id,
       '45000000-0000-4000-8000-000000000001','MDF-TJ-PARQUE-PROD-001','46000000-0000-4000-8000-000000000001',1,'Legacy MDF'
FROM asset_types WHERE code='MDF';
UPDATE naming_rules SET last_seq=1 WHERE id='46000000-0000-4000-8000-000000000001';
UPDATE locations SET asset_id='47000000-0000-4000-8000-000000000001'
WHERE id='45000000-0000-4000-8000-000000000001';
INSERT INTO mdf_idf(id,asset_id,tenant_id,branch_id,type) VALUES
  ('48000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','MDF');

CREATE TABLE phase12c_legacy_before AS SELECT
  (SELECT count(*) FROM tenants) tenants,
  (SELECT count(*) FROM branches) branches,
  (SELECT count(*) FROM buildings) buildings,
  (SELECT count(*) FROM internal_areas) internal_areas,
  (SELECT count(*) FROM locations) locations,
  (SELECT count(*) FROM assets) assets,
  (SELECT count(*) FROM mdf_idf) mdf_idf,
  (SELECT count(*) FROM naming_rules) naming_rules,
  (SELECT tenant_id FROM branches WHERE id='42000000-0000-4000-8000-000000000001') branch_tenant,
  (SELECT branch_id FROM buildings WHERE id='43000000-0000-4000-8000-000000000001') building_branch,
  (SELECT site_id FROM internal_areas WHERE id='44000000-0000-4000-8000-000000000001') area_site,
  (SELECT internal_area_id FROM locations WHERE id='45000000-0000-4000-8000-000000000001') location_area,
  (SELECT location_id FROM assets WHERE id='47000000-0000-4000-8000-000000000001') asset_location,
  (SELECT nomenclature_id FROM assets WHERE id='47000000-0000-4000-8000-000000000001') asset_rule,
  (SELECT asset_id FROM mdf_idf WHERE id='48000000-0000-4000-8000-000000000001') mdf_asset;

SELECT format('ZERO_DATA_LOSS_BEFORE tenants=%s branches=%s buildings=%s internal_areas=%s locations=%s assets=%s mdf_idf=%s naming_rules=%s',
  tenants,branches,buildings,internal_areas,locations,assets,mdf_idf,naming_rules)
FROM phase12c_legacy_before;
COMMIT;
