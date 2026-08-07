-- Recover the first AI-PR-001 multi-agent meeting after pre-hotfix empty model outputs.
-- Preserve the failed test turns for auditability by reclassifying them as system records,
-- then make the same governed session resumable from Round 1.

do $$
declare
  v_session_id uuid;
  v_org_id uuid;
begin
  select s.id, s.organization_id
    into v_session_id, v_org_id
  from public.meeting_agent_sessions s
  join public.meetings m on m.id = s.meeting_id
  join public.projects p on p.id = s.project_id
  where p.project_code = 'AI-PR-001'
    and m.title = 'AI-PR-001 — Future Strategy and 90-Day Feature Scope'
    and s.status in ('ready','running','failed')
  order by s.created_at desc
  limit 1;

  if v_session_id is null then
    return;
  end if;

  update public.meeting_agent_messages
  set speaker_type = 'system',
      message_type = 'system',
      content = 'Discarded pre-hotfix agent turn: model returned no displayable text. Retained for audit history and excluded from deliberation.'
  where session_id = v_session_id
    and content = 'No textual response was produced.'
    and message_type in ('position','challenge');

  update public.meeting_agent_sessions
  set status = 'ready',
      synthesis = null,
      recommendation = null,
      decision_options = '[]'::jsonb,
      error_message = null,
      started_at = null,
      started_by_user_id = null,
      completed_at = null,
      updated_at = now()
  where id = v_session_id;

  insert into public.audit_events (
    organization_id,
    actor_type,
    event_type,
    object_type,
    object_id,
    risk_level,
    payload
  )
  select
    v_org_id,
    'system',
    'meeting.agent_empty_output_recovered',
    'meeting',
    s.meeting_id,
    'low',
    jsonb_build_object(
      'session_id', v_session_id,
      'recovery', 'empty pre-hotfix turns reclassified as system records; deliberation reset to ready',
      'external_actions', false
    )
  from public.meeting_agent_sessions s
  where s.id = v_session_id;
end $$;
