-- RYTHM Project Operating System
-- Additive, backward-compatible foundation. Reuses projects, action_items, approvals,
-- meetings, decisions, organization_integrations and the Integration & Execution Gateway.

alter table public.projects add column if not exists start_date date;
alter table public.projects add column if not exists internal_owner_label text;
alter table public.projects add column if not exists responsible_department text;
alter table public.projects add column if not exists tags text[] not null default '{}';
alter table public.projects add column if not exists notes text not null default '';
alter table public.projects add column if not exists autonomy_mode text not null default 'approval_required';
alter table public.projects add column if not exists readiness_score smallint not null default 0;
alter table public.projects add column if not exists last_analyzed_at timestamptz;
alter table public.projects add column if not exists last_heartbeat_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='projects_autonomy_mode_check') then
    alter table public.projects add constraint projects_autonomy_mode_check
      check (autonomy_mode in ('observe_only','approval_required','limited_autonomy','full_autonomy_within_policy')) not valid;
    alter table public.projects validate constraint projects_autonomy_mode_check;
  end if;
  if not exists (select 1 from pg_constraint where conname='projects_readiness_score_check') then
    alter table public.projects add constraint projects_readiness_score_check check (readiness_score between 0 and 100) not valid;
    alter table public.projects validate constraint projects_readiness_score_check;
  end if;
end $$;

create table if not exists public.project_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  client_name text not null,
  legal_company_name text,
  trading_name text,
  client_type text,
  contact_person text,
  email text,
  phone text,
  website text,
  country text,
  billing_entity text,
  relationship_type text not null default 'other',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id)
);

create table if not exists public.project_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  contract_number text,
  contract_start_date date,
  contract_end_date date,
  contract_value numeric(18,2),
  currency text,
  payment_terms text,
  deliverables jsonb not null default '[]'::jsonb,
  sla jsonb not null default '{}'::jsonb,
  milestones jsonb not null default '[]'::jsonb,
  provider_obligations jsonb not null default '[]'::jsonb,
  client_obligations jsonb not null default '[]'::jsonb,
  exclusions jsonb not null default '[]'::jsonb,
  dependencies jsonb not null default '[]'::jsonb,
  approval_requirements jsonb not null default '[]'::jsonb,
  termination_conditions text,
  confidentiality_requirements text,
  ip_ownership text,
  data_protection_requirements text,
  special_clauses jsonb not null default '[]'::jsonb,
  legal_analysis jsonb not null default '{}'::jsonb,
  legal_risk text not null default 'unreviewed',
  legal_review_status text not null default 'not_requested',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id)
);

create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null default 'other',
  file_name text not null,
  storage_path text not null,
  mime_type text,
  byte_size bigint,
  checksum text,
  extraction_status text not null default 'pending',
  extracted_summary text,
  extracted_data jsonb not null default '{}'::jsonb,
  legal_document boolean not null default false,
  uploaded_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(project_id, storage_path)
);

-- Expand the existing resource registry rather than introducing a second URL registry.
alter table public.project_resources add column if not exists description text;
alter table public.project_resources add column if not exists source text not null default 'manual';
alter table public.project_resources add column if not exists access_status text not null default 'unknown';
alter table public.project_resources drop constraint if exists project_resources_resource_type_check;
alter table public.project_resources add constraint project_resources_resource_type_check check (
  resource_type in ('github','vercel','supabase','website','landing_page','google_drive','sharepoint','figma','cms','analytics','search_console','crm','cloudflare','document','dataset','admin','other')
) not valid;
alter table public.project_resources validate constraint project_resources_resource_type_check;

create table if not exists public.project_connection_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  integration_id uuid not null references public.organization_integrations(id) on delete cascade,
  resource_type text not null,
  resource_ref text not null,
  display_name text not null,
  permission_scope jsonb not null default '{}'::jsonb,
  access_status text not null default 'pending',
  recommendation_level text not null default 'optional',
  recommendation_reason text,
  confirmed_by_user_id uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,integration_id,resource_ref)
);

create table if not exists public.project_readiness_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  project_understanding smallint not null default 0,
  contract_understanding smallint not null default 0,
  required_inputs_total integer not null default 0,
  required_inputs_available integer not null default 0,
  connections_total integer not null default 0,
  connections_available integer not null default 0,
  team_readiness smallint not null default 0,
  execution_readiness smallint not null default 0,
  risks jsonb not null default '[]'::jsonb,
  missing_inputs jsonb not null default '[]'::jsonb,
  required_connections jsonb not null default '[]'::jsonb,
  recommended_connections jsonb not null default '[]'::jsonb,
  team_recommendation jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.project_clarification_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  question_key text not null,
  question text not null,
  reason text not null,
  input_type text not null default 'text',
  options jsonb not null default '[]'::jsonb,
  materiality text not null default 'required',
  status text not null default 'open',
  answer jsonb,
  answered_by_user_id uuid references auth.users(id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  unique(project_id,question_key,status)
);

create table if not exists public.project_scope_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null default 1,
  included jsonb not null default '[]'::jsonb,
  excluded jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  dependencies jsonb not null default '[]'::jsonb,
  deliverables jsonb not null default '[]'::jsonb,
  success_criteria jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  generated_from jsonb not null default '{}'::jsonb,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(project_id,version)
);

create table if not exists public.project_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  execution_no integer not null,
  status text not null default 'queued',
  execution_context jsonb not null default '{}'::jsonb,
  plan_snapshot jsonb not null default '{}'::jsonb,
  budget_snapshot jsonb not null default '{}'::jsonb,
  started_by_user_id uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  last_heartbeat_at timestamptz,
  recovery_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,execution_no)
);

create table if not exists public.project_task_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  execution_id uuid not null references public.project_executions(id) on delete cascade,
  action_item_id uuid references public.action_items(id) on delete set null,
  task_key text not null,
  title text not null,
  assigned_agent_id uuid references public.agents(id) on delete set null,
  status text not null default 'queued',
  priority smallint not null default 3,
  dependencies jsonb not null default '[]'::jsonb,
  waiting_on_approval_id uuid references public.approval_requests(id) on delete set null,
  waiting_on_connection_id uuid references public.project_connection_bindings(id) on delete set null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  idempotency_key text not null,
  input jsonb not null default '{}'::jsonb,
  safe_result jsonb not null default '{}'::jsonb,
  error_class text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,idempotency_key),
  unique(execution_id,task_key)
);

create table if not exists public.project_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by_agent_id uuid references public.agents(id) on delete set null,
  responsible_manager_id uuid references public.agents(id) on delete set null,
  department text,
  proposal_type text not null,
  title text not null,
  executive_summary text not null,
  rationale text not null default '',
  expected_impact jsonb not null default '{}'::jsonb,
  estimated_cost numeric(18,2),
  cost_currency text,
  estimated_effort text,
  risk_level text not null default 'low',
  required_permissions jsonb not null default '[]'::jsonb,
  supporting_evidence jsonb not null default '[]'::jsonb,
  alternatives_considered jsonb not null default '[]'::jsonb,
  decision_required_from text not null default 'human_ceo',
  status text not null default 'draft',
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  execution_result jsonb not null default '{}'::jsonb,
  measured_outcome jsonb not null default '{}'::jsonb,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_decision_memory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  decision text not null,
  rationale text not null default '',
  decision_maker_type text not null,
  decision_maker_id uuid,
  proposal_id uuid references public.project_proposals(id) on delete set null,
  constraints jsonb not null default '[]'::jsonb,
  outcome jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.project_agent_capacity (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  allocation_percent smallint not null default 0 check(allocation_percent between 0 and 100),
  priority smallint not null default 3,
  updated_at timestamptz not null default now(),
  primary key(project_id,agent_id)
);

create table if not exists public.project_activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  execution_id uuid references public.project_executions(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  event_type text not null,
  headline text not null,
  detail text,
  importance text not null default 'normal',
  correlation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.project_health_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  execution_id uuid references public.project_executions(id) on delete cascade,
  health_type text not null,
  severity text not null default 'warning',
  status text not null default 'open',
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Private project files. Uploads are performed server-side only after tenant authorization.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('project-files','project-files',false,52428800,array[
  'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel',
  'text/csv','text/plain','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png','image/jpeg','image/webp'
])
on conflict(id) do update set public=false;

-- Tenant RLS: owners/admins manage project operating records; company members can read.
do $$
declare t text;
begin
  foreach t in array array[
    'project_clients','project_contracts','project_documents','project_connection_bindings',
    'project_readiness_assessments','project_clarification_requests','project_scope_versions',
    'project_executions','project_task_runs','project_proposals','project_decision_memory',
    'project_agent_capacity','project_activity_events','project_health_events'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists %I_member_read on public.%I',t,t);
    execute format('create policy %I_member_read on public.%I for select to authenticated using (public.is_org_member(organization_id))',t,t);
    execute format('drop policy if exists %I_owner_write on public.%I',t,t);
    execute format('create policy %I_owner_write on public.%I for all to authenticated using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id))',t,t);
  end loop;
end $$;

create index if not exists project_documents_project_idx on public.project_documents(project_id,category,created_at desc);
create index if not exists project_connections_project_idx on public.project_connection_bindings(project_id,access_status,recommendation_level);
create index if not exists project_readiness_project_idx on public.project_readiness_assessments(project_id,created_at desc);
create index if not exists project_clarifications_open_idx on public.project_clarification_requests(project_id,status);
create index if not exists project_executions_status_idx on public.project_executions(organization_id,status,updated_at);
create index if not exists project_task_runs_dispatch_idx on public.project_task_runs(status,next_attempt_at,priority,created_at);
create index if not exists project_task_runs_project_idx on public.project_task_runs(project_id,execution_id,status);
create index if not exists project_proposals_attention_idx on public.project_proposals(organization_id,status,risk_level,created_at desc);
create index if not exists project_activity_timeline_idx on public.project_activity_events(project_id,created_at desc);
create index if not exists project_health_open_idx on public.project_health_events(organization_id,status,severity,detected_at desc);

-- Durable worker primitive. It only leases runnable work; task execution remains in the server worker.
create or replace function public.claim_project_task_runs_v1(worker_id text, claim_limit integer default 8, lease_seconds integer default 240)
returns setof public.project_task_runs
language plpgsql
security definer
set search_path=public
as $$
begin
  if coalesce(worker_id,'')='' then raise exception 'worker_id required'; end if;
  return query
  with candidates as (
    select tr.id
    from public.project_task_runs tr
    join public.project_executions pe on pe.id=tr.execution_id and pe.status in ('queued','running')
    where tr.status in ('queued','retrying')
      and (tr.next_attempt_at is null or tr.next_attempt_at<=now())
      and (tr.lease_expires_at is null or tr.lease_expires_at<now())
      and not exists (
        select 1
        from jsonb_array_elements_text(tr.dependencies) d(task_key)
        join public.project_task_runs dep on dep.execution_id=tr.execution_id and dep.task_key=d.task_key
        where dep.status<>'completed'
      )
      and not exists (
        select 1 from public.project_agent_capacity pac
        where pac.project_id=tr.project_id and pac.agent_id=tr.assigned_agent_id
          and pac.allocation_percent=0
      )
    order by tr.priority asc, tr.created_at asc
    for update skip locked
    limit greatest(1,least(claim_limit,32))
  )
  update public.project_task_runs tr
  set status='running',lease_owner=worker_id,lease_expires_at=now()+make_interval(secs=>greatest(30,lease_seconds)),
      attempt_count=attempt_count+1,started_at=coalesce(started_at,now()),updated_at=now()
  from candidates c where tr.id=c.id
  returning tr.*;
end $$;

revoke all on function public.claim_project_task_runs_v1(text,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_project_task_runs_v1(text,integer,integer) to service_role;

-- Recover interrupted tasks after worker/deployment failure without duplicating completed side effects.
create or replace function public.recover_stale_project_task_runs_v1()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare recovered integer;
begin
  update public.project_task_runs
  set status=case when attempt_count>=max_attempts then 'failed' else 'retrying' end,
      error_class=case when attempt_count>=max_attempts then 'retry_exhausted' else 'worker_lease_expired' end,
      error_message='Worker lease expired before completion.',
      lease_owner=null,lease_expires_at=null,
      next_attempt_at=case when attempt_count>=max_attempts then null else now()+make_interval(secs=>least(1800,30*(2^least(attempt_count,6)))) end,
      updated_at=now()
  where status='running' and lease_expires_at<now();
  get diagnostics recovered=row_count;
  return recovered;
end $$;
revoke all on function public.recover_stale_project_task_runs_v1() from public,anon,authenticated;
grant execute on function public.recover_stale_project_task_runs_v1() to service_role;

-- Approval is authorization: tasks waiting on approved/rejected requests converge automatically.
create or replace function public.resume_project_tasks_after_approval_v1()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.status is distinct from new.status and new.status='approved' then
    update public.project_task_runs set status='queued',waiting_on_approval_id=null,next_attempt_at=now(),updated_at=now()
    where waiting_on_approval_id=new.id and status='waiting_for_approval';
  elsif old.status is distinct from new.status and new.status='rejected' then
    update public.project_task_runs set status='blocked',error_class='approval_rejected',error_message='Required approval was rejected.',updated_at=now()
    where waiting_on_approval_id=new.id and status='waiting_for_approval';
  end if;
  return new;
end $$;
drop trigger if exists trg_resume_project_tasks_after_approval on public.approval_requests;
create trigger trg_resume_project_tasks_after_approval after update of status on public.approval_requests
for each row execute function public.resume_project_tasks_after_approval_v1();
revoke all on function public.resume_project_tasks_after_approval_v1() from public,anon,authenticated;

-- Connection confirmation also unblocks only dependent tasks.
create or replace function public.resume_project_tasks_after_connection_v1()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.access_status is distinct from new.access_status and new.access_status='connected' then
    update public.project_task_runs set status='queued',waiting_on_connection_id=null,next_attempt_at=now(),updated_at=now()
    where waiting_on_connection_id=new.id and status='waiting_for_connection';
  end if;
  return new;
end $$;
drop trigger if exists trg_resume_project_tasks_after_connection on public.project_connection_bindings;
create trigger trg_resume_project_tasks_after_connection after update of access_status on public.project_connection_bindings
for each row execute function public.resume_project_tasks_after_connection_v1();
revoke all on function public.resume_project_tasks_after_connection_v1() from public,anon,authenticated;

-- Ensure worker-only maintenance functions cannot become public PostgREST RPCs.
revoke all on function public.resume_project_tasks_after_connection_v1() from public,anon,authenticated;

comment on table public.project_task_runs is 'Durable execution state for existing Action Item Engine tasks; not a parallel business task system.';
comment on table public.project_connection_bindings is 'Project-scoped resource grants over company-level organization_integrations.';
comment on table public.project_proposals is 'Proactive agent/manager proposals routed to executive attention without bypassing approval authority.';