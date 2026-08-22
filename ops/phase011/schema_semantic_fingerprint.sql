\set ON_ERROR_STOP on
WITH objects(category, definition) AS (
  SELECT 'columns', concat_ws('|', table_name, ordinal_position, column_name,
    data_type, udt_schema, udt_name, is_nullable, coalesce(column_default,''),
    is_identity, identity_generation, is_generated, generation_expression)
  FROM information_schema.columns WHERE table_schema='public'
  UNION ALL
  SELECT 'constraints', concat_ws('|', t.relname, c.conname, c.contype,
    pg_get_constraintdef(c.oid, true), c.condeferrable, c.condeferred, c.convalidated)
  FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'
  UNION ALL
  SELECT 'indexes', concat_ws('|', tablename, indexname, indexdef)
  FROM pg_indexes WHERE schemaname='public'
  UNION ALL
  SELECT 'sequences', concat_ws('|', sequencename, data_type, start_value,
    min_value, max_value, increment_by, cycle, cache_size)
  FROM pg_sequences WHERE schemaname='public'
  UNION ALL
  SELECT 'extensions', concat_ws('|', extname, extversion)
  FROM pg_extension WHERE extname <> 'plpgsql'
  UNION ALL
  SELECT 'functions', concat_ws('|', p.proname, pg_get_function_identity_arguments(p.oid),
    pg_get_function_result(p.oid), pg_get_functiondef(p.oid))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  UNION ALL
  SELECT 'triggers', concat_ws('|', c.relname, t.tgname, pg_get_triggerdef(t.oid, true))
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
  UNION ALL
  SELECT 'rls', concat_ws('|', c.relname, c.relrowsecurity, c.relforcerowsecurity)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
  UNION ALL
  SELECT 'policies', concat_ws('|', tablename, policyname, permissive, roles::text,
    cmd, coalesce(qual,''), coalesce(with_check,''))
  FROM pg_policies WHERE schemaname='public'
  UNION ALL
  SELECT 'ledger', concat_ws('|', path, sha256)
  FROM production_bootstrap_migrations
)
SELECT category, count(*) AS object_count,
       md5(string_agg(definition, E'\n' ORDER BY definition)) AS semantic_md5
FROM objects GROUP BY category ORDER BY category;
