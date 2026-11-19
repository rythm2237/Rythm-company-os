-- Run ONLY in rythm-phase3-staging (viqjdgohtxqkrdgwtull).
-- Disposable W01 browser fixture cleanup; preserves both Auth identities and legacy schema.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $cleanup$
DECLARE r record; n bigint; tables text;
 expected jsonb := '{"audit_events":1,"communication_mailboxes":6,"communication_provider_connections":1,"communication_settings":1,"company_events":2,"crm_access_grants":3,"crm_accounts":1,"crm_audit_log":17,"crm_leads":1,"crm_pipeline_stages":6,"customer_profiles":1,"organization_members":1,"organizations":1,"project_contracts":1}';
BEGIN
 IF (SELECT count(*) FROM public.organizations)<>1
 OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id='f0200000-0000-4000-8000-000000000028' AND slug='w01-browser-advertising')
 OR (SELECT count(*) FROM auth.users)<>2
 OR EXISTS(SELECT 1 FROM auth.sessions)
 OR EXISTS(SELECT 1 FROM storage.objects)
 OR EXISTS(SELECT 1 FROM cron.job)
 OR EXISTS(SELECT 1 FROM vault.secrets)
 THEN RAISE EXCEPTION 'Unexpected fixture/auth/storage/jobs state. Nothing cleaned.'; END IF;
 IF (SELECT count(*) FROM w01_legacy_20261025.organizations)<>2
 OR (SELECT count(*) FROM w01_legacy_20261025.audit_events)<>15
 THEN RAISE EXCEPTION 'Legacy guard failed'; END IF;
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',r.tablename) INTO n;
  IF n <> coalesce((expected->>r.tablename)::bigint,0) THEN
   RAISE EXCEPTION 'Unexpected row count in %. Cleanup aborted.',r.tablename;
  END IF;
 END LOOP;
 SELECT string_agg(format('public.%I',tablename),',' ORDER BY tablename) INTO tables FROM pg_tables WHERE schemaname='public';
 -- Explicit public-only list, RESTRICT, no CASCADE. Private legacy and Auth untouched.
 EXECUTE 'TRUNCATE TABLE '||tables||' RESTRICT';
END $cleanup$;
COMMIT;
SELECT (SELECT count(*) FROM public.organizations) AS organizations,
 (SELECT count(*) FROM auth.users) AS auth_users_preserved,
 (SELECT count(*) FROM auth.sessions) AS sessions,
 (SELECT count(*) FROM storage.objects) AS storage_objects,
 (SELECT count(*) FROM w01_legacy_20261025.organizations) AS legacy_organizations,
 (SELECT count(*) FROM w01_legacy_20261025.audit_events) AS legacy_audit_events;
