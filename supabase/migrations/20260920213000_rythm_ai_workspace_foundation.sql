-- RYTHM AI Workspace shared personal/company/guest usage foundation.
-- Existing RYTHM organizations, agents, integrations, approvals and billing-provider tables remain canonical.

create table if not exists public.aiw_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  kind text not null check (kind in ('personal','guest')),
  status text not null default 'active' check (status in ('active','paused','blocked')),
  daily_limit_micros bigint not null default 0 check (daily_limit_micros between 0 and 1000000000000),
  monthly_limit_micros bigint not null default 0 check (monthly_limit_micros between 0 and 1000000000000),
  max_request_micros bigint not null default 250000 check (max_request_micros between 0 and 1000000000),
  allowed_modes text[] not null default array['auto','fast','best'],
  allowed_prompt_profiles text[] not null default array['normal','professional'],
  allowed_models text[] not null default array[]::text[],
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind='personal' and user_id is not null) or (kind='guest' and user_id is null))
);

create table if not exists public.aiw_workspaces (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.aiw_accounts(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('personal','company')),
  name text not null check (length(name) between 1 and 120),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(account_id, kind),
  check ((kind='personal' and account_id is not null and organization_id is null) or (kind='company' and organization_id is not null))
);

create unique index if not exists aiw_company_workspace_unique on public.aiw_workspaces(organization_id) where kind='company';

create table if not exists public.aiw_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.aiw_workspaces(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  description text not null default '' check (length(description) <= 2000),
  instructions text not null default '' check (length(instructions) <= 12000),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aiw_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.aiw_workspaces(id) on delete cascade,
  project_id uuid references public.aiw_projects(id) on delete cascade,
  title text not null default 'New chat' check (length(title) between 1 and 160),
  archived boolean not null default false,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aiw_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.aiw_workspaces(id) on delete cascade,
  conversation_id uuid not null references public.aiw_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) between 1 and 500000),
  request_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists aiw_messages_conversation_created on public.aiw_messages(conversation_id, created_at);

create table if not exists public.aiw_saved_prompts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.aiw_workspaces(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  content text not null check (length(content) between 1 and 24000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aiw_memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.aiw_workspaces(id) on delete cascade,
  project_id uuid references public.aiw_projects(id) on delete cascade,
  scope text not null check (scope in ('personal','project','company')),
  title text not null check (length(title) between 1 and 160),
  content text not null check (length(content) between 1 and 12000),
  source_type text not null default 'user',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aiw_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.aiw_workspaces(id) on delete cascade,
  project_id uuid references public.aiw_projects(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  storage_path text not null unique,
  byte_size bigint not null check (byte_size between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  ingestion_status text not null default 'pending' check (ingestion_status in ('pending','processing','ready','failed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(workspace_id, sha256)
);

create table if not exists public.aiw_file_chunks (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.aiw_files(id) on delete cascade,
  workspace_id uuid not null references public.aiw_workspaces(id) on delete cascade,
  project_id uuid references public.aiw_projects(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (length(content) between 1 and 12000),
  metadata jsonb not null default '{}',
  unique(file_id, chunk_index)
);

create table if not exists public.aiw_skills (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.aiw_workspaces(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  name text not null check (length(name) between 1 and 120),
  description text not null default '',
  instructions text not null check (length(instructions) <= 16000),
  allowed_tools text[] not null default array[]::text[],
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Usage wallets are separate from provider billing/subscription records and are shared by personal, company and guest payers.
create table if not exists public.usage_wallets (
  id uuid primary key default gen_random_uuid(),
  payer_type text not null check (payer_type in ('personal','company','guest','trial','promo')),
  personal_account_id uuid references public.aiw_accounts(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  currency text not null default 'EUR',
  status text not null default 'active' check (status in ('active','paused','closed')),
  created_at timestamptz not null default now(),
  check ((payer_type in ('personal','guest','trial','promo') and personal_account_id is not null) or (payer_type='company' and organization_id is not null))
);
create unique index if not exists usage_wallet_personal_unique on public.usage_wallets(personal_account_id) where personal_account_id is not null and payer_type in ('personal','guest');
create unique index if not exists usage_wallet_company_unique on public.usage_wallets(organization_id) where organization_id is not null and payer_type='company';

create table if not exists public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.usage_wallets(id),
  request_id uuid,
  transaction_type text not null check (transaction_type in ('purchase','ai_usage_debit','adjustment','refund','promo_credit','guest_credit','agent_subscription_charge','reconciliation')),
  amount_micros bigint not null check (amount_micros between -1000000000000 and 1000000000000),
  currency text not null default 'EUR',
  source text not null,
  metadata jsonb not null default '{}',
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(request_id, transaction_type)
);
create index if not exists usage_ledger_wallet_created on public.usage_ledger(wallet_id, created_at);

create table if not exists public.ai_usage_requests (
  id uuid primary key,
  wallet_id uuid not null references public.usage_wallets(id),
  workspace_id uuid not null references public.aiw_workspaces(id),
  organization_id uuid references public.organizations(id),
  user_id uuid references auth.users(id),
  agent_id uuid references public.agents(id),
  conversation_id uuid references public.aiw_conversations(id),
  provider text,
  model text,
  request_kind text not null check (request_kind in ('answer','prompt_enhancement','agent_execution')),
  routing_mode text not null check (routing_mode in ('auto','fast','best')),
  prompt_profile text not null check (prompt_profile in ('normal','professional')),
  reserved_micros bigint not null check (reserved_micros >= 0),
  estimated_micros bigint,
  actual_micros bigint,
  margin_micros bigint,
  status text not null default 'reserved' check (status in ('reserved','provider_started','settled','released','uncertain','failed')),
  idempotency_key text not null unique,
  provider_request_id text,
  error_code text,
  created_at timestamptz not null default now(),
  provider_started_at timestamptz,
  settled_at timestamptz
);
create index if not exists ai_usage_wallet_status on public.ai_usage_requests(wallet_id, status, created_at);

create table if not exists public.aiw_guest_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  label text not null,
  status text not null default 'active' check (status in ('active','revoked')),
  initial_credit_micros bigint not null default 0 check (initial_credit_micros >= 0),
  per_request_cap_micros bigint not null default 100000 check (per_request_cap_micros >= 0),
  daily_limit_micros bigint not null default 0 check (daily_limit_micros >= 0),
  monthly_limit_micros bigint not null default 0 check (monthly_limit_micros >= 0),
  allowed_models text[] not null default array[]::text[],
  allowed_modes text[] not null default array['auto','fast'],
  expires_at timestamptz,
  device_limit integer not null default 1 check (device_limit between 1 and 10),
  activation_limit integer not null default 1 check (activation_limit between 1 and 1000),
  activation_count integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.aiw_guest_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.aiw_accounts(id) on delete cascade,
  guest_code_id uuid not null references public.aiw_guest_codes(id),
  session_hash text not null unique check (session_hash ~ '^[a-f0-9]{64}$'),
  device_hash text not null check (device_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_commercial_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  agent_template_id uuid references public.agent_templates(id),
  status text not null check (status in ('active','ended','trial')),
  monthly_price numeric(12,2),
  currency text not null default 'EUR',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_trials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  agent_template_id uuid not null references public.agent_templates(id),
  started_at timestamptz not null,
  ends_at timestamptz not null,
  usage_cap_micros bigint not null default 0,
  allowed_models text[] not null default array[]::text[],
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id, agent_template_id, user_id),
  check (ends_at > started_at)
);

create or replace function public.aiw_immutable_record()
returns trigger language plpgsql security invoker set search_path='' as $$ begin raise exception 'IMMUTABLE_RECORD'; end $$;

drop trigger if exists usage_ledger_immutable on public.usage_ledger;
create trigger usage_ledger_immutable before update or delete on public.usage_ledger for each row execute function public.aiw_immutable_record();

create or replace function public.aiw_reserve_usage(
  p_wallet uuid, p_workspace uuid, p_request uuid, p_idempotency text,
  p_amount bigint, p_kind text, p_mode text, p_profile text,
  p_user uuid default null, p_organization uuid default null,
  p_agent uuid default null, p_conversation uuid default null
) returns boolean language plpgsql security invoker set search_path='' as $$
declare
  w public.usage_wallets;
  account public.aiw_accounts;
  posted bigint;
  pending bigint;
  daily_spend bigint;
  monthly_spend bigint;
begin
  if p_amount <= 0 then return false; end if;
  select * into w from public.usage_wallets where id=p_wallet for update;
  if not found or w.status <> 'active' then return false; end if;
  if exists(select 1 from public.ai_usage_requests where idempotency_key=p_idempotency or id=p_request) then return false; end if;
  select coalesce(sum(amount_micros),0) into posted from public.usage_ledger where wallet_id=p_wallet;
  select coalesce(sum(reserved_micros),0) into pending from public.ai_usage_requests where wallet_id=p_wallet and status in ('reserved','provider_started','uncertain');
  if posted - pending < p_amount then return false; end if;
  if w.personal_account_id is not null then
    select * into account from public.aiw_accounts where id=w.personal_account_id for update;
    if not found or account.status <> 'active' or (account.expires_at is not null and account.expires_at <= now()) or p_amount > account.max_request_micros then return false; end if;
    select coalesce(-sum(amount_micros),0) into daily_spend from public.usage_ledger where wallet_id=p_wallet and transaction_type='ai_usage_debit' and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
    select coalesce(-sum(amount_micros),0) into monthly_spend from public.usage_ledger where wallet_id=p_wallet and transaction_type='ai_usage_debit' and created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
    if account.daily_limit_micros > 0 and daily_spend + pending + p_amount > account.daily_limit_micros then return false; end if;
    if account.monthly_limit_micros > 0 and monthly_spend + pending + p_amount > account.monthly_limit_micros then return false; end if;
  end if;
  insert into public.ai_usage_requests(id,wallet_id,workspace_id,organization_id,user_id,agent_id,conversation_id,request_kind,routing_mode,prompt_profile,reserved_micros,status,idempotency_key)
  values(p_request,p_wallet,p_workspace,p_organization,p_user,p_agent,p_conversation,p_kind,p_mode,p_profile,p_amount,'reserved',p_idempotency);
  return true;
end $$;

create or replace function public.aiw_mark_provider_started(p_request uuid, p_provider text, p_model text, p_provider_request text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.ai_usage_requests set status='provider_started',provider=p_provider,model=p_model,provider_request_id=p_provider_request,provider_started_at=now()
  where id=p_request and status='reserved';
  return found;
end $$;

create or replace function public.aiw_settle_usage(p_request uuid, p_actual bigint, p_metadata jsonb default '{}')
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.ai_usage_requests;
begin
  if p_actual < 0 then return false; end if;
  select * into r from public.ai_usage_requests where id=p_request for update;
  if not found or r.status not in ('reserved','provider_started') or p_actual > r.reserved_micros then return false; end if;
  insert into public.usage_ledger(wallet_id,request_id,transaction_type,amount_micros,source,metadata,actor_user_id)
  values(r.wallet_id,r.id,'ai_usage_debit',-p_actual,'ai_workspace',p_metadata,r.user_id);
  update public.ai_usage_requests set actual_micros=p_actual,status='settled',settled_at=now() where id=p_request;
  return true;
end $$;

create or replace function public.aiw_release_usage(p_request uuid, p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.ai_usage_requests set status='released',error_code=p_error,settled_at=now() where id=p_request and status='reserved';
  return found;
end $$;

create or replace function public.aiw_mark_uncertain(p_request uuid, p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.ai_usage_requests set status='uncertain',error_code=p_error where id=p_request and status in ('reserved','provider_started');
  return found;
end $$;

create or replace function public.aiw_wallet_balance(p_wallet uuid)
returns bigint language sql security invoker set search_path='' as $$
  select coalesce((select sum(amount_micros) from public.usage_ledger where wallet_id=p_wallet),0) -
         coalesce((select sum(reserved_micros) from public.ai_usage_requests where wallet_id=p_wallet and status in ('reserved','provider_started','uncertain')),0);
$$;

-- All AI Workspace storage is backend-mediated. Browser roles receive no direct CRUD or RPC execution.
do $$ declare t text; begin
  foreach t in array array['aiw_accounts','aiw_workspaces','aiw_projects','aiw_conversations','aiw_messages','aiw_saved_prompts','aiw_memories','aiw_files','aiw_file_chunks','aiw_skills','usage_wallets','usage_ledger','ai_usage_requests','aiw_guest_codes','aiw_guest_sessions','agent_commercial_contracts','agent_trials'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
  end loop;
end $$;

do $$ declare f text; begin
  foreach f in array array['aiw_reserve_usage','aiw_mark_provider_started','aiw_settle_usage','aiw_release_usage','aiw_mark_uncertain','aiw_wallet_balance'] loop
    execute format('revoke all on function public.%I from public, anon, authenticated',f);
    execute format('grant execute on function public.%I to service_role',f);
  end loop;
end $$;
