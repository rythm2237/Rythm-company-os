-- RYTHM Project OS scheduler for environments where frequent Vercel Cron is unavailable.
-- The dispatcher remains an authenticated server endpoint; Postgres pg_cron + pg_net invokes it.
-- Activation is explicit and stores the dispatcher credential in Supabase Vault.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.project_scheduler_config (
  id boolean primary key default true check(id=true),
  dispatcher_base_url text not null,
  vault_secret_id uuid not null,
  enabled boolean not null default true,
  cadence_minutes smallint not null default 5 check(cadence_minutes between 1 and 60),
  cron_job_id bigint,
  configured_by_user_id uuid references auth.users(id) on delete set null,
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.project_scheduler_config enable row level security;
revoke all on public.project_scheduler_config from public,anon,authenticated;
grant select on public.project_scheduler_config to service_role;

create or replace function public.dispatch_project_os_from_database_v1()
returns bigint
language plpgsql
security definer
set search_path=public,extensions,vault
as $$
declare cfg public.project_scheduler_config%rowtype; secret_value text; request_id bigint;
begin
  select * into cfg from public.project_scheduler_config where id=true and enabled=true;
  if cfg.id is null then return null; end if;
  select decrypted_secret into secret_value from vault.decrypted_secrets where id=cfg.vault_secret_id;
  if coalesce(secret_value,'')='' then raise exception 'Project scheduler secret unavailable'; end if;
  select net.http_get(
    url => rtrim(cfg.dispatcher_base_url,'/') || '/api/projects/dispatch',
    headers => jsonb_build_object('Authorization','Bearer '||secret_value,'User-Agent','RYTHM-Project-Scheduler/1.0'),
    timeout_milliseconds => 290000
  ) into request_id;
  return request_id;
end $$;
revoke all on function public.dispatch_project_os_from_database_v1() from public,anon,authenticated;
grant execute on function public.dispatch_project_os_from_database_v1() to service_role;

create or replace function public.configure_project_os_scheduler_v1(
  target_base_url text,
  target_cron_secret text,
  target_cadence_minutes integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,vault,cron
as $$
declare existing public.project_scheduler_config%rowtype; secret_id uuid; job_id bigint; cadence integer;
begin
  if coalesce(auth.role(),'')<>'service_role' and not exists(select 1 from public.organization_members where user_id=auth.uid() and role='owner') then
    raise exception 'Owner or service authorization required';
  end if;
  if target_base_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' then raise exception 'HTTPS application base URL required'; end if;
  if length(coalesce(target_cron_secret,''))<24 then raise exception 'Scheduler secret is too short'; end if;
  cadence:=greatest(1,least(coalesce(target_cadence_minutes,5),60));
  select * into existing from public.project_scheduler_config where id=true for update;
  if existing.cron_job_id is not null then perform cron.unschedule(existing.cron_job_id); end if;
  if existing.vault_secret_id is null then
    select vault.create_secret(target_cron_secret,'rythm-project-os-dispatcher','Credential for database project scheduler',null) into secret_id;
  else
    secret_id:=existing.vault_secret_id;
    perform vault.update_secret(secret_id,target_cron_secret,null,null,null);
  end if;
  select cron.schedule('rythm-project-os-dispatcher',format('*/%s * * * *',cadence),'select public.dispatch_project_os_from_database_v1();') into job_id;
  insert into public.project_scheduler_config(id,dispatcher_base_url,vault_secret_id,enabled,cadence_minutes,cron_job_id,configured_by_user_id,configured_at,updated_at)
  values(true,target_base_url,secret_id,true,cadence,job_id,auth.uid(),now(),now())
  on conflict(id) do update set dispatcher_base_url=excluded.dispatcher_base_url,vault_secret_id=excluded.vault_secret_id,enabled=true,cadence_minutes=excluded.cadence_minutes,cron_job_id=excluded.cron_job_id,configured_by_user_id=excluded.configured_by_user_id,configured_at=now(),updated_at=now();
  return jsonb_build_object('enabled',true,'cadence_minutes',cadence,'cron_job_id',job_id);
end $$;
revoke all on function public.configure_project_os_scheduler_v1(text,text,integer) from public,anon,authenticated;
grant execute on function public.configure_project_os_scheduler_v1(text,text,integer) to service_role;

create or replace function public.disable_project_os_scheduler_v1()
returns boolean
language plpgsql
security definer
set search_path=public,cron
as $$
declare job_id bigint;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service authorization required'; end if;
  select cron_job_id into job_id from public.project_scheduler_config where id=true;
  if job_id is not null then perform cron.unschedule(job_id); end if;
  update public.project_scheduler_config set enabled=false,cron_job_id=null,updated_at=now() where id=true;
  return true;
end $$;
revoke all on function public.disable_project_os_scheduler_v1() from public,anon,authenticated;
grant execute on function public.disable_project_os_scheduler_v1() to service_role;
