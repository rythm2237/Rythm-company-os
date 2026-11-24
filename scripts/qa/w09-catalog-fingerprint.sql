-- W09 read-only schema attestation. No application rows, object paths, or secrets.
-- Run against source and restore target with the same PostgreSQL major version.
-- Output only aggregate counts and hashes; managed-schema drift must be reviewed.
WITH
app_ns AS (SELECT oid,nspname FROM pg_namespace WHERE nspname IN ('public','crm_private')),
items AS (
 SELECT 'app_relations' AS bucket, jsonb_build_array(n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner),coalesce((SELECT string_agg(a::text,',' ORDER BY a::text) FROM unnest(c.relacl) a),'')) AS item
 FROM pg_class c JOIN app_ns n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m','S')
 UNION ALL
 SELECT 'app_columns',jsonb_build_array(n.nspname,c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid))
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN app_ns n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL
 SELECT 'app_constraints',jsonb_build_array(n.nspname,coalesce(c.relname,t.typname),x.conname,x.contype,x.convalidated,x.condeferrable,x.condeferred,pg_get_constraintdef(x.oid,true))
 FROM pg_constraint x JOIN app_ns n ON n.oid=x.connamespace LEFT JOIN pg_class c ON c.oid=x.conrelid LEFT JOIN pg_type t ON t.oid=x.contypid
 UNION ALL
 SELECT 'app_indexes',jsonb_build_array(n.nspname,c.relname,i.relname,x.indisunique,x.indisprimary,x.indisvalid,pg_get_indexdef(i.oid))
 FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class c ON c.oid=x.indrelid JOIN app_ns n ON n.oid=c.relnamespace
 UNION ALL
 SELECT 'app_functions',jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prosecdef,p.provolatile,pg_get_userbyid(p.proowner),p.proconfig,coalesce((SELECT string_agg(a::text,',' ORDER BY a::text) FROM unnest(p.proacl) a),''),pg_get_functiondef(p.oid))
 FROM pg_proc p JOIN app_ns n ON n.oid=p.pronamespace WHERE p.prokind IN ('f','p','w')
 UNION ALL
 SELECT 'app_views',jsonb_build_array(n.nspname,c.relname,pg_get_viewdef(c.oid,true),c.reloptions)
 FROM pg_class c JOIN app_ns n ON n.oid=c.relnamespace WHERE c.relkind IN ('v','m')
 UNION ALL
 SELECT CASE WHEN schemaname IN ('public','crm_private') THEN 'app_policies' ELSE 'managed_policies' END,
 jsonb_build_array(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check)
 FROM pg_policies WHERE schemaname IN ('public','crm_private','auth','storage')
 UNION ALL
 SELECT CASE WHEN n.nspname IN ('public','crm_private') THEN 'app_triggers' ELSE 'managed_triggers' END,
 jsonb_build_array(n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true))
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','crm_private','auth','storage')
 UNION ALL
 SELECT 'app_enum_domain',jsonb_build_array(n.nspname,t.typname,t.typtype,format_type(t.typbasetype,t.typtypmod),t.typnotnull,t.typdefault,(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid))
 FROM pg_type t JOIN app_ns n ON n.oid=t.typnamespace WHERE t.typtype IN ('e','d')
 UNION ALL
 SELECT 'migration_ledger',jsonb_build_array(version,name) FROM supabase_migrations.schema_migrations
 UNION ALL
 SELECT 'bucket_configuration',jsonb_build_array(id,public,file_size_limit,allowed_mime_types) FROM storage.buckets
)
SELECT bucket,count(*) AS item_count,encode(sha256(convert_to(string_agg(item::text,E'\n' ORDER BY item::text),'UTF8')),'hex') AS sha256 FROM items GROUP BY bucket ORDER BY bucket;
