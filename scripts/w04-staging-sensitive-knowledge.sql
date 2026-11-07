-- W04 Staging-only same-tenant sensitive-knowledge regression.
-- Synthetic data only, all writes and roles undone by transaction rollback.
begin;
set local statement_timeout = '10000ms';

do $w04$
declare v_org uuid; v_owner uuid;
begin
 select id into v_org from public.organizations where slug='w02-synthetic-a-staging-v1';
 select id into v_owner from auth.users where email='w02-a-owner@example.test';
 if v_org is null or v_owner is null
   or not exists(select 1 from auth.users where email='w02-a-member@example.test')
 then raise exception 'Missing W02 synthetic company/user fixtures'; end if;
 update public.organization_members set membership_status='active'
 where organization_id=v_org and user_id in
   (v_owner,(select id from auth.users where email='w02-a-member@example.test'));
 if (select count(*) from public.organization_members
   where organization_id=v_org and membership_status='active'
   and user_id in (v_owner,(select id from auth.users where email='w02-a-member@example.test')))<>2 then
   raise exception 'Synthetic owner/member activation failed'; end if;

 insert into public.agents(id,organization_id,agent_code,name,role_title,purpose,
   company_knowledge_connected,enabled,agent_status)
 values('00000000-0000-4000-8000-000000000407'::uuid,v_org,
   'W04-TEST-PRIV','W04 Synthetic Finance Agent','Finance Director',
   'W04 rollback-only authorization fixture',true,false,'paused');

 insert into public.company_knowledge(
   id,organization_id,title,content,source_type,confidentiality,allowed_role_keywords,
   created_by,status,ingestion_status)
 values
 ('00000000-0000-4000-8000-000000000408'::uuid,v_org,'W04 confidential',
   'w04-synthetic-canary sensitive', 'text','confidential',array['Finance Director'],v_owner,'active','ready'),
 ('00000000-0000-4000-8000-000000000410'::uuid,v_org,'W04 internal',
   'w04-synthetic-canary internal','text','internal',array[]::text[],v_owner,'active','ready');

 insert into public.company_knowledge_chunks(
   id,organization_id,knowledge_id,chunk_index,content)
 values
 ('00000000-0000-4000-8000-000000000409'::uuid,v_org,
  '00000000-0000-4000-8000-000000000408'::uuid,0,'w04-synthetic-canary sensitive'),
 ('00000000-0000-4000-8000-000000000411'::uuid,v_org,
  '00000000-0000-4000-8000-000000000410'::uuid,0,'w04-synthetic-canary internal');
end;
$w04$;

select set_config('request.jwt.claim.sub',
 (select id::text from auth.users where email='w02-a-member@example.test'),true);
set local role authenticated;
do $w04$
declare v_org uuid; v_internal bigint; v_confidential bigint;
begin
 select id into v_org from public.organizations where slug='w02-synthetic-a-staging-v1';
 if not public.is_org_member(v_org) or public.is_org_owner(v_org) then
   raise exception 'Synthetic ordinary member identity incorrect'; end if;
 select count(*) filter(where confidentiality='internal'),
        count(*) filter(where confidentiality='confidential')
 into v_internal,v_confidential
 from public.search_company_knowledge_for_agent_v1(
   v_org,'00000000-0000-4000-8000-000000000407'::uuid,'w04-synthetic-canary',20);
 if v_internal<>1 or v_confidential<>0 then
   raise exception 'Member should see internal (1) and confidential (0), actual: %,%',
     v_internal,v_confidential;
 end if;
end;
$w04$;
reset role;

select set_config('request.jwt.claim.sub',
 (select id::text from auth.users where email='w02-a-owner@example.test'),true);
set local role authenticated;
do $w04$
declare v_org uuid; v_internal bigint; v_confidential bigint;
begin
 select id into v_org from public.organizations where slug='w02-synthetic-a-staging-v1';
 if not public.is_org_owner(v_org) then raise exception 'Synthetic owner identity invalid'; end if;
 select count(*) filter(where confidentiality='internal'),
        count(*) filter(where confidentiality='confidential')
 into v_internal,v_confidential
 from public.search_company_knowledge_for_agent_v1(
   v_org,'00000000-0000-4000-8000-000000000407'::uuid,'w04-synthetic-canary',20);
 if v_internal<>1 or v_confidential<>1 then
   raise exception 'Owner should see internal (1) and confidential (1), actual: %,%',
     v_internal,v_confidential;
 end if;
end;
$w04$;
reset role;

-- Trusted server principal is the only non-owner exception for confidential
-- agent search. Simulate signed Supabase service_role JWT claims in this
-- disposable staging-only transaction; never make this a client-side claim.
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $w04$
declare v_org uuid; v_internal bigint; v_confidential bigint;
begin
 select id into v_org from public.organizations where slug='w02-synthetic-a-staging-v1';
 select count(*) filter(where confidentiality='internal'),
        count(*) filter(where confidentiality='confidential')
 into v_internal,v_confidential
 from public.search_company_knowledge_for_agent_v1(
   v_org,'00000000-0000-4000-8000-000000000407'::uuid,'w04-synthetic-canary',20);
 if v_internal<>1 or v_confidential<>1 then
   raise exception 'Service principal expected both tiers, actual %,%',
     v_internal,v_confidential;
 end if;
end;
$w04$;
reset role;
rollback;
