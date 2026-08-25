-- RYTHM OS Phase 1D — path-scoped routing rollout controls.
-- This additive table allows the five approved Production migrations to move
-- through off/shadow/enforced independently without enabling unrelated AI traffic.

create table if not exists public.ai_routing_feature_rollout_config (
  id uuid primary key default gen_random_uuid(),
  request_feature text not null check (request_feature in (
    'company.document_extraction',
    'boardroom.summary',
    'boardroom.legal_triage',
    'boardroom.legal_review',
    'boardroom.deliberation'
  )),
  scope text not null check (scope in ('global', 'environment', 'organization')),
  environment text,
  organization_id uuid references public.organizations(id) on delete cascade,
  routing_mode text not null default 'off' check (routing_mode in ('off', 'shadow', 'enforced')),
  kill_switch boolean not null default false,
  policy_version text not null default 'phase1d-routing-policy-v1',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_routing_feature_rollout_scope_shape check (
    (scope = 'global' and environment is null and organization_id is null)
    or (scope = 'environment' and environment is not null and organization_id is null)
    or (scope = 'organization' and environment is null and organization_id is not null)
  )
);

create unique index if not exists ai_routing_feature_rollout_global_unique
  on public.ai_routing_feature_rollout_config (request_feature) where scope = 'global';
create unique index if not exists ai_routing_feature_rollout_environment_unique
  on public.ai_routing_feature_rollout_config (request_feature, environment) where scope = 'environment';
create unique index if not exists ai_routing_feature_rollout_organization_unique
  on public.ai_routing_feature_rollout_config (request_feature, organization_id) where scope = 'organization';

alter table public.ai_routing_feature_rollout_config enable row level security;

create policy ai_routing_feature_rollout_member_read
on public.ai_routing_feature_rollout_config
for select
to authenticated
using (
  scope in ('global', 'environment')
  or exists (
    select 1
    from public.organization_members om
    where om.organization_id = ai_routing_feature_rollout_config.organization_id
      and om.user_id = (select auth.uid())
  )
);

revoke all on table public.ai_routing_feature_rollout_config from public, anon, authenticated, service_role;
grant select on table public.ai_routing_feature_rollout_config to authenticated;
grant select, insert, update, delete on table public.ai_routing_feature_rollout_config to service_role;

insert into public.ai_routing_feature_rollout_config (request_feature, scope, routing_mode, policy_version)
select feature, 'global', 'off', 'phase1d-routing-policy-v1'
from unnest(array[
  'company.document_extraction',
  'boardroom.summary',
  'boardroom.legal_triage',
  'boardroom.legal_review',
  'boardroom.deliberation'
]) as feature
on conflict (request_feature) where scope = 'global' do nothing;

comment on table public.ai_routing_feature_rollout_config is
  'Server-controlled Phase 1D per-path rollout modes. Feature and generic kill switches remain fail-closed.';

alter table public.ai_routing_decisions
  add column if not exists meeting_id uuid,
  add column if not exists meeting_session_id uuid,
  add column if not exists document_id uuid,
  add column if not exists project_id uuid;

alter table public.company_knowledge
  add column if not exists last_ai_correlation_id uuid;
alter table public.meeting_agent_messages
  add column if not exists ai_correlation_id uuid;
alter table public.meeting_legal_reviews
  add column if not exists ai_correlation_id uuid;
alter table public.meeting_agent_sessions
  add column if not exists legal_triage_correlation_id uuid;

create index if not exists ai_routing_decisions_org_meeting_idx
  on public.ai_routing_decisions (organization_id, meeting_id, created_at desc)
  where meeting_id is not null;
create index if not exists ai_routing_decisions_org_document_idx
  on public.ai_routing_decisions (organization_id, document_id, created_at desc)
  where document_id is not null;

-- The existing application dedupes before insertion. This database constraint
-- closes the remaining concurrent-request race without changing existing rows.
create unique index if not exists company_knowledge_org_storage_path_unique
  on public.company_knowledge (organization_id, storage_path)
  where storage_path is not null;

create unique index if not exists meeting_legal_reviews_one_running_per_session
  on public.meeting_legal_reviews (organization_id, session_id)
  where status = 'running';
