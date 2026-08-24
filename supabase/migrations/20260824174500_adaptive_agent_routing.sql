-- RYTHM OS — Adaptive Agent Routing foundation
-- Backward-compatible: legacy runtime_provider/runtime_model remain available as optional fallback/override fields.

alter table public.agents
  add column if not exists model_policy jsonb not null default '{"mode":"adaptive","allowEscalation":true,"maxEscalations":2,"maxRetries":1,"costStrategy":"balanced"}'::jsonb,
  add column if not exists language_policy jsonb not null default '{"mode":"automatic"}'::jsonb,
  add column if not exists routing_policy_key text not null default 'RYTHM_DEFAULT';

update public.agents
set model_policy = jsonb_build_object(
  'mode', 'adaptive',
  'allowEscalation', true,
  'maxEscalations', 2,
  'maxRetries', 1,
  'costStrategy', 'balanced',
  'legacyProvider', runtime_provider,
  'legacyModel', runtime_model
)
where model_policy is null
   or coalesce(model_policy->>'mode','') = '';

alter table public.organization_entitlements
  add column if not exists allowed_model_tiers jsonb not null default '["luna","terra","sol"]'::jsonb,
  add column if not exists advanced_reasoning_enabled boolean not null default true,
  add column if not exists preferred_cost_strategy text not null default 'balanced'
    check (preferred_cost_strategy in ('economy','balanced','quality')),
  add column if not exists max_ai_context_tokens integer,
  add column if not exists max_ai_cost_per_request numeric(12,6);

create table if not exists public.user_ai_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_language text,
  updated_at timestamptz not null default now()
);

alter table public.user_ai_preferences enable row level security;

drop policy if exists user_ai_preferences_select_own on public.user_ai_preferences;
create policy user_ai_preferences_select_own on public.user_ai_preferences
for select to authenticated using (user_id = auth.uid());

drop policy if exists user_ai_preferences_insert_own on public.user_ai_preferences;
create policy user_ai_preferences_insert_own on public.user_ai_preferences
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists user_ai_preferences_update_own on public.user_ai_preferences;
create policy user_ai_preferences_update_own on public.user_ai_preferences
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.ai_routing_decisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  task_type text not null,
  operation_type text not null,
  detected_language text not null,
  response_language text not null,
  complexity text not null check (complexity in ('low','medium','high')),
  risk_level text not null check (risk_level in ('low','medium','high','restricted')),
  selected_model_tier text not null check (selected_model_tier in ('luna','terra','sol')),
  provider text not null,
  provider_model text not null,
  reasoning_level text not null check (reasoning_level in ('low','medium','high')),
  routing_confidence numeric(5,4),
  routing_source text not null,
  escalation_index integer not null default 0 check (escalation_index >= 0),
  tools_used jsonb not null default '[]'::jsonb,
  latency_ms integer,
  input_tokens integer,
  cached_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(12,8),
  execution_status text not null default 'routed',
  validation_result text,
  created_at timestamptz not null default now(),
  unique (request_id, escalation_index)
);

create index if not exists ai_routing_decisions_org_created_idx
  on public.ai_routing_decisions (organization_id, created_at desc);
create index if not exists ai_routing_decisions_agent_created_idx
  on public.ai_routing_decisions (agent_id, created_at desc)
  where agent_id is not null;

alter table public.ai_routing_decisions enable row level security;

drop policy if exists ai_routing_decisions_select_org on public.ai_routing_decisions;
create policy ai_routing_decisions_select_org on public.ai_routing_decisions
for select to authenticated using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = ai_routing_decisions.organization_id
      and om.user_id = auth.uid()
  )
);

drop policy if exists ai_routing_decisions_insert_org on public.ai_routing_decisions;
create policy ai_routing_decisions_insert_org on public.ai_routing_decisions
for insert to authenticated with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.organization_members om
    where om.organization_id = ai_routing_decisions.organization_id
      and om.user_id = auth.uid()
  )
);

comment on column public.agents.runtime_provider is 'Legacy fallback/fixed override. Adaptive routing is governed by model_policy.';
comment on column public.agents.runtime_model is 'Legacy fallback/fixed override. Adaptive routing is governed by model_policy.';
comment on table public.ai_routing_decisions is 'Structured, content-minimized telemetry for RYTHM Request Intelligence and Adaptive Routing.';
