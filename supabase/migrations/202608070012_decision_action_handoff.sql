-- Batch 2.2 — Governed Decision -> Action Handoff
-- Implements WF-006. Human CEO authority remains authoritative.
-- External actions remain disabled. No historical decision is backfilled automatically.

-- -----------------------------------------------------------------------------
-- 1. Persist execution-authorization provenance on Action Items
-- -----------------------------------------------------------------------------

alter table public.action_items
  add column if not exists handoff_source text,
  add column if not exists authorization_approval_id uuid references public.approval_requests(id) on delete set null,
  add column if not exists authorized_at timestamptz,
  add column if not exists authorization_snapshot jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.action_items'::regclass
      and conname = 'action_items_handoff_source_check'
  ) then
    alter table public.action_items
      add constraint action_items_handoff_source_check
      check (handoff_source is null or handoff_source in ('decision_pipeline','execution_plan_seed','manual')) not valid;
    alter table public.action_items validate constraint action_items_handoff_source_check;
  end if;
end $$;

create index if not exists action_items_decision_handoff_idx
  on public.action_items(decision_id, handoff_source, created_at desc)
  where decision_id is not null;

-- Historical Action Items are intentionally not updated here.
-- Existing execution-plan rows remain authoritative and are detected by decision_id,
-- so WF-006 does not need to mutate them in order to prevent duplicates.

-- -----------------------------------------------------------------------------
-- 2. Approval-aware, idempotent Decision -> Action function
-- -----------------------------------------------------------------------------

create or replace function public.create_governed_action_from_decision(target_decision_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  d public.decisions%rowtype;
  approval_id uuid;
  existing_action_id uuid;
  created_action_id uuid;
  created_event_id uuid;
  generated_action_code text;
  generated_priority integer;
  authorization_time timestamptz;
begin
  select * into d
  from public.decisions
  where id = target_decision_id;

  if not found then
    raise exception 'Decision not found';
  end if;

  -- A decision record is not execution authority until Human CEO finalization exists.
  if d.status <> 'approved' then
    raise exception 'Decision % is not approved for execution', d.decision_key;
  end if;

  if d.decided_by_user_id is null or d.decided_at is null then
    raise exception 'Decision % lacks Human CEO finalization provenance', d.decision_key;
  end if;

  -- High/Critical or explicitly human-approved decisions require a resolved Approval Request.
  if d.requires_human_approval or d.risk_level in ('high','critical') then
    select ar.id into approval_id
    from public.approval_requests ar
    where ar.organization_id = d.organization_id
      and ar.subject_type = 'decision'
      and ar.subject_id = d.id
      and ar.status = 'approved'
    order by ar.resolved_at desc nulls last, ar.created_at desc
    limit 1;

    if approval_id is null then
      raise exception 'Decision % requires an approved Approval Request before execution handoff', d.decision_key;
    end if;
  end if;

  -- Existing linked actions are authoritative. Do not create a duplicate parent action.
  select ai.id into existing_action_id
  from public.action_items ai
  where ai.organization_id = d.organization_id
    and ai.decision_id = d.id
  order by ai.created_at asc
  limit 1;

  if existing_action_id is not null then
    return existing_action_id;
  end if;

  generated_action_code := d.decision_key || '-HANDOFF';
  generated_priority := case d.risk_level
    when 'critical' then 1
    when 'high' then 1
    when 'medium' then 2
    else 3
  end;
  authorization_time := coalesce(d.decided_at, now());

  insert into public.action_items (
    organization_id,
    project_id,
    decision_id,
    action_code,
    phase_code,
    phase_name,
    owner_label,
    title,
    description,
    status,
    priority,
    assigned_user_id,
    risk_level,
    handoff_source,
    authorization_approval_id,
    authorized_at,
    authorization_snapshot
  ) values (
    d.organization_id,
    d.project_id,
    d.id,
    generated_action_code,
    'DECISION_HANDOFF',
    'Governed Decision Handoff',
    'Human CEO / Owner',
    'Execute approved decision — ' || d.title,
    'Accountable execution handoff created after Human CEO decision finalization. ' ||
      'Decision key: ' || d.decision_key || '. ' ||
      case when d.rationale is not null and btrim(d.rationale) <> ''
        then 'Decision rationale: ' || d.rationale || '. '
        else '' end ||
      'External actions remain disabled unless separately approved.',
    'open',
    generated_priority,
    d.decided_by_user_id,
    d.risk_level,
    'decision_pipeline',
    approval_id,
    authorization_time,
    jsonb_build_object(
      'decision_id', d.id,
      'decision_key', d.decision_key,
      'decision_status', d.status,
      'risk_level', d.risk_level,
      'requires_human_approval', d.requires_human_approval,
      'approval_request_id', approval_id,
      'decided_by_user_id', d.decided_by_user_id,
      'decided_at', d.decided_at,
      'external_actions', false
    )
  )
  returning id into created_action_id;

  -- Company Event: immutable operating fact. Explicit casts avoid signature ambiguity.
  created_event_id := public.record_company_event(
    target_event_type := 'execution.action.created',
    target_organization_id := d.organization_id,
    target_project_id := d.project_id,
    target_aggregate_type := 'action_item',
    target_aggregate_id := created_action_id,
    target_actor_type := 'user',
    target_actor_user_id := d.decided_by_user_id,
    target_actor_agent_id := null,
    target_correlation_id := gen_random_uuid(),
    target_causation_event_id := null,
    target_risk_level := d.risk_level::public.rythm_risk_level,
    target_payload := jsonb_build_object(
      'action_id', created_action_id,
      'decision_id', d.id,
      'decision_key', d.decision_key,
      'approval_request_id', approval_id,
      'handoff_source', 'decision_pipeline',
      'human_authority', 'Human CEO / Owner',
      'external_actions', false
    ),
    target_idempotency_key := 'decision-action-handoff:' || d.id::text,
    target_occurred_at := authorization_time,
    target_event_version := 1::smallint
  );

  perform public.ensure_entity_relationship(
    target_organization_id := d.organization_id,
    target_project_id := d.project_id,
    target_source_type := 'action_item',
    target_source_id := created_action_id,
    target_relationship_type := 'implements_decision',
    target_target_type := 'decision',
    target_target_id := d.id,
    target_created_by_user_id := d.decided_by_user_id,
    target_created_by_agent_id := null,
    target_source_event_id := created_event_id,
    target_metadata := jsonb_build_object('handoff_source','decision_pipeline')
  );

  if d.project_id is not null then
    perform public.ensure_entity_relationship(
      target_organization_id := d.organization_id,
      target_project_id := d.project_id,
      target_source_type := 'action_item',
      target_source_id := created_action_id,
      target_relationship_type := 'belongs_to_project',
      target_target_type := 'project',
      target_target_id := d.project_id,
      target_created_by_user_id := d.decided_by_user_id,
      target_created_by_agent_id := null,
      target_source_event_id := created_event_id,
      target_metadata := jsonb_build_object('handoff_source','decision_pipeline')
    );
  end if;

  return created_action_id;
end $$;

comment on function public.create_governed_action_from_decision(uuid) is
  'Creates an idempotent Action Item only from a Human-CEO-finalized decision; High/Critical decisions require an approved Approval Request. Does not authorize external actions.';

-- -----------------------------------------------------------------------------
-- 3. Automatic convergence when a decision first becomes approved
-- -----------------------------------------------------------------------------

create or replace function public.on_decision_execution_authorized()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'approved'
     and (TG_OP = 'INSERT' or old.status is distinct from new.status) then
    perform public.create_governed_action_from_decision(new.id);
  end if;
  return new;
end $$;

drop trigger if exists decisions_execution_handoff_trigger on public.decisions;
create trigger decisions_execution_handoff_trigger
after insert or update of status on public.decisions
for each row
execute function public.on_decision_execution_authorized();

-- -----------------------------------------------------------------------------
-- 4. Explicit guard verification helpers / permissions
-- -----------------------------------------------------------------------------

revoke all on function public.create_governed_action_from_decision(uuid) from anon;
grant execute on function public.create_governed_action_from_decision(uuid) to authenticated;

-- No backfill is intentionally executed here.
-- Existing decisions remain unchanged; future approval transitions use WF-006.
