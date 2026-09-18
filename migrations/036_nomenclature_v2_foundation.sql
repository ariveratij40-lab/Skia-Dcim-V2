-- Phase 1.2F-B1: additive nomenclature V2 schema and provenance foundation.
-- This migration deliberately publishes no production preset rows.

ALTER TABLE system_naming_presets
  ADD COLUMN IF NOT EXISTS preset_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS context_mode VARCHAR(32),
  ADD COLUMN IF NOT EXISTS sequence_scope VARCHAR(24);

-- Existing catalog rows predate V2 provenance. Give them deterministic technical
-- identities without claiming they were one of the approved V2 presets.
UPDATE system_naming_presets
SET preset_code = 'LEGACY_' || asset_type_code || '_V' || preset_version::text
WHERE preset_code IS NULL;
UPDATE system_naming_presets
SET context_mode = CASE
      WHEN include_housing THEN 'CANONICAL_HOUSING'
      WHEN include_distribution THEN 'CANONICAL_DISTRIBUTION'
      WHEN include_zone THEN 'CANONICAL_ZONE'
      ELSE 'LEGACY_INTERNAL_AREA'
    END
WHERE context_mode IS NULL;
UPDATE system_naming_presets
SET sequence_scope = CASE
      WHEN include_distribution THEN 'DISTRIBUTION'
      WHEN include_placement THEN 'PLACEMENT'
      ELSE 'BRANCH'
    END
WHERE sequence_scope IS NULL;

ALTER TABLE system_naming_presets
  ALTER COLUMN preset_code SET NOT NULL,
  ALTER COLUMN context_mode SET NOT NULL,
  ALTER COLUMN context_mode SET DEFAULT 'LEGACY_INTERNAL_AREA',
  ALTER COLUMN sequence_scope SET NOT NULL,
  ALTER COLUMN sequence_scope SET DEFAULT 'BRANCH';

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_naming_presets_preset_code
  ON system_naming_presets(preset_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_naming_presets_exact_identity
  ON system_naming_presets(id,preset_version,asset_type_code);

ALTER TABLE system_naming_presets
  ADD CONSTRAINT system_naming_presets_code_format
    CHECK(preset_code ~ '^[A-Z0-9]+(_[A-Z0-9]+)*$') NOT VALID,
  ADD CONSTRAINT system_naming_presets_context_mode_check
    CHECK(
      (context_mode='LEGACY_INTERNAL_AREA' AND NOT include_zone AND NOT include_distribution AND NOT include_housing)
      OR (context_mode='CANONICAL_ZONE' AND include_zone AND NOT include_distribution AND NOT include_housing AND NOT include_placement)
      OR (context_mode='CANONICAL_DISTRIBUTION' AND include_distribution AND NOT include_housing AND NOT include_placement)
      OR (context_mode='CANONICAL_HOUSING' AND include_housing AND NOT include_placement)
    ) NOT VALID,
  ADD CONSTRAINT system_naming_presets_sequence_scope_check
    CHECK(sequence_scope IN ('BRANCH','PLACEMENT','DISTRIBUTION')) NOT VALID,
  ADD CONSTRAINT system_naming_presets_sequence_scope_coherence
    CHECK(
      (sequence_scope='BRANCH')
      OR (sequence_scope='PLACEMENT' AND include_placement)
      OR (sequence_scope='DISTRIBUTION' AND include_distribution)
    ) NOT VALID,
  ADD CONSTRAINT system_naming_presets_housing_placement_exclusive
    CHECK(NOT (include_housing AND include_placement)) NOT VALID;

ALTER TABLE system_naming_presets VALIDATE CONSTRAINT system_naming_presets_code_format;
ALTER TABLE system_naming_presets VALIDATE CONSTRAINT system_naming_presets_context_mode_check;
ALTER TABLE system_naming_presets VALIDATE CONSTRAINT system_naming_presets_sequence_scope_check;
ALTER TABLE system_naming_presets VALIDATE CONSTRAINT system_naming_presets_sequence_scope_coherence;
ALTER TABLE system_naming_presets VALIDATE CONSTRAINT system_naming_presets_housing_placement_exclusive;

CREATE OR REPLACE FUNCTION derive_legacy_system_naming_preset_foundation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.preset_code IS NULL THEN
    NEW.preset_code := 'LEGACY_' || NEW.asset_type_code || '_V' || NEW.preset_version::text;
  END IF;
  IF NEW.context_mode='LEGACY_INTERNAL_AREA' AND NEW.include_placement
     AND NEW.sequence_scope='BRANCH' THEN
    NEW.sequence_scope := 'PLACEMENT';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_derive_legacy_system_naming_preset_foundation ON system_naming_presets;
CREATE TRIGGER trg_derive_legacy_system_naming_preset_foundation
  BEFORE INSERT ON system_naming_presets
  FOR EACH ROW EXECUTE FUNCTION derive_legacy_system_naming_preset_foundation();

CREATE OR REPLACE FUNCTION enforce_system_naming_preset_version_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.preset_code IS DISTINCT FROM OLD.preset_code
     OR NEW.asset_type_code IS DISTINCT FROM OLD.asset_type_code
     OR NEW.preset_version IS DISTINCT FROM OLD.preset_version
     OR NEW.prefix IS DISTINCT FROM OLD.prefix
     OR NEW.separator IS DISTINCT FROM OLD.separator
     OR NEW.include_branch IS DISTINCT FROM OLD.include_branch
     OR NEW.include_building IS DISTINCT FROM OLD.include_building
     OR NEW.include_floor IS DISTINCT FROM OLD.include_floor
     OR NEW.include_zone IS DISTINCT FROM OLD.include_zone
     OR NEW.include_distribution IS DISTINCT FROM OLD.include_distribution
     OR NEW.include_housing IS DISTINCT FROM OLD.include_housing
     OR NEW.include_placement IS DISTINCT FROM OLD.include_placement
     OR NEW.context_mode IS DISTINCT FROM OLD.context_mode
     OR NEW.sequence_scope IS DISTINCT FROM OLD.sequence_scope
     OR NEW.seq_digits IS DISTINCT FROM OLD.seq_digits
     OR NEW.custom_segment_1 IS DISTINCT FROM OLD.custom_segment_1
     OR NEW.custom_segment_2 IS DISTINCT FROM OLD.custom_segment_2
     OR NEW.custom_segment_1_label IS DISTINCT FROM OLD.custom_segment_1_label
     OR NEW.custom_segment_2_label IS DISTINCT FROM OLD.custom_segment_2_label
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'system_naming_preset_version_immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_system_naming_preset_version_immutability ON system_naming_presets;
CREATE TRIGGER trg_system_naming_preset_version_immutability
  BEFORE UPDATE ON system_naming_presets
  FOR EACH ROW EXECUTE FUNCTION enforce_system_naming_preset_version_immutability();

ALTER TABLE naming_rules
  ADD COLUMN IF NOT EXISTS include_floor BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS include_distribution BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS include_housing BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sequence_scope VARCHAR(24),
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(32),
  ADD COLUMN IF NOT EXISTS source_preset_id UUID,
  ADD COLUMN IF NOT EXISTS source_preset_version INTEGER,
  ADD COLUMN IF NOT EXISTS accepted_by UUID,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_by_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS customized_after_acceptance BOOLEAN;

-- The canonical migrator is intentionally NOBYPASSRLS and naming_rules uses
-- FORCE RLS. Take an exclusive transactional lock, suspend FORCE only for the
-- compatibility backfill, and restore it before constraints are installed.
-- Any failure rolls the complete state transition back.
LOCK TABLE naming_rules IN ACCESS EXCLUSIVE MODE;
ALTER TABLE naming_rules NO FORCE ROW LEVEL SECURITY;

UPDATE naming_rules
SET sequence_scope = CASE WHEN include_placement THEN 'PLACEMENT' ELSE 'BRANCH' END,
    source_type = 'LEGACY_UNATTRIBUTED',
    customized_after_acceptance = FALSE
WHERE sequence_scope IS NULL OR source_type IS NULL OR customized_after_acceptance IS NULL;

ALTER TABLE naming_rules FORCE ROW LEVEL SECURITY;

ALTER TABLE naming_rules
  ALTER COLUMN sequence_scope SET NOT NULL,
  ALTER COLUMN sequence_scope SET DEFAULT 'BRANCH',
  ALTER COLUMN source_type SET NOT NULL,
  ALTER COLUMN source_type SET DEFAULT 'LEGACY_UNATTRIBUTED',
  ALTER COLUMN customized_after_acceptance SET NOT NULL,
  ALTER COLUMN customized_after_acceptance SET DEFAULT FALSE;

ALTER TABLE naming_rules DROP CONSTRAINT IF EXISTS naming_rules_context_mode_check;
ALTER TABLE naming_rules
  ADD CONSTRAINT naming_rules_context_mode_check CHECK(
    (context_mode='LEGACY_INTERNAL_AREA' AND NOT include_zone AND NOT include_distribution AND NOT include_housing)
    OR (context_mode='CANONICAL_ZONE' AND include_zone AND NOT include_internal_area AND NOT include_distribution AND NOT include_housing AND NOT include_placement)
    OR (context_mode='CANONICAL_DISTRIBUTION' AND include_distribution AND NOT include_internal_area AND NOT include_housing AND NOT include_placement)
    OR (context_mode='CANONICAL_HOUSING' AND include_housing AND NOT include_internal_area AND NOT include_placement)
  ) NOT VALID,
  ADD CONSTRAINT naming_rules_sequence_scope_check
    CHECK(sequence_scope IN ('BRANCH','PLACEMENT','DISTRIBUTION')) NOT VALID,
  ADD CONSTRAINT naming_rules_sequence_scope_coherence CHECK(
    sequence_scope='BRANCH'
    OR (sequence_scope='PLACEMENT' AND include_placement)
    OR (sequence_scope='DISTRIBUTION' AND include_distribution)
  ) NOT VALID,
  ADD CONSTRAINT naming_rules_housing_placement_exclusive
    CHECK(NOT (include_housing AND include_placement)) NOT VALID,
  ADD CONSTRAINT naming_rules_source_type_check
    CHECK(source_type IN ('LEGACY_UNATTRIBUTED','PRESET','CUSTOM','DERIVED_FROM_PRESET')) NOT VALID,
  ADD CONSTRAINT naming_rules_provenance_coherence CHECK(
    (source_type='LEGACY_UNATTRIBUTED'
      AND source_preset_id IS NULL AND source_preset_version IS NULL
      AND accepted_by IS NULL AND accepted_at IS NULL AND accepted_by_snapshot IS NULL
      AND NOT customized_after_acceptance)
    OR
    (source_type='CUSTOM'
      AND source_preset_id IS NULL AND source_preset_version IS NULL
      AND accepted_by IS NULL AND accepted_at IS NULL AND accepted_by_snapshot IS NULL
      AND NOT customized_after_acceptance)
    OR
    (source_type='PRESET'
      AND source_preset_id IS NOT NULL AND source_preset_version IS NOT NULL
      AND accepted_at IS NOT NULL AND accepted_by_snapshot IS NOT NULL
      AND jsonb_typeof(accepted_by_snapshot)='object'
      AND accepted_by_snapshot ? 'user_id'
      AND NOT customized_after_acceptance)
    OR
    (source_type='DERIVED_FROM_PRESET'
      AND source_preset_id IS NOT NULL AND source_preset_version IS NOT NULL
      AND accepted_at IS NOT NULL AND accepted_by_snapshot IS NOT NULL
      AND jsonb_typeof(accepted_by_snapshot)='object'
      AND accepted_by_snapshot ? 'user_id'
      AND customized_after_acceptance)
  ) NOT VALID,
  ADD CONSTRAINT naming_rules_source_preset_version_positive
    CHECK(source_preset_version IS NULL OR source_preset_version > 0) NOT VALID,
  ADD CONSTRAINT naming_rules_accepted_by_fk
    FOREIGN KEY(accepted_by) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT naming_rules_exact_source_preset_fk
    FOREIGN KEY(source_preset_id,source_preset_version,asset_type_code)
    REFERENCES system_naming_presets(id,preset_version,asset_type_code) ON DELETE RESTRICT;

ALTER TABLE naming_rules VALIDATE CONSTRAINT naming_rules_context_mode_check;
ALTER TABLE naming_rules VALIDATE CONSTRAINT naming_rules_sequence_scope_check;
ALTER TABLE naming_rules VALIDATE CONSTRAINT naming_rules_sequence_scope_coherence;
ALTER TABLE naming_rules VALIDATE CONSTRAINT naming_rules_housing_placement_exclusive;
ALTER TABLE naming_rules VALIDATE CONSTRAINT naming_rules_source_type_check;
ALTER TABLE naming_rules VALIDATE CONSTRAINT naming_rules_provenance_coherence;
ALTER TABLE naming_rules VALIDATE CONSTRAINT naming_rules_source_preset_version_positive;

CREATE INDEX IF NOT EXISTS idx_naming_rules_source_preset
  ON naming_rules(source_preset_id,source_preset_version)
  WHERE source_preset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_naming_rules_accepted_by
  ON naming_rules(accepted_by) WHERE accepted_by IS NOT NULL;

CREATE OR REPLACE FUNCTION derive_legacy_naming_rule_sequence_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Pre-B1 callers do not send sequence_scope. Preserve their established
  -- include_placement counter behavior without weakening explicit V2 rules.
  IF NEW.source_type='LEGACY_UNATTRIBUTED' AND NEW.include_placement
     AND NEW.sequence_scope='BRANCH' THEN
    NEW.sequence_scope := 'PLACEMENT';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_derive_legacy_naming_rule_sequence_scope ON naming_rules;
CREATE TRIGGER trg_derive_legacy_naming_rule_sequence_scope
  BEFORE INSERT ON naming_rules
  FOR EACH ROW EXECUTE FUNCTION derive_legacy_naming_rule_sequence_scope();

CREATE OR REPLACE FUNCTION enforce_naming_rule_v2_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_preset_id IS DISTINCT FROM OLD.source_preset_id
     OR NEW.source_preset_version IS DISTINCT FROM OLD.source_preset_version
     OR (NEW.accepted_by IS DISTINCT FROM OLD.accepted_by
         AND NOT (OLD.accepted_by IS NOT NULL AND NEW.accepted_by IS NULL))
     OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
     OR NEW.accepted_by_snapshot IS DISTINCT FROM OLD.accepted_by_snapshot
     OR NEW.customized_after_acceptance IS DISTINCT FROM OLD.customized_after_acceptance THEN
    RAISE EXCEPTION 'naming_rule_provenance_immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.last_seq > 0 AND (
     NEW.include_floor IS DISTINCT FROM OLD.include_floor
     OR NEW.include_distribution IS DISTINCT FROM OLD.include_distribution
     OR NEW.include_housing IS DISTINCT FROM OLD.include_housing
     OR NEW.sequence_scope IS DISTINCT FROM OLD.sequence_scope) THEN
    RAISE EXCEPTION 'normative_version_required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_naming_rule_v2_immutability ON naming_rules;
CREATE TRIGGER trg_enforce_naming_rule_v2_immutability
  BEFORE UPDATE ON naming_rules
  FOR EACH ROW EXECUTE FUNCTION enforce_naming_rule_v2_immutability();

-- Preserve the V1 callable contract, but never project rows whose semantics the
-- V1 result shape cannot represent.
CREATE OR REPLACE FUNCTION public.read_active_system_naming_presets(
  p_asset_type_codes text[]
) RETURNS TABLE(
  asset_type_code varchar(50), preset_version integer, prefix varchar(20),
  separator varchar(5), include_branch boolean, include_placement boolean,
  seq_digits smallint
)
LANGUAGE sql STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT p.asset_type_code,p.preset_version,p.prefix,p.separator,
         p.include_branch,p.include_placement,p.seq_digits
  FROM public.system_naming_presets p
  WHERE p.active
    AND p.context_mode='LEGACY_INTERNAL_AREA'
    AND NOT p.include_building AND NOT p.include_floor AND NOT p.include_zone
    AND NOT p.include_distribution AND NOT p.include_housing
    AND p.sequence_scope=CASE WHEN p.include_placement THEN 'PLACEMENT' ELSE 'BRANCH' END
    AND pg_catalog.cardinality(p_asset_type_codes)>0
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.unnest(p_asset_type_codes) requested(code)
      WHERE pg_catalog.upper(pg_catalog.btrim(requested.code)) NOT IN
        ('MDF','IDF','RACK','SWITCH','UPS','PDU','PATCH_PANEL','NODE','BACKBONE','FIREWALL','SERVER','CCTV','AC_UNIT')
    )
    AND p.asset_type_code=ANY(ARRAY(
      SELECT pg_catalog.upper(pg_catalog.btrim(requested.code))
      FROM pg_catalog.unnest(p_asset_type_codes) requested(code)))
  ORDER BY p.asset_type_code,p.preset_version;
$function$;

ALTER FUNCTION public.read_active_system_naming_presets(text[]) OWNER TO skia_migrator;
REVOKE ALL ON FUNCTION public.read_active_system_naming_presets(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_active_system_naming_presets(text[]) FROM skia_onboarding;
GRANT EXECUTE ON FUNCTION public.read_active_system_naming_presets(text[]) TO skia_runtime;

CREATE OR REPLACE FUNCTION public.read_active_system_naming_presets_v2(
  p_asset_type_codes text[]
) RETURNS TABLE(
  id uuid, preset_code varchar(100), asset_type_code varchar(50), preset_version integer,
  prefix varchar(20), separator varchar(5), include_branch boolean,
  include_building boolean, include_floor boolean, include_zone boolean,
  include_distribution boolean, include_housing boolean, include_placement boolean,
  context_mode varchar(32), sequence_scope varchar(24), seq_digits smallint,
  custom_segment_1 varchar(50), custom_segment_2 varchar(50),
  custom_segment_1_label varchar(100), custom_segment_2_label varchar(100), description text
)
LANGUAGE sql STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT p.id,p.preset_code,p.asset_type_code,p.preset_version,p.prefix,p.separator,
         p.include_branch,p.include_building,p.include_floor,p.include_zone,
         p.include_distribution,p.include_housing,p.include_placement,
         p.context_mode,p.sequence_scope,p.seq_digits,p.custom_segment_1,
         p.custom_segment_2,p.custom_segment_1_label,p.custom_segment_2_label,p.description
  FROM public.system_naming_presets p
  WHERE p.active
    AND pg_catalog.cardinality(p_asset_type_codes)>0
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.unnest(p_asset_type_codes) requested(code)
      WHERE pg_catalog.upper(pg_catalog.btrim(requested.code)) NOT IN
        ('MDF','IDF','RACK','SWITCH','UPS','PDU','PATCH_PANEL','NODE','FIREWALL','SERVER','CCTV','AC_UNIT')
    )
    AND p.asset_type_code=ANY(ARRAY(
      SELECT pg_catalog.upper(pg_catalog.btrim(requested.code))
      FROM pg_catalog.unnest(p_asset_type_codes) requested(code)))
  ORDER BY p.asset_type_code,p.preset_version;
$function$;

ALTER FUNCTION public.read_active_system_naming_presets_v2(text[]) OWNER TO skia_migrator;
REVOKE ALL ON FUNCTION public.read_active_system_naming_presets_v2(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_active_system_naming_presets_v2(text[]) FROM skia_onboarding;
GRANT EXECUTE ON FUNCTION public.read_active_system_naming_presets_v2(text[]) TO skia_runtime;

COMMENT ON COLUMN naming_rules.source_type IS
  'Operational provenance: legacy rows remain LEGACY_UNATTRIBUTED; preset attribution is never inferred.';
COMMENT ON FUNCTION public.read_active_system_naming_presets_v2(text[]) IS
  'Fixed-projection V2 recommendation reader; presets remain non-authoritative until explicit tenant acceptance.';

DO $verification$
BEGIN
  IF EXISTS (SELECT 1 FROM system_naming_presets WHERE preset_code IN
      ('MDF_V1','IDF_V1','RACK_V1','SWITCH_V1','UPS_V1','PDU_V1','PATCH_PANEL_V1','NODE_V1','FIREWALL_V1','SERVER_V1','CCTV_V1','AC_UNIT_V1')) THEN
    RAISE EXCEPTION '036 must not activate the Phase 1.2F catalog';
  END IF;
  IF has_table_privilege('skia_runtime','public.system_naming_presets','SELECT')
     OR NOT has_function_privilege('skia_runtime','public.read_active_system_naming_presets_v2(text[])','EXECUTE') THEN
    RAISE EXCEPTION '036 secure reader privilege contract differs';
  END IF;
END
$verification$;
