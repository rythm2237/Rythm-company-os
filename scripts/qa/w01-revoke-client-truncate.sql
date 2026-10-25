-- W01 ISOLATED-ONLY candidate. Not installed as a Production migration.
-- Caller owns the transaction, local-target checks and catalog attestation.
DO $w01_harden$
DECLARE obj record; creator record; before_permissions jsonb; after_permissions jsonb;
BEGIN
 IF current_setting('w01.allow_client_truncate_hardening',true) IS DISTINCT FROM 'isolated-only' THEN
  RAISE EXCEPTION 'W01 isolated hardening flag is required';
 END IF;
 SELECT jsonb_agg(jsonb_build_array(c.oid,r.rolname,p.priv,has_table_privilege(r.oid,c.oid,p.priv)) ORDER BY c.oid,r.rolname,p.priv)
 INTO before_permissions
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN pg_roles r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','REFERENCES','TRIGGER','MAINTAIN','TRUNCATE']) p(priv)
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND r.rolname IN ('anon','authenticated','service_role','postgres')
 AND (p.priv<>'TRUNCATE' OR r.rolname IN ('service_role','postgres'));

 FOR obj IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p') LOOP
  EXECUTE format('REVOKE TRUNCATE ON TABLE %I.%I FROM PUBLIC, anon, authenticated',obj.nspname,obj.relname);
 END LOOP;

 -- Cover current table owners and creators with public/global defaults.
 -- Per-schema default revokes alone cannot cancel additive global defaults.
 FOR creator IN
  SELECT rolname FROM pg_roles WHERE rolname IN ('postgres','supabase_admin')
  UNION SELECT pg_get_userbyid(c.relowner) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')
  UNION SELECT pg_get_userbyid(d.defaclrole) FROM pg_default_acl d WHERE d.defaclobjtype='r' AND d.defaclnamespace IN (0,'public'::regnamespace::oid)
 LOOP
  IF EXISTS(SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE d.defaclrole=creator.rolname::regrole AND d.defaclnamespace=0 AND d.defaclobjtype='r'
   AND a.privilege_type='TRUNCATE' AND a.grantee IN (0,'anon'::regrole::oid,'authenticated'::regrole::oid)) THEN
   EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE TRUNCATE ON TABLES FROM PUBLIC, anon, authenticated',creator.rolname);
  END IF;
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM PUBLIC, anon, authenticated',creator.rolname);
 END LOOP;

 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
  AND (has_table_privilege('anon',c.oid,'TRUNCATE') OR has_table_privilege('authenticated',c.oid,'TRUNCATE'))) THEN
  RAISE EXCEPTION 'Client TRUNCATE still inherited; hardening transaction must roll back';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE d.defaclobjtype='r' AND d.defaclnamespace IN (0,'public'::regnamespace::oid)
  AND a.privilege_type='TRUNCATE' AND a.grantee IN (0,'anon'::regrole::oid,'authenticated'::regrole::oid)) THEN
  RAISE EXCEPTION 'Future-table client TRUNCATE default remains';
 END IF;

 SELECT jsonb_agg(jsonb_build_array(c.oid,r.rolname,p.priv,has_table_privilege(r.oid,c.oid,p.priv)) ORDER BY c.oid,r.rolname,p.priv)
 INTO after_permissions
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN pg_roles r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','REFERENCES','TRIGGER','MAINTAIN','TRUNCATE']) p(priv)
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND r.rolname IN ('anon','authenticated','service_role','postgres')
 AND (p.priv<>'TRUNCATE' OR r.rolname IN ('service_role','postgres'));
 IF before_permissions IS DISTINCT FROM after_permissions THEN
  RAISE EXCEPTION 'Unrelated DML/backend privileges changed';
 END IF;
END $w01_harden$;
