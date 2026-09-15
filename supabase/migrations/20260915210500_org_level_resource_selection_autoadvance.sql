create or replace function public.enforce_org_level_resource_selection_autoadvance_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  step_type text;
begin
  if new.automation_mode = 'ai'
     and new.project_id is null
     and new.session_status = 'waiting_for_user'
     and coalesce(new.requires_user_action, false) = true
     and new.user_action_type = 'RESOURCE_CHOICE_REQUIRED' then
    step_type := new.setup_plan -> 'steps' -> new.current_step ->> 'type';
    if step_type = 'RESOURCE_SELECTION' then
      new.current_step := new.current_step + 1;
      new.session_status := 'running';
      new.step_status := 'in_progress';
      new.control_mode := 'ai';
      new.requires_user_action := false;
      new.user_action_required := false;
      new.user_action_type := null;
      new.human_takeover_reason := null;
      new.last_heartbeat_at := now();
      new.updated_at := now();
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_org_level_resource_selection_autoadvance_v1() from public, anon, authenticated;
grant execute on function public.enforce_org_level_resource_selection_autoadvance_v1() to service_role;

drop trigger if exists trg_connection_setup_org_resource_autoadvance on public.integration_setup_sessions;
create trigger trg_connection_setup_org_resource_autoadvance
before insert or update on public.integration_setup_sessions
for each row execute function public.enforce_org_level_resource_selection_autoadvance_v1();
