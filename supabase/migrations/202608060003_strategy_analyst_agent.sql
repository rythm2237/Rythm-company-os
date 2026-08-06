-- A-101 Strategy Analyst: governed internal-first strategic analysis.

update public.agents
set
  name = 'Strategy Analyst',
  role_title = 'Strategic Analysis Agent',
  purpose = 'Analyze strategic questions across CEO-owned projects, prioritize internal evidence, produce structured options and recommendations, and request Human CEO approval before any web research.',
  authority_level = 1,
  risk_ceiling = 'medium'::public.rythm_risk_level,
  enabled = true,
  specification_version = '2.0',
  identity = jsonb_build_object(
    'class','strategy',
    'scope','all_projects_with_context_isolation',
    'language_policy','match_request_language',
    'meeting_language_policy','ask_ceo_before_meeting',
    'research_priority','internal_first',
    'web_research','approval_required',
    'execution_mode','dry_run_only'
  ),
  permissions = jsonb_build_object(
    'read',jsonb_build_array('company_memory','decisions','meetings','action_items','approval_requests'),
    'write',jsonb_build_array('strategy_work_requests','approval_requests','audit_events'),
    'web_research','human_approval_required',
    'external_actions',false
  ),
  updated_at = now()
where agent_code = 'A-101';

create table if not exists public.strategy_work_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete restrict,
  project_context text not null,
  question text not null,
  request_language text not null check (request_language in ('fa','en','auto')),
  meeting_mode boolean not null default false,
  meeting_language text check (meeting_language in ('fa','en')),
  internal_context text,
  web_research_requested boolean not null default false,
  web_approval_request_id uuid references public.approval_requests(id),
  status text not null default 'queued' check (status in ('queued','awaiting_web_approval','approved_for_web','completed','cancelled')),
  output jsonb,
  quality_score numeric(5,2) check (quality_score between 0 and 100),
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.strategy_work_requests enable row level security;
drop policy if exists strategy_work_requests_member_read on public.strategy_work_requests;
create policy strategy_work_requests_member_read on public.strategy_work_requests
for select using (public.is_org_member(organization_id));
drop policy if exists strategy_work_requests_owner_write on public.strategy_work_requests;
create policy strategy_work_requests_owner_write on public.strategy_work_requests
for all using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

create index if not exists strategy_work_requests_queue_idx
on public.strategy_work_requests (organization_id, status, created_at desc);

create or replace function public.enforce_strategy_work_request()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_org_owner(new.organization_id) then
    raise exception 'Only an organization owner may create or update strategy work';
  end if;
  if new.created_by_user_id is distinct from auth.uid() then
    raise exception 'Strategy request creator must match the authenticated owner';
  end if;
  if new.meeting_mode and new.meeting_language is null then
    raise exception 'Meeting language must be selected before a strategy meeting starts';
  end if;
  if new.web_research_requested and new.status not in ('awaiting_web_approval','approved_for_web','completed','cancelled') then
    raise exception 'Web research must enter the approval workflow';
  end if;
  if new.status = 'approved_for_web' then
    if new.web_approval_request_id is null or not exists (
      select 1 from public.approval_requests ar
      where ar.id = new.web_approval_request_id
        and ar.organization_id = new.organization_id
        and ar.status = 'approved'
    ) then
      raise exception 'Approved Human CEO authorization is required for web research';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists strategy_work_request_guardrail on public.strategy_work_requests;
create trigger strategy_work_request_guardrail
before insert or update on public.strategy_work_requests
for each row execute function public.enforce_strategy_work_request();