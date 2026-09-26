begin;
create table public.organization_branding (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 logo_path text,
 updated_at timestamptz not null default now(),
 constraint organization_logo_path check (logo_path is null or logo_path ~ ('^' || organization_id::text || '/[0-9a-f-]{36}\.webp$'))
);
alter table public.organization_branding enable row level security;
revoke all on public.organization_branding from anon,authenticated;
grant select,insert,update on public.organization_branding to authenticated;
create policy branding_read on public.organization_branding for select to authenticated using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy branding_insert on public.organization_branding for insert to authenticated with check (public.is_org_owner(organization_id));
create policy branding_update on public.organization_branding for update to authenticated using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create function public.audit_organization_branding() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.organization_id<>old.organization_id then raise exception 'Company cannot be reassigned'; end if;
 new.updated_at:=clock_timestamp();
 insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,payload)
 values(new.organization_id,'user',auth.uid(),case when new.logo_path is null then 'organization.logo_removed' else 'organization.logo_updated' end,'organization',new.organization_id::text,'{}'::jsonb);
 return new;
end $$;
revoke all on function public.audit_organization_branding() from public,anon,authenticated;
create trigger audit_organization_branding before insert or update on public.organization_branding for each row execute function public.audit_organization_branding();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('company-logos','company-logos',false,2097152,array['image/webp']);
create policy company_logos_read on storage.objects for select to authenticated using (
 bucket_id='company-logos' and (public.is_org_owner(case when split_part(name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(name,'/',1)::uuid else null end) or exists(select 1 from public.organization_branding b where b.logo_path=name and (public.is_org_member(b.organization_id) or public.is_platform_admin())))
);
create policy company_logos_insert on storage.objects for insert to authenticated with check (bucket_id='company-logos' and public.is_org_owner(case when split_part(name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(name,'/',1)::uuid else null end) and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$');
create policy company_logos_delete on storage.objects for delete to authenticated using (bucket_id='company-logos' and public.is_org_owner(case when split_part(name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(name,'/',1)::uuid else null end));
-- No UPDATE policy: unique immutable objects avoid overwriting another active logo.
create or replace function public.platform_customer_list_v1(p_search text default '', p_status text default '', p_sort text default 'newest', p_page integer default 1)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator required' using errcode='42501'; end if;
 with customers as (
 select o.id,o.name,o.status,o.created_at,
 (select b.updated_at from public.organization_branding b where b.organization_id=o.id and b.logo_path is not null) as logo_version,
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
 'logo_version',(select updated_at from public.organization_branding where organization_id=p_organization_id and logo_path is not null),
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
