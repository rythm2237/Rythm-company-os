-- RYTHM Customer Connection Platform — Phase 1
-- Company authorization, discovered resources and project capability bindings are distinct.

begin;

alter table public.integration_providers
  add column if not exists setup_availability text not null default 'coming_later',
  add column if not exists connection_adapter_key text,
  add column if not exists resource_discovery_supported boolean not null default false,
  add column if not exists setup_plan jsonb not null default '{}'::jsonb;

alter table public.integration_providers drop constraint if exists integration_providers_setup_availability_check;
alter table public.integration_providers add constraint integration_providers_setup_availability_check
  check (setup_availability in ('available','setup_available','coming_later'));

update public.integration_providers set
  setup_availability=case
    when provider_key in ('google_search_console','google_analytics','google_workspace','microsoft_365','github','vercel','supabase','cloudflare') then 'available'
    when provider_key in ('figma','google_drive','google_ads','google_business_profile','slack','microsoft_teams','ahrefs','semrush','website_cms','meta_marketing','linkedin_marketing','youtube','tiktok_business') then 'setup_available'
    else 'coming_later' end,
  connection_adapter_key=case when provider_key in ('google_search_console','google_analytics','google_workspace','microsoft_365','github','vercel','supabase','cloudflare') then provider_key else null end,
  resource_discovery_supported=provider_key in ('google_search_console','google_analytics','github','vercel','supabase','cloudflare'),
  updated_at=now();

alter table public.organization_integrations
  add column if not exists authorization_started_at timestamptz,
  add column if not exists last_health_check_at timestamptz,
  add column if not exists last_error_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_message text;

alter table public.organization_integrations drop constraint if exists organization_integrations_status_check;
-- Preserve connections with concrete legacy verification evidence, while explicitly labelling
-- the backfill. Rows without a credential + verification timestamp are not trusted.
update public.organization_integrations set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('verification_result','verified','legacy_verified_backfill',true)
where status='connected' and last_verified_at is not null and (vault_secret_id is not null or provider_key='internal') and coalesce(metadata->>'verification_result','')<>'verified';
update public.organization_integrations set status='needs_attention', metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('verification_result','legacy_unverified')
where status in ('connected','degraded') and coalesce(metadata->>'verification_result','')<>'verified';
alter table public.organization_integrations alter column status set default 'not_started';
alter table public.organization_integrations add constraint organization_integrations_status_check check (status in (
  'not_started','setup_required','authorizing','verifying','connected','needs_attention','reauth_required','revoked','error','disconnected'
));

create table if not exists public.integration_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid not null references public.organization_integrations(id) on delete cascade,
  provider_key text not null references public.integration_providers(provider_key),
  resource_type text not null,
  resource_id text not null,
  resource_name text not null,
  resource_metadata jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  available boolean not null default true,
  unique(integration_id,resource_type,resource_id)
);
alter table public.integration_resources enable row level security;
drop policy if exists integration_resources_member_read on public.integration_resources;
create policy integration_resources_member_read on public.integration_resources for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists integration_resources_owner_write on public.integration_resources;
create policy integration_resources_owner_write on public.integration_resources for all to authenticated using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create index if not exists integration_resources_connection_idx on public.integration_resources(integration_id,available,resource_type);

create table if not exists public.integration_setup_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider_key text not null references public.integration_providers(provider_key),
  connection_id uuid references public.organization_integrations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  setup_plan jsonb not null default '{}'::jsonb,
  resource_requirement jsonb not null default '{}'::jsonb,
  current_step integer not null default 0 check(current_step>=0),
  step_status text not null default 'not_started' check(step_status in ('not_started','in_progress','waiting_for_user','completed','failed')),
  user_action_required boolean not null default false,
  human_takeover_reason text,
  resume_token_hash text,
  provider_context jsonb not null default '{}'::jsonb,
  verification_result jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.integration_setup_sessions enable row level security;
drop policy if exists integration_setup_sessions_member_read on public.integration_setup_sessions;
create policy integration_setup_sessions_member_read on public.integration_setup_sessions for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists integration_setup_sessions_owner_write on public.integration_setup_sessions;
create policy integration_setup_sessions_owner_write on public.integration_setup_sessions for all to authenticated using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

alter table public.project_connection_bindings
  add column if not exists provider_key text,
  add column if not exists resource_id text,
  add column if not exists resource_name text,
  add column if not exists capabilities text[] not null default '{}'::text[],
  add column if not exists binding_status text not null default 'pending',
  add column if not exists verified_at timestamptz;
alter table public.project_connection_bindings drop constraint if exists project_connection_bindings_binding_status_check;
alter table public.project_connection_bindings add constraint project_connection_bindings_binding_status_check
  check(binding_status in ('pending','verified','needs_attention','revoked'));

-- Credential storage never proves provider access. Verification is a separate, explicit step.
create or replace function public.store_organization_integration_secret_unverified_v1(target_integration_id uuid, secret_value text)
returns uuid language plpgsql security definer set search_path=public,vault as $$
declare target_org uuid; existing_secret uuid; result_id uuid;
begin
  select organization_id,vault_secret_id into target_org,existing_secret from public.organization_integrations where id=target_integration_id;
  if target_org is null then raise exception 'Integration not found'; end if;
  if not public.is_org_owner(target_org) then raise exception 'Owner authorization required'; end if;
  if length(coalesce(secret_value,''))<8 then raise exception 'Secret is invalid'; end if;
  if existing_secret is null then
    select vault.create_secret(secret_value,'rythm-integration-'||target_integration_id::text,'RYTHM organization integration credential',null) into result_id;
  else
    perform vault.update_secret(existing_secret,secret_value,null,null,null); result_id:=existing_secret;
  end if;
  update public.organization_integrations set vault_secret_id=result_id,status='verifying',updated_at=now() where id=target_integration_id;
  return result_id;
end $$;
revoke all on function public.store_organization_integration_secret_unverified_v1(uuid,text) from public,anon;
grant execute on function public.store_organization_integration_secret_unverified_v1(uuid,text) to authenticated;

-- Preserve the old RPC name for callers, but remove its legacy fake-success side effect.
create or replace function public.set_organization_integration_secret_v1(target_integration_id uuid, secret_value text)
returns uuid language sql security invoker set search_path=public as $$
  select public.store_organization_integration_secret_unverified_v1(target_integration_id,secret_value)
$$;

create or replace function public.enforce_verified_connection_state_v1()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.status='connected' and (
    (new.vault_secret_id is null and new.provider_key<>'internal') or new.connected_at is null or new.last_verified_at is null or
    coalesce(new.metadata->>'verification_result','')<>'verified'
  ) then raise exception 'Connected requires a verified provider credential'; end if;
  return new;
end $$;
drop trigger if exists trg_enforce_verified_connection_state on public.organization_integrations;
create trigger trg_enforce_verified_connection_state before insert or update on public.organization_integrations
for each row execute function public.enforce_verified_connection_state_v1();

insert into public.integration_capabilities(provider_key,capability_key,risk_level,default_approval_mode,description) values
  ('google_search_console','read.search_console','low','autonomous','Read verified Search Console properties and performance data'),
  ('google_analytics','read.analytics','low','autonomous','Read verified GA4 account and property analytics'),
  ('github','repository.read','low','autonomous','Read one bound repository'),
  ('github','repository.write','medium','approval_required','Write to one bound repository'),
  ('github','repository.merge','high','approval_required','Merge an approved pull request'),
  ('vercel','deployment.execute','high','approval_required','Execute a deployment for one bound project'),
  ('cloudflare','zone.read','low','autonomous','Read one bound Cloudflare zone'),
  ('supabase','project.read','low','autonomous','Read one bound Supabase project')
on conflict(provider_key,capability_key) do update set risk_level=excluded.risk_level,default_approval_mode=excluded.default_approval_mode,description=excluded.description;

commit;
