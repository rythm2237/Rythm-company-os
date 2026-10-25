\set ON_ERROR_STOP on
-- W01: Local-only database schema attestation. No business-row reads or writes.
-- The local runner is disposable, initialized without historical owner seed.
SELECT 'w01_local_database' AS stage, current_setting('server_version') AS postgres_version;
SELECT 'public_schema_inventory' AS metric,
       count(*) FILTER (WHERE c.relkind IN ('r','p')) AS public_tables,
       count(*) FILTER (WHERE c.relkind IN ('r','p') AND c.relrowsecurity) AS public_tables_with_rls,
       count(*) FILTER (WHERE c.relkind IN ('r','p') AND NOT c.relrowsecurity) AS public_tables_without_rls
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public';
WITH inventory AS (
 SELECT concat_ws('|','T',n.nspname,c.relname,c.relkind::text,c.relrowsecurity::text) AS line
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')
 UNION ALL
 SELECT concat_ws('|','C',n.nspname,c.relname,a.attname,
   pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull::text)
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')
   AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL
 SELECT concat_ws('|','P',schemaname,tablename,policyname,permissive,
   cmd,coalesce(qual,''),coalesce(with_check,''))
 FROM pg_policies WHERE schemaname='public'
 UNION ALL
 SELECT concat_ws('|','F',n.nspname,p.proname,
   pg_get_function_identity_arguments(p.oid),md5(pg_get_functiondef(p.oid)))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
)
SELECT 'w01_schema_fingerprint' AS stage,
       md5(string_agg(line, E'\n' ORDER BY line)) AS actual_fingerprint_md5,
       count(*) AS inventory_lines
FROM inventory;
-- Running all source files without historical owner seed is diagnostic.
-- This query checks expected public-table baseline and RLS fail-closed.
DO $w01$
DECLARE t int; r int;
BEGIN
 SELECT count(*), count(*) FILTER (WHERE c.relrowsecurity) INTO t, r
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p');
 IF t <> 214 THEN RAISE EXCEPTION 'W01 schema mismatch: production 214 public tables, local %', t; END IF;
 IF r <> 214 THEN RAISE EXCEPTION 'W01 RLS mismatch: production 214 RLS tables, local %', r; END IF;
END
$w01$;
