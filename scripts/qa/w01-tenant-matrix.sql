\set ON_ERROR_STOP on
-- W01: synthetic records only, isolated local Supabase only. Always rollback.
-- Database roles + real auth.uid/RLS/RPCs; this is NOT an HTTP/JWT login test.
BEGIN;
SET LOCAL statement_timeout='120s';
SET LOCAL lock_timeout='5s';
SET LOCAL row_security=on;
DO $guard$
BEGIN
 IF current_database()<>'postgres' OR session_user<>'postgres' THEN RAISE EXCEPTION 'Local initialized postgres required'; END IF;
 IF (SELECT count(*) FROM pg_tables WHERE schemaname='public')<>214 THEN RAISE EXCEPTION 'Complete 214-table restore required'; END IF;
 IF to_regprocedure('crm_private.can_access(uuid,text,text,uuid)') IS NULL THEN RAISE EXCEPTION 'Actual CRM dependency missing'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM public.organizations) THEN RAISE EXCEPTION 'Expected empty synthetic-only restore; no reset will be attempted'; END IF;
 IF EXISTS(SELECT 1 FROM cron.job) OR EXISTS(SELECT 1 FROM vault.secrets) THEN RAISE EXCEPTION 'Jobs/secrets must be absent'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'Invalid normal user role'; END IF;
END $guard$;

-- W01_HELPERS_BEGIN (also exercised independently in disposable Docker CI)
CREATE SCHEMA w01_test;
GRANT USAGE ON SCHEMA w01_test TO authenticated,anon;
CREATE TABLE w01_test.results(label text NOT NULL,passed boolean NOT NULL,detail text NOT NULL DEFAULT '');
GRANT INSERT,SELECT ON w01_test.results TO authenticated,anon;
CREATE FUNCTION w01_test.check_result(label text, ok boolean, detail text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $fn$
BEGIN
 INSERT INTO w01_test.results VALUES(label,ok IS TRUE,detail);
END $fn$;
CREATE FUNCTION w01_test.denied(label text, q text, zero_ok boolean DEFAULT false,
 accepted_states text[] DEFAULT ARRAY['42501','P0001','23503','23514']) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE affected bigint; state text; msg text; ok boolean;
BEGIN
 -- The sentinel exception also rolls back unexpectedly ALLOWED attacks.
 BEGIN
  EXECUTE q;
  GET DIAGNOSTICS affected=ROW_COUNT;
  RAISE SQLSTATE 'Z0001';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,msg=MESSAGE_TEXT;
  ok:=CASE WHEN state='Z0001' THEN zero_ok AND affected=0 ELSE state=ANY(accepted_states) END;
 END;
 INSERT INTO w01_test.results VALUES(label,coalesce(ok,false),
  CASE WHEN state='Z0001' THEN 'affected='||affected ELSE state||': '||left(msg,160) END);
END $fn$;
CREATE FUNCTION w01_test.allowed(label text, q text, expected_rows bigint DEFAULT 1) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE affected bigint;
BEGIN
 EXECUTE q;
 GET DIAGNOSTICS affected=ROW_COUNT;
 INSERT INTO w01_test.results VALUES(label,affected=expected_rows,'affected='||affected);
END $fn$;
-- W01_HELPERS_END

CREATE TABLE w01_test.companies(key text PRIMARY KEY,kind text,id uuid,owner_id uuid,manager_id uuid,customer_id uuid,project_id uuid,invoice_id uuid,contract_id uuid,item_id uuid);
CREATE TABLE w01_test.actors(tag text PRIMARY KEY,company text,persona text,membership text,id uuid);
GRANT SELECT ON w01_test.companies,w01_test.actors TO authenticated,anon;
INSERT INTO w01_test.companies
SELECT key,kind,md5('w01-company-'||key)::uuid,md5('w01-'||key||'-owner')::uuid,
 md5('w01-'||key||'-manager')::uuid,md5('w01-customer-'||key)::uuid,
 md5('w01-project-'||key)::uuid,md5('w01-invoice-'||key)::uuid,
 md5('w01-contract-'||key)::uuid,md5('w01-intake-'||key)::uuid
FROM (VALUES('A','Advertising'),('B','Software Development'),('C','Retail')) c(key,kind);
INSERT INTO w01_test.actors
SELECT c.key||'/'||r.persona,c.key,r.persona,r.membership,md5('w01-'||c.key||'-'||r.persona)::uuid
FROM w01_test.companies c CROSS JOIN (VALUES
 ('owner','owner'),('executive','executive'),('operator','operator'),
 ('auditor','auditor'),('viewer','viewer'),('finance','operator'),('manager','operator')
) r(persona,membership);

-- Privileged SETUP ONLY. Every application authorization assertion below uses
-- authenticated/anon, never postgres or service_role.
INSERT INTO auth.users(id,instance_id,aud,role,email,created_at,updated_at)
SELECT id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'w01-'||replace(lower(tag),'/','-')||'@example.invalid',now(),now() FROM w01_test.actors;
INSERT INTO auth.users(id,instance_id,aud,role,email,created_at,updated_at) VALUES
 (md5('w01-shared')::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','w01-shared@example.invalid',now(),now()),
 (md5('w01-outsider')::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','w01-outsider@example.invalid',now(),now());
INSERT INTO public.organizations(id,name,slug,mission,owner_user_id,status)
SELECT id,'W01 Synthetic '||key||' - '||kind,'w01-synthetic-'||lower(key),kind,owner_id,'approved' FROM w01_test.companies;
INSERT INTO public.organization_members(organization_id,user_id,role,membership_status)
SELECT c.id,a.id,a.membership,'active' FROM w01_test.actors a JOIN w01_test.companies c ON c.key=a.company;
INSERT INTO public.organization_members(organization_id,user_id,role,membership_status)
SELECT id,md5('w01-shared')::uuid,'operator','active' FROM w01_test.companies WHERE key IN ('A','B');
INSERT INTO public.customer_profiles(user_id,active_organization_id,onboarding_status)
SELECT a.id,c.id,'complete' FROM w01_test.actors a JOIN w01_test.companies c ON c.key=a.company;
INSERT INTO public.customer_profiles(user_id,active_organization_id,onboarding_status)
SELECT md5('w01-shared')::uuid,id,'complete' FROM w01_test.companies WHERE key='A';
INSERT INTO public.customer_profiles(user_id,onboarding_status) VALUES(md5('w01-outsider')::uuid,'complete');

-- Provisioning triggers remain active. Suppress all synthetic transport metadata
-- and outbound switches, in addition to the disconnected Docker network.
UPDATE public.communication_provider_connections SET inbound_enabled=false,outbound_enabled=false,status='disconnected';
UPDATE public.communication_settings SET auto_send_enabled=false;
UPDATE public.communication_mailboxes SET is_active=false;

INSERT INTO public.crm_accounts(id,organization_id,name,email,industry,customer_status)
SELECT customer_id,id,'W01 Customer '||key,'w01-customer-'||lower(key)||'@example.invalid',kind,'active' FROM w01_test.companies;
DO $seed$
DECLARE c record; a record;
BEGIN
 FOR c IN SELECT * FROM w01_test.companies ORDER BY key LOOP
  PERFORM set_config('request.jwt.claim.sub',c.owner_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',c.owner_id,'role','authenticated')::text,true);
  INSERT INTO public.projects(id,organization_id,project_code,name,primary_manager_user_id,customer_id,engagement_type,created_by_user_id)
  VALUES(c.project_id,c.id,'W01-'||c.key,'W01 Project '||c.key,c.manager_id,c.customer_id,'external',c.owner_id);
  INSERT INTO public.intake_items(id,organization_id,intake_key,item_type,title,summary,category,created_by_user_id)
  VALUES(c.item_id,c.id,'W01-'||c.key,'idea','W01 initial idea','Synthetic isolation fixture','general',c.owner_id);
  -- Finance and contract authorization are independently granted to DIFFERENT
  -- personas. Neither membership title nor owner status is an implicit grant.
  FOR a IN SELECT * FROM w01_test.actors WHERE company=c.key AND persona IN ('finance','executive') LOOP
   INSERT INTO public.crm_access_grants(organization_id,principal_type,principal_id,capability,resource_type,resource_id,granted_by)
   VALUES(c.id,'user',a.id,CASE WHEN a.persona='finance' THEN 'finance.read' ELSE 'contract.read' END,'company',c.id,c.owner_id);
  END LOOP;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claims','{}',true);
END $seed$;
UPDATE public.projects SET budget_cap_usd=123.45 WHERE id IN (SELECT project_id FROM w01_test.companies);
INSERT INTO public.project_contracts(id,organization_id,customer_id,contract_number,contract_value,currency)
SELECT contract_id,id,customer_id,'W01-'||key,456.78,'EUR' FROM w01_test.companies;
INSERT INTO public.finance_invoices(id,organization_id,customer_id,internal_reference,total)
SELECT invoice_id,id,customer_id,'W01-'||key,123.45 FROM w01_test.companies;

DO $matrix$
DECLARE a record; c record; f record; prefix text; query text; scratch uuid;
BEGIN
 FOR a IN SELECT * FROM w01_test.actors ORDER BY tag LOOP
  SELECT * INTO c FROM w01_test.companies WHERE key=a.company;
  PERFORM set_config('request.jwt.claim.sub',a.id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a.id,'role','authenticated','user_metadata',jsonb_build_object('role','owner','is_admin',true))::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  prefix:=a.tag||': ';
  PERFORM w01_test.check_result(prefix||'normal DB role',current_user='authenticated' AND auth.uid()=a.id);
  PERFORM w01_test.check_result(prefix||'own member',public.is_org_member(c.id));
  PERFORM w01_test.check_result(prefix||'user_metadata cannot forge ownership',public.is_org_owner(c.id)=(a.persona='owner'));
  PERFORM w01_test.check_result(prefix||'own organization SELECT',(SELECT count(*)=1 FROM public.organizations WHERE id=c.id));
  PERFORM w01_test.check_result(prefix||'own customer SELECT',(SELECT count(*)=1 FROM public.crm_accounts WHERE id=c.customer_id));
  PERFORM w01_test.check_result(prefix||'own project SELECT',(SELECT count(id)=1 FROM public.projects WHERE id=c.project_id));
  PERFORM w01_test.check_result(prefix||'own project has one manager',(SELECT primary_manager_user_id=c.manager_id FROM public.projects WHERE id=c.project_id));
  PERFORM w01_test.check_result(prefix||'SECURITY DEFINER organization list',(SELECT count(*)=1 FROM public.list_my_organizations()));
  PERFORM w01_test.check_result(prefix||'finance capability explicit only',public.crm_can(c.id,'finance.read')=(a.persona='finance'));
  PERFORM w01_test.check_result(prefix||'contract capability independent',public.crm_can(c.id,'contract.read')=(a.persona='executive'));
  PERFORM w01_test.check_result(prefix||'invoice row access',(SELECT count(*)=CASE WHEN a.persona='finance' THEN 1 ELSE 0 END FROM public.finance_invoices WHERE id=c.invoice_id));
  PERFORM w01_test.check_result(prefix||'contract row access',(SELECT count(*)=CASE WHEN a.persona='executive' THEN 1 ELSE 0 END FROM public.project_contracts WHERE id=c.contract_id));
  IF a.persona='finance' THEN
   PERFORM w01_test.check_result(prefix||'budget RPC authorized',public.crm_project_budget(c.id,c.project_id)=123.45);
  ELSE
   PERFORM w01_test.denied(prefix||'budget RPC denied',format('SELECT public.crm_project_budget(%L::uuid,%L::uuid)',c.id,c.project_id));
  END IF;
  PERFORM w01_test.denied(prefix||'raw confidential budget column denied',format('SELECT budget_cap_usd FROM public.projects WHERE id=%L::uuid',c.project_id));
  PERFORM w01_test.denied(prefix||'read grant cannot become finance write',format('UPDATE public.projects SET budget_cap_usd=999 WHERE id=%L::uuid',c.project_id),true);
  PERFORM w01_test.check_result(prefix||'legitimate context switch',public.set_active_organization(c.id)=c.id);
  IF a.persona<>'owner' THEN
   PERFORM w01_test.denied(prefix||'membership escalation',format('UPDATE public.organization_members SET role=''owner'' WHERE organization_id=%L::uuid AND user_id=%L::uuid',c.id,a.id),true);
   PERFORM w01_test.denied(prefix||'self financial grant',format('INSERT INTO public.crm_access_grants(organization_id,principal_type,principal_id,capability,resource_type,resource_id,granted_by) VALUES(%L::uuid,''user'',%L::uuid,''finance.update'',''company'',%L::uuid,%L::uuid)',c.id,a.id,c.id,a.id));
   PERFORM w01_test.denied(prefix||'manager cannot self-assign responsibility',format('SELECT public.crm_assign_project_manager(%L::uuid,%L::uuid)',c.project_id,a.id));
  END IF;
  FOR f IN SELECT * FROM w01_test.companies WHERE key<>a.company ORDER BY key LOOP
   PERFORM w01_test.check_result(prefix||f.key||' foreign organization SELECT',(SELECT count(*)=0 FROM public.organizations WHERE id=f.id));
   PERFORM w01_test.check_result(prefix||f.key||' foreign customer SELECT',(SELECT count(*)=0 FROM public.crm_accounts WHERE id=f.customer_id));
   PERFORM w01_test.check_result(prefix||f.key||' foreign project SELECT',(SELECT count(id)=0 FROM public.projects WHERE id=f.project_id));
   PERFORM w01_test.check_result(prefix||f.key||' foreign membership SELECT',(SELECT count(*)=0 FROM public.organization_members WHERE organization_id=f.id));
   PERFORM w01_test.check_result(prefix||f.key||' foreign invoice SELECT',(SELECT count(*)=0 FROM public.finance_invoices WHERE id=f.invoice_id));
   PERFORM w01_test.check_result(prefix||f.key||' foreign contract SELECT',(SELECT count(*)=0 FROM public.project_contracts WHERE id=f.contract_id));
   PERFORM w01_test.denied(prefix||f.key||' foreign INSERT',format('INSERT INTO public.intake_items(organization_id,intake_key,item_type,title,summary,category,created_by_user_id) VALUES(%L::uuid,%L,''idea'',''Synthetic foreign attempt'',''Synthetic isolation attempt'',''general'',%L::uuid)',f.id,'W01-attack-'||a.tag||f.key,a.id));
   PERFORM w01_test.denied(prefix||f.key||' foreign UPDATE',format('UPDATE public.intake_items SET title=''W01 foreign mutation'' WHERE id=%L::uuid',f.item_id),true);
   PERFORM w01_test.denied(prefix||f.key||' foreign DELETE',format('DELETE FROM public.intake_items WHERE id=%L::uuid',f.item_id),true);
   PERFORM w01_test.denied(prefix||f.key||' foreign context RPC',format('SELECT public.set_active_organization(%L::uuid)',f.id));
   PERFORM w01_test.denied(prefix||f.key||' forged profile context',format('UPDATE public.customer_profiles SET active_organization_id=%L::uuid WHERE user_id=%L::uuid',f.id,a.id));
   PERFORM w01_test.denied(prefix||f.key||' foreign budget RPC',format('SELECT public.crm_project_budget(%L::uuid,%L::uuid)',f.id,f.project_id));
   PERFORM w01_test.denied(prefix||f.key||' foreign membership INSERT',format('INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(%L::uuid,%L::uuid,''owner'')',f.id,md5('w01-outsider')::uuid));
  END LOOP;
  IF a.persona='owner' THEN
   scratch:=md5('w01-crud-'||a.tag)::uuid;
   PERFORM w01_test.allowed(prefix||'own INSERT',format('INSERT INTO public.intake_items(id,organization_id,intake_key,item_type,title,summary,category,created_by_user_id) VALUES(%L::uuid,%L::uuid,%L,''idea'',''Synthetic own item'',''Synthetic positive control'',''general'',%L::uuid)',scratch,c.id,'W01-crud-'||a.tag,a.id));
   PERFORM w01_test.allowed(prefix||'own UPDATE',format('UPDATE public.intake_items SET title=''W01 own update'' WHERE id=%L::uuid',scratch));
   PERFORM w01_test.allowed(prefix||'own DELETE',format('DELETE FROM public.intake_items WHERE id=%L::uuid',scratch));
   PERFORM w01_test.allowed(prefix||'own customer UPDATE',format('UPDATE public.crm_accounts SET notes=''W01 positive update'' WHERE id=%L::uuid',c.customer_id));
   PERFORM w01_test.allowed(prefix||'own manager RPC',format('SELECT public.crm_assign_project_manager(%L::uuid,%L::uuid)',c.project_id,c.owner_id));
   PERFORM w01_test.check_result(prefix||'manager reassignment applied',(SELECT primary_manager_user_id=c.owner_id FROM public.projects WHERE id=c.project_id));
   PERFORM w01_test.allowed(prefix||'restore own manager',format('SELECT public.crm_assign_project_manager(%L::uuid,%L::uuid)',c.project_id,c.manager_id));
   PERFORM w01_test.denied(prefix||'missing project manager',format('SELECT public.crm_assign_project_manager(%L::uuid,NULL::uuid)',c.project_id));
   FOR f IN SELECT * FROM w01_test.companies WHERE key<>c.key LOOP
    PERFORM w01_test.denied(prefix||f.key||' cross-company project manager',format('SELECT public.crm_assign_project_manager(%L::uuid,%L::uuid)',c.project_id,f.manager_id));
    PERFORM w01_test.denied(prefix||f.key||' cross-company customer reference',format('INSERT INTO public.crm_contacts(organization_id,account_id,first_name) VALUES(%L::uuid,%L::uuid,''W01 foreign reference'')',c.id,f.customer_id));
    PERFORM w01_test.denied(prefix||f.key||' cross-company project customer',format('UPDATE public.projects SET customer_id=%L::uuid WHERE id=%L::uuid',f.customer_id,c.project_id));
   END LOOP;
   INSERT INTO public.crm_access_grants(id,organization_id,principal_type,principal_id,capability,resource_type,resource_id,granted_by)
   VALUES(md5('w01-revocation-'||c.key)::uuid,c.id,'user',c.manager_id,'finance.read','company',c.id,c.owner_id);
   PERFORM set_config('request.jwt.claim.sub',c.manager_id::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',c.manager_id,'role','authenticated')::text,true);
   PERFORM w01_test.check_result(prefix||'explicit finance grant effective',public.crm_project_budget(c.id,c.project_id)=123.45);
   PERFORM set_config('request.jwt.claim.sub',c.owner_id::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',c.owner_id,'role','authenticated')::text,true);
   UPDATE public.crm_access_grants SET revoked_at=now() WHERE id=md5('w01-revocation-'||c.key)::uuid;
   PERFORM set_config('request.jwt.claim.sub',c.manager_id::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',c.manager_id,'role','authenticated')::text,true);
   PERFORM w01_test.denied(prefix||'revoked finance grant denied',format('SELECT public.crm_project_budget(%L::uuid,%L::uuid)',c.id,c.project_id));
   PERFORM set_config('request.jwt.claim.sub',c.owner_id::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',c.owner_id,'role','authenticated')::text,true);
  END IF;
  EXECUTE 'RESET ROLE';
 END LOOP;
 -- A real shared member can switch A/B but cannot acquire C or finance access.
 PERFORM set_config('request.jwt.claim.sub',md5('w01-shared')::uuid::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',md5('w01-shared')::uuid,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM w01_test.check_result('shared: exactly two memberships',(SELECT count(*)=2 FROM public.list_my_organizations()));
 FOR c IN SELECT * FROM w01_test.companies ORDER BY key LOOP
  IF c.key IN ('A','B') THEN
   PERFORM w01_test.check_result('shared: legitimate switch '||c.key,public.set_active_organization(c.id)=c.id);
   PERFORM w01_test.check_result('shared: finance denied '||c.key,NOT public.crm_can(c.id,'finance.read'));
  ELSE
   PERFORM w01_test.denied('shared: C context denied',format('SELECT public.set_active_organization(%L::uuid)',c.id));
  END IF;
 END LOOP;
 EXECUTE 'RESET ROLE';
 -- No membership, missing claims, malformed claim and anonymous database role.
 PERFORM set_config('request.jwt.claim.sub',md5('w01-outsider')::uuid::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',md5('w01-outsider')::uuid,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM w01_test.check_result('outsider: zero organizations',(SELECT count(*)=0 FROM public.list_my_organizations()));
 PERFORM w01_test.check_result('outsider: zero customers',(SELECT count(*)=0 FROM public.crm_accounts));
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claims','{}',true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM w01_test.check_result('missing claim: uid null',auth.uid() IS NULL);
 PERFORM w01_test.check_result('missing claim: zero organizations',(SELECT count(*)=0 FROM public.list_my_organizations()));
 PERFORM w01_test.check_result('missing claim: zero customers',(SELECT count(*)=0 FROM public.crm_accounts));
 PERFORM w01_test.denied('missing claim: privileged switch denied',format('SELECT public.set_active_organization(%L::uuid)',(SELECT id FROM w01_test.companies WHERE key='A')));
 PERFORM set_config('request.jwt.claim.sub','not-a-uuid',true);
 PERFORM w01_test.denied('malformed DB claim fails closed','SELECT auth.uid()',false,ARRAY['22P02']);
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claims','{}',true);
 EXECUTE 'SET LOCAL ROLE anon';
 PERFORM w01_test.denied('anon: customer SELECT denied','SELECT id FROM public.crm_accounts',true);
 PERFORM w01_test.denied('anon: privileged organization RPC denied','SELECT * FROM public.list_my_organizations()',true);
 EXECUTE 'RESET ROLE';
 -- TRUNCATE bypasses row policies; a grant is a DB-role security finding.
 -- This assertion DOES NOT claim PostgREST exposes TRUNCATE to HTTP clients.
 PERFORM w01_test.check_result('DB privilege: authenticated cannot TRUNCATE tenant preferences',NOT has_table_privilege('authenticated','public.user_ai_preferences','TRUNCATE'));
END $matrix$;

SELECT jsonb_build_object('suite','W01_DB_TENANT_MATRIX','companies',3,'actors',23,
 'checks_expected',1000,'checks',count(*),'passed',count(*) FILTER(WHERE passed),'failed',count(*) FILTER(WHERE NOT passed),
 'failures',coalesce(jsonb_agg(jsonb_build_object('case',label,'detail',detail)) FILTER(WHERE NOT passed),'[]'::jsonb),
 'scope','DB-role RLS/CRUD/CRM/RPC tests, not HTTP/JWT verification','w01','NOT_ACCEPTED')::text
FROM w01_test.results;
DO $finish$ BEGIN
 IF (SELECT count(*) FROM w01_test.results)<>1000 THEN RAISE EXCEPTION 'W01 matrix case-count mismatch; fixtures rolled back'; END IF;
 IF EXISTS(SELECT 1 FROM w01_test.results WHERE NOT passed) THEN RAISE EXCEPTION 'W01 tenant matrix has failing assertions; fixtures rolled back'; END IF;
END $finish$;
ROLLBACK;
