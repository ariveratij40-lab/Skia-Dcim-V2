-- Phase 1.2D-B3B5A: make secure import completion compatible with FORCE RLS.
-- The canonical bootstrap executes each migration with psql -1, so all DDL
-- below and the ledger write share one transaction.

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='public.assets'::pg_catalog.regclass
      AND conname='assets_import_commit_scope_key'
  ) THEN
    ALTER TABLE public.assets
      ADD CONSTRAINT assets_import_commit_scope_key
      UNIQUE (id,tenant_id,branch_id);
  END IF;
END $migration$;

ALTER TABLE public.inventory_import_rows
  DROP CONSTRAINT IF EXISTS inventory_import_rows_canonical_asset_fk;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='public.inventory_import_rows'::pg_catalog.regclass
      AND conname='inventory_import_rows_canonical_asset_scope_fk'
  ) THEN
    ALTER TABLE public.inventory_import_rows
      ADD CONSTRAINT inventory_import_rows_canonical_asset_scope_fk
      FOREIGN KEY (canonical_asset_id,tenant_id,branch_id)
      REFERENCES public.assets(id,tenant_id,branch_id)
      ON DELETE RESTRICT;
  END IF;
END $migration$;

REVOKE ALL ON FUNCTION public.complete_import_row_commit(BIGINT,BIGINT,UUID,UUID,UUID) FROM PUBLIC,skia_runtime;
DROP FUNCTION public.complete_import_row_commit(BIGINT,BIGINT,UUID,UUID,UUID);

CREATE FUNCTION public.complete_import_row_commit(
  p_import_id BIGINT,
  p_row_id BIGINT,
  p_tenant_id UUID,
  p_branch_id UUID,
  p_expected_normalized_row_hash TEXT,
  p_canonical_asset_id UUID)
RETURNS TABLE(result_code TEXT,row_status TEXT,canonical_asset_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v public.inventory_import_rows%ROWTYPE;
BEGIN
  IF p_expected_normalized_row_hash IS NULL
     OR p_expected_normalized_row_hash !~ '^[0-9a-f]{64}$'
     OR p_canonical_asset_id IS NULL THEN
    RETURN QUERY SELECT 'INVALID_ARGUMENT',NULL::TEXT,NULL::UUID;
    RETURN;
  END IF;

  SELECT r.* INTO v
  FROM public.inventory_import_rows r
  JOIN public.inventory_imports i
    ON i.id=r.import_id AND i.tenant_id=r.tenant_id AND i.branch_id=r.branch_id
  WHERE r.id=p_row_id AND r.import_id=p_import_id
    AND r.tenant_id=p_tenant_id AND r.branch_id=p_branch_id
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND_OR_UNAUTHORIZED',NULL::TEXT,NULL::UUID;
    RETURN;
  END IF;
  IF v.status<>'COMMITTING' THEN
    RETURN QUERY SELECT 'INVALID_STATE',v.status::TEXT,v.canonical_asset_id;
    RETURN;
  END IF;
  IF v.normalized_row_hash IS DISTINCT FROM p_expected_normalized_row_hash THEN
    RETURN QUERY SELECT 'HASH_MISMATCH',v.status::TEXT,NULL::UUID;
    RETURN;
  END IF;

  -- The composite FK is the asset existence and exact tenant/branch scope
  -- authority. No SELECT through the RLS-incompatible definer is necessary.
  UPDATE public.inventory_import_rows r
  SET status='COMMITTED',canonical_asset_id=p_canonical_asset_id,
      committed_at=CURRENT_TIMESTAMP,last_error_code=NULL,
      updated_at=CURRENT_TIMESTAMP
  WHERE r.id=v.id;

  RETURN QUERY SELECT 'COMMITTED','COMMITTED'::TEXT,p_canonical_asset_id;
END $fn$;

ALTER FUNCTION public.complete_import_row_commit(BIGINT,BIGINT,UUID,UUID,TEXT,UUID)
  OWNER TO skia_migrator;
REVOKE ALL ON FUNCTION public.complete_import_row_commit(BIGINT,BIGINT,UUID,UUID,TEXT,UUID)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_import_row_commit(BIGINT,BIGINT,UUID,UUID,TEXT,UUID)
  TO skia_runtime;
