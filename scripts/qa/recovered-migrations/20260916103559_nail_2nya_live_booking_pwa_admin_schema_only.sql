create table if not exists public.nail_2nya_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nail_2nya_push_deliveries (
  appointment_id uuid primary key references public.nail_2nya_appointments(id) on delete cascade,
  notified_at timestamptz not null default now()
);

alter table public.nail_2nya_push_subscriptions enable row level security;
alter table public.nail_2nya_push_deliveries enable row level security;

drop policy if exists nail_2nya_push_admin_all on public.nail_2nya_push_subscriptions;
create policy nail_2nya_push_admin_all on public.nail_2nya_push_subscriptions for all to authenticated using (public.nail_2nya_is_admin()) with check (public.nail_2nya_is_admin() and auth_user_id = auth.uid());

drop policy if exists nail_2nya_push_delivery_admin_read on public.nail_2nya_push_deliveries;
create policy nail_2nya_push_delivery_admin_read on public.nail_2nya_push_deliveries for select to authenticated using (public.nail_2nya_is_admin());

grant select, insert, update, delete on public.nail_2nya_push_subscriptions to authenticated;
grant select on public.nail_2nya_push_deliveries to authenticated;

create or replace function public.nail_2nya_claim_admin(p_code text)
returns jsonb
language plpgsql
security definer
set search_path='public','extensions','auth'
as $$
declare v_hash text; v_count int;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'code','authentication_required'); end if;
  select count(*) into v_count from public.nail_2nya_admin_users where active=true;
  if v_count > 0 then return jsonb_build_object('ok',false,'code','already_initialized'); end if;
  select value->>'sha256' into v_hash from public.nail_2nya_site_settings where key='admin_bootstrap';
  if v_hash is null or encode(extensions.digest(coalesce(p_code,'')::bytea,'sha256'),'hex') <> v_hash then
    return jsonb_build_object('ok',false,'code','invalid_code');
  end if;
  insert into public.nail_2nya_admin_users(auth_user_id,display_name,active)
  values(auth.uid(),coalesce((select raw_user_meta_data->>'full_name' from auth.users where id=auth.uid()),'2nya Admin'),true)
  on conflict (auth_user_id) do update set active=true;
  delete from public.nail_2nya_site_settings where key='admin_bootstrap';
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.nail_2nya_claim_admin(text) to authenticated;


do $$ begin
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='nail_2nya_appointments'
  ) then
    alter publication supabase_realtime add table public.nail_2nya_appointments;
  end if;
end $$;