-- PHASE 1.2E-A2A: canonical physical housing and backbone governance.
-- The canonical bootstrap runner applies this artifact and its ledger row in
-- one transaction. Incompatible demo rows must be removed before application.

ALTER TABLE public.assets
  ADD COLUMN mount_mode varchar(20) NOT NULL DEFAULT 'NONE',
  ADD COLUMN housing_rack_id uuid;
ALTER TABLE public.assets ADD CONSTRAINT assets_mount_mode_check
  CHECK (mount_mode IN ('NONE','RACK_MOUNTED','ROOM_MOUNTED'));

ALTER TABLE public.backbone_links
  ADD COLUMN circuit_code varchar(64);
UPDATE public.backbone_links SET circuit_code=upper(btrim(id::text)) WHERE circuit_code IS NULL;
ALTER TABLE public.backbone_links ALTER COLUMN circuit_code SET NOT NULL;
ALTER TABLE public.backbone_links ALTER COLUMN origin_id SET NOT NULL;
ALTER TABLE public.backbone_links ALTER COLUMN destination_id SET NOT NULL;
ALTER TABLE public.backbone_links ADD CONSTRAINT backbone_circuit_code_check
  CHECK (btrim(circuit_code)<>'' AND circuit_code=upper(btrim(circuit_code)));
ALTER TABLE public.backbone_links ADD CONSTRAINT backbone_distinct_endpoints_check
  CHECK (origin_id<>destination_id);

ALTER TABLE public.asset_relationships ADD COLUMN branch_id uuid;
UPDATE public.asset_relationships ar SET branch_id=a.branch_id
FROM public.assets a
WHERE a.id=ar.source_asset_id AND a.tenant_id=ar.tenant_id AND ar.branch_id IS NULL;
ALTER TABLE public.asset_relationships ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.asset_relationships DROP CONSTRAINT asset_relationships_relationship_type_check;
ALTER TABLE public.asset_relationships ADD CONSTRAINT asset_relationships_relationship_type_check
  CHECK (relationship_type IN ('CONNECTED_TO','UPLINK_TO','TERMINATES_ON','POWERED_BY','SERVES'));

ALTER TABLE public.racks ALTER COLUMN mdf_idf_id SET NOT NULL;

-- Candidate keys used as exact tenant/branch scope authorities.
DO $$ BEGIN
  ALTER TABLE public.assets ADD CONSTRAINT assets_housing_scope_key UNIQUE(id,tenant_id,branch_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.mdf_idf ADD CONSTRAINT mdf_idf_housing_scope_key UNIQUE(id,tenant_id,branch_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.racks ADD CONSTRAINT racks_housing_scope_key UNIQUE(id,tenant_id,branch_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.locations ADD CONSTRAINT locations_housing_scope_key UNIQUE(id,tenant_id,branch_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.racks ADD CONSTRAINT racks_mdf_idf_scope_fk
  FOREIGN KEY(mdf_idf_id,tenant_id,branch_id)
  REFERENCES public.mdf_idf(id,tenant_id,branch_id) ON DELETE RESTRICT;
ALTER TABLE public.assets ADD CONSTRAINT assets_housing_rack_scope_fk
  FOREIGN KEY(housing_rack_id,tenant_id,branch_id)
  REFERENCES public.racks(id,tenant_id,branch_id) ON DELETE RESTRICT;
ALTER TABLE public.assets ADD CONSTRAINT assets_location_scope_fk
  FOREIGN KEY(location_id,tenant_id,branch_id)
  REFERENCES public.locations(id,tenant_id,branch_id) ON DELETE RESTRICT;

-- Satellite identity must always match its base asset scope.
ALTER TABLE public.mdf_idf ADD CONSTRAINT mdf_idf_asset_scope_fk
  FOREIGN KEY(asset_id,tenant_id,branch_id) REFERENCES public.assets(id,tenant_id,branch_id) ON DELETE CASCADE;
ALTER TABLE public.racks ADD CONSTRAINT racks_asset_scope_fk
  FOREIGN KEY(asset_id,tenant_id,branch_id) REFERENCES public.assets(id,tenant_id,branch_id) ON DELETE CASCADE;
ALTER TABLE public.patch_panels ADD CONSTRAINT patch_panels_asset_scope_fk
  FOREIGN KEY(asset_id,tenant_id,branch_id) REFERENCES public.assets(id,tenant_id,branch_id) ON DELETE CASCADE;
ALTER TABLE public.switches ADD CONSTRAINT switches_asset_scope_fk
  FOREIGN KEY(asset_id,tenant_id,branch_id) REFERENCES public.assets(id,tenant_id,branch_id) ON DELETE CASCADE;
ALTER TABLE public.pdus ADD CONSTRAINT pdus_asset_scope_fk
  FOREIGN KEY(asset_id,tenant_id,branch_id) REFERENCES public.assets(id,tenant_id,branch_id) ON DELETE CASCADE;
ALTER TABLE public.ups ADD CONSTRAINT ups_asset_scope_fk
  FOREIGN KEY(asset_id,tenant_id,branch_id) REFERENCES public.assets(id,tenant_id,branch_id) ON DELETE CASCADE;
ALTER TABLE public.backbone_links ADD CONSTRAINT backbone_links_asset_scope_fk
  FOREIGN KEY(asset_id,tenant_id,branch_id) REFERENCES public.assets(id,tenant_id,branch_id) ON DELETE CASCADE;
ALTER TABLE public.nodes ADD CONSTRAINT nodes_asset_scope_fk
  FOREIGN KEY(asset_id,tenant_id,branch_id) REFERENCES public.assets(id,tenant_id,branch_id) ON DELETE CASCADE;

ALTER TABLE public.backbone_links ADD CONSTRAINT backbone_origin_scope_fk
  FOREIGN KEY(origin_id,tenant_id,branch_id) REFERENCES public.assets(id,tenant_id,branch_id) ON DELETE RESTRICT;
ALTER TABLE public.backbone_links ADD CONSTRAINT backbone_destination_scope_fk
  FOREIGN KEY(destination_id,tenant_id,branch_id) REFERENCES public.assets(id,tenant_id,branch_id) ON DELETE RESTRICT;
ALTER TABLE public.asset_relationships ADD CONSTRAINT asset_relationships_source_scope_fk
  FOREIGN KEY(source_asset_id,tenant_id,branch_id) REFERENCES public.assets(id,tenant_id,branch_id) ON DELETE CASCADE;
ALTER TABLE public.asset_relationships ADD CONSTRAINT asset_relationships_target_scope_fk
  FOREIGN KEY(target_asset_id,tenant_id,branch_id) REFERENCES public.assets(id,tenant_id,branch_id) ON DELETE CASCADE;

CREATE INDEX idx_assets_housing_rack ON public.assets(housing_rack_id) WHERE housing_rack_id IS NOT NULL;
CREATE INDEX idx_racks_mdf_idf_scope ON public.racks(mdf_idf_id,tenant_id,branch_id);
CREATE INDEX idx_backbone_origin_scope ON public.backbone_links(origin_id,tenant_id,branch_id);
CREATE INDEX idx_backbone_destination_scope ON public.backbone_links(destination_id,tenant_id,branch_id);
CREATE UNIQUE INDEX uq_backbone_logical_circuit
  ON public.backbone_links(tenant_id,branch_id,origin_id,destination_id,circuit_code);
CREATE INDEX idx_asset_relationships_source_scope
  ON public.asset_relationships(source_asset_id,tenant_id,branch_id);
CREATE INDEX idx_asset_relationships_target_scope
  ON public.asset_relationships(target_asset_id,tenant_id,branch_id);

CREATE FUNCTION public.assert_canonical_asset_housing(p_asset_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE a public.assets%ROWTYPE; type_code text; sat_count integer;
DECLARE rack_location uuid; distribution_location uuid;
BEGIN
  SELECT x.* INTO a FROM public.assets x WHERE x.id=p_asset_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT at.code INTO STRICT type_code FROM public.asset_types at WHERE at.id=a.asset_type_id;

  IF type_code IN ('MDF','IDF') THEN
    IF a.mount_mode<>'NONE' OR a.housing_rack_id IS NOT NULL THEN
      RAISE EXCEPTION 'MDF/IDF cannot be housed in a Rack' USING ERRCODE='23514';
    END IF;
    SELECT count(*) INTO sat_count FROM public.mdf_idf m
      WHERE m.asset_id=a.id AND m.tenant_id=a.tenant_id AND m.branch_id=a.branch_id AND m.type=type_code;
    IF sat_count<>1 THEN RAISE EXCEPTION 'MDF/IDF typed satellite mismatch' USING ERRCODE='23514'; END IF;
  ELSIF type_code='RACK' THEN
    IF a.mount_mode<>'NONE' OR a.housing_rack_id IS NOT NULL THEN
      RAISE EXCEPTION 'Rack cannot be housed in a Rack' USING ERRCODE='23514';
    END IF;
    SELECT count(*) INTO sat_count
    FROM public.racks r JOIN public.mdf_idf m ON m.id=r.mdf_idf_id AND m.tenant_id=r.tenant_id AND m.branch_id=r.branch_id
    JOIN public.assets pa ON pa.id=m.asset_id AND pa.tenant_id=m.tenant_id AND pa.branch_id=m.branch_id
    WHERE r.asset_id=a.id AND r.tenant_id=a.tenant_id AND r.branch_id=a.branch_id;
    SELECT pa.location_id INTO distribution_location
    FROM public.racks r JOIN public.mdf_idf m ON m.id=r.mdf_idf_id AND m.tenant_id=r.tenant_id AND m.branch_id=r.branch_id
    JOIN public.assets pa ON pa.id=m.asset_id AND pa.tenant_id=m.tenant_id AND pa.branch_id=m.branch_id
    WHERE r.asset_id=a.id AND r.tenant_id=a.tenant_id AND r.branch_id=a.branch_id LIMIT 1;
    IF sat_count<>1 OR a.location_id IS DISTINCT FROM distribution_location THEN
      RAISE EXCEPTION 'Rack parent or placement is not canonical' USING ERRCODE='23514';
    END IF;
  ELSIF type_code IN ('PATCH_PANEL','SWITCH','PDU') THEN
    IF a.mount_mode<>'RACK_MOUNTED' OR a.housing_rack_id IS NULL THEN
      RAISE EXCEPTION '% requires canonical Rack housing',type_code USING ERRCODE='23514';
    END IF;
    SELECT ra.location_id INTO rack_location FROM public.racks r
      JOIN public.assets ra ON ra.id=r.asset_id AND ra.tenant_id=r.tenant_id AND ra.branch_id=r.branch_id
      WHERE r.id=a.housing_rack_id AND r.tenant_id=a.tenant_id AND r.branch_id=a.branch_id;
    IF NOT FOUND OR a.location_id IS DISTINCT FROM rack_location THEN
      RAISE EXCEPTION '% placement differs from housing Rack',type_code USING ERRCODE='23514';
    END IF;
    IF type_code='PATCH_PANEL' THEN SELECT count(*) INTO sat_count FROM public.patch_panels s WHERE s.asset_id=a.id AND s.tenant_id=a.tenant_id AND s.branch_id=a.branch_id;
    ELSIF type_code='SWITCH' THEN SELECT count(*) INTO sat_count FROM public.switches s WHERE s.asset_id=a.id AND s.tenant_id=a.tenant_id AND s.branch_id=a.branch_id;
    ELSE SELECT count(*) INTO sat_count FROM public.pdus s WHERE s.asset_id=a.id AND s.tenant_id=a.tenant_id AND s.branch_id=a.branch_id; END IF;
    IF sat_count<>1 THEN RAISE EXCEPTION '% typed satellite mismatch',type_code USING ERRCODE='23514'; END IF;
  ELSIF type_code='UPS' THEN
    SELECT count(*) INTO sat_count FROM public.ups s WHERE s.asset_id=a.id AND s.tenant_id=a.tenant_id AND s.branch_id=a.branch_id;
    IF sat_count<>1 THEN RAISE EXCEPTION 'UPS typed satellite mismatch' USING ERRCODE='23514'; END IF;
    IF a.mount_mode='RACK_MOUNTED' THEN
      IF a.housing_rack_id IS NULL THEN RAISE EXCEPTION 'rack-mounted UPS requires Rack' USING ERRCODE='23514'; END IF;
      SELECT ra.location_id INTO rack_location FROM public.racks r JOIN public.assets ra ON ra.id=r.asset_id
       WHERE r.id=a.housing_rack_id AND r.tenant_id=a.tenant_id AND r.branch_id=a.branch_id;
      IF NOT FOUND OR a.location_id IS DISTINCT FROM rack_location THEN RAISE EXCEPTION 'UPS placement differs from Rack' USING ERRCODE='23514'; END IF;
    ELSIF a.mount_mode='ROOM_MOUNTED' THEN
      IF a.housing_rack_id IS NOT NULL OR a.location_id IS NULL THEN RAISE EXCEPTION 'room-mounted UPS requires location and forbids Rack' USING ERRCODE='23514'; END IF;
    ELSE RAISE EXCEPTION 'UPS requires an explicit mount mode' USING ERRCODE='23514'; END IF;
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.assert_canonical_asset_housing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_canonical_asset_housing(uuid) TO skia_runtime;

CREATE FUNCTION public.enforce_canonical_housing_final_state()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE asset_id uuid; dependent uuid;
BEGIN
  IF TG_TABLE_NAME='assets' THEN
    asset_id:=NEW.id;
  ELSE
    asset_id:=NEW.asset_id;
  END IF;
  PERFORM public.assert_canonical_asset_housing(asset_id);
  IF TG_TABLE_NAME='assets' THEN
    FOR dependent IN
      SELECT child.id FROM public.racks r JOIN public.mdf_idf m ON m.id=r.mdf_idf_id
      JOIN public.assets child ON child.id=r.asset_id WHERE m.asset_id=NEW.id
      UNION SELECT child.id FROM public.racks r JOIN public.assets child ON child.housing_rack_id=r.id WHERE r.asset_id=NEW.id
    LOOP PERFORM public.assert_canonical_asset_housing(dependent); END LOOP;
  END IF;
  RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION public.enforce_canonical_housing_final_state() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER trg_assets_canonical_housing
AFTER INSERT OR UPDATE ON public.assets DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_housing_final_state();
CREATE CONSTRAINT TRIGGER trg_racks_canonical_housing
AFTER INSERT OR UPDATE ON public.racks DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_housing_final_state();
CREATE CONSTRAINT TRIGGER trg_mdf_idf_canonical_housing
AFTER INSERT OR UPDATE ON public.mdf_idf DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_housing_final_state();
CREATE CONSTRAINT TRIGGER trg_patch_panels_canonical_housing
AFTER INSERT OR UPDATE ON public.patch_panels DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_housing_final_state();
CREATE CONSTRAINT TRIGGER trg_switches_canonical_housing
AFTER INSERT OR UPDATE ON public.switches DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_housing_final_state();
CREATE CONSTRAINT TRIGGER trg_pdus_canonical_housing
AFTER INSERT OR UPDATE ON public.pdus DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_housing_final_state();
CREATE CONSTRAINT TRIGGER trg_ups_canonical_housing
AFTER INSERT OR UPDATE ON public.ups DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_housing_final_state();

CREATE FUNCTION public.enforce_canonical_backbone()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE origin_type text; destination_type text;
BEGIN
  NEW.circuit_code:=upper(btrim(NEW.circuit_code));
  SELECT at.code INTO origin_type FROM public.assets a JOIN public.asset_types at ON at.id=a.asset_type_id
   WHERE a.id=NEW.origin_id AND a.tenant_id=NEW.tenant_id AND a.branch_id=NEW.branch_id;
  SELECT at.code INTO destination_type FROM public.assets a JOIN public.asset_types at ON at.id=a.asset_type_id
   WHERE a.id=NEW.destination_id AND a.tenant_id=NEW.tenant_id AND a.branch_id=NEW.branch_id;
  IF origin_type IS DISTINCT FROM 'MDF' OR destination_type IS DISTINCT FROM 'IDF' THEN
    RAISE EXCEPTION 'Backbone endpoints must be directed MDF to IDF' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.enforce_canonical_backbone() FROM PUBLIC;
CREATE TRIGGER trg_enforce_canonical_backbone BEFORE INSERT OR UPDATE OF origin_id,destination_id,tenant_id,branch_id,circuit_code
ON public.backbone_links FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_backbone();

COMMENT ON COLUMN public.assets.mount_mode IS 'Canonical mount semantics: NONE, RACK_MOUNTED, or ROOM_MOUNTED.';
COMMENT ON COLUMN public.assets.housing_rack_id IS 'Canonical Rack housing authority; legacy satellite rack_id columns are deprecated.';
COMMENT ON COLUMN public.backbone_links.circuit_code IS 'Normalized discriminator allowing parallel MDF-to-IDF circuits.';
COMMENT ON COLUMN public.asset_relationships.branch_id IS 'Canonical branch scope for non-containment connectivity relationships.';
