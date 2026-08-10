-- MVP release E2E remediation: record post-closure CEO decisions without mutating the closed meeting row.
--
-- Production E2E exposed an integrity conflict: record_meeting_ceo_decision() correctly
-- runs after explicit Human CEO / Chair closure, but the function then attempted to
-- UPDATE meetings.minutes. The meeting immutability trigger correctly rejected that
-- mutation with "Completed or cancelled meetings are immutable", rolling back the
-- entire decision transaction.
--
-- This migration preserves the stronger invariant:
-- * completed meetings remain immutable;
-- * the CEO decision is appended as its own canonical Decision record;
-- * the CEO decision is appended to meeting_agent_messages as Human CEO history;
-- * high/critical decisions still create an Approval Request;
-- * audit history records whether the CEO selected a B-001 package option or used
--   an independent Custom Human CEO Decision;
-- * existing idempotency and closure-bound legal-triage guards remain in force.
--
-- Historical resolved decisions and completed meeting rows are not modified.

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
  v_decision_source text;
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
      and m.ended_at is not null
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

  -- Idempotency: retries return the single canonical decision for this session.
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
  v_decision_source := case
    when target_selected_option like 'Custom Human CEO Decision:%' then 'human_ceo_custom'
    else 'human_ceo_package_selection'
  end;

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

  -- Do NOT update public.meetings here. The meeting was explicitly closed before
  -- this gate and is immutable by design. Decision, message, approval, and audit
  -- records provide the append-only post-closure governance history.

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
      'decision_source', v_decision_source,
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
