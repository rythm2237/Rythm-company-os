begin;
-- Reuse existing identity and roles; deactivated memberships confer no access.
create or replace function public.is_org_member(target_org uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.organization_members where organization_id=target_org and user_id=auth.uid() and membership_status='active')
$$;
create or replace function public.is_org_owner(target_org uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.organization_members where organization_id=target_org and user_id=auth.uid() and role='owner' and membership_status='active')
$$;
-- Preserve the existing switch contract, adding membership status validation.
do $$ declare definition text; begin
 select pg_get_functiondef('public.list_my_organizations()'::regprocedure) into definition;
 definition:=replace(definition,'where om.user_id = auth.uid()', 'where om.user_id = auth.uid() and om.membership_status = ''active'''); execute definition;
 select pg_get_functiondef('public.set_active_organization(uuid)'::regprocedure) into definition;
 definition:=replace(definition,'and om.organization_id = target_org_id','and om.organization_id = target_org_id and om.membership_status = ''active'''); execute definition;
end $$;

-- Explicit cross-tenant read API, gated by the existing platform-admin allowlist.
-- SECURITY DEFINER is required for this audited read across tenant RLS and for
-- selecting only the email field from auth.users. No service-role client is used.
create or replace function public.platform_customer_list_v1(p_search text default '', p_status text default '', p_sort text default 'newest', p_page integer default 1)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator required' using errcode='42501'; end if;
 with customers as (
 select o.id,o.name,o.status,o.website_url,o.country_code,o.created_at,
 coalesce(cp.full_name,om.display_name) as owner_name,u.email as owner_email,
 e.plan_code,e.product_code,e.status as entitlement_status,cp.onboarding_status,
 (select count(*) from public.organization_members m where m.organization_id=o.id and m.membership_status='active') as user_count,
 (select count(*) from public.agents a where a.organization_id=o.id) as agent_count,
 (select count(*) from public.agents a where a.organization_id=o.id and a.agent_status='enabled' and a.enabled) as active_agent_count,
 (select count(*) from public.organization_integrations i where i.organization_id=o.id) as integration_count,
 (select max(a.created_at) from public.audit_events a where a.organization_id=o.id and a.event_type not like 'platform.customer%') as last_activity
 from public.organizations o
 left join public.customer_profiles cp on cp.user_id=o.owner_user_id
 left join public.organization_members om on om.organization_id=o.id and om.user_id=o.owner_user_id
 left join auth.users u on u.id=o.owner_user_id
 left join public.organization_entitlements e on e.organization_id=o.id
 where (coalesce(p_status,'')='' or o.status::text=p_status)
 and (coalesce(p_search,'')='' or concat_ws(' ',o.name,o.id::text,cp.full_name,om.display_name,u.email,o.website_url,e.plan_code,e.product_code,o.country_code) ilike '%'||left(p_search,200)||'%')
 ), page as (
 select * from customers order by
 case when p_sort='name' then lower(name) end asc,
 case when p_sort='activity' then last_activity end desc nulls last,
 case when p_sort='agents' then agent_count end desc,
 created_at desc,id limit 25 offset ((greatest(1,least(coalesce(p_page,1),100000))-1)*25)
 ) select jsonb_build_object('total',(select count(*) from customers),'items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into result;
 insert into public.audit_events(actor_type,actor_user_id,event_type,object_type,payload)
 values('user',auth.uid(),'platform.customer_list_viewed','organization',jsonb_build_object('page',p_page,'result_count',jsonb_array_length(result->'items'),'source','admin/customers'));
 return result;
end $$;

create or replace function public.platform_customer_detail_v1(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator required' using errcode='42501'; end if;
 if not exists(select 1 from public.organizations where id=p_organization_id) then return null; end if;
 select jsonb_build_object(
 'company',(select to_jsonb(c) from (select id,name,slug,status,mission,vision,website_url,country_code,timezone,primary_email,primary_phone,created_at,owner_user_id from public.organizations where id=p_organization_id)c),
 'entitlement',(select to_jsonb(e) from (select product_code,plan_code,status,starts_at,ends_at,max_active_agents,agent_builder_enabled,agent_create_enabled,agent_archive_enabled from public.organization_entitlements where organization_id=p_organization_id)e),
 'users',coalesce((select jsonb_agg(to_jsonb(m)) from (select om.user_id,coalesce(om.display_name,cp.full_name) as name,u.email,om.role,om.membership_status,coalesce(om.joined_at,om.created_at) as joined_at,cp.onboarding_status from public.organization_members om left join public.customer_profiles cp on cp.user_id=om.user_id left join auth.users u on u.id=om.user_id where om.organization_id=p_organization_id order by om.created_at)m),'[]'::jsonb),
 'agents',coalesce((select jsonb_agg(to_jsonb(a)) from (select a.id,a.agent_code,a.name,a.role_title,a.purpose,a.agent_status,a.enabled,d.name as department,a.runtime_provider,a.runtime_model,a.created_at,a.allowed_tools,a.authority_level,a.risk_ceiling,
 (select sum(r.cost_usd) from public.agent_runs r where r.organization_id=p_organization_id and r.agent_id=a.id) as recorded_cost_usd,
 (select max(r.created_at) from public.agent_runs r where r.organization_id=p_organization_id and r.agent_id=a.id) as last_activity,
 (select ev.actor_user_id from public.audit_events ev where ev.organization_id=p_organization_id and ev.object_id=a.id::text and ev.event_type in ('agent_studio.agent_created','agent_studio.agent_cloned','agent.configuration_insert') order by ev.created_at limit 1) as creator_id
 from public.agents a left join public.departments d on d.id=a.department_id and d.organization_id=p_organization_id where a.organization_id=p_organization_id order by a.name)a),'[]'::jsonb),
 'integrations',coalesce((select jsonb_agg(to_jsonb(i)) from (select provider_key,display_name,status,enabled,last_verified_at,last_health_check_at,last_error_at from public.organization_integrations where organization_id=p_organization_id order by display_name)i),'[]'::jsonb),
 'usage',jsonb_build_object('agent_cost_usd',(select sum(cost_usd) from public.agent_runs where organization_id=p_organization_id),'projects',(select count(*) from public.projects where organization_id=p_organization_id),'meetings',(select count(*) from public.meetings where organization_id=p_organization_id),'agent_runs',(select count(*) from public.agent_runs where organization_id=p_organization_id),'workspace_ai_requests',(select count(*) from public.ai_usage_requests where organization_id=p_organization_id),'last_agent_run',(select max(created_at) from public.agent_runs where organization_id=p_organization_id)),
 'billing',coalesce((select jsonb_agg(to_jsonb(b)) from (select status,currency,current_period_start,current_period_end,cancel_at_period_end from public.billing_subscriptions where organization_id=p_organization_id order by created_at desc)b),'[]'::jsonb),
 'activity',coalesce((select jsonb_agg(to_jsonb(ev)) from (select id,event_type,object_type,object_id,actor_user_id,actor_agent_id,created_at from public.audit_events where organization_id=p_organization_id order by created_at desc limit 100)ev),'[]'::jsonb),
 'last_activity',(select max(created_at) from public.audit_events where organization_id=p_organization_id and event_type not like 'platform.customer%')
 ) into result;
 insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,payload)
 values(p_organization_id,'user',auth.uid(),'platform.customer_detail_viewed','organization',p_organization_id::text,jsonb_build_object('source','admin/customers/detail'));
 return result;
end $$;
revoke all on function public.platform_customer_list_v1(text,text,text,integer) from public,anon;
revoke all on function public.platform_customer_detail_v1(uuid) from public,anon;
grant execute on function public.platform_customer_list_v1(text,text,text,integer),public.platform_customer_detail_v1(uuid) to authenticated;

-- Backward-compatible status names: enabled = active; paused = disabled.
create or replace function public.set_agent_status_v1(target_agent_id uuid,target_status text)
returns void language plpgsql security definer set search_path=public as $$
declare v_agent public.agents%rowtype; v_entitlement public.organization_entitlements%rowtype; v_status text:=lower(target_status); begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into v_agent from public.agents where id=target_agent_id;
 if v_agent.id is null or not public.is_org_owner(v_agent.organization_id) then raise exception 'Agent not found or not authorized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtext(v_agent.organization_id::text));
 select * into v_agent from public.agents where id=target_agent_id for update;
 select * into v_entitlement from public.organization_entitlements where organization_id=v_agent.organization_id;
 if v_entitlement.id is null or not v_entitlement.agent_builder_enabled or v_entitlement.status<>'active' or v_entitlement.starts_at>now() or v_entitlement.ends_at<=now() then raise exception 'Active Agent Builder entitlement required'; end if;
 if v_status is null or v_status not in ('enabled','paused','archived') then raise exception 'Invalid Agent status'; end if;
 if v_status='archived' and not v_entitlement.agent_archive_enabled then raise exception 'Agent archive is not enabled'; end if;
 if v_agent.agent_status='archived' then
  if v_status='enabled' then raise exception 'Restore archived Agents to Disabled before enabling'; end if;
  if v_status='paused' then
   if not v_entitlement.agent_archive_enabled then raise exception 'Agent restore is not enabled'; end if;
   if (select count(*) from public.agents where organization_id=v_agent.organization_id and agent_status<>'archived')>=v_entitlement.max_active_agents then raise exception 'Agent limit reached for this organization'; end if;
  end if;
 end if;
 if v_status='enabled' and v_agent.provisioning_status<>'ready' then raise exception 'Professional knowledge provisioning must be Ready before this Agent can be enabled'; end if;
 if v_status='enabled' and v_agent.template_version like 'trusted-bootstrap%' and not exists(select 1 from public.agent_role_foundation_bindings b join public.role_foundations f on f.id=b.role_foundation_id where b.agent_id=v_agent.id and b.organization_id=v_agent.organization_id and b.status='active' and f.status in ('validated','active')) then raise exception 'A validated Professional Role Foundation must be bound before this Agent can be enabled'; end if;
 update public.agents set agent_status=v_status,enabled=(v_status='enabled'),external_actions_allowed=false,updated_at=now() where id=target_agent_id and organization_id=v_agent.organization_id;
 insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
 values(v_agent.organization_id,'user',auth.uid(),case when v_agent.agent_status='archived' and v_status='paused' then 'agent_studio.agent_restored' else 'agent_studio.status_changed' end,'agent',target_agent_id::text,'medium',jsonb_build_object('before',v_agent.agent_status,'after',v_status,'source','agent_studio','external_actions_allowed',false));
end $$;
revoke all on function public.set_agent_status_v1(uuid,text) from public,anon;
grant execute on function public.set_agent_status_v1(uuid,text) to authenticated;
-- Preserve history: customer clients must use archive, never hard-delete.
revoke delete,truncate on public.agents from authenticated,anon;

-- Audit all configuration writes, including existing provisioning paths.
create or replace function public.audit_agent_configuration_v1() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='UPDATE' and new.organization_id<>old.organization_id then raise exception 'Agent organization cannot be reassigned'; end if;
 if TG_OP='INSERT' or (old.name,old.role_title,old.purpose,old.department_id,old.allowed_tools,old.authority_level,old.risk_ceiling,old.agent_status,old.enabled) is distinct from (new.name,new.role_title,new.purpose,new.department_id,new.allowed_tools,new.authority_level,new.risk_ceiling,new.agent_status,new.enabled) then
 insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,payload)
 values(new.organization_id,case when auth.uid() is null then 'system' else 'user' end,auth.uid(),'agent.configuration_'||lower(TG_OP),'agent',new.id::text,jsonb_build_object('before',case when TG_OP='UPDATE' then jsonb_build_object('name',old.name,'role',old.role_title,'department_id',old.department_id,'allowed_tools',old.allowed_tools,'authority_level',old.authority_level,'status',old.agent_status,'enabled',old.enabled) else null end,'after',jsonb_build_object('name',new.name,'role',new.role_title,'department_id',new.department_id,'allowed_tools',new.allowed_tools,'authority_level',new.authority_level,'status',new.agent_status,'enabled',new.enabled)));
 end if;
 return new;
end $$;
revoke all on function public.audit_agent_configuration_v1() from public,anon,authenticated;
create trigger audit_agent_configuration_v1 after insert or update on public.agents for each row execute function public.audit_agent_configuration_v1();
create or replace function public.guard_agent_lifecycle_v1() returns trigger language plpgsql security definer set search_path=public as $$
declare ent public.organization_entitlements%rowtype; begin
 if new.organization_id<>old.organization_id then raise exception 'Agent organization cannot be reassigned'; end if;
 if new.role_title is distinct from old.role_title and old.template_version like 'trusted-bootstrap%' then
  new.agent_status:='paused'; new.enabled:=false; new.provisioning_status:='failed'; new.provisioning_error:='Role changed. Re-provision professional knowledge before enabling.';
 end if;
 if (new.agent_status,new.enabled) is not distinct from (old.agent_status,old.enabled) then return new; end if;
 if new.enabled is distinct from (new.agent_status='enabled') then raise exception 'Agent status and enabled flag must agree'; end if;
 if old.agent_status='archived' and new.agent_status='enabled' then raise exception 'Restore archived Agents to Disabled before enabling'; end if;
 if old.agent_status='archived' and new.agent_status<>'archived' then
  perform pg_advisory_xact_lock(hashtext(new.organization_id::text));
  select * into ent from public.organization_entitlements where organization_id=new.organization_id;
  if ent.id is null or ent.status<>'active' or not ent.agent_archive_enabled or ent.starts_at>now() or ent.ends_at<=now() then raise exception 'Active archive entitlement required to restore'; end if;
  if (select count(*) from public.agents where organization_id=new.organization_id and agent_status<>'archived' and id<>new.id)>=ent.max_active_agents then raise exception 'Agent limit reached for this organization'; end if;
 end if;
 if new.agent_status='enabled' and new.provisioning_status<>'ready' then raise exception 'Professional knowledge must be Ready before enabling'; end if;
 if new.agent_status='enabled' and new.template_version like 'trusted-bootstrap%' and not exists(select 1 from public.agent_role_foundation_bindings b join public.role_foundations f on f.id=b.role_foundation_id where b.agent_id=new.id and b.organization_id=new.organization_id and b.status='active' and f.status in ('validated','active')) then raise exception 'Validated professional foundation required'; end if;
 return new;
end $$;
revoke all on function public.guard_agent_lifecycle_v1() from public,anon,authenticated;
create trigger guard_agent_lifecycle_v1 before update on public.agents for each row execute function public.guard_agent_lifecycle_v1();
commit;
