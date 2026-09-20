-- B3a: data-only global recommendations; never tenant acceptance.
-- Canonical JSON SHA256: 2c32e4b53c3969e310d70feb2e6d56e6c54dd71d73c4b9f7c83b5863219cad45
-- One atomic DO statement; canonical runner also binds ledger insertion in -1.
-- Derived verbatim from docs/phase1_2f/B3_DEFINITION_CATALOG_CANONICAL.json.
DO $catalog$
DECLARE
  approved constant jsonb := $json$[["AC_UNIT_V1","AC_UNIT",1,"AC","-",true,false,false,true,false,false,false,"CANONICAL_ZONE","BRANCH",4,null,null,null,null,null,true],["CCTV_V1","CCTV",1,"CAM","-",true,false,false,true,false,false,false,"CANONICAL_ZONE","BRANCH",4,null,null,null,null,null,true],["FIREWALL_V1","FIREWALL",1,"FW","-",true,false,false,false,false,true,false,"CANONICAL_HOUSING","BRANCH",4,null,null,null,null,null,true],["IDF_V1","IDF",1,"IDF","-",true,false,false,true,false,false,false,"CANONICAL_ZONE","BRANCH",3,null,null,null,null,null,true],["MDF_V1","MDF",1,"MDF","-",true,false,false,true,false,false,false,"CANONICAL_ZONE","BRANCH",3,null,null,null,null,null,true],["NODE_V1","NODE",1,"ND","-",true,false,false,true,false,false,false,"CANONICAL_ZONE","BRANCH",4,null,null,null,null,null,true],["PATCH_PANEL_V1","PATCH_PANEL",1,"PP","-",true,false,false,false,false,true,false,"CANONICAL_HOUSING","BRANCH",4,null,null,null,null,null,true],["PDU_V1","PDU",1,"PDU","-",true,false,false,false,false,true,false,"CANONICAL_HOUSING","BRANCH",4,null,null,null,null,null,true],["RACK_V1","RACK",1,"RK","-",true,false,false,false,true,false,false,"CANONICAL_DISTRIBUTION","DISTRIBUTION",3,null,null,null,null,null,true],["SERVER_V1","SERVER",1,"SRV","-",true,false,false,false,false,true,false,"CANONICAL_HOUSING","BRANCH",4,null,null,null,null,null,true],["SWITCH_V1","SWITCH",1,"SW","-",true,false,false,false,false,true,false,"CANONICAL_HOUSING","BRANCH",4,null,null,null,null,null,true],["UPS_V1","UPS",1,"UPS","-",true,false,false,true,false,false,false,"CANONICAL_ZONE","BRANCH",4,null,null,null,null,null,true]]$json$::jsonb;
  r jsonb;
  present jsonb;
BEGIN
  LOCK TABLE public.system_naming_presets IN SHARE ROW EXCLUSIVE MODE;
  IF jsonb_array_length(approved) <> 12 THEN
    RAISE EXCEPTION '040 invalid catalog cardinality';
  END IF;
  -- Validate every conflict before any write. NULL is compared as JSON null.
  FOR r IN SELECT value FROM jsonb_array_elements(approved) LOOP
    FOR present IN
      SELECT jsonb_build_array(p.preset_code, p.asset_type_code, p.preset_version, p.prefix, p.separator, p.include_branch, p.include_building, p.include_floor, p.include_zone, p.include_distribution, p.include_housing, p.include_placement, p.context_mode, p.sequence_scope, p.seq_digits, p.custom_segment_1, p.custom_segment_1_label, p.custom_segment_2, p.custom_segment_2_label, p.description, p.active)
      FROM public.system_naming_presets p
      WHERE p.preset_code = r->>0
         OR (p.asset_type_code = r->>1 AND p.preset_version = (r->>2)::integer)
    LOOP
      IF present IS DISTINCT FROM r THEN
        RAISE EXCEPTION '040 conflicting preset %', r->>0;
      END IF;
    END LOOP;
  END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements(approved) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.system_naming_presets WHERE preset_code = r->>0) THEN
      INSERT INTO public.system_naming_presets (preset_code, asset_type_code, preset_version, prefix, separator, include_branch, include_building, include_floor, include_zone, include_distribution, include_housing, include_placement, context_mode, sequence_scope, seq_digits, custom_segment_1, custom_segment_1_label, custom_segment_2, custom_segment_2_label, description, active)
      VALUES (r->>0, r->>1, (r->>2)::integer, r->>3, r->>4, (r->>5)::boolean, (r->>6)::boolean, (r->>7)::boolean, (r->>8)::boolean, (r->>9)::boolean, (r->>10)::boolean, (r->>11)::boolean, r->>12, r->>13, (r->>14)::integer, r->>15, r->>16, r->>17, r->>18, r->>19, (r->>20)::boolean);
    END IF;
  END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements(approved) LOOP
    SELECT jsonb_build_array(p.preset_code, p.asset_type_code, p.preset_version, p.prefix, p.separator, p.include_branch, p.include_building, p.include_floor, p.include_zone, p.include_distribution, p.include_housing, p.include_placement, p.context_mode, p.sequence_scope, p.seq_digits, p.custom_segment_1, p.custom_segment_1_label, p.custom_segment_2, p.custom_segment_2_label, p.description, p.active)
      INTO STRICT present FROM public.system_naming_presets p WHERE p.preset_code = r->>0;
    IF present IS DISTINCT FROM r THEN
      RAISE EXCEPTION '040 final catalog mismatch %', r->>0;
    END IF;
  END LOOP;
END
$catalog$;
