-- Resume durable AI setup from provider verification and Human-confirmed resource binding.
begin;

create or replace function public.resume_ai_connection_setup_after_verified_connection_v1()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='connected' and new.last_verified_at is not null and
     (old.status is distinct from new.status or old.last_verified_at is distinct from new.last_verified_at) then
    update public.integration_setup_sessions s
    set current_step=coalesce((
          select (entry.ordinality-1)::integer
          from jsonb_array_elements(coalesce(s.setup_plan->'steps','[]'::jsonb)) with ordinality entry(value,ordinality)
          where entry.value->>'type'='RESOURCE_DISCOVERY'
          order by entry.ordinality limit 1
        ),s.current_step+1),
        session_status='running',step_status='in_progress',control_mode='ai',
        requires_user_action=false,user_action_required=false,user_action_type=null,human_takeover_reason=null,
        last_heartbeat_at=now(),next_attempt_at=null,updated_at=now()
    where s.organization_id=new.organization_id and s.connection_id=new.id and s.automation_mode='ai'
      and s.session_status in ('waiting_for_user','waiting_for_provider','running','verifying','retrying','paused');
  end if;
  return new;
end $$;

drop trigger if exists trg_resume_ai_connection_setup_after_verified_connection on public.organization_integrations;
create trigger trg_resume_ai_connection_setup_after_verified_connection
after update of status,last_verified_at on public.organization_integrations
for each row execute function public.resume_ai_connection_setup_after_verified_connection_v1();

create or replace function public.resume_ai_connection_setup_after_verified_binding_v1()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.binding_status='verified' and new.verified_at is not null then
    update public.integration_setup_sessions s
    set current_step=coalesce((
          select (entry.ordinality-1)::integer
          from jsonb_array_elements(coalesce(s.setup_plan->'steps','[]'::jsonb)) with ordinality entry(value,ordinality)
          where entry.value->>'type'='CONNECTION_VERIFY'
          order by entry.ordinality limit 1
        ),s.current_step+1),
        session_status='running',step_status='in_progress',control_mode='ai',
        requires_user_action=false,user_action_required=false,user_action_type=null,human_takeover_reason=null,
        last_heartbeat_at=now(),next_attempt_at=null,updated_at=now()
    where s.organization_id=new.organization_id and s.connection_id=new.integration_id and s.project_id=new.project_id
      and s.automation_mode='ai' and s.session_status in ('waiting_for_user','running','verifying','retrying','paused');
  end if;
  return new;
end $$;

drop trigger if exists trg_resume_ai_connection_setup_after_verified_binding on public.project_connection_bindings;
create trigger trg_resume_ai_connection_setup_after_verified_binding
after insert or update of binding_status,verified_at on public.project_connection_bindings
for each row execute function public.resume_ai_connection_setup_after_verified_binding_v1();

revoke all on function public.resume_ai_connection_setup_after_verified_connection_v1() from public,anon,authenticated;
revoke all on function public.resume_ai_connection_setup_after_verified_binding_v1() from public,anon,authenticated;

commit;
