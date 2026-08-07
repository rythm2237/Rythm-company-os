-- Batch 2.1.6 — Unified Workflow Database & Backend Integration
-- Implements WF-002 Company Events, WF-003 semantic relationships,
-- WF-004 timeline projection support and WF-005 deterministic workflow state.
-- Additive/idempotent. Human CEO authority and existing domain engines remain authoritative.

-- -----------------------------------------------------------------------------
-- 1. Canonical project workflow state
-- -----------------------------------------------------------------------------

alter table public.projects
  add column if not exists workflow_state text not null default 'DISCOVERY',
  add column if not exists workflow_state_updated_at timestamptz not null default now(),
  add column if not exists blocked_from_state text,
  add column if not exists blocker_type text,
  add column if not exists blocker_summary text,
  add column if not exists blocking_entity_type text,
  add column if not exists blocking_entity_id uuid,
  add column if not exists blocker_risk_level text,
  add column if not exists blocked_at timestamptz,
  add column if not exists resolution_required text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_workflow_state_check'
  ) then
    alter table public.projects
      add constraint projects_workflow_state_check
      check (workflow_state in (
        'INTAKE','DISCOVERY','DELIBERATION','LEGAL_REVIEW','DECISION_PENDING',
        'APPROVAL_PENDING','EXECUTION','BLOCKED','COMPLETE','CANCELLED'
      )) not valid;
    alter table public.projects validate constraint projects_workflow_state_check;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_blocker_risk_level_check'
  ) then
    alter table public.projects
      add constraint projects_blocker_risk_level_check
      check (blocker_risk_level is null or blocker_risk_level in ('low','medium','high','critical')) not valid;
    alter table public.projects validate constraint projects_blocker_risk_level_check;
  end if;
end $$;

create index if not exists projects_workflow_state_idx
  on public.projects(organization_id, workflow_state, priority);

-- -----------------------------------------------------------------------------
-- 2. WF-002 immutable Company Event stream
-- -----------------------------------------------------------------------------

create table if not exists public.company_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  event_version smallint not null default 1 check (event_version > 0),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  aggregate_type text not null,
  aggregate_id uuid,
  actor_type text not null check (actor_type in ('user','agent','system')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_agent_id uuid references public.agents(id) on delete set null,
  correlation_id uuid not null default gen_random_uuid(),
  causation_event_id uuid references public.company_events(id) on delete set null,
  risk_level public.rythm_risk_level not null default 'low',
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  idempotency_key text,
  payload jsonb not null default '{}'::jsonb,
  check (
    (actor_type='user' and actor_user_id is not null and actor_agent_id is null)
    or (actor_type='agent' and actor_agent_id is not null and actor_user_id is null)
    or (actor_type='system' and actor_user_id is null and actor_agent_id is null)
  )
);

create unique index if not exists company_events_idempotency_uidx
  on public.company_events(organization_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists company_events_project_time_idx
  on public.company_events(project_id, occurred_at desc, recorded_at desc);
create index if not exists company_events_aggregate_idx
  on public.company_events(organization_id, aggregate_type, aggregate_id, occurred_at desc);
create index if not exists company_events_correlation_idx
  on public.company_events(organization_id, correlation_id, occurred_at);
create index if not exists company_events_type_idx
  on public.company_events(organization_id, event_type, occurred_at desc);

alter table public.company_events enable row level security;

drop policy if exists company_events_member_read on public.company_events;
create policy company_events_member_read on public.company_events
for select using (public.is_org_member(organization_id));

drop policy if exists company_events_owner_insert on public.company_events;
create policy company_events_owner_insert on public.company_events
for insert with check (public.is_org_owner(organization_id));

-- No UPDATE/DELETE policy: company_events is append-only for authenticated users.

create or replace function public.record_company_event(
  target_event_type text,
  target_organization_id uuid,
  target_project_id uuid,
  target_aggregate_type text,
  target_aggregate_id uuid,
  target_actor_type text default 'system',
  target_actor_user_id uuid default null,
  target_actor_agent_id uuid default null,
  target_correlation_id uuid default null,
  target_causation_event_id uuid default null,
  target_risk_level public.rythm_risk_level default 'low',
  target_payload jsonb default '{}'::jsonb,
  target_idempotency_key text default null,
  target_occurred_at timestamptz default now(),
  target_event_version smallint default 1
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_id uuid;
  existing_id uuid;
begin
  if target_event_type is null or btrim(target_event_type) = '' then
    raise exception 'event_type is required';
  end if;

  if target_actor_type not in ('user','agent','system') then
    raise exception 'Invalid actor_type: %', target_actor_type;
  end if;

  if target_actor_type='user' and (target_actor_user_id is null or target_actor_agent_id is not null) then
    raise exception 'User event requires actor_user_id only';
  elsif target_actor_type='agent' and (target_actor_agent_id is null or target_actor_user_id is not null) then
    raise exception 'Agent event requires actor_agent_id only';
  elsif target_actor_type='system' and (target_actor_user_id is not null or target_actor_agent_id is not null) then
    raise exception 'System event cannot carry user/agent actor IDs';
  end if;

  if target_project_id is not null and not exists (
    select 1 from public.projects p
    where p.id = target_project_id and p.organization_id = target_organization_id
  ) then
    raise exception 'Project does not belong to organization';
  end if;

  if target_idempotency_key is not null then
    select id into existing_id
    from public.company_events
    where organization_id = target_organization_id
      and idempotency_key = target_idempotency_key;
    if existing_id is not null then return existing_id; end if;
  end if;

  insert into public.company_events(
    event_type,event_version,organization_id,project_id,aggregate_type,aggregate_id,
    actor_type,actor_user_id,actor_agent_id,correlation_id,causation_event_id,
    risk_level,occurred_at,idempotency_key,payload
  ) values (
    target_event_type,target_event_version,target_organization_id,target_project_id,
    target_aggregate_type,target_aggregate_id,target_actor_type,target_actor_user_id,
    target_actor_agent_id,coalesce(target_correlation_id,gen_random_uuid()),target_causation_event_id,
    target_risk_level,coalesce(target_occurred_at,now()),target_idempotency_key,
    coalesce(target_payload,'{}'::jsonb)
  )
  on conflict (organization_id,idempotency_key) where idempotency_key is not null
  do nothing
  returning id into created_id;

  if created_id is null and target_idempotency_key is not null then
    select id into created_id from public.company_events
    where organization_id=target_organization_id and idempotency_key=target_idempotency_key;
  end if;

  return created_id;
end $$;

-- -----------------------------------------------------------------------------
-- 3. WF-003 semantic relationship engine
-- -----------------------------------------------------------------------------

create table if not exists public.entity_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  source_type text not null,
  source_id uuid not null,
  relationship_type text not null,
  target_type text not null,
  target_id uuid not null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_agent_id uuid references public.agents(id) on delete set null,
  source_event_id uuid references public.company_events(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (not (created_by_user_id is not null and created_by_agent_id is not null)),
  unique(organization_id,source_type,source_id,relationship_type,target_type,target_id)
);

create index if not exists entity_relationships_project_idx
  on public.entity_relationships(project_id, relationship_type, created_at desc);
create index if not exists entity_relationships_source_idx
  on public.entity_relationships(organization_id, source_type, source_id);
create index if not exists entity_relationships_target_idx
  on public.entity_relationships(organization_id, target_type, target_id);

alter table public.entity_relationships enable row level security;

drop policy if exists entity_relationships_member_read on public.entity_relationships;
create policy entity_relationships_member_read on public.entity_relationships
for select using (public.is_org_member(organization_id));

drop policy if exists entity_relationships_owner_insert on public.entity_relationships;
create policy entity_relationships_owner_insert on public.entity_relationships
for insert with check (public.is_org_owner(organization_id));

create or replace function public.ensure_entity_relationship(
  target_organization_id uuid,
  target_project_id uuid,
  target_source_type text,
  target_source_id uuid,
  target_relationship_type text,
  target_target_type text,
  target_target_id uuid,
  target_created_by_user_id uuid default null,
  target_created_by_agent_id uuid default null,
  target_source_event_id uuid default null,
  target_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare created_id uuid;
begin
  if target_source_id = target_target_id and target_source_type = target_target_type then
    raise exception 'Self relationship is not allowed';
  end if;
  if target_created_by_user_id is not null and target_created_by_agent_id is not null then
    raise exception 'Relationship provenance must be user, agent, or system — not both';
  end if;
  if target_project_id is not null and not exists (
    select 1 from public.projects p where p.id=target_project_id and p.organization_id=target_organization_id
  ) then
    raise exception 'Project does not belong to organization';
  end if;

  insert into public.entity_relationships(
    organization_id,project_id,source_type,source_id,relationship_type,target_type,target_id,
    created_by_user_id,created_by_agent_id,source_event_id,metadata
  ) values (
    target_organization_id,target_project_id,target_source_type,target_source_id,
    target_relationship_type,target_target_type,target_target_id,
    target_created_by_user_id,target_created_by_agent_id,target_source_event_id,
    coalesce(target_metadata,'{}'::jsonb)
  )
  on conflict (organization_id,source_type,source_id,relationship_type,target_type,target_id)
  do update set metadata = public.entity_relationships.metadata || excluded.metadata
  returning id into created_id;

  return created_id;
end $$;

-- -----------------------------------------------------------------------------
-- 4. WF-005 deterministic workflow-state resolver
-- -----------------------------------------------------------------------------

create or replace function public.resolve_project_workflow_state(target_project_id uuid)
returns text
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  p public.projects%rowtype;
begin
  select * into p from public.projects where id=target_project_id;
  if not found then raise exception 'Project not found'; end if;

  -- Terminal/explicit governance states first.
  if p.status='cancelled' then return 'CANCELLED'; end if;
  if p.status='blocked' or p.blocker_type is not null then return 'BLOCKED'; end if;

  -- Pending governed approval has precedence over other active work.
  if exists (
    select 1 from public.approval_requests a
    where a.project_id=target_project_id and a.status='pending'
  ) then return 'APPROVAL_PENDING'; end if;

  -- Legal review applies only to meetings/sessions within this project.
  if exists (
    select 1
    from public.meeting_legal_reviews l
    join public.meeting_agent_sessions s on s.id=l.session_id
    where s.project_id=target_project_id and l.status in ('pending','running')
  ) then return 'LEGAL_REVIEW'; end if;

  -- Completed synthesis without a Human CEO decision is decision-pending.
  if exists (
    select 1
    from public.meeting_agent_sessions s
    where s.project_id=target_project_id
      and s.status='completed'
      and s.synthesis is not null
      and not exists (
        select 1 from public.meeting_agent_messages m
        where m.session_id=s.id and m.message_type='ceo_decision'
      )
  ) then return 'DECISION_PENDING'; end if;

  if exists (
    select 1 from public.meeting_agent_sessions s
    where s.project_id=target_project_id and s.status='running'
  ) or exists (
    select 1 from public.meetings m
    where m.project_id=target_project_id and m.status='running'
  ) then return 'DELIBERATION'; end if;

  -- Approved governed actions indicate execution.
  if exists (
    select 1 from public.action_items x
    where x.project_id=target_project_id and x.status in ('open','in_progress','blocked')
  ) then return 'EXECUTION'; end if;

  if p.status='completed' then return 'COMPLETE'; end if;
  if p.status='idea' then return 'INTAKE'; end if;

  return 'DISCOVERY';
end $$;

create or replace function public.refresh_project_workflow_state(
  target_project_id uuid,
  target_trigger_entity_type text default null,
  target_trigger_entity_id uuid default null,
  target_reason text default null,
  target_correlation_id uuid default null
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_org_id uuid;
  previous_state text;
  resolved_state text;
  event_key text;
begin
  select organization_id,workflow_state into target_org_id,previous_state
  from public.projects where id=target_project_id;
  if target_org_id is null then raise exception 'Project not found'; end if;

  resolved_state := public.resolve_project_workflow_state(target_project_id);
  if resolved_state = previous_state then return resolved_state; end if;

  update public.projects
  set workflow_state=resolved_state,
      workflow_state_updated_at=now(),
      blocked_from_state=case when resolved_state='BLOCKED' then previous_state else blocked_from_state end,
      updated_at=now()
  where id=target_project_id;

  event_key := concat_ws(':','workflow-state',target_project_id::text,previous_state,resolved_state,
                         coalesce(target_trigger_entity_type,'resolver'),
                         coalesce(target_trigger_entity_id::text,'none'));

  perform public.record_company_event(
    'workflow.state_changed.v1', target_org_id, target_project_id,
    'project', target_project_id, 'system', null, null,
    coalesce(target_correlation_id,gen_random_uuid()), null, 'low',
    jsonb_build_object(
      'before_state',previous_state,
      'after_state',resolved_state,
      'trigger_entity_type',target_trigger_entity_type,
      'trigger_entity_id',target_trigger_entity_id,
      'reason',target_reason,
      'external_actions',false
    ),
    event_key, now(), 1
  );

  return resolved_state;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Convergence triggers: persisted domain changes refresh project state.
--    They do not perform the underlying governed action or bypass authority.
-- -----------------------------------------------------------------------------

create or replace function public.refresh_workflow_from_project_row()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.project_id is not null then
    perform public.refresh_project_workflow_state(new.project_id,TG_TABLE_NAME,new.id,'Domain state changed',gen_random_uuid());
  end if;
  return new;
end $$;

create or replace function public.refresh_workflow_from_legal_review()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare target_project_id uuid;
begin
  select s.project_id into target_project_id from public.meeting_agent_sessions s where s.id=new.session_id;
  if target_project_id is not null then
    perform public.refresh_project_workflow_state(target_project_id,'meeting_legal_reviews',new.id,'Legal review state changed',gen_random_uuid());
  end if;
  return new;
end $$;

create or replace function public.refresh_workflow_from_meeting_message()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare target_project_id uuid;
begin
  if new.message_type='ceo_decision' then
    select s.project_id into target_project_id from public.meeting_agent_sessions s where s.id=new.session_id;
    if target_project_id is not null then
      perform public.refresh_project_workflow_state(target_project_id,'meeting_agent_messages',new.id,'Human CEO decision recorded',gen_random_uuid());
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_workflow_meeting_sessions on public.meeting_agent_sessions;
create trigger trg_workflow_meeting_sessions
after insert or update of status,synthesis on public.meeting_agent_sessions
for each row execute function public.refresh_workflow_from_project_row();

drop trigger if exists trg_workflow_meetings on public.meetings;
create trigger trg_workflow_meetings
after insert or update of status on public.meetings
for each row execute function public.refresh_workflow_from_project_row();

drop trigger if exists trg_workflow_approvals on public.approval_requests;
create trigger trg_workflow_approvals
after insert or update of status on public.approval_requests
for each row execute function public.refresh_workflow_from_project_row();

drop trigger if exists trg_workflow_actions on public.action_items;
create trigger trg_workflow_actions
after insert or update of status on public.action_items
for each row execute function public.refresh_workflow_from_project_row();

drop trigger if exists trg_workflow_legal_reviews on public.meeting_legal_reviews;
create trigger trg_workflow_legal_reviews
after insert or update of status,outcome on public.meeting_legal_reviews
for each row execute function public.refresh_workflow_from_legal_review();

drop trigger if exists trg_workflow_ceo_decision_message on public.meeting_agent_messages;
create trigger trg_workflow_ceo_decision_message
after insert on public.meeting_agent_messages
for each row execute function public.refresh_workflow_from_meeting_message();

-- -----------------------------------------------------------------------------
-- 6. Semantic-edge reconciliation from authoritative foreign keys
-- -----------------------------------------------------------------------------

insert into public.entity_relationships(organization_id,project_id,source_type,source_id,relationship_type,target_type,target_id,metadata)
select m.organization_id,m.project_id,'meeting',m.id,'belongs_to_project','project',m.project_id,'{"derived_from_fk":true}'::jsonb
from public.meetings m where m.project_id is not null
on conflict do nothing;

insert into public.entity_relationships(organization_id,project_id,source_type,source_id,relationship_type,target_type,target_id,metadata)
select d.organization_id,d.project_id,'decision',d.id,'belongs_to_project','project',d.project_id,'{"derived_from_fk":true}'::jsonb
from public.decisions d where d.project_id is not null
on conflict do nothing;

insert into public.entity_relationships(organization_id,project_id,source_type,source_id,relationship_type,target_type,target_id,metadata)
select a.organization_id,a.project_id,'approval_request',a.id,'belongs_to_project','project',a.project_id,'{"derived_from_fk":true}'::jsonb
from public.approval_requests a where a.project_id is not null
on conflict do nothing;

insert into public.entity_relationships(organization_id,project_id,source_type,source_id,relationship_type,target_type,target_id,metadata)
select x.organization_id,x.project_id,'action_item',x.id,'belongs_to_project','project',x.project_id,'{"derived_from_fk":true}'::jsonb
from public.action_items x where x.project_id is not null
on conflict do nothing;

insert into public.entity_relationships(organization_id,project_id,source_type,source_id,relationship_type,target_type,target_id,metadata)
select x.organization_id,x.project_id,'action_item',x.id,'implements_decision','decision',x.decision_id,'{"derived_from_fk":true}'::jsonb
from public.action_items x where x.decision_id is not null
on conflict do nothing;

insert into public.entity_relationships(organization_id,project_id,source_type,source_id,relationship_type,target_type,target_id,metadata)
select x.organization_id,x.project_id,'action_item',x.id,'originated_from','meeting',x.meeting_id,'{"derived_from_fk":true}'::jsonb
from public.action_items x where x.meeting_id is not null
on conflict do nothing;

insert into public.entity_relationships(organization_id,project_id,source_type,source_id,relationship_type,target_type,target_id,metadata)
select s.organization_id,s.project_id,'meeting_session',s.id,'originated_from','meeting',s.meeting_id,'{"derived_from_fk":true}'::jsonb
from public.meeting_agent_sessions s where s.project_id is not null
on conflict do nothing;

insert into public.entity_relationships(organization_id,project_id,source_type,source_id,relationship_type,target_type,target_id,metadata)
select l.organization_id,s.project_id,'legal_review',l.id,'originated_from','meeting',l.meeting_id,'{"derived_from_fk":true}'::jsonb
from public.meeting_legal_reviews l
join public.meeting_agent_sessions s on s.id=l.session_id
where s.project_id is not null
on conflict do nothing;

insert into public.entity_relationships(organization_id,project_id,source_type,source_id,relationship_type,target_type,target_id,metadata)
select e.organization_id,e.project_id,'project_progress_event',e.id,'tracks_project','project',e.project_id,'{"derived_from_fk":true}'::jsonb
from public.project_progress_events e
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 7. Historical event backfill for existing Project Pulse evidence
-- -----------------------------------------------------------------------------

insert into public.company_events(
  event_type,event_version,organization_id,project_id,aggregate_type,aggregate_id,
  actor_type,correlation_id,risk_level,occurred_at,idempotency_key,payload
)
select
  'project.progress.changed',1,e.organization_id,e.project_id,'project_progress_event',e.id,
  'system',gen_random_uuid(),'low',e.created_at,'backfill:project-progress:'||e.id::text,
  jsonb_build_object(
    'event_label',e.event_label,
    'previous_progress',e.previous_progress,
    'new_progress',e.new_progress,
    'previous_node',e.previous_node,
    'new_node',e.new_node,
    'event_state',e.event_state,
    'source_type',e.source_type,
    'source_id',e.source_id,
    'backfilled',true
  )
from public.project_progress_events e
on conflict (organization_id,idempotency_key) where idempotency_key is not null do nothing;

-- Resolve every existing project once so current workflow state converges from persisted evidence.
do $$
declare r record;
begin
  for r in select id from public.projects loop
    perform public.refresh_project_workflow_state(r.id,'migration',null,'Initial WF-005 convergence',gen_random_uuid());
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 8. WF-004 Operating Timeline projection
-- -----------------------------------------------------------------------------

create or replace view public.project_operating_timeline
with (security_invoker = true)
as
select
  ce.id,
  ce.organization_id,
  ce.project_id,
  ce.occurred_at as occurred_at,
  'company_event'::text as timeline_source,
  ce.event_type,
  ce.aggregate_type as entity_type,
  ce.aggregate_id as entity_id,
  ce.correlation_id,
  ce.risk_level::text as risk_level,
  ce.payload
from public.company_events ce
where ce.project_id is not null
union all
select
  pe.id,
  pe.organization_id,
  pe.project_id,
  pe.created_at as occurred_at,
  'project_progress_event'::text as timeline_source,
  pe.event_type,
  coalesce(pe.source_type,'project_progress_event') as entity_type,
  pe.source_id as entity_id,
  null::uuid as correlation_id,
  'low'::text as risk_level,
  jsonb_build_object(
    'event_label',pe.event_label,
    'previous_progress',pe.previous_progress,
    'new_progress',pe.new_progress,
    'previous_node',pe.previous_node,
    'new_node',pe.new_node,
    'event_state',pe.event_state,
    'next_step',pe.next_step,
    'metadata',pe.metadata
  ) as payload
from public.project_progress_events pe;

comment on table public.company_events is
  'Append-only WF-002 domain event stream. Events describe completed facts and do not grant authority.';
comment on table public.entity_relationships is
  'WF-003 semantic graph edges; authoritative direct foreign keys remain primary when present.';
comment on view public.project_operating_timeline is
  'WF-004 project timeline projection over immutable company events and existing Project Pulse evidence.';
