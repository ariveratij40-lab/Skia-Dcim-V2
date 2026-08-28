\set ON_ERROR_STOP on
DO $$
DECLARE b phase12c_legacy_before%ROWTYPE;
BEGIN
  SELECT * INTO b FROM phase12c_legacy_before;
  IF ROW(b.tenants,b.branches,b.buildings,b.internal_areas,b.locations,b.assets,b.mdf_idf,b.naming_rules)
     IS DISTINCT FROM ROW(
       (SELECT count(*) FROM tenants),(SELECT count(*) FROM branches),
       (SELECT count(*) FROM buildings),(SELECT count(*) FROM internal_areas),
       (SELECT count(*) FROM locations),(SELECT count(*) FROM assets),
       (SELECT count(*) FROM mdf_idf),(SELECT count(*) FROM naming_rules)) THEN
    RAISE EXCEPTION 'legacy named counts changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id='41000000-0000-4000-8000-000000000001')
     OR NOT EXISTS (SELECT 1 FROM branches WHERE id='42000000-0000-4000-8000-000000000001')
     OR NOT EXISTS (SELECT 1 FROM buildings WHERE id='43000000-0000-4000-8000-000000000001')
     OR NOT EXISTS (SELECT 1 FROM internal_areas WHERE id='44000000-0000-4000-8000-000000000001')
     OR NOT EXISTS (SELECT 1 FROM locations WHERE id='45000000-0000-4000-8000-000000000001')
     OR NOT EXISTS (SELECT 1 FROM naming_rules WHERE id='46000000-0000-4000-8000-000000000001')
     OR NOT EXISTS (SELECT 1 FROM assets WHERE id='47000000-0000-4000-8000-000000000001')
     OR NOT EXISTS (SELECT 1 FROM mdf_idf WHERE id='48000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'legacy row identity changed';
  END IF;
  IF b.branch_tenant IS DISTINCT FROM (SELECT tenant_id FROM branches WHERE id='42000000-0000-4000-8000-000000000001')
     OR b.building_branch IS DISTINCT FROM (SELECT branch_id FROM buildings WHERE id='43000000-0000-4000-8000-000000000001')
     OR b.area_site IS DISTINCT FROM (SELECT site_id FROM internal_areas WHERE id='44000000-0000-4000-8000-000000000001')
     OR b.location_area IS DISTINCT FROM (SELECT internal_area_id FROM locations WHERE id='45000000-0000-4000-8000-000000000001')
     OR b.asset_location IS DISTINCT FROM (SELECT location_id FROM assets WHERE id='47000000-0000-4000-8000-000000000001')
     OR b.asset_rule IS DISTINCT FROM (SELECT nomenclature_id FROM assets WHERE id='47000000-0000-4000-8000-000000000001')
     OR b.mdf_asset IS DISTINCT FROM (SELECT asset_id FROM mdf_idf WHERE id='48000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'legacy relationships changed';
  END IF;
  IF (SELECT internal_area_id IS DISTINCT FROM '44000000-0000-4000-8000-000000000001'::uuid OR zone_id IS NOT NULL
      FROM locations WHERE id='45000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'legacy location path changed';
  END IF;
END $$;

SELECT format('ZERO_DATA_LOSS_AFTER tenants=%s branches=%s buildings=%s internal_areas=%s locations=%s assets=%s mdf_idf=%s naming_rules=%s',
  (SELECT count(*) FROM tenants),(SELECT count(*) FROM branches),
  (SELECT count(*) FROM buildings),(SELECT count(*) FROM internal_areas),
  (SELECT count(*) FROM locations),(SELECT count(*) FROM assets),
  (SELECT count(*) FROM mdf_idf),(SELECT count(*) FROM naming_rules));
SELECT 'ZERO_DATA_LOSS_NAMED_COUNTS=PASS';
SELECT 'LEGACY_ROW_IDENTITY_PRESERVED=PASS';
SELECT 'LEGACY_RELATIONSHIPS_PRESERVED=PASS';
SELECT 'LEGACY_LOCATION_UNCHANGED=PASS';
DROP TABLE phase12c_legacy_before;
