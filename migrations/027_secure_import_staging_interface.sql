-- Phase 1.2D-B3B2: scoped staging authority without direct runtime table access.
ALTER TABLE public.inventory_import_rows
  ADD COLUMN IF NOT EXISTS normalized_row_hash TEXT,
  ADD COLUMN IF NOT EXISTS canonical_asset_id UUID,
  ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS commit_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.inventory_import_rows
  DROP CONSTRAINT IF EXISTS check_status;
ALTER TABLE public.inventory_import_rows
  ADD CONSTRAINT check_status CHECK (status IN (
    'pending','valid','error','duplicate','skipped','processed','validated','imported','rejected',
    'STAGED','VALID','INVALID','COMMITTING','COMMITTED','FAILED')),
  ADD CONSTRAINT inventory_import_rows_commit_attempts_nonnegative CHECK (commit_attempts >= 0),
  ADD CONSTRAINT inventory_import_rows_commit_hash_required CHECK (
    status NOT IN ('COMMITTING','COMMITTED') OR normalized_row_hash IS NOT NULL),
  ADD CONSTRAINT inventory_import_rows_committed_shape CHECK (
    (status = 'COMMITTED' AND canonical_asset_id IS NOT NULL AND committed_at IS NOT NULL)
    OR (status <> 'COMMITTED' AND canonical_asset_id IS NULL AND committed_at IS NULL)),
  ADD CONSTRAINT inventory_import_rows_canonical_asset_fk
    FOREIGN KEY (canonical_asset_id) REFERENCES public.assets(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.enforce_committing_import_row_hash_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
  IF OLD.status IN ('COMMITTING','COMMITTED')
     AND NEW.normalized_row_hash IS DISTINCT FROM OLD.normalized_row_hash THEN
    RAISE EXCEPTION 'committing_import_row_hash_immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
ALTER FUNCTION public.enforce_committing_import_row_hash_immutable() OWNER TO skia_migrator;
REVOKE ALL ON FUNCTION public.enforce_committing_import_row_hash_immutable() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_committing_import_row_hash_immutable ON public.inventory_import_rows;
CREATE TRIGGER trg_committing_import_row_hash_immutable
  BEFORE UPDATE OF normalized_row_hash ON public.inventory_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.enforce_committing_import_row_hash_immutable();

CREATE OR REPLACE FUNCTION public.validate_import_row_for_commit(
  p_import_id BIGINT, p_row_id BIGINT, p_tenant_id UUID, p_branch_id UUID)
RETURNS TABLE(result_code TEXT,row_status TEXT,row_data JSONB,canonical_asset_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT CASE WHEN r.status IN ('valid','validated','VALID') AND r.normalized_row_hash IS NOT NULL
              THEN 'READY_FOR_COMMIT' ELSE 'INVALID_STATE' END,
         r.status,r.data,r.canonical_asset_id
  FROM public.inventory_import_rows r
  JOIN public.inventory_imports i ON i.id=r.import_id AND i.tenant_id=r.tenant_id AND i.branch_id=r.branch_id
  WHERE r.import_id=p_import_id AND r.id=p_row_id
    AND r.tenant_id=p_tenant_id AND r.branch_id=p_branch_id;
$fn$;

CREATE OR REPLACE FUNCTION public.claim_import_row_for_commit(
  p_import_id BIGINT, p_row_id BIGINT, p_tenant_id UUID, p_branch_id UUID,
  p_expected_normalized_row_hash TEXT)
RETURNS TABLE(result_code TEXT,row_status TEXT,row_data JSONB,canonical_asset_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v public.inventory_import_rows%ROWTYPE;
BEGIN
  SELECT r.* INTO v FROM public.inventory_import_rows r
  JOIN public.inventory_imports i ON i.id=r.import_id AND i.tenant_id=r.tenant_id AND i.branch_id=r.branch_id
  WHERE r.import_id=p_import_id AND r.id=p_row_id
    AND r.tenant_id=p_tenant_id AND r.branch_id=p_branch_id FOR UPDATE OF r;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND_OR_UNAUTHORIZED',NULL::TEXT,NULL::JSONB,NULL::UUID; RETURN; END IF;
  IF v.status='COMMITTED' THEN RETURN QUERY SELECT 'ALREADY_COMMITTED',v.status::TEXT,v.data,v.canonical_asset_id; RETURN; END IF;
  IF v.status NOT IN ('valid','validated','VALID') OR v.normalized_row_hash IS NULL
     OR p_expected_normalized_row_hash IS NULL
     OR v.normalized_row_hash IS DISTINCT FROM p_expected_normalized_row_hash THEN
    RETURN QUERY SELECT 'INVALID_STATE',v.status::TEXT,v.data,NULL::UUID; RETURN;
  END IF;
  UPDATE public.inventory_import_rows SET status='COMMITTING',commit_attempts=commit_attempts+1,
    last_error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=v.id;
  RETURN QUERY SELECT 'READY_FOR_COMMIT','COMMITTING'::TEXT,v.data,NULL::UUID;
END $fn$;

CREATE OR REPLACE FUNCTION public.complete_import_row_commit(
  p_import_id BIGINT,p_row_id BIGINT,p_tenant_id UUID,p_branch_id UUID,p_canonical_asset_id UUID)
RETURNS TABLE(result_code TEXT,row_status TEXT,canonical_asset_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.assets a WHERE a.id=p_canonical_asset_id AND a.tenant_id=p_tenant_id AND a.branch_id=p_branch_id) THEN
    RETURN QUERY SELECT 'NOT_FOUND_OR_UNAUTHORIZED',NULL::TEXT,NULL::UUID; RETURN;
  END IF;
  UPDATE public.inventory_import_rows r SET status='COMMITTED',canonical_asset_id=p_canonical_asset_id,
    committed_at=CURRENT_TIMESTAMP,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP
  FROM public.inventory_imports i WHERE r.id=p_row_id AND r.import_id=p_import_id
    AND r.tenant_id=p_tenant_id AND r.branch_id=p_branch_id
    AND i.id=r.import_id AND i.tenant_id=r.tenant_id AND i.branch_id=r.branch_id
    AND r.status='COMMITTING';
  IF NOT FOUND THEN RETURN QUERY SELECT 'INVALID_STATE',NULL::TEXT,NULL::UUID; RETURN; END IF;
  RETURN QUERY SELECT 'COMMITTED','COMMITTED'::TEXT,p_canonical_asset_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.fail_import_row_commit(
  p_import_id BIGINT,p_row_id BIGINT,p_tenant_id UUID,p_branch_id UUID,p_error_code TEXT)
RETURNS TABLE(result_code TEXT,row_status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
  IF p_error_code IS NULL OR p_error_code !~ '^[A-Z0-9_]{1,64}$' THEN
    RETURN QUERY SELECT 'INVALID_ERROR_CODE',NULL::TEXT; RETURN;
  END IF;
  UPDATE public.inventory_import_rows r SET status='FAILED',last_error_code=p_error_code,
    updated_at=CURRENT_TIMESTAMP FROM public.inventory_imports i
  WHERE r.id=p_row_id AND r.import_id=p_import_id AND r.tenant_id=p_tenant_id AND r.branch_id=p_branch_id
    AND i.id=r.import_id AND i.tenant_id=r.tenant_id AND i.branch_id=r.branch_id AND r.status='COMMITTING';
  IF NOT FOUND THEN RETURN QUERY SELECT 'INVALID_STATE',NULL::TEXT; RETURN; END IF;
  RETURN QUERY SELECT 'FAILED_RETRYABLE','FAILED'::TEXT;
END $fn$;

CREATE OR REPLACE FUNCTION public.recompute_inventory_import_state(
  p_import_id BIGINT,p_tenant_id UUID,p_branch_id UUID)
RETURNS TABLE(result_code TEXT,aggregate_state TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE total_count BIGINT; committed_count BIGINT; failed_count BIGINT; next_state TEXT; stored_status TEXT;
BEGIN
  PERFORM 1 FROM public.inventory_imports i WHERE i.id=p_import_id AND i.tenant_id=p_tenant_id AND i.branch_id=p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND_OR_UNAUTHORIZED',NULL::TEXT; RETURN; END IF;
  SELECT count(*),count(*) FILTER(WHERE status='COMMITTED'),count(*) FILTER(WHERE status IN ('INVALID','FAILED','error','rejected'))
    INTO total_count,committed_count,failed_count FROM public.inventory_import_rows
    WHERE import_id=p_import_id AND tenant_id=p_tenant_id AND branch_id=p_branch_id;
  IF total_count>0 AND committed_count=total_count THEN next_state:='COMPLETED'; stored_status:='completed';
  ELSIF committed_count>0 AND failed_count>0 THEN next_state:='PARTIAL'; stored_status:='completed';
  ELSIF total_count>0 AND committed_count=0 AND failed_count=total_count THEN next_state:='FAILED'; stored_status:='failed';
  ELSE next_state:='READY'; stored_status:='validated'; END IF;
  UPDATE public.inventory_imports SET status=stored_status,workflow_status=next_state,updated_at=CURRENT_TIMESTAMP
    WHERE id=p_import_id AND tenant_id=p_tenant_id AND branch_id=p_branch_id;
  RETURN QUERY SELECT 'STATE_RECOMPUTED',next_state;
END $fn$;

ALTER FUNCTION public.validate_import_row_for_commit(BIGINT,BIGINT,UUID,UUID) OWNER TO skia_migrator;
ALTER FUNCTION public.claim_import_row_for_commit(BIGINT,BIGINT,UUID,UUID,TEXT) OWNER TO skia_migrator;
ALTER FUNCTION public.complete_import_row_commit(BIGINT,BIGINT,UUID,UUID,UUID) OWNER TO skia_migrator;
ALTER FUNCTION public.fail_import_row_commit(BIGINT,BIGINT,UUID,UUID,TEXT) OWNER TO skia_migrator;
ALTER FUNCTION public.recompute_inventory_import_state(BIGINT,UUID,UUID) OWNER TO skia_migrator;

REVOKE ALL ON FUNCTION public.validate_import_row_for_commit(BIGINT,BIGINT,UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_import_row_for_commit(BIGINT,BIGINT,UUID,UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_import_row_commit(BIGINT,BIGINT,UUID,UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_import_row_commit(BIGINT,BIGINT,UUID,UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_inventory_import_state(BIGINT,UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_import_row_for_commit(BIGINT,BIGINT,UUID,UUID) TO skia_runtime;
GRANT EXECUTE ON FUNCTION public.claim_import_row_for_commit(BIGINT,BIGINT,UUID,UUID,TEXT) TO skia_runtime;
GRANT EXECUTE ON FUNCTION public.complete_import_row_commit(BIGINT,BIGINT,UUID,UUID,UUID) TO skia_runtime;
GRANT EXECUTE ON FUNCTION public.fail_import_row_commit(BIGINT,BIGINT,UUID,UUID,TEXT) TO skia_runtime;
GRANT EXECUTE ON FUNCTION public.recompute_inventory_import_state(BIGINT,UUID,UUID) TO skia_runtime;
