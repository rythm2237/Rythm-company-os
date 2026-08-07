-- Batch 2.3 — WF-007 Idea / Issue Intake -> Governed Meeting
-- Additive and idempotent. Human CEO authority remains authoritative.
-- Routing creates a draft Meeting only; it never authorizes agents, starts runtime,
-- creates a Decision, changes project scope, or enables external actions.

-- -----------------------------------------------------------------------------
-- 1. Authoritative Idea / Issue intake domain
-- -----------------------------------------------------------------------------

create table if not exists public.intake_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  intake_key text not null,
  item_type text not null check (item_type in ('idea','issue')),
  title text not null,
  summary text not null,
  category text not null,
  why_it_matters text,
  questions_assumptions jsonb not null default '[]'::jsonb,
  status text not null default 'inbox' check (status in (
    'inbox','to_review','research_required','scheduled_for_review','under_evaluation',
    'deferred','accepted_for_decision','rejected','converted','archived'
  )),
  priority smallint not null default 3 check (priority between 1 and 5),
  risk_level public.rythm_risk_level not null default 'low',
  agent_relevance jsonb not null default '[]'::jsonb,
  revisit_trigger text,
  source_type text not null default 'human_ceo',
  created_by_user_id uuid not null references auth.users(id),
  routed_meeting_id uuid references public.meetings(id) on delete set null,
  routed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, intake_key),
  check (jsonb_typeof(questions_assumptions) = 'array'),
  check (jsonb_typeof(agent_relevance) = 'array')
);

create index if not exists intake_items_org_status_idx
  on public.intake_items(organization_id,status,created_at desc);
create index if not exists intake_items_project_idx
  on public.intake_items(project_id,status,created_at desc)
  where project_id is not null;
create index if not exists intake_items_routed_meeting_idx
  on public.intake_items(routed_meeting_id)
  where routed_meeting_id is not null;

alter table public.intake_items enable row level security;

drop policy if exists intake_items_member_read on public.intake_items;
create policy intake_items_member_read on public.intake_items
for select using (public.is_org_member(organization_id));

drop policy if exists intake_items_owner_write on public.intake_items;
create policy intake_items_owner_write on public.intake_items
for all using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

-- -----------------------------------------------------------------------------
-- 2. Human-CEO-only atomic capture command
-- -----------------------------------------------------------------------------

create or replace function public.create_intake_item(
  target_organization_id uuid,
  target_item_type text,
  target_title text,
  target_summary text,
  target_project_id uuid default null,
  target_category text default 'general',
  target_why_it_matters text default null,
  target_questions_assumptions jsonb default '[]'::jsonb,
  target_priority smallint default 3,
  target_risk_level public.rythm_risk_level default 'low',
  target_agent_relevance jsonb default '[]'::jsonb,
  target_revisit_trigger text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  created_id uuid;
  created_key text;
  created_event_id uuid;
  event_correlation uuid := gen_random_uuid();
begin
  if actor_id is null or not public.is_org_owner(target_organization_id) then
    raise exception 'Only an organization owner may capture an Idea or Issue';
  end if;

  if target_item_type not in ('idea','issue') then
    raise exception 'item_type must be idea or issue';
  end if;
  if btrim(coalesce(target_title,'')) = '' or length(btrim(target_title)) < 3 then
    raise exception 'A title of at least 3 characters is required';
  end if;
  if btrim(coalesce(target_summary,'')) = '' or length(btrim(target_summary)) < 10 then
    raise exception 'A summary of at least 10 characters is required';
  end if;
  if btrim(coalesce(target_category,'')) = '' then
    raise exception 'Category is required';
  end if;
  if target_priority not between 1 and 5 then
    raise exception 'Priority must be between 1 and 5';
  end if;
  if jsonb_typeof(coalesce(target_questions_assumptions,'[]'::jsonb)) <> 'array' then
    raise exception 'questions_assumptions must be a JSON array';
  end if;
  if jsonb_typeof(coalesce(target_agent_relevance,'[]'::jsonb)) <> 'array' then
    raise exception 'agent_relevance must be a JSON array';
  end if;

  if target_project_id is not null and not exists (
    select 1 from public.projects p
    where p.id=target_project_id and p.organization_id=target_organization_id
  ) then
    raise exception 'Project does not belong to organization';
  end if;

  created_key := upper(target_item_type) || '-' || to_char(now(),'YYYY') || '-' ||
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.intake_items(
    organization_id,project_id,intake_key,item_type,title,summary,category,
    why_it_matters,questions_assumptions,status,priority,risk_level,
    agent_relevance,revisit_trigger,source_type,created_by_user_id
  ) values (
    target_organization_id,target_project_id,created_key,target_item_type,
    btrim(target_title),btrim(target_summary),btrim(target_category),
    nullif(btrim(coalesce(target_why_it_matters,'')),''),
    coalesce(target_questions_assumptions,'[]'::jsonb),'inbox',target_priority,
    target_risk_level,coalesce(target_agent_relevance,'[]'::jsonb),
    nullif(btrim(coalesce(target_revisit_trigger,'')),''),'human_ceo',actor_id
  ) returning id into created_id;

  created_event_id := public.record_company_event(
    target_event_type := 'idea.idea.registered',
    target_organization_id := target_organization_id,
    target_project_id := target_project_id,
    target_aggregate_type := 'idea',
    target_aggregate_id := created_id,
    target_actor_type := 'user',
    target_actor_user_id := actor_id,
    target_actor_agent_id := null,
    target_correlation_id := event_correlation,
    target_causation_event_id := null,
    target_risk_level := target_risk_level,
    target_payload := jsonb_build_object(
      'intake_key',created_key,
      'item_type',target_item_type,
      'category',btrim(target_category),
      'status','inbox',
      'priority',target_priority,
      'external_actions',false
    ),
    target_idempotency_key := 'intake-registered:' || created_id::text,
    target_occurred_at := now(),
    target_event_version := 1::smallint
  );

  if target_project_id is not null then
    perform public.ensure_entity_relationship(
      target_organization_id := target_organization_id,
      target_project_id := target_project_id,
      target_source_type := 'idea',
      target_source_id := created_id,
      target_relationship_type := 'belongs_to_project',
      target_target_type := 'project',
      target_target_id := target_project_id,
      target_created_by_user_id := actor_id,
      target_created_by_agent_id := null,
      target_source_event_id := created_event_id,
      target_metadata := jsonb_build_object('item_type',target_item_type,'intake_key',created_key)
    );
  end if;

  insert into public.audit_events(
    organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload,correlation_id
  ) values (
    target_organization_id,'user',actor_id,'idea.registered','intake_item',created_id::text,
    target_risk_level,jsonb_build_object(
      'intake_key',created_key,'item_type',target_item_type,'project_id',target_project_id,
      'external_actions',false
    ),event_correlation
  );

  return created_id;
end $$;

comment on function public.create_intake_item(uuid,text,text,text,uuid,text,text,jsonb,smallint,public.rythm_risk_level,jsonb,text) is
  'Human-CEO-only atomic Idea/Issue capture. Does not change project scope or authorize execution.';

-- -----------------------------------------------------------------------------
-- 3. Governed status command
-- -----------------------------------------------------------------------------

create or replace function public.update_intake_item_status(
  target_intake_item_id uuid,
  target_status text,
  target_revisit_trigger text default null
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  item public.intake_items%rowtype;
  previous_status text;
  event_type_name text;
  event_correlation uuid := gen_random_uuid();
begin
  select * into item from public.intake_items where id=target_intake_item_id for update;
  if not found then raise exception 'Intake item not found'; end if;
  if actor_id is null or not public.is_org_owner(item.organization_id) then
    raise exception 'Only an organization owner may update an intake item';
  end if;
  if target_status not in (
    'inbox','to_review','research_required','scheduled_for_review','under_evaluation',
    'deferred','accepted_for_decision','rejected','converted','archived'
  ) then raise exception 'Invalid intake status'; end if;
  if item.status in ('rejected','converted','archived') and target_status <> item.status then
    raise exception 'Terminal intake items cannot be reopened in MVP v1';
  end if;
  if target_status='deferred' and btrim(coalesce(target_revisit_trigger,item.revisit_trigger,''))='' then
    raise exception 'Deferred intake items require a revisit trigger';
  end if;

  previous_status := item.status;
  if previous_status = target_status and coalesce(target_revisit_trigger,'') = '' then
    return previous_status;
  end if;

  update public.intake_items
  set status=target_status,
      revisit_trigger=case
        when target_status='deferred' then coalesce(nullif(btrim(coalesce(target_revisit_trigger,'')),''),revisit_trigger)
        when nullif(btrim(coalesce(target_revisit_trigger,'')),'') is not null then btrim(target_revisit_trigger)
        else revisit_trigger end,
      updated_at=now()
  where id=target_intake_item_id;

  event_type_name := case
    when target_status='deferred' then 'idea.idea.deferred'
    when target_status in ('accepted_for_decision','converted') then 'idea.idea.promoted'
    else 'idea.idea.updated'
  end;

  perform public.record_company_event(
    target_event_type := event_type_name,
    target_organization_id := item.organization_id,
    target_project_id := item.project_id,
    target_aggregate_type := 'idea',
    target_aggregate_id := item.id,
    target_actor_type := 'user',
    target_actor_user_id := actor_id,
    target_actor_agent_id := null,
    target_correlation_id := event_correlation,
    target_causation_event_id := null,
    target_risk_level := item.risk_level,
    target_payload := jsonb_build_object(
      'intake_key',item.intake_key,'item_type',item.item_type,
      'before_status',previous_status,'after_status',target_status,
      'external_actions',false
    ),
    target_idempotency_key := 'intake-status:' || item.id::text || ':' || previous_status || ':' || target_status || ':' || extract(epoch from now())::bigint::text,
    target_occurred_at := now(),
    target_event_version := 1::smallint
  );

  insert into public.audit_events(
    organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload,correlation_id
  ) values (
    item.organization_id,'user',actor_id,'idea.status_changed','intake_item',item.id::text,item.risk_level,
    jsonb_build_object('before_status',previous_status,'after_status',target_status,'intake_key',item.intake_key),
    event_correlation
  );

  return target_status;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Idempotent Human-CEO-only Idea / Issue -> draft Meeting routing
-- -----------------------------------------------------------------------------

create or replace function public.route_intake_item_to_meeting(target_intake_item_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  item public.intake_items%rowtype;
  created_meeting_id uuid;
  route_event_id uuid;
  meeting_event_id uuid;
  event_correlation uuid := gen_random_uuid();
begin
  select * into item
  from public.intake_items
  where id=target_intake_item_id
  for update;

  if not found then raise exception 'Intake item not found'; end if;
  if actor_id is null or not public.is_org_owner(item.organization_id) then
    raise exception 'Only an organization owner may route an intake item to a meeting';
  end if;
  if item.status in ('rejected','converted','archived') then
    raise exception 'This intake item is terminal and cannot be routed to a meeting';
  end if;

  if item.routed_meeting_id is not null then
    if exists (
      select 1 from public.meetings m
      where m.id=item.routed_meeting_id and m.organization_id=item.organization_id
    ) then
      return item.routed_meeting_id;
    end if;
  end if;

  if item.project_id is not null and not exists (
    select 1 from public.projects p
    where p.id=item.project_id and p.organization_id=item.organization_id
  ) then
    raise exception 'Linked project does not belong to organization';
  end if;

  insert into public.meetings(
    organization_id,project_id,title,purpose,status,human_join_allowed,agenda,created_by_user_id
  ) values (
    item.organization_id,item.project_id,
    '[' || item.intake_key || '] ' || item.title,
    'Governed review of ' || item.item_type || ' ' || item.intake_key ||
      '. Review may recommend research, deferral, rejection, or advancement toward a Human CEO decision package. ' ||
      'Routing does not change project scope, authorize agents, or enable external actions.',
    'draft',true,
    jsonb_build_array(
      'Re-state the Idea/Issue and confirm the problem or opportunity',
      'Review context, evidence, assumptions and unknowns',
      'Compare options, operational risks and dependencies',
      'Identify legal/governance relevance where applicable',
      'Recommend research, defer, reject, or advance toward a Human CEO decision package'
    ),
    actor_id
  ) returning id into created_meeting_id;

  update public.intake_items
  set routed_meeting_id=created_meeting_id,
      routed_at=now(),
      status='scheduled_for_review',
      updated_at=now()
  where id=item.id;

  route_event_id := public.record_company_event(
    target_event_type := 'idea.idea.routed',
    target_organization_id := item.organization_id,
    target_project_id := item.project_id,
    target_aggregate_type := 'idea',
    target_aggregate_id := item.id,
    target_actor_type := 'user',
    target_actor_user_id := actor_id,
    target_actor_agent_id := null,
    target_correlation_id := event_correlation,
    target_causation_event_id := null,
    target_risk_level := item.risk_level,
    target_payload := jsonb_build_object(
      'intake_key',item.intake_key,'item_type',item.item_type,
      'meeting_id',created_meeting_id,'status','scheduled_for_review',
      'meeting_status','draft','agents_authorized',false,'meeting_started',false,
      'external_actions',false
    ),
    target_idempotency_key := 'intake-routed:' || item.id::text,
    target_occurred_at := now(),
    target_event_version := 1::smallint
  );

  meeting_event_id := public.record_company_event(
    target_event_type := 'meeting.meeting.created',
    target_organization_id := item.organization_id,
    target_project_id := item.project_id,
    target_aggregate_type := 'meeting',
    target_aggregate_id := created_meeting_id,
    target_actor_type := 'user',
    target_actor_user_id := actor_id,
    target_actor_agent_id := null,
    target_correlation_id := event_correlation,
    target_causation_event_id := route_event_id,
    target_risk_level := item.risk_level,
    target_payload := jsonb_build_object(
      'source_intake_id',item.id,'source_intake_key',item.intake_key,
      'meeting_status','draft','human_join_allowed',true,
      'agents_authorized',false,'external_actions',false
    ),
    target_idempotency_key := 'intake-meeting-created:' || item.id::text,
    target_occurred_at := now(),
    target_event_version := 1::smallint
  );

  perform public.ensure_entity_relationship(
    target_organization_id := item.organization_id,
    target_project_id := item.project_id,
    target_source_type := 'idea',
    target_source_id := item.id,
    target_relationship_type := 'discussed_in',
    target_target_type := 'meeting',
    target_target_id := created_meeting_id,
    target_created_by_user_id := actor_id,
    target_created_by_agent_id := null,
    target_source_event_id := route_event_id,
    target_metadata := jsonb_build_object(
      'item_type',item.item_type,'intake_key',item.intake_key,'meeting_status','draft'
    )
  );

  perform public.ensure_entity_relationship(
    target_organization_id := item.organization_id,
    target_project_id := item.project_id,
    target_source_type := 'meeting',
    target_source_id := created_meeting_id,
    target_relationship_type := 'belongs_to_project',
    target_target_type := 'project',
    target_target_id := item.project_id,
    target_created_by_user_id := actor_id,
    target_created_by_agent_id := null,
    target_source_event_id := meeting_event_id,
    target_metadata := jsonb_build_object('source_intake_id',item.id)
  ) from public.projects p
  where item.project_id is not null and p.id=item.project_id;

  insert into public.audit_events(
    organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload,correlation_id
  ) values (
    item.organization_id,'user',actor_id,'idea.routed_to_meeting','intake_item',item.id::text,item.risk_level,
    jsonb_build_object(
      'intake_key',item.intake_key,'meeting_id',created_meeting_id,'meeting_status','draft',
      'agents_authorized',false,'meeting_started',false,'external_actions',false
    ),event_correlation
  );

  return created_meeting_id;
end $$;

comment on function public.route_intake_item_to_meeting(uuid) is
  'Human-CEO-only, idempotent routing from Idea/Issue to one draft Meeting. Does not create a session, authorize agents, start deliberation, create a Decision, change project scope, or enable external actions.';

-- -----------------------------------------------------------------------------
-- 5. Function permissions
-- -----------------------------------------------------------------------------

revoke all on function public.create_intake_item(uuid,text,text,text,uuid,text,text,jsonb,smallint,public.rythm_risk_level,jsonb,text) from anon;
revoke all on function public.update_intake_item_status(uuid,text,text) from anon;
revoke all on function public.route_intake_item_to_meeting(uuid) from anon;

grant execute on function public.create_intake_item(uuid,text,text,text,uuid,text,text,jsonb,smallint,public.rythm_risk_level,jsonb,text) to authenticated;
grant execute on function public.update_intake_item_status(uuid,text,text) to authenticated;
grant execute on function public.route_intake_item_to_meeting(uuid) to authenticated;

-- No seed/backfill is performed. Existing documentation-only ideas remain unchanged.
