-- Phase 1.2D-B3B4A: scoped write authority for canonical import staging.

CREATE OR REPLACE FUNCTION public.create_inventory_import_staging(
  p_file_name TEXT,
  p_asset_type TEXT,
  p_document_type TEXT,
  p_extraction_method TEXT,
  p_created_by UUID)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE
  v_tenant UUID;
  v_branch UUID;
  v_import_id BIGINT;
BEGIN
  v_tenant := NULLIF(current_setting('app.tenant_id',true),'')::UUID;
  v_branch := NULLIF(current_setting('app.branch_id',true),'')::UUID;
  IF v_tenant IS NULL OR v_branch IS NULL THEN
    RAISE EXCEPTION 'staging_scope_required' USING ERRCODE='42501';
  END IF;
  IF p_file_name IS NULL OR btrim(p_file_name)='' OR length(p_file_name)>255
     OR p_created_by IS NULL THEN
    RAISE EXCEPTION 'invalid_staging_header' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    JOIN public.user_tenants ut ON ut.tenant_id=b.tenant_id AND ut.user_id=p_created_by
    JOIN public.user_branches ub ON ub.branch_id=b.id AND ub.user_id=p_created_by
    JOIN public.users u ON u.id=p_created_by
    WHERE b.id=v_branch AND b.tenant_id=v_tenant
      AND COALESCE(b.status,'active')='active' AND COALESCE(u.status,'active')='active'
  ) THEN
    RAISE EXCEPTION 'not_found_or_unauthorized' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.inventory_imports(
    tenant_id,branch_id,file_name,asset_type,document_type,extraction_method,
    status,workflow_status,created_by,user_id)
  VALUES (
    v_tenant,v_branch,btrim(p_file_name),NULLIF(btrim(p_asset_type),''),
    NULLIF(btrim(p_document_type),''),NULLIF(btrim(p_extraction_method),''),
    'pending','STAGING',p_created_by,p_created_by)
  RETURNING id INTO v_import_id;
  RETURN v_import_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.stage_inventory_import_row(
  p_import_id BIGINT,
  p_row_number INTEGER,
  p_row_data JSONB,
  p_normalized_row_hash TEXT,
  p_row_state TEXT,
  p_validation_error TEXT,
  p_expected_current_hash TEXT)
RETURNS TABLE(result_code TEXT,row_id BIGINT,row_status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE
  v_tenant UUID;
  v_branch UUID;
  v_existing public.inventory_import_rows%ROWTYPE;
BEGIN
  v_tenant := NULLIF(current_setting('app.tenant_id',true),'')::UUID;
  v_branch := NULLIF(current_setting('app.branch_id',true),'')::UUID;
  IF v_tenant IS NULL OR v_branch IS NULL THEN
    RAISE EXCEPTION 'staging_scope_required' USING ERRCODE='42501';
  END IF;
  IF p_import_id IS NULL OR p_row_number IS NULL OR p_row_number<=0
     OR p_row_data IS NULL OR jsonb_typeof(p_row_data)<>'object'
     OR p_normalized_row_hash IS NULL OR p_normalized_row_hash !~ '^[0-9a-f]{64}$'
     OR (p_expected_current_hash IS NOT NULL
         AND p_expected_current_hash !~ '^[0-9a-f]{64}$')
     OR p_row_state NOT IN ('STAGED','VALID','INVALID')
     OR length(COALESCE(p_validation_error,''))>2000
     OR (p_row_state='INVALID' AND NULLIF(btrim(p_validation_error),'') IS NULL)
     OR (p_row_state<>'INVALID' AND p_validation_error IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_staging_row' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_imports i
    WHERE i.id=p_import_id AND i.tenant_id=v_tenant AND i.branch_id=v_branch
      AND i.status IN ('pending','processing','validated')
  ) THEN
    RETURN QUERY SELECT 'NOT_FOUND_OR_UNAUTHORIZED',NULL::BIGINT,NULL::TEXT;
    RETURN;
  END IF;

  -- Serialize the durable (import_id,row_number) identity before insert/update.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_import_id::TEXT||':'||p_row_number::TEXT,0));
  SELECT r.* INTO v_existing
  FROM public.inventory_import_rows r
  WHERE r.import_id=p_import_id AND r.row_number=p_row_number
    AND r.tenant_id=v_tenant AND r.branch_id=v_branch
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status IN ('COMMITTING','COMMITTED')
       OR v_existing.status NOT IN ('STAGED','VALID','INVALID') THEN
      RETURN QUERY SELECT 'RESTAGE_DENIED',v_existing.id,v_existing.status::TEXT;
      RETURN;
    END IF;
    IF v_existing.normalized_row_hash=p_normalized_row_hash
       AND v_existing.data=p_row_data
       AND v_existing.status=p_row_state
       AND v_existing.error_message IS NOT DISTINCT FROM p_validation_error THEN
      RETURN QUERY SELECT 'ROW_UNCHANGED',v_existing.id,v_existing.status::TEXT;
      RETURN;
    END IF;
    IF v_existing.normalized_row_hash=p_normalized_row_hash
       AND v_existing.data<>p_row_data THEN
      RETURN QUERY SELECT 'HASH_CONFLICT',v_existing.id,v_existing.status::TEXT;
      RETURN;
    END IF;
    -- Revalidation is compare-and-swap.  A caller may replace content only
    -- when it names the exact durable hash that it previously observed.
    -- Concurrent writers that observed the same version therefore produce
    -- one winner and one controlled conflict instead of last-writer-wins.
    IF p_expected_current_hash IS NULL
       OR p_expected_current_hash<>v_existing.normalized_row_hash THEN
      RETURN QUERY SELECT 'ROW_CONTENT_CONFLICT',v_existing.id,v_existing.status::TEXT;
      RETURN;
    END IF;
    UPDATE public.inventory_import_rows r
    SET data=p_row_data,normalized_row_hash=p_normalized_row_hash,
        status=p_row_state,error_message=p_validation_error,
        last_error_code=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE r.id=v_existing.id
    RETURNING r.id,r.status::TEXT INTO row_id,row_status;
    result_code := 'ROW_RESTAGED';
    UPDATE public.inventory_imports i
    SET status='processing',workflow_status='STAGING',updated_at=CURRENT_TIMESTAMP
    WHERE i.id=p_import_id AND i.tenant_id=v_tenant AND i.branch_id=v_branch;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.inventory_import_rows(
    import_id,tenant_id,branch_id,row_number,status,data,error_message,normalized_row_hash)
  VALUES (p_import_id,v_tenant,v_branch,p_row_number,p_row_state,p_row_data,
          p_validation_error,p_normalized_row_hash)
  RETURNING id,status::TEXT INTO row_id,row_status;
  result_code := 'ROW_STAGED';
  UPDATE public.inventory_imports i
  SET status='processing',workflow_status='STAGING',updated_at=CURRENT_TIMESTAMP
  WHERE i.id=p_import_id AND i.tenant_id=v_tenant AND i.branch_id=v_branch;
  RETURN NEXT;
END $fn$;

CREATE OR REPLACE FUNCTION public.update_inventory_import_progress(
  p_import_id BIGINT,
  p_total_items INTEGER,
  p_valid_items INTEGER,
  p_items_with_errors INTEGER,
  p_items_with_warnings INTEGER)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_tenant UUID; v_branch UUID;
BEGIN
  v_tenant := NULLIF(current_setting('app.tenant_id',true),'')::UUID;
  v_branch := NULLIF(current_setting('app.branch_id',true),'')::UUID;
  IF v_tenant IS NULL OR v_branch IS NULL THEN
    RAISE EXCEPTION 'staging_scope_required' USING ERRCODE='42501';
  END IF;
  IF p_total_items IS NULL OR p_valid_items IS NULL OR p_items_with_errors IS NULL
     OR p_items_with_warnings IS NULL
     OR p_total_items<0 OR p_valid_items<0 OR p_items_with_errors<0 OR p_items_with_warnings<0
     OR p_valid_items+p_items_with_errors+p_items_with_warnings>p_total_items THEN
    RAISE EXCEPTION 'invalid_import_progress' USING ERRCODE='22023';
  END IF;
  UPDATE public.inventory_imports i
  SET total_items=p_total_items,valid_items=p_valid_items,
      items_with_errors=p_items_with_errors,items_with_warnings=p_items_with_warnings,
      status='processing',workflow_status='STAGING',updated_at=CURRENT_TIMESTAMP
  WHERE i.id=p_import_id AND i.tenant_id=v_tenant AND i.branch_id=v_branch
    AND i.status IN ('pending','processing');
  IF NOT FOUND THEN RETURN 'NOT_FOUND_OR_UNAUTHORIZED'; END IF;
  RETURN 'PROGRESS_UPDATED';
END $fn$;

CREATE OR REPLACE FUNCTION public.finalize_inventory_import_staging(p_import_id BIGINT)
RETURNS TABLE(result_code TEXT,aggregate_state TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE
  v_tenant UUID; v_branch UUID; v_total INTEGER; v_valid INTEGER; v_invalid INTEGER;
BEGIN
  v_tenant := NULLIF(current_setting('app.tenant_id',true),'')::UUID;
  v_branch := NULLIF(current_setting('app.branch_id',true),'')::UUID;
  IF v_tenant IS NULL OR v_branch IS NULL THEN
    RAISE EXCEPTION 'staging_scope_required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.inventory_imports i
  WHERE i.id=p_import_id AND i.tenant_id=v_tenant AND i.branch_id=v_branch
    AND i.status IN ('pending','processing','validated') FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND_OR_UNAUTHORIZED',NULL::TEXT;
    RETURN;
  END IF;
  SELECT count(*)::INTEGER,count(*) FILTER(WHERE status='VALID')::INTEGER,
         count(*) FILTER(WHERE status='INVALID')::INTEGER
  INTO v_total,v_valid,v_invalid
  FROM public.inventory_import_rows
  WHERE import_id=p_import_id AND tenant_id=v_tenant AND branch_id=v_branch;
  IF v_total=0 OR EXISTS (
    SELECT 1 FROM public.inventory_import_rows
    WHERE import_id=p_import_id AND tenant_id=v_tenant AND branch_id=v_branch
      AND status NOT IN ('VALID','INVALID')) THEN
    RETURN QUERY SELECT 'STAGING_INCOMPLETE','STAGING'::TEXT;
    RETURN;
  END IF;
  UPDATE public.inventory_imports
  SET total_items=v_total,valid_items=v_valid,items_with_errors=v_invalid,
      items_with_warnings=0,status='validated',workflow_status='READY',updated_at=CURRENT_TIMESTAMP
  WHERE id=p_import_id AND tenant_id=v_tenant AND branch_id=v_branch;
  RETURN QUERY SELECT 'STAGING_FINALIZED','READY'::TEXT;
END $fn$;

ALTER FUNCTION public.create_inventory_import_staging(TEXT,TEXT,TEXT,TEXT,UUID) OWNER TO skia_migrator;
ALTER FUNCTION public.stage_inventory_import_row(BIGINT,INTEGER,JSONB,TEXT,TEXT,TEXT,TEXT) OWNER TO skia_migrator;
ALTER FUNCTION public.update_inventory_import_progress(BIGINT,INTEGER,INTEGER,INTEGER,INTEGER) OWNER TO skia_migrator;
ALTER FUNCTION public.finalize_inventory_import_staging(BIGINT) OWNER TO skia_migrator;

REVOKE ALL ON FUNCTION public.create_inventory_import_staging(TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stage_inventory_import_row(BIGINT,INTEGER,JSONB,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_inventory_import_progress(BIGINT,INTEGER,INTEGER,INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_inventory_import_staging(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_inventory_import_staging(TEXT,TEXT,TEXT,TEXT,UUID) TO skia_runtime;
GRANT EXECUTE ON FUNCTION public.stage_inventory_import_row(BIGINT,INTEGER,JSONB,TEXT,TEXT,TEXT,TEXT) TO skia_runtime;
GRANT EXECUTE ON FUNCTION public.update_inventory_import_progress(BIGINT,INTEGER,INTEGER,INTEGER,INTEGER) TO skia_runtime;
GRANT EXECUTE ON FUNCTION public.finalize_inventory_import_staging(BIGINT) TO skia_runtime;
