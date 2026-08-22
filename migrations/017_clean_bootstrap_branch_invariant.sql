-- PHASE-010 prerequisite for composite tenant/branch foreign keys.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.oid = 'public.branches'::regclass
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) = 'UNIQUE (id, tenant_id)'
  ) THEN
    ALTER TABLE branches ADD CONSTRAINT uq_branches_id_tenant UNIQUE (id, tenant_id);
  END IF;
END $$;
