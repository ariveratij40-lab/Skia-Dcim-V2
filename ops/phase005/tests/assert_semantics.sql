\set ON_ERROR_STOP on

BEGIN;
SET LOCAL ROLE skia_runtime;

DO $tests$
DECLARE n integer; denied boolean;
BEGIN
  SELECT count(*) INTO n FROM assets;
  IF n <> 0 THEN RAISE EXCEPTION 'no-context assets fail-closed failed: %',n; END IF;
  SELECT count(*) INTO n FROM asset_logs;
  IF n <> 0 THEN RAISE EXCEPTION 'no-context logs fail-closed failed: %',n; END IF;
  SELECT count(*) INTO n FROM asset_relationships;
  IF n <> 0 THEN RAISE EXCEPTION 'no-context relationships fail-closed failed: %',n; END IF;

  PERFORM set_config('app.tenant_id','20000000-0000-4000-8000-00000000000a',true);
  PERFORM set_config('app.branch_id','30000000-0000-4000-8000-0000000000a1',true);
  SELECT count(*) INTO n FROM assets;
  IF n <> 2 THEN RAISE EXCEPTION 'A/A1 asset visibility failed: %',n; END IF;
  SELECT count(*) INTO n FROM asset_logs;
  IF n <> 1 THEN RAISE EXCEPTION 'A/A1 inherited log visibility failed: %',n; END IF;
  SELECT count(*) INTO n FROM asset_relationships;
  IF n <> 1 THEN RAISE EXCEPTION 'A/A1 both-endpoint relationship visibility failed: %',n; END IF;

  denied := false;
  BEGIN
    INSERT INTO asset_logs VALUES
      ('40000000-0000-4000-8000-0000000000f1','20000000-0000-4000-8000-00000000000a',
       '10000000-0000-4000-8000-0000000000a3','must fail');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'cross-branch log write was allowed'; END IF;

  denied := false;
  BEGIN
    INSERT INTO asset_relationships VALUES
      ('50000000-0000-4000-8000-0000000000f1','20000000-0000-4000-8000-00000000000a',
       '10000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a3','must fail');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'cross-branch relationship write was allowed'; END IF;

  denied := false;
  BEGIN
    UPDATE assets SET branch_id='30000000-0000-4000-8000-0000000000a2'
    WHERE id='10000000-0000-4000-8000-0000000000a1';
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'cross-branch asset update was allowed'; END IF;

  INSERT INTO asset_relationships VALUES
    ('50000000-0000-4000-8000-0000000000f2','20000000-0000-4000-8000-00000000000a',
     '10000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a2','allowed');

  PERFORM set_config('app.branch_id','30000000-0000-4000-8000-0000000000a2',true);
  SELECT count(*) INTO n FROM assets;
  IF n <> 1 THEN RAISE EXCEPTION 'A/A2 asset visibility failed: %',n; END IF;
  SELECT count(*) INTO n FROM asset_logs;
  IF n <> 1 THEN RAISE EXCEPTION 'A/A2 log visibility failed: %',n; END IF;
  SELECT count(*) INTO n FROM asset_relationships;
  IF n <> 0 THEN RAISE EXCEPTION 'A/A2 relationship isolation failed: %',n; END IF;

  PERFORM set_config('app.branch_scope_all','true',true);
  SELECT count(*) INTO n FROM assets;
  IF n <> 3 THEN RAISE EXCEPTION 'tenant-wide assets failed: %',n; END IF;
  SELECT count(*) INTO n FROM asset_logs;
  IF n <> 2 THEN RAISE EXCEPTION 'tenant-wide logs failed: %',n; END IF;
  SELECT count(*) INTO n FROM asset_relationships;
  IF n <> 3 THEN RAISE EXCEPTION 'tenant-wide relationships failed: %',n; END IF;

  PERFORM set_config('app.tenant_id','20000000-0000-4000-8000-00000000000b',true);
  PERFORM set_config('app.branch_id','30000000-0000-4000-8000-0000000000b1',true);
  PERFORM set_config('app.branch_scope_all','false',true);
  SELECT count(*) INTO n FROM assets;
  IF n <> 1 THEN RAISE EXCEPTION 'Tenant B assets failed: %',n; END IF;
  SELECT count(*) INTO n FROM asset_logs;
  IF n <> 1 THEN RAISE EXCEPTION 'Tenant B logs failed: %',n; END IF;
  SELECT count(*) INTO n FROM asset_relationships;
  IF n <> 0 THEN RAISE EXCEPTION 'cross-tenant relationship leaked: %',n; END IF;
END $tests$;

ROLLBACK;
