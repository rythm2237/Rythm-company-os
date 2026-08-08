-- Batch 3 — automatic runtime incident capture
-- Depends on 202608080016_batch3_security_reliability.sql.

create or replace function public.capture_meeting_session_incident()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_message text;
  incident_key_value text;
  severity_value text;
begin
  if new.error_message is null or btrim(new.error_message)='' then
    return new;
  end if;

  if tg_op='UPDATE' and old.error_message is not distinct from new.error_message
     and old.status is not distinct from new.status then
    return new;
  end if;

  normalized_message := left(regexp_replace(new.error_message,'[\r\n\t]+',' ','g'),500);
  incident_key_value := 'meeting-session:' || new.id::text || ':' || md5(normalized_message);
  severity_value := case when new.status='failed' then 'high' else 'medium' end;

  insert into public.operational_incidents(
    organization_id,incident_key,severity,source,error_code,safe_message,context,
    correlation_id,status,occurrence_count,first_seen_at,last_seen_at,created_by_user_id
  ) values (
    new.organization_id,incident_key_value,severity_value,'meeting_runtime',
    case when new.status='failed' then 'SESSION_FAILED' else 'SESSION_RUNTIME_WARNING' end,
    normalized_message,
    jsonb_build_object(
      'session_id',new.id,
      'meeting_id',new.meeting_id,
      'project_id',new.project_id,
      'session_status',new.status,
      'external_actions',false
    ),
    gen_random_uuid(),'open',1,now(),now(),auth.uid()
  )
  on conflict (organization_id,incident_key) do update
  set severity=excluded.severity,
      safe_message=excluded.safe_message,
      context=excluded.context,
      status='open',
      occurrence_count=public.operational_incidents.occurrence_count+1,
      last_seen_at=now();

  return new;
end $$;

revoke all on function public.capture_meeting_session_incident() from public;

do $$
begin
  if to_regclass('public.meeting_agent_sessions') is not null then
    execute 'drop trigger if exists meeting_session_incident_capture on public.meeting_agent_sessions';
    execute 'create trigger meeting_session_incident_capture after insert or update of status,error_message on public.meeting_agent_sessions for each row execute function public.capture_meeting_session_incident()';
  end if;
end $$;

comment on function public.capture_meeting_session_incident() is
  'Automatically captures deduplicated meeting runtime failures/warnings for owner diagnostics. Does not alter meeting authority or retry state.';
