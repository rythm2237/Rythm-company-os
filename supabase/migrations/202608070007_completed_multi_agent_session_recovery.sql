-- Recover an AI-PR-001 multi-agent session that completed before the empty-output guard was deployed.
-- Preserve invalid historical outputs as system audit records, reset the governed session to ready,
-- and reopen the linked meeting only when no Human CEO decision was recorded.

do $$
declare
  v_session_id uuid;
  v_org_id uuid;
  v_meeting_id uuid;
  v_prev_input integer;
  v_prev_output integer;
  v_prev_cost numeric(12,6);
  v_has_ceo_decision boolean;
begin
  select s.id, s.organization_id, s.meeting_id,
         s.total_input_tokens, s.total_output_tokens, s.estimated_cost_usd
    into v_session_id, v_org_id, v_meeting_id,
         v_prev_input, v_prev_output, v_prev_cost
  from public.meeting_agent_sessions s
  join public.meetings m on m.id = s.meeting_id
  join public.projects p on p.id = s.project_id
  where p.project_code = 'AI-PR-001'
    and m.title = 'AI-PR-001 — Future Strategy and 90-Day Feature Scope'
    and s.status = 'completed'
    and (
      exists (
        select 1 from public.meeting_agent_messages msg
        where msg.session_id = s.id
          and msg.content = 'No textual response was produced.'
          and msg.message_type in ('position','challenge')
      )
      or coalesce(trim(s.synthesis), '') = ''
      or s.synthesis ilike '%Human CEO review required.%'
    )
  order by s.created_at desc
  limit 1;

  if v_session_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.meeting_agent_messages msg
    where msg.session_id = v_session_id
      and msg.message_type = 'ceo_decision'
  ) into v_has_ceo_decision;

  if v_has_ceo_decision then
    raise exception 'Recovery aborted: a Human CEO decision already exists for session %', v_session_id;
  end if;

  -- Preserve invalid agent turns, but exclude them from future deliberation counting/transcript context.
  update public.meeting_agent_messages
  set speaker_type = 'system',
      message_type = 'system',
      content = 'Discarded pre-hotfix agent turn: model returned no displayable text. Retained for audit history and excluded from deliberation.'
  where session_id = v_session_id
    and content = 'No textual response was produced.'
    and message_type in ('position','challenge');

  -- Preserve the invalid synthesis as an audit record rather than a valid synthesis turn.
  update public.meeting_agent_messages
  set speaker_type = 'system',
      message_type = 'system',
      content = 'Discarded pre-hotfix synthesis: deliberation contained no valid agent text. Retained for audit history and excluded from the restarted session.'
  where session_id = v_session_id
    and message_type = 'synthesis';

  update public.meeting_agent_sessions
  set status = 'ready',
      synthesis = null,
      recommendation = null,
      decision_options = '[]'::jsonb,
      total_input_tokens = 0,
      total_output_tokens = 0,
      estimated_cost_usd = 0,
      error_message = null,
      started_at = null,
      started_by_user_id = null,
      completed_at = null,
      updated_at = now()
  where id = v_session_id;

  -- If this meeting was incorrectly closed without a CEO decision, reopen it for the same governed session.
  update public.meetings
  set status = 'running',
      ended_at = null,
      updated_at = now()
  where id = v_meeting_id
    and status = 'completed';

  insert into public.audit_events (
    organization_id,
    actor_type,
    event_type,
    object_type,
    object_id,
    risk_level,
    payload
  ) values (
    v_org_id,
    'system',
    'meeting.completed_empty_output_recovered',
    'meeting',
    v_meeting_id,
    'low',
    jsonb_build_object(
      'session_id', v_session_id,
      'previous_input_tokens', coalesce(v_prev_input, 0),
      'previous_output_tokens', coalesce(v_prev_output, 0),
      'previous_estimated_cost_usd', coalesce(v_prev_cost, 0),
      'recovery', 'invalid completed session reset to ready; invalid turns retained as system audit records',
      'human_ceo_decision_present', false,
      'external_actions', false
    )
  );
end $$;
