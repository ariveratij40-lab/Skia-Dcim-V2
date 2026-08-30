-- Phase 1.2D-B3B3: minimum scoped interface for the import commit coordinator.
CREATE OR REPLACE FUNCTION public.list_import_rows_for_commit(
  p_import_id BIGINT, p_tenant_id UUID, p_branch_id UUID)
RETURNS TABLE(
  result_code TEXT,
  row_id BIGINT,
  row_number INTEGER,
  row_status TEXT,
  normalized_row_hash TEXT,
  row_data JSONB,
  canonical_asset_id UUID)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_imports i
    WHERE i.id=p_import_id
      AND i.tenant_id=p_tenant_id
      AND i.branch_id=p_branch_id
      AND i.status IN ('validated','completed','imported','approved')
  ) THEN
    RETURN QUERY SELECT 'NOT_FOUND_OR_UNAUTHORIZED',NULL::BIGINT,NULL::INTEGER,
      NULL::TEXT,NULL::TEXT,NULL::JSONB,NULL::UUID;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT 'IMPORT_ROW',r.id,r.row_number,r.status::TEXT,r.normalized_row_hash,
      r.data,r.canonical_asset_id
    FROM public.inventory_import_rows r
    WHERE r.import_id=p_import_id
      AND r.tenant_id=p_tenant_id
      AND r.branch_id=p_branch_id
    ORDER BY r.row_number,r.id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'IMPORT_EMPTY',NULL::BIGINT,NULL::INTEGER,
      NULL::TEXT,NULL::TEXT,NULL::JSONB,NULL::UUID;
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.fail_import_row_after_rollback(
  p_import_id BIGINT,
  p_row_id BIGINT,
  p_tenant_id UUID,
  p_branch_id UUID,
  p_expected_normalized_row_hash TEXT,
  p_error_code TEXT)
RETURNS TABLE(result_code TEXT,row_status TEXT,commit_attempts INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v public.inventory_import_rows%ROWTYPE;
BEGIN
  IF p_error_code IS NULL OR p_error_code !~ '^[A-Z0-9_]{1,64}$' THEN
    RETURN QUERY SELECT 'INVALID_ERROR_CODE',NULL::TEXT,NULL::INTEGER;
    RETURN;
  END IF;

  SELECT r.* INTO v
  FROM public.inventory_import_rows r
  JOIN public.inventory_imports i
    ON i.id=r.import_id AND i.tenant_id=r.tenant_id AND i.branch_id=r.branch_id
  WHERE r.import_id=p_import_id
    AND r.id=p_row_id
    AND r.tenant_id=p_tenant_id
    AND r.branch_id=p_branch_id
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND_OR_UNAUTHORIZED',NULL::TEXT,NULL::INTEGER;
    RETURN;
  END IF;
  IF v.status='COMMITTED' OR v.status NOT IN ('valid','validated','VALID') THEN
    RETURN QUERY SELECT 'INVALID_STATE',v.status::TEXT,v.commit_attempts;
    RETURN;
  END IF;
  IF v.normalized_row_hash IS NULL OR p_expected_normalized_row_hash IS NULL
     OR v.normalized_row_hash IS DISTINCT FROM p_expected_normalized_row_hash THEN
    RETURN QUERY SELECT 'HASH_MISMATCH',v.status::TEXT,v.commit_attempts;
    RETURN;
  END IF;

  UPDATE public.inventory_import_rows r
  SET status='FAILED',last_error_code=p_error_code,
      commit_attempts=r.commit_attempts+1,updated_at=CURRENT_TIMESTAMP
  WHERE r.id=v.id
  RETURNING r.status::TEXT,r.commit_attempts
  INTO row_status,commit_attempts;
  result_code:='FAILED_RECORDED';
  RETURN NEXT;
END $fn$;

ALTER FUNCTION public.list_import_rows_for_commit(BIGINT,UUID,UUID) OWNER TO skia_migrator;
ALTER FUNCTION public.fail_import_row_after_rollback(BIGINT,BIGINT,UUID,UUID,TEXT,TEXT) OWNER TO skia_migrator;

REVOKE ALL ON FUNCTION public.list_import_rows_for_commit(BIGINT,UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_import_row_after_rollback(BIGINT,BIGINT,UUID,UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_import_rows_for_commit(BIGINT,UUID,UUID) TO skia_runtime;
GRANT EXECUTE ON FUNCTION public.fail_import_row_after_rollback(BIGINT,BIGINT,UUID,UUID,TEXT,TEXT) TO skia_runtime;
