-- Execute in a transaction AFTER the migration. Always roll back fixtures.
begin;
insert into auth.users(id,email) values
 ('a1000000-0000-4000-8000-000000000001','owner-customer-test@example.invalid'),
 ('a1000000-0000-4000-8000-000000000002','member-customer-test@example.invalid'),
 ('a1000000-0000-4000-8000-000000000003','platform-customer-test@example.invalid');
insert into public.organizations(id,name,slug,owner_user_id,status) values
 ('b1000000-0000-4000-8000-000000000001','Customer isolation test A','customer-isolation-test-a','a1000000-0000-4000-8000-000000000001','approved'),
 ('b1000000-0000-4000-8000-000000000002','Customer isolation test B','customer-isolation-test-b','a1000000-0000-4000-8000-000000000003','approved');
insert into public.organization_members(organization_id,user_id,role) values
 ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','owner'),
 ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','viewer'),
 ('b1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000003','owner');
insert into public.organization_entitlements(organization_id,product_code,status,agent_builder_enabled,agent_create_enabled,agent_archive_enabled,max_active_agents) values
 ('b1000000-0000-4000-8000-000000000001','company_studio','active',true,true,true,2),
 ('b1000000-0000-4000-8000-000000000002','company_studio','active',true,true,true,2);
insert into public.platform_admins(user_id,role,enabled) values ('a1000000-0000-4000-8000-000000000003','platform_admin',true);
insert into public.agents(id,organization_id,agent_code,name,role_title,purpose,agent_status,enabled,provisioning_status) values
 ('c1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','TEST-B','B Agent','Tester','Isolation test purpose','paused',false,'ready');
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select public.set_active_organization('b1000000-0000-4000-8000-000000000001');
do $$ declare a uuid; n integer; begin
 if exists(select 1 from public.agents where organization_id='b1000000-0000-4000-8000-000000000002') then raise exception 'FAIL cross-tenant agents'; end if;
 if exists(select 1 from public.organization_members where organization_id='b1000000-0000-4000-8000-000000000002') then raise exception 'FAIL cross-tenant users'; end if;
 begin perform public.platform_customer_list_v1(); raise exception 'FAIL owner accessed platform inventory'; exception when insufficient_privilege then null; end;
 begin perform public.platform_customer_detail_v1('b1000000-0000-4000-8000-000000000002'); raise exception 'FAIL owner accessed customer detail'; exception when insufficient_privilege then null; end;
 begin perform public.set_agent_status_v1('c1000000-0000-4000-8000-000000000002','archived'); raise exception 'FAIL cross-tenant mutation'; exception when insufficient_privilege then null; end;
 begin perform public.set_active_organization('b1000000-0000-4000-8000-000000000002'); raise exception 'FAIL cross-tenant switch'; exception when raise_exception then if SQLERRM like 'FAIL%' then raise; end if; end;
 a:=public.create_agent_v1('b1000000-0000-4000-8000-000000000001','Test Agent','Analyst','A disposable lifecycle test');
 perform set_config('test.agent_id',a::text,true);
 perform public.update_agent_v1(a,'Updated Agent','Analyst','Updated lifecycle purpose');
 if not exists(select 1 from public.agents where id=a and name='Updated Agent') then raise exception 'FAIL agent edit'; end if;
 -- Legacy create defaults readiness to ready in the production schema.
 update public.agents set provisioning_status='ready' where id=a;
 perform public.set_agent_status_v1(a,'enabled');
 if not exists(select 1 from public.agents where id=a and enabled and agent_status='enabled') then raise exception 'FAIL enable'; end if;
 perform public.set_agent_status_v1(a,'paused');
 if not exists(select 1 from public.agents where id=a and not enabled) then raise exception 'FAIL disable'; end if;
 perform public.set_agent_status_v1(a,'archived');
 begin perform public.set_agent_status_v1(a,'enabled'); raise exception 'FAIL archived direct enable'; exception when raise_exception then if SQLERRM like 'FAIL%' then raise; end if; end;
 perform public.set_agent_status_v1(a,'paused');
 if not exists(select 1 from public.agents where id=a and agent_status='paused' and not enabled) then raise exception 'FAIL restore'; end if;
 if not exists(select 1 from public.audit_events where object_id=a::text and event_type='agent_studio.agent_restored') then raise exception 'FAIL restore audit'; end if;
 begin delete from public.agents where id=a; raise exception 'FAIL hard deletion allowed'; exception when insufficient_privilege then null; end;
 select count(*) into n from public.audit_events where object_id=a::text;
 if n<5 then raise exception 'FAIL audit history lost'; end if;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select public.set_active_organization('b1000000-0000-4000-8000-000000000001');
do $$ begin
 begin perform public.set_agent_status_v1(current_setting('test.agent_id')::uuid,'enabled'); raise exception 'FAIL member mutation allowed'; exception when insufficient_privilege then null; end;
 begin perform public.platform_customer_list_v1(); raise exception 'FAIL member inventory allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
do $$ declare inventory jsonb; detail jsonb; begin
 inventory:=public.platform_customer_list_v1('Customer isolation test');
 if (inventory->>'total')::integer<>2 then raise exception 'FAIL customer inventory count'; end if;
 detail:=public.platform_customer_detail_v1('b1000000-0000-4000-8000-000000000001');
 if jsonb_array_length(detail->'users')<>2 or jsonb_array_length(detail->'agents')<>2 then raise exception 'FAIL detail counts'; end if;
 if not exists(select 1 from jsonb_array_elements(detail->'agents') a where a->>'name'='Updated Agent') then raise exception 'FAIL agent name'; end if;
 if detail::text ~ 'vault_secret_id|encrypted_password|refresh_token|system_instructions' then raise exception 'FAIL sensitive field exposure'; end if;
end $$;
reset role;
-- A second membership verifies switch/refetch authorization. Inactive membership is rejected.
insert into public.organization_members(organization_id,user_id,role,membership_status) values('b1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','viewer','active');
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select public.set_active_organization('b1000000-0000-4000-8000-000000000002');
do $$ begin
 if not exists(select 1 from public.list_my_organizations() where organization_id='b1000000-0000-4000-8000-000000000002' and is_active and membership_role='viewer') then raise exception 'FAIL switch context'; end if;
 if not exists(select 1 from public.agents where organization_id='b1000000-0000-4000-8000-000000000002') then raise exception 'FAIL switched data'; end if;
end $$;
reset role;
update public.organization_members set membership_status='inactive' where user_id='a1000000-0000-4000-8000-000000000001' and organization_id='b1000000-0000-4000-8000-000000000002';
update public.organization_entitlements set max_active_agents=0 where organization_id='b1000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.list_my_organizations() where organization_id='b1000000-0000-4000-8000-000000000002') then raise exception 'FAIL inactive membership visible'; end if;
 begin perform public.set_active_organization('b1000000-0000-4000-8000-000000000002'); raise exception 'FAIL inactive membership switch'; exception when raise_exception then if SQLERRM like 'FAIL%' then raise; end if; end;
 perform public.set_agent_status_v1(current_setting('test.agent_id')::uuid,'archived');
 begin perform public.set_agent_status_v1(current_setting('test.agent_id')::uuid,'paused'); raise exception 'FAIL restore capacity bypass'; exception when raise_exception then if SQLERRM like 'FAIL%' then raise; end if; end;
end $$;
reset role;
select 'PASS: owner/member/platform authorization, tenant isolation, create/edit/enable/disable/archive/restore, audit, capacity, switching and inactive membership' as result;
rollback;
