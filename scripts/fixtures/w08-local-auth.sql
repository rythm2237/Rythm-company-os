-- W08 disposable local Auth fixture ONLY. Never apply to hosted staging or production.
create table public.organizations (id uuid primary key, name text not null, slug text not null, status text default 'draft', owner_user_id uuid references auth.users(id));
create table public.organization_members (organization_id uuid references public.organizations(id), user_id uuid references auth.users(id), role text not null, membership_status text default 'active', primary key(organization_id,user_id));
create table public.w08_active_org (user_id uuid primary key references auth.users(id), organization_id uuid references public.organizations(id));
create table public.customer_profiles (user_id uuid primary key references auth.users(id), full_name text, onboarding_status text, updated_at timestamptz);
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.w08_active_org enable row level security;
alter table public.customer_profiles enable row level security;
create policy w08_member_read on public.organization_members for select to authenticated using (user_id=auth.uid() and membership_status='active');
create policy w08_org_read on public.organizations for select to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=id and m.user_id=auth.uid() and m.membership_status='active'));
create policy w08_active_own on public.w08_active_org for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and exists(select 1 from public.organization_members m where m.organization_id=w08_active_org.organization_id and m.user_id=auth.uid() and m.membership_status='active'));
create policy w08_profile_own on public.customer_profiles for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select on public.organizations, public.organization_members to authenticated;
grant select,insert,update on public.w08_active_org,public.customer_profiles to authenticated;
grant all on public.organizations, public.organization_members, public.w08_active_org,public.customer_profiles to service_role;
create function public.list_my_organizations() returns table(organization_id uuid, organization_name text, organization_slug text, organization_status text, owner_user_id uuid, membership_role text,is_active boolean) language sql stable security invoker set search_path='' as $$
select o.id,o.name,o.slug,o.status,o.owner_user_id,m.role,coalesce(a.organization_id=o.id,false) from public.organization_members m join public.organizations o on o.id=m.organization_id left join public.w08_active_org a on a.user_id=m.user_id where m.user_id=auth.uid() and m.membership_status='active' order by o.name
$$;
create function public.set_active_organization(target_org_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.organization_members m where m.user_id=auth.uid() and m.organization_id=target_org_id and m.membership_status='active') then raise exception 'not authorized'; end if;
 insert into public.w08_active_org(user_id,organization_id) values(auth.uid(),target_org_id) on conflict(user_id) do update set organization_id=excluded.organization_id;
 return target_org_id;
end $$;
revoke all on function public.list_my_organizations() from public,anon;
revoke all on function public.set_active_organization(uuid) from public,anon;
grant execute on function public.list_my_organizations(),public.set_active_organization(uuid) to authenticated;
