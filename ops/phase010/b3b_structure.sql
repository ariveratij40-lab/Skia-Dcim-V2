-- Catalog authority, PostgreSQL 16. No DDL/DML or installation required.
-- Each record is an array with explicit kind, qualified identity, fixed fields.
-- Sort records by their canonical UTF-8 encoding in the caller, never by OID.
SET LOCAL search_path=pg_catalog;
WITH ns AS (
 SELECT oid,nspname,nspowner,nspacl FROM pg_namespace
 WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
), rel AS (
 SELECT c.*, n.nspname FROM pg_class c JOIN ns n ON n.oid=c.relnamespace
), fun AS (
 SELECT p.*,n.nspname FROM pg_proc p JOIN ns n ON n.oid=p.pronamespace
), records AS (
 SELECT jsonb_build_array('schema',nspname,pg_get_userbyid(nspowner)) AS r FROM ns
 UNION ALL
 SELECT jsonb_build_array('database','RESTORE_TARGET',pg_get_userbyid(datdba),encoding,
   datcollate,datctype,datlocprovider,daticulocale,datcollversion) FROM pg_database WHERE datname=current_database()
 UNION ALL
 SELECT jsonb_build_array('database_acl','RESTORE_TARGET',pg_get_userbyid(a.grantor),
   CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable)
 FROM pg_database d CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a WHERE d.datname=current_database()
 UNION ALL
 SELECT jsonb_build_array('collation',n.nspname,c.collname,pg_get_userbyid(c.collowner),
   c.collprovider,c.collisdeterministic,c.collencoding,c.collcollate,c.collctype,c.colliculocale,c.collversion)
 FROM pg_collation c JOIN ns n ON n.oid=c.collnamespace
 UNION ALL
 SELECT jsonb_build_array('relation',nspname,relname,relkind,pg_get_userbyid(relowner),
   relpersistence,relrowsecurity,relforcerowsecurity,relreplident,reloptions,
   (SELECT amname FROM pg_am WHERE oid=relam),relispartition,
   CASE WHEN relispartition THEN pg_get_expr(relpartbound,oid,false) END,
   CASE WHEN relkind='p' THEN pg_get_partkeydef(oid) END)
 FROM rel WHERE relkind IN ('r','p','v','m','S','f','c')
 UNION ALL
 SELECT jsonb_build_array('column',c.nspname,c.relname,
   row_number() OVER (PARTITION BY c.oid ORDER BY a.attnum),a.attname,
   tn.nspname,t.typname,format_type(a.atttypid,a.atttypmod),a.atttypmod,
   a.attndims,a.attnotnull,a.attidentity,a.attgenerated,
   cn.nspname,co.collname,pg_get_expr(d.adbin,d.adrelid,false))
 FROM rel c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace tn ON tn.oid=t.typnamespace
 LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 LEFT JOIN pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace
 WHERE c.relkind IN ('r','p','v','m','f','c')
 UNION ALL
 SELECT jsonb_build_array('constraint',n.nspname,c.conname,
   CASE WHEN c.conrelid<>0 THEN c.conrelid::regclass::text ELSE c.contypid::regtype::text END,
   c.contype,c.condeferrable,c.condeferred,c.convalidated,c.connoinherit,
   pg_get_constraintdef(c.oid,false),
   (SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(num,ord)
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num),
   CASE WHEN c.confrelid<>0 THEN c.confrelid::regclass::text END,
   (SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY k(num,ord)
    JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num),
   c.confupdtype,c.confdeltype,c.confmatchtype)
 FROM pg_constraint c JOIN ns n ON n.oid=c.connamespace
 UNION ALL
 SELECT jsonb_build_array('index',r.nspname,r.relname,i.indrelid::regclass::text,
   i.indisunique,i.indnullsnotdistinct,i.indisprimary,i.indisexclusion,i.indimmediate,
   i.indisvalid,i.indisready,i.indislive,i.indisreplident,am.amname,
   i.indnkeyatts,i.indnatts,pg_get_indexdef(i.indexrelid,0,false),
   pg_get_expr(i.indexprs,i.indrelid,false),pg_get_expr(i.indpred,i.indrelid,false),r.reloptions)
 FROM pg_index i JOIN rel r ON r.oid=i.indexrelid JOIN pg_am am ON am.oid=r.relam
 UNION ALL
 SELECT jsonb_build_array('sequence',r.nspname,r.relname,format_type(s.seqtypid,NULL),
   s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle,
   (SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attname,d.deptype) ORDER BY n.nspname,c.relname,a.attname)
    FROM pg_depend d JOIN pg_class c ON c.oid=d.refobjid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=d.refobjsubid
    WHERE d.classid='pg_class'::regclass AND d.objid=r.oid AND d.deptype IN ('a','i')))
 FROM pg_sequence s JOIN rel r ON r.oid=s.seqrelid
 UNION ALL
 SELECT jsonb_build_array('type',n.nspname,t.typname,t.typtype,pg_get_userbyid(t.typowner),
   t.typnotnull,CASE WHEN t.typbasetype<>0 THEN format_type(t.typbasetype,t.typtypmod) END,
   t.typtypmod,t.typndims,t.typdefault,pg_get_expr(t.typdefaultbin,0,false),
   CASE WHEN t.typcollation<>0 THEN t.typcollation::regcollation::text END,
   (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid))
 FROM pg_type t JOIN ns n ON n.oid=t.typnamespace WHERE t.typtype IN ('e','d')
 UNION ALL
 SELECT jsonb_build_array('view',nspname,relname,relkind,pg_get_viewdef(oid,false),relispopulated)
 FROM rel WHERE relkind IN ('v','m')
 UNION ALL
 SELECT jsonb_build_array('routine',p.nspname,p.proname,p.oid::regprocedure::text,
   pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),
   pg_get_userbyid(p.proowner),l.lanname,p.prokind,p.provolatile,p.proisstrict,
   p.prosecdef,p.proleakproof,p.proparallel,p.procost,p.prorows,p.proconfig,
   pg_get_functiondef(p.oid))
 FROM fun p JOIN pg_language l ON l.oid=p.prolang WHERE p.prokind IN ('f','p','w')
 UNION ALL
 SELECT jsonb_build_array('trigger',r.nspname,r.relname,t.tgname,t.tgenabled,
   t.tgfoid::regprocedure::text,pg_get_triggerdef(t.oid,false),t.tgdeferrable,t.tginitdeferred)
 FROM pg_trigger t JOIN rel r ON r.oid=t.tgrelid WHERE NOT t.tgisinternal
 UNION ALL
 SELECT jsonb_build_array('policy',r.nspname,r.relname,p.polname,p.polcmd,p.polpermissive,
   (SELECT jsonb_agg(CASE WHEN x=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x) END ORDER BY
    CASE WHEN x=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x) END) FROM unnest(p.polroles) x),
   pg_get_expr(p.polqual,p.polrelid,false),pg_get_expr(p.polwithcheck,p.polrelid,false))
 FROM pg_policy p JOIN rel r ON r.oid=p.polrelid
 UNION ALL
 SELECT jsonb_build_array('rule',r.nspname,r.relname,w.rulename,w.ev_enabled,pg_get_ruledef(w.oid,false))
 FROM pg_rewrite w JOIN rel r ON r.oid=w.ev_class WHERE w.rulename <> '_RETURN'
 UNION ALL
 SELECT jsonb_build_array('extension',e.extname,n.nspname,e.extversion,pg_get_userbyid(e.extowner),e.extrelocatable)
 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
 UNION ALL
 SELECT jsonb_build_array('extension_member',e.extname,i.type,i.schema,i.name,i.identity)
 FROM pg_extension e JOIN pg_depend d ON d.refclassid='pg_extension'::regclass
   AND d.refobjid=e.oid AND d.deptype='e'
 CROSS JOIN LATERAL pg_identify_object(d.classid,d.objid,d.objsubid) i
 UNION ALL
 SELECT jsonb_build_array('role',rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,
   rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolconfig)
 FROM pg_roles WHERE rolname !~ '^pg_'
 UNION ALL
 SELECT jsonb_build_array('membership',pg_get_userbyid(roleid),pg_get_userbyid(member),
   pg_get_userbyid(grantor),admin_option,inherit_option,set_option) FROM pg_auth_members
 UNION ALL
 SELECT jsonb_build_array('default_acl',pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype,
   pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
   a.privilege_type,a.is_grantable)
 FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
 CROSS JOIN LATERAL aclexplode(d.defaclacl) a
 UNION ALL
 SELECT jsonb_build_array('relation_acl',r.nspname,r.relname,pg_get_userbyid(a.grantor),
   CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable)
 FROM rel r CROSS JOIN LATERAL aclexplode(COALESCE(r.relacl,acldefault(CASE WHEN r.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,r.relowner))) a
 WHERE r.relkind IN ('r','p','v','m','S','f')
 UNION ALL
 SELECT jsonb_build_array('column_acl',r.nspname,r.relname,c.attname,pg_get_userbyid(a.grantor),
   CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable)
 FROM rel r JOIN pg_attribute c ON c.attrelid=r.oid AND c.attnum>0 AND NOT c.attisdropped
 CROSS JOIN LATERAL aclexplode(c.attacl) a
 UNION ALL
 SELECT jsonb_build_array('schema_acl',n.nspname,pg_get_userbyid(a.grantor),
   CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable)
 FROM ns n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
 UNION ALL
 SELECT jsonb_build_array('routine_acl',p.oid::regprocedure::text,pg_get_userbyid(a.grantor),
   CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable)
 FROM fun p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
 UNION ALL
 SELECT jsonb_build_array('type_acl',n.nspname,t.typname,pg_get_userbyid(a.grantor),
   CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable)
 FROM pg_type t JOIN ns n ON n.oid=t.typnamespace
 CROSS JOIN LATERAL aclexplode(COALESCE(t.typacl,acldefault('T',t.typowner))) a
 WHERE t.typtype IN ('e','d')
 UNION ALL
 SELECT jsonb_build_array('runtime_table',r.nspname,r.relname,p.privilege,
   has_table_privilege('skia_runtime',r.oid,p.privilege))
 FROM rel r CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege)
 WHERE r.relkind IN ('r','p','v','m','f')
 UNION ALL
 SELECT jsonb_build_array('runtime_routine',p.oid::regprocedure::text,has_function_privilege('skia_runtime',p.oid,'EXECUTE')) FROM fun p
 UNION ALL
 SELECT jsonb_build_array('runtime_sequence',r.nspname,r.relname,p.privilege,has_sequence_privilege('skia_runtime',r.oid,p.privilege))
 FROM rel r CROSS JOIN (VALUES('SELECT'),('UPDATE'),('USAGE')) p(privilege) WHERE r.relkind='S'
)
SELECT COALESCE(jsonb_agg(r),'[]') FROM records;
