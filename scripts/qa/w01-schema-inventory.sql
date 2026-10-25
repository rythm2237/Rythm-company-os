-- Catalog only. No business rows, secrets, or function bodies are returned.
WITH acl_objects AS (
 SELECT 'SCHEMA' kind,format('%I',n.nspname) ident,coalesce(n.nspacl,acldefault('n',n.nspowner)) acl FROM pg_namespace n WHERE n.nspname IN ('public','crm_private')
 UNION ALL
 SELECT CASE WHEN c.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,format('%I.%I',n.nspname,c.relname),coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','crm_private') AND c.relkind IN ('r','p','v','m','S')
 UNION ALL
 SELECT 'FUNCTION',format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),coalesce(p.proacl,acldefault('f',p.proowner)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','crm_private')
 UNION ALL
 SELECT 'TYPE',format('%I.%I',n.nspname,t.typname),coalesce(t.typacl,acldefault('T',t.typowner)) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','crm_private') AND t.typtype IN ('e','d')
), objects AS (
 SELECT 'relations' bucket, concat_ws('|',n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner),coalesce(array_to_string(c.reloptions,','),'')) line
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','crm_private') AND c.relkind IN ('r','p','v','m','S')
 UNION ALL
 SELECT 'columns',concat_ws('|',n.nspname,c.relname,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,coalesce(pg_get_expr(d.adbin,d.adrelid),''))
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname IN ('public','crm_private') AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL
 SELECT 'functions',concat_ws('|',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),md5(pg_get_functiondef(p.oid)),pg_get_userbyid(p.proowner))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','crm_private') AND p.prokind IN ('f','p')
 UNION ALL
 SELECT 'policies',concat_ws('|',schemaname,tablename,policyname,permissive,roles::text,cmd,coalesce(qual,''),coalesce(with_check,'')) FROM pg_policies WHERE schemaname IN ('public','crm_private')
 UNION ALL
 SELECT 'constraints',concat_ws('|',n.nspname,c.relname,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid)) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','crm_private')
 UNION ALL
 SELECT 'indexes',concat_ws('|',n.nspname,c.relname,x.relname,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid)) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_class x ON x.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','crm_private')
 UNION ALL
 SELECT 'triggers',concat_ws('|',n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','crm_private') AND NOT t.tgisinternal
 UNION ALL
 SELECT 'extensions',concat_ws('|',e.extname,e.extversion,n.nspname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname IN ('btree_gist','pg_cron','pg_net','pg_stat_statements','pgcrypto','plpgsql','supabase_vault','uuid-ossp')
 UNION ALL
 SELECT 'effective_acl',concat_ws('|',o.kind,o.ident,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) FROM acl_objects o CROSS JOIN LATERAL aclexplode(o.acl) a
 UNION ALL
 SELECT 'column_acl',concat_ws('|',n.nspname,c.relname,a.attname,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE n.nspname IN ('public','crm_private')
), buckets AS (
 SELECT bucket,jsonb_build_object('count',count(*),'md5',md5(string_agg(line,E'\n' ORDER BY line))) value FROM objects GROUP BY bucket
)
SELECT jsonb_object_agg(bucket,value) AS inventory FROM buckets;
