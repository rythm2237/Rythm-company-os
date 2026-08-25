-- RYTHM OS Phase 1B — routing rollout controls and content-minimized telemetry.
-- Additive and backward compatible. Existing request_id remains the canonical
-- correlation identifier and existing selected_* columns remain populated.

create table if not exists public.ai_routing_rollout_config (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'environment', 'organization')),
  environment text,
  organization_id uuid references public.organizations(id) on delete cascade,
  routing_mode text not null default 'off' check (routing_mode in ('off', 'shadow', 'enforced')),
  kill_switch boolean not null default false,
  policy_version text not null default 'routing-policy-v1',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_routing_rollout_config_scope_shape check (
    (scope = 'global' and environment is null and organization_id is null)
    or (scope = 'environment' and environment is not null and organization_id is null)
    or (scope = 'organization' and environment is null and organization_id is not null)
  )
);

create unique index if not exists ai_routing_rollout_global_unique
  on public.ai_routing_rollout_config (scope) where scope = 'global';
create unique index if not exists ai_routing_rollout_environment_unique
  on public.ai_routing_rollout_config (environment) where scope = 'environment';
create unique index if not exists ai_routing_rollout_organization_unique
  on public.ai_routing_rollout_config (organization_id) where scope = 'organization';

alter table public.ai_routing_rollout_config enable row level security;

drop policy if exists ai_routing_rollout_config_member_read on public.ai_routing_rollout_config;
create policy ai_routing_rollout_config_member_read
on public.ai_routing_rollout_config
for select
to authenticated
using (
  scope in ('global', 'environment')
  or exists (
    select 1
    from public.organization_members om
    where om.organization_id = ai_routing_rollout_config.organization_id
      and om.user_id = (select auth.uid())
  )
);

revoke all on table public.ai_routing_rollout_config from public, anon, authenticated;
grant select on table public.ai_routing_rollout_config to authenticated;
grant select, insert, update, delete on table public.ai_routing_rollout_config to service_role;

insert into public.ai_routing_rollout_config (scope, routing_mode, policy_version)
values ('global', 'off', 'routing-policy-v1')
on conflict (scope) where scope = 'global' do nothing;

alter table public.ai_routing_decisions
  add column if not exists request_type text,
  add column if not exists routing_mode text not null default 'off'
    check (routing_mode in ('off', 'shadow', 'enforced')),
  add column if not exists intent text,
  add column if not exists proposed_model_tier text
    check (proposed_model_tier is null or proposed_model_tier in ('luna', 'terra', 'sol')),
  add column if not exists proposed_provider text,
  add column if not exists proposed_model text,
  add column if not exists actual_model_tier text
    check (actual_model_tier is null or actual_model_tier in ('luna', 'terra', 'sol')),
  add column if not exists actual_provider text,
  add column if not exists actual_model text,
  add column if not exists execution_policy text
    check (execution_policy is null or execution_policy in ('adaptive', 'legacy_fallback', 'fixed_model')),
  add column if not exists fixed_model_exception boolean not null default false,
  add column if not exists fallback_used boolean not null default false,
  add column if not exists escalation_triggered boolean not null default false,
  add column if not exists reason_codes jsonb not null default '[]'::jsonb,
  add column if not exists actual_cost_usd numeric(12,8),
  add column if not exists reasoning_tokens integer,
  add column if not exists provider_latency_ms integer,
  add column if not exists gateway_latency_ms integer,
  add column if not exists total_latency_ms integer,
  add column if not exists normalized_error_class text,
  add column if not exists router_version text,
  add column if not exists policy_version text,
  add column if not exists pricing_version text,
  add column if not exists completed_at timestamptz;

-- A routing failure can happen before a model is selected. Nullable legacy
-- classification/selection fields allow that failure to be recorded honestly
-- rather than inventing a provider, model or classification.
alter table public.ai_routing_decisions
  alter column task_type drop not null,
  alter column operation_type drop not null,
  alter column detected_language drop not null,
  alter column response_language drop not null,
  alter column complexity drop not null,
  alter column risk_level drop not null,
  alter column selected_model_tier drop not null,
  alter column provider drop not null,
  alter column provider_model drop not null,
  alter column reasoning_level drop not null,
  alter column routing_source drop not null;

comment on column public.ai_routing_decisions.request_id is
  'Canonical correlation ID joining request, routing, provider execution and final outcome.';
comment on column public.ai_routing_decisions.provider is
  'Legacy selected provider field retained for backward compatibility.';
comment on column public.ai_routing_decisions.provider_model is
  'Legacy selected model field retained for backward compatibility.';
comment on table public.ai_routing_rollout_config is
  'Server-controlled global, environment and organization rollout modes. Any applicable kill switch forces off.';

-- Preserve the existing authenticated insert path, but remove unrelated table
-- privileges. Telemetry updates/finalization are server-owned via service_role.
revoke all on table public.ai_routing_decisions from public, anon, authenticated;
grant select, insert on table public.ai_routing_decisions to authenticated;
grant select, insert, update, delete on table public.ai_routing_decisions to service_role;

drop policy if exists ai_routing_decisions_select_org on public.ai_routing_decisions;
create policy ai_routing_decisions_select_org
on public.ai_routing_decisions
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = ai_routing_decisions.organization_id
      and om.user_id = (select auth.uid())
  )
);

drop policy if exists ai_routing_decisions_insert_org on public.ai_routing_decisions;
create policy ai_routing_decisions_insert_org
on public.ai_routing_decisions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.organization_members om
    where om.organization_id = ai_routing_decisions.organization_id
      and om.user_id = (select auth.uid())
  )
);

create index if not exists ai_routing_decisions_mode_created_idx
  on public.ai_routing_decisions (routing_mode, created_at desc);
