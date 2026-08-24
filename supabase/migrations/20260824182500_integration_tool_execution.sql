-- RYTHM Integration & Tool Execution Platform

create table if not exists public.integration_providers (
  provider_key text primary key,
  display_name text not null,
  category text not null,
  supports_oauth boolean not null default false,
  supports_token boolean not null default true,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_capabilities (
  provider_key text not null references public.integration_providers(provider_key) on delete cascade,
  capability_key text not null,
  risk_level text not null check (risk_level in ('low','medium','high','restricted')),
  default_approval_mode text not null check (default_approval_mode in ('autonomous','approval_required','human_only')),
  description text,
  primary key (provider_key, capability_key)
);

create table if not exists public.organization_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider_key text not null references public.integration_providers(provider_key),
  display_name text not null,
  account_ref text,
  base_url text,
  auth_type text not null default 'token' check (auth_type in ('oauth','token','service_account')),
  vault_secret_id uuid,
  status text not null default 'disconnected' check (status in ('disconnected','connected','degraded','revoked')),
  metadata jsonb not null default '{}'::jsonb,
  connected_by_user_id uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider_key, display_name)
);

create table if not exists public.agent_integration_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  integration_id uuid not null references public.organization_integrations(id) on delete cascade,
  capability_key text not null,
  approval_mode text not null check (approval_mode in ('autonomous','approval_required','human_only')),
  scope jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  granted_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (agent_id, integration_id, capability_key)
);

create table if not exists public.tool_execution_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  integration_id uuid not null references public.organization_integrations(id) on delete restrict,
  capability_key text not null,
  operation text not null,
  target_ref text,
  input jsonb not null default '{}'::jsonb,
  risk_level text not null check (risk_level in ('low','medium','high','restricted')),
  approval_mode text not null check (approval_mode in ('autonomous','approval_required','human_only')),
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  status text not null default 'requested' check (status in ('requested','awaiting_approval','approved','running','succeeded','failed','denied','cancelled')),
  idempotency_key text not null,
  safe_result jsonb not null default '{}'::jsonb,
  error_code text,
  latency_ms integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table if not exists public.tool_execution_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  execution_request_id uuid not null references public.tool_execution_requests(id) on delete cascade,
  event_type text not null,
  status text,
  safe_detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_org_integrations_org on public.organization_integrations(organization_id, provider_key);
create index if not exists idx_agent_grants_agent on public.agent_integration_grants(organization_id, agent_id);
create index if not exists idx_tool_exec_org_created on public.tool_execution_requests(organization_id, created_at desc);
create index if not exists idx_tool_exec_status on public.tool_execution_requests(organization_id, status);

alter table public.organization_integrations enable row level security;
alter table public.agent_integration_grants enable row level security;
alter table public.tool_execution_requests enable row level security;
alter table public.tool_execution_events enable row level security;

create policy organization_integrations_member_read on public.organization_integrations for select to authenticated using (exists (select 1 from public.organization_members m where m.organization_id=organization_integrations.organization_id and m.user_id=auth.uid()));
create policy organization_integrations_owner_write on public.organization_integrations for all to authenticated using (exists (select 1 from public.organization_members m where m.organization_id=organization_integrations.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin'))) with check (exists (select 1 from public.organization_members m where m.organization_id=organization_integrations.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')));
create policy agent_integration_grants_member_read on public.agent_integration_grants for select to authenticated using (exists (select 1 from public.organization_members m where m.organization_id=agent_integration_grants.organization_id and m.user_id=auth.uid()));
create policy agent_integration_grants_owner_write on public.agent_integration_grants for all to authenticated using (exists (select 1 from public.organization_members m where m.organization_id=agent_integration_grants.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin'))) with check (exists (select 1 from public.organization_members m where m.organization_id=agent_integration_grants.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')));
create policy tool_execution_requests_member_read on public.tool_execution_requests for select to authenticated using (exists (select 1 from public.organization_members m where m.organization_id=tool_execution_requests.organization_id and m.user_id=auth.uid()));
create policy tool_execution_events_member_read on public.tool_execution_events for select to authenticated using (exists (select 1 from public.organization_members m where m.organization_id=tool_execution_events.organization_id and m.user_id=auth.uid()));

-- Store/replace a provider token in Supabase Vault. Plaintext never lands in public tables.
create or replace function public.set_organization_integration_secret_v1(target_integration_id uuid, secret_value text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  target_org uuid;
  existing_secret uuid;
  result_id uuid;
begin
  select organization_id, vault_secret_id into target_org, existing_secret from public.organization_integrations where id=target_integration_id;
  if target_org is null then raise exception 'Integration not found'; end if;
  if not exists (select 1 from public.organization_members m where m.organization_id=target_org and m.user_id=auth.uid() and m.role in ('owner','admin')) then raise exception 'Owner/admin authorization required'; end if;
  if length(coalesce(secret_value,'')) < 8 then raise exception 'Secret is invalid'; end if;
  if existing_secret is null then
    select vault.create_secret(secret_value, 'rythm-integration-'||target_integration_id::text, 'RYTHM organization integration credential', null) into result_id;
    update public.organization_integrations set vault_secret_id=result_id,status='connected',connected_by_user_id=auth.uid(),connected_at=coalesce(connected_at,now()),last_verified_at=now(),updated_at=now() where id=target_integration_id;
  else
    perform vault.update_secret(existing_secret, secret_value, null, null, null);
    result_id := existing_secret;
    update public.organization_integrations set status='connected',last_verified_at=now(),updated_at=now() where id=target_integration_id;
  end if;
  return result_id;
end; $$;
revoke all on function public.set_organization_integration_secret_v1(uuid,text) from public, anon;
grant execute on function public.set_organization_integration_secret_v1(uuid,text) to authenticated;

insert into public.integration_providers(provider_key,display_name,category,supports_oauth,supports_token) values
('github','GitHub','source_control',true,true),
('vercel','Vercel','deployment',true,true),
('supabase','Supabase','database',true,true),
('cloudflare','Cloudflare','dns_edge',true,true),
('stripe','Stripe','payments',true,true),
('google_workspace','Google Workspace','productivity',true,true),
('microsoft_365','Microsoft 365','productivity',true,true)
on conflict (provider_key) do update set display_name=excluded.display_name, category=excluded.category, supports_oauth=excluded.supports_oauth, supports_token=excluded.supports_token;

insert into public.integration_capabilities(provider_key,capability_key,risk_level,default_approval_mode,description) values
('github','repo.read','low','autonomous','Read repository content and metadata'),
('github','branch.create','medium','autonomous','Create isolated branches'),
('github','code.write','medium','autonomous','Commit changes to non-protected branches'),
('github','pull_request.create','medium','autonomous','Create pull requests'),
('github','pull_request.merge','high','approval_required','Merge approved pull requests'),
('github','repo.delete','restricted','human_only','Delete repositories'),
('vercel','deployment.read','low','autonomous','Read deployments and logs'),
('vercel','preview.deploy','medium','autonomous','Create preview deployments'),
('vercel','production.deploy','high','approval_required','Deploy or promote production'),
('vercel','project.delete','restricted','human_only','Delete projects'),
('supabase','schema.read','low','autonomous','Inspect schema and health'),
('supabase','sql.read','low','autonomous','Execute read-only queries'),
('supabase','migration.apply','high','approval_required','Apply database migrations'),
('supabase','data.delete','restricted','human_only','Destructive production data changes'),
('cloudflare','dns.read','low','autonomous','Read DNS configuration'),
('cloudflare','dns.write','high','approval_required','Change DNS records'),
('stripe','billing.read','low','autonomous','Read billing state'),
('stripe','refund.create','high','approval_required','Issue a refund'),
('stripe','payout.modify','restricted','human_only','Modify payouts or settlement'),
('google_workspace','calendar.read','low','autonomous','Read company calendar'),
('google_workspace','calendar.write','medium','approval_required','Create or update external calendar events'),
('google_workspace','email.send','high','approval_required','Send external email'),
('microsoft_365','calendar.read','low','autonomous','Read company calendar'),
('microsoft_365','calendar.write','medium','approval_required','Create or update external calendar events'),
('microsoft_365','email.send','high','approval_required','Send external email')
on conflict (provider_key,capability_key) do update set risk_level=excluded.risk_level, default_approval_mode=excluded.default_approval_mode, description=excluded.description;
