begin;
-- Replace the existing RPCs in place: the previous confidential API is not retained.
-- Cross-tenant SECURITY DEFINER reads remain allowlist-gated and audited.
-- Only service-account fields and aggregate resource counts are selected.
-- Search excludes private fields as well, preventing a count/existence oracle.
create or replace function public.platform_customer_list_v1(p_search text default '', p_status text default '', p_sort text default 'newest', p_page integer default 1)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator required' using errcode='42501'; end if;
 with customers as (
 select o.id,o.name,o.status,o.created_at,
 e.plan_code,e.product_code,e.status as entitlement_status,
 (select count(*) from public.organization_members m where m.organization_id=o.id and m.membership_status='active') as user_count,
 (select count(*) from public.agents a where a.organization_id=o.id) as agent_count,
 (select count(*) from public.agents a where a.organization_id=o.id and a.agent_status='enabled' and a.enabled) as active_agent_count,
 (select count(*) from public.organization_integrations i where i.organization_id=o.id) as integration_count
 from public.organizations o
 left join public.organization_entitlements e on e.organization_id=o.id
 where (coalesce(p_status,'')='' or o.status::text=p_status)
 and (coalesce(p_search,'')='' or concat_ws(' ',o.name,o.id::text,e.plan_code,e.product_code) ilike '%'||left(p_search,200)||'%')
 ), page as (
 select * from customers order by
 case when p_sort='name' then lower(name) end asc,
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
 'company',(select to_jsonb(c) from (select id,name,status,created_at from public.organizations where id=p_organization_id)c),
 'entitlement',(select to_jsonb(e) from (select product_code,plan_code,status,starts_at,ends_at,max_active_agents,agent_builder_enabled,agent_create_enabled,agent_archive_enabled from public.organization_entitlements where organization_id=p_organization_id)e),
 'counts',jsonb_build_object(
   'users',(select count(*) from public.organization_members where organization_id=p_organization_id and membership_status='active'),
   'memberships',(select count(*) from public.organization_members where organization_id=p_organization_id),
   'agents',(select count(*) from public.agents where organization_id=p_organization_id),
   'enabled_agents',(select count(*) from public.agents where organization_id=p_organization_id and agent_status='enabled' and enabled),
   'archived_agents',(select count(*) from public.agents where organization_id=p_organization_id and agent_status='archived'),
   'integrations',(select count(*) from public.organization_integrations where organization_id=p_organization_id),
   'connected_integrations',(select count(*) from public.organization_integrations where organization_id=p_organization_id and status='connected' and enabled)
 ),
 -- Empty compatibility containers keep the previous UI safe during rollout.
 -- They never contain customer data. Do not restore their former fields.
 'users','[]'::jsonb,'agents','[]'::jsonb,'integrations','[]'::jsonb,
 'billing','[]'::jsonb,'activity','[]'::jsonb,
 'usage',jsonb_build_object('agent_cost_usd',null),'last_activity',null
 ) into result;
 insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,payload)
 values(p_organization_id,'user',auth.uid(),'platform.customer_detail_viewed','organization',p_organization_id::text,jsonb_build_object('source','admin/customers/detail'));
 return result;
end $$;
revoke all on function public.platform_customer_list_v1(text,text,text,integer) from public,anon;
revoke all on function public.platform_customer_detail_v1(uuid) from public,anon;
grant execute on function public.platform_customer_list_v1(text,text,text,integer),public.platform_customer_detail_v1(uuid) to authenticated;

commit;
