-- PHASE 1.2E-A2F: remove deprecated Rack storage authorities.
--
-- Preconditions are fail-closed. Migration 035 is permitted only after A2E
-- proved that runtime code no longer reads/writes these authorities and that
-- production contains no meaningful legacy values or DB dependencies.
--
-- Canonical authority remains:
--   assets.housing_rack_id
--
-- This migration intentionally does NOT rename or remove API/DTO compatibility
-- names such as JSON `rack_id`, does NOT remove `rack_unit`, and does NOT alter
-- racks.id.

-- Abort before any mutation if a satellite legacy authority has repopulated.
DO $guard$
DECLARE
  switch_values bigint;
  patch_panel_values bigint;
  pdu_values bigint;
BEGIN
  SELECT count(*) INTO switch_values
  FROM public.switches
  WHERE rack_id IS NOT NULL;

  SELECT count(*) INTO patch_panel_values
  FROM public.patch_panels
  WHERE rack_id IS NOT NULL;

  SELECT count(*) INTO pdu_values
  FROM public.pdus
  WHERE rack_id IS NOT NULL;

  IF switch_values <> 0 OR patch_panel_values <> 0 OR pdu_values <> 0 THEN
    RAISE EXCEPTION
      'Migration 035 blocked: legacy Rack authority repopulated (switches=%, patch_panels=%, pdus=%)',
      switch_values, patch_panel_values, pdu_values
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- assets.specs.rack_id was a legacy metadata authority. A2E established that
-- no meaningful values remain. Remove the key itself (including null/blank
-- remnants) so it cannot survive as an ambiguous secondary source of truth.
UPDATE public.assets
SET specs = specs - 'rack_id'
WHERE specs ? 'rack_id';

-- Remove the deprecated satellite storage authorities. IF EXISTS keeps the
-- artifact safe across already-clean bootstrap/test databases while the guard
-- above protects databases where the columns still exist and contain data.
ALTER TABLE public.switches
  DROP COLUMN IF EXISTS rack_id;

ALTER TABLE public.patch_panels
  DROP COLUMN IF EXISTS rack_id;

ALTER TABLE public.pdus
  DROP COLUMN IF EXISTS rack_id;

COMMENT ON COLUMN public.assets.housing_rack_id IS
  'Canonical Rack housing authority. Legacy satellite rack_id storage authorities were removed by Migration 035.';
