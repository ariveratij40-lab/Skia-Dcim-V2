-- INV-ASSET-NOM-006/007: first-rule creation and immutable issued norms.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='naming_rules'::regclass
      AND conname='naming_rules_seq_digits_range'
  ) THEN
    ALTER TABLE naming_rules
      ADD CONSTRAINT naming_rules_seq_digits_range
      CHECK (seq_digits BETWEEN 2 AND 6) NOT VALID;
  END IF;
END $$;
ALTER TABLE naming_rules VALIDATE CONSTRAINT naming_rules_seq_digits_range;

CREATE OR REPLACE FUNCTION enforce_naming_rule_normative_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.last_seq <> 0 THEN
    RAISE EXCEPTION 'naming_rule_sequence_must_start_at_zero' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.asset_type_code IS DISTINCT FROM OLD.asset_type_code THEN
      RAISE EXCEPTION 'naming_rule_scope_immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.last_seq < OLD.last_seq THEN
      RAISE EXCEPTION 'naming_rule_sequence_cannot_decrease' USING ERRCODE='23514';
    END IF;
    IF OLD.last_seq > 0 AND (
      NEW.prefix IS DISTINCT FROM OLD.prefix OR
      NEW.separator IS DISTINCT FROM OLD.separator OR
      NEW.include_branch IS DISTINCT FROM OLD.include_branch OR
      NEW.include_location IS DISTINCT FROM OLD.include_location OR
      NEW.seq_digits IS DISTINCT FROM OLD.seq_digits OR
      NEW.reset_per_location IS DISTINCT FROM OLD.reset_per_location OR
      NEW.custom_segment_1 IS DISTINCT FROM OLD.custom_segment_1 OR
      NEW.custom_segment_2 IS DISTINCT FROM OLD.custom_segment_2 OR
      NEW.custom_segment_1_label IS DISTINCT FROM OLD.custom_segment_1_label OR
      NEW.custom_segment_2_label IS DISTINCT FROM OLD.custom_segment_2_label
    ) THEN
      RAISE EXCEPTION 'normative_version_required' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_naming_rule_normative_history ON naming_rules;
CREATE TRIGGER trg_enforce_naming_rule_normative_history
  BEFORE INSERT OR UPDATE ON naming_rules
  FOR EACH ROW EXECUTE FUNCTION enforce_naming_rule_normative_history();
