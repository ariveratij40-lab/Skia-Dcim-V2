-- PHASE 1.2D-B3B: provision the approved placement policy metadata.
-- Application enforcement remains a later, separately authorized phase.

DO $$
DECLARE
  missing_codes TEXT;
  conflicting_policies TEXT;
BEGIN
  WITH expected(code, policy) AS (
    VALUES
      ('MDF', 'ZONE'),
      ('IDF', 'ZONE'),
      ('RACK', 'MDF_IDF'),
      ('SWITCH', 'HOUSING'),
      ('UPS', 'ZONE'),
      ('PDU', 'HOUSING'),
      ('PATCH_PANEL', 'HOUSING'),
      ('NODE', 'ZONE'),
      ('BACKBONE', 'RELATIONSHIP_ONLY'),
      ('FIREWALL', 'HOUSING'),
      ('SERVER', 'HOUSING'),
      ('CCTV', 'ZONE'),
      ('AC_UNIT', 'ZONE')
  )
  SELECT STRING_AGG(e.code, ',' ORDER BY e.code)
  INTO missing_codes
  FROM expected e
  LEFT JOIN asset_types a ON a.code=e.code
  WHERE a.id IS NULL;

  IF missing_codes IS NOT NULL THEN
    RAISE EXCEPTION 'asset_type_placement_policy_missing_codes:%', missing_codes;
  END IF;

  WITH expected(code, policy) AS (
    VALUES
      ('MDF', 'ZONE'), ('IDF', 'ZONE'), ('RACK', 'MDF_IDF'),
      ('SWITCH', 'HOUSING'), ('UPS', 'ZONE'), ('PDU', 'HOUSING'),
      ('PATCH_PANEL', 'HOUSING'), ('NODE', 'ZONE'),
      ('BACKBONE', 'RELATIONSHIP_ONLY'), ('FIREWALL', 'HOUSING'),
      ('SERVER', 'HOUSING'), ('CCTV', 'ZONE'), ('AC_UNIT', 'ZONE')
  )
  SELECT STRING_AGG(a.code || '=' || a.placement_policy, ',' ORDER BY a.code)
  INTO conflicting_policies
  FROM asset_types a
  JOIN expected e ON e.code=a.code
  WHERE a.placement_policy IS NOT NULL
    AND a.placement_policy<>e.policy;

  IF conflicting_policies IS NOT NULL THEN
    RAISE EXCEPTION 'asset_type_placement_policy_conflict:%', conflicting_policies;
  END IF;
END $$;

WITH expected(code, policy) AS (
  VALUES
    ('MDF', 'ZONE'),
    ('IDF', 'ZONE'),
    ('RACK', 'MDF_IDF'),
    ('SWITCH', 'HOUSING'),
    ('UPS', 'ZONE'),
    ('PDU', 'HOUSING'),
    ('PATCH_PANEL', 'HOUSING'),
    ('NODE', 'ZONE'),
    ('BACKBONE', 'RELATIONSHIP_ONLY'),
    ('FIREWALL', 'HOUSING'),
    ('SERVER', 'HOUSING'),
    ('CCTV', 'ZONE'),
    ('AC_UNIT', 'ZONE')
)
UPDATE asset_types a
SET placement_policy=e.policy
FROM expected e
WHERE a.code=e.code
  AND a.placement_policy IS NULL;

DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  WITH expected(code, policy) AS (
    VALUES
      ('MDF', 'ZONE'), ('IDF', 'ZONE'), ('RACK', 'MDF_IDF'),
      ('SWITCH', 'HOUSING'), ('UPS', 'ZONE'), ('PDU', 'HOUSING'),
      ('PATCH_PANEL', 'HOUSING'), ('NODE', 'ZONE'),
      ('BACKBONE', 'RELATIONSHIP_ONLY'), ('FIREWALL', 'HOUSING'),
      ('SERVER', 'HOUSING'), ('CCTV', 'ZONE'), ('AC_UNIT', 'ZONE')
  )
  SELECT COUNT(*)
  INTO invalid_count
  FROM expected e
  LEFT JOIN asset_types a ON a.code=e.code
  WHERE a.id IS NULL OR a.placement_policy<>e.policy;

  IF invalid_count<>0 THEN
    RAISE EXCEPTION 'asset_type_placement_policy_postcondition_failed:%', invalid_count;
  END IF;
END $$;
