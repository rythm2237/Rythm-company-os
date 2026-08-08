-- MVP release audit blocker remediation
-- 1) Paused agents are a real runtime kill-switch for governed meetings.
-- 2) One meeting-agent session can produce at most one CEO decision.
-- 3) CEO decision persistence is atomic and idempotent.

alter table public.decisions
  add column if not exists source_meeting_session_id uuid references public.meeting_agent_sessions(id) on delete set null;

create index if not exists decisions_source_meeting_session_idx
  on public.decisions (source_meeting_session_id)
  where source_meeting_session_id is not null;

-- Backfill the first decision attributable to each historical meeting-agent session
-- from immutable audit evidence. Historical duplicates, if any, are preserved but
-- only the first becomes the canonical session decision.
with candidates as (
  select
    d.id as decision_id,
    mas.id as session_id,
    row_number() over (
      partition by mas.id
      order by ae.created_at asc, ae.id asc
    ) as rn
  from public.audit_events ae
  join public.decisions d
    on d.organization_id = ae.organization_id
   and d.id::text = ae.object_id
  join public.meeting_agent_sessions mas
    on mas.organization_id = ae.organization_id
   and mas.id::text = ae.payload ->> 'session_id'
  where ae.object_type = 'decision'
    and ae.event_type in ('decision.created','decision.approved')
    and ae.payload ? 'session_id'
)
update public.decisions d
set source_meeting_session_id = c.session_id
from candidates c
where d.id = c.decision_id
  and c.rn = 1
  and d.source_meeting_session_id is null;

create unique index if not exists decisions_one_per_meeting_session_uidx
  on public.decisions (organization_id, source_meeting_session_id)
  where source_meeting_session_id is not null;

create or replace function public.enforce_enabled_meeting_participant()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_enabled boolean;
  v_agent_code text;
begin
  select a.enabled, a.agent_code
    into v_enabled, v_agent_code
  from public.agents a
  where a.id = new.agent_id
    and a.organization_id = new.organization_id;

  if v_agent_code is null then
    raise exception 'Selected meeting agent is not registered in this organization';
  end if;

  if v_agent_code = 'T-001' then
    raise exception 'The external execution agent cannot participate in internal Boardroom deliberation';
  end if;

  if not coalesce(v_enabled,false) then
    raise exception 'Selected meeting agent is paused';
  end if;

  return new;
end;
$$;

drop trigger if exists meeting_participant_enabled_guard on public.meeting_agent_participants;
create trigger meeting_participant_enabled_guard
before insert or update of agent_id, organization_id
on public.meeting_agent_participants
for each row execute function public.enforce_enabled_meeting_participant();

create or replace function public.enforce_enabled_agents_before_session_run()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total integer;
  v_enabled integer;
  v_b001 integer;
begin
  if new.status = 'running' and old.status is distinct from 'running' then
    select
      count(*),
      count(*) filter (where a.enabled),
      count(*) filter (where a.enabled and a.agent_code = 'B-001')
    into v_total, v_enabled, v_b001
    from public.meeting_agent_participants p
    join public.agents a
      on a.id = p.agent_id
     and a.organization_id = p.organization_id
    where p.session_id = new.id
      and p.organization_id = new.organization_id
      and p.explicitly_authorized_by_ceo = true;

    if v_total < 2 then
      raise exception 'At least two enabled CEO-authorized agents are required';
    end if;

    if v_enabled <> v_total then
      raise exception 'A selected meeting agent is paused';
    end if;

    if v_b001 < 1 then
      raise exception 'Enabled B-001 Executive Orchestrator is required for governed meeting synthesis';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists meeting_session_enabled_agents_guard on public.meeting_agent_sessions;
create trigger meeting_session_enabled_agents_guard
before update of status
on public.meeting_agent_sessions
for each row execute function public.enforce_enabled_agents_before_session_run();

create or replace function public.record_meeting_ceo_decision(
  target_org_id uuid,
  target_meeting_id uuid,
  target_session_id uuid,
  target_project_id uuid,
  target_title text,
  target_context text,
  target_options jsonb,
  target_recommendation jsonb,
  target_rationale text,
  target_risk_level text,
  target_selected_option text,
  target_legal_triage_status text,
  target_legal_review_outcome text,
  target_synthesis text,
  target_legal_minutes text,
  target_proposed_by_agent_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_decision_id uuid;
  v_requires_approval boolean;
  v_status public.rythm_record_status;
  v_decision_key text;
  v_turn_index integer;
  v_conditions jsonb;
  v_session_project_id uuid;
begin
  if not public.is_org_owner(target_org_id) then
    raise exception 'Owner authorization required';
  end if;

  if target_risk_level not in ('low','medium','high','critical') then
    raise exception 'Invalid decision risk level';
  end if;

  if not exists (
    select 1 from public.meetings m
    where m.id = target_meeting_id
      and m.organization_id = target_org_id
      and m.status = 'completed'
  ) then
    raise exception 'Meeting must be explicitly closed by the Human CEO / Chair';
  end if;

  select s.project_id
    into v_session_project_id
  from public.meeting_agent_sessions s
  where s.id = target_session_id
    and s.meeting_id = target_meeting_id
    and s.organization_id = target_org_id
    and s.status = 'completed';

  if not found then
    raise exception 'Completed governed meeting session not found';
  end if;

  if target_project_id is distinct from v_session_project_id then
    raise exception 'Decision project does not match meeting session project';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements_text(coalesce(target_options,'[]'::jsonb)) option_value
    where option_value = target_selected_option
  ) then
    raise exception 'Selected option is not part of the meeting decision package';
  end if;

  select d.id
    into v_decision_id
  from public.decisions d
  where d.organization_id = target_org_id
    and d.source_meeting_session_id = target_session_id
  limit 1;

  if v_decision_id is not null then
    return v_decision_id;
  end if;

  v_requires_approval := target_risk_level in ('high','critical');
  v_status := case when v_requires_approval then 'review'::public.rythm_record_status else 'approved'::public.rythm_record_status end;
  v_decision_key := 'DEC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));

  begin
    insert into public.decisions (
      organization_id,
      project_id,
      source_meeting_session_id,
      decision_key,
      title,
      context,
      options,
      recommendation,
      rationale,
      risk_level,
      status,
      requires_human_approval,
      decided_by_user_id,
      proposed_by_agent_id,
      decided_at
    ) values (
      target_org_id,
      target_project_id,
      target_session_id,
      v_decision_key,
      target_title,
      target_context,
      coalesce(target_options,'[]'::jsonb),
      target_recommendation,
      'CEO selected: ' || target_selected_option || E'\n\n' || target_rationale,
      target_risk_level::public.rythm_risk_level,
      v_status,
      v_requires_approval,
      case when v_requires_approval then null else auth.uid() end,
      target_proposed_by_agent_id,
      case when v_requires_approval then null else now() end
    ) returning id into v_decision_id;
  exception when unique_violation then
    select d.id
      into v_decision_id
    from public.decisions d
    where d.organization_id = target_org_id
      and d.source_meeting_session_id = target_session_id
    limit 1;
    if v_decision_id is null then
      raise;
    end if;
    return v_decision_id;
  end;

  if v_requires_approval then
    v_conditions := jsonb_build_array(
      'Human CEO approval required before this high-risk decision is finalized',
      'External actions remain disabled'
    );
    if target_legal_review_outcome = 'RISK_IDENTIFIED' then
      v_conditions := v_conditions || jsonb_build_array('A-106 identified material legal risk; resolve legal conditions before execution');
    end if;

    insert into public.approval_requests (
      organization_id,
      project_id,
      subject_type,
      subject_id,
      title,
      summary,
      risk_level,
      status,
      conditions,
      expires_at
    ) values (
      target_org_id,
      target_project_id,
      'decision',
      v_decision_id,
      'Approve decision: ' || target_title,
      target_context,
      target_risk_level::public.rythm_risk_level,
      'pending',
      v_conditions,
      now() + interval '7 days'
    );
  end if;

  select coalesce(max(m.turn_index),0) + 1
    into v_turn_index
  from public.meeting_agent_messages m
  where m.session_id = target_session_id;

  insert into public.meeting_agent_messages (
    organization_id,
    meeting_id,
    session_id,
    agent_id,
    turn_index,
    round_no,
    speaker_type,
    message_type,
    content
  ) values (
    target_org_id,
    target_meeting_id,
    target_session_id,
    null,
    v_turn_index,
    99,
    'human_ceo',
    'ceo_decision',
    'CEO decision: ' || target_selected_option || E'\n\nRationale: ' || target_rationale
  );

  update public.meetings
  set minutes = jsonb_build_object(
    'text',
    'Multi-Agent deliberation closed by Human CEO / Chair.' || E'\n\n' ||
    coalesce(target_synthesis,'') || coalesce(target_legal_minutes,'') || E'\n\n' ||
    'Human CEO decision: ' || target_selected_option || E'\nRationale: ' || target_rationale || E'\nDecision record: ' || v_decision_key
  )
  where id = target_meeting_id
    and organization_id = target_org_id
    and status = 'completed';

  insert into public.audit_events (
    organization_id,
    actor_type,
    actor_user_id,
    event_type,
    object_type,
    object_id,
    risk_level,
    payload
  ) values (
    target_org_id,
    'user',
    auth.uid(),
    case when v_requires_approval then 'decision.created' else 'decision.approved' end,
    'decision',
    v_decision_id::text,
    target_risk_level::public.rythm_risk_level,
    jsonb_build_object(
      'meeting_id', target_meeting_id,
      'session_id', target_session_id,
      'selected_option', target_selected_option,
      'human_authority', 'Human CEO / Owner',
      'chair_closed', true,
      'legal_triage_status', target_legal_triage_status,
      'legal_review_outcome', target_legal_review_outcome,
      'external_actions', false
    )
  );

  return v_decision_id;
end;
$$;

revoke all on function public.record_meeting_ceo_decision(uuid,uuid,uuid,uuid,text,text,jsonb,jsonb,text,text,text,text,text,text,text,uuid) from public;
grant execute on function public.record_meeting_ceo_decision(uuid,uuid,uuid,uuid,text,text,jsonb,jsonb,text,text,text,text,text,text,text,uuid) to authenticated;
