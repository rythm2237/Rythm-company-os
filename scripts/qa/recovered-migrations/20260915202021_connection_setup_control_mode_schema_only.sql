CREATE OR REPLACE FUNCTION public.enforce_connection_setup_control_mode_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  -- Human-only step with a live browser: immediately hand interaction to the user.
  if new.session_status = 'waiting_for_user'
     and (coalesce(new.requires_user_action, false) or coalesce(new.user_action_required, false))
     and new.browser_session_id is not null
     and new.control_mode <> 'paused' then
    new.control_mode := 'human';
    return new;
  end if;

  -- Once a verified provider/server signal advances the workflow, return control to AI.
  if tg_op = 'UPDATE'
     and old.session_status = 'waiting_for_user'
     and old.control_mode = 'human'
     and new.session_status in ('queued','starting','running','waiting_for_provider','verifying','retrying')
     and not coalesce(new.requires_user_action, false)
     and not coalesce(new.user_action_required, false)
     and new.control_mode <> 'paused' then
    new.control_mode := 'ai';
    return new;
  end if;

  return new;
end;
$function$

CREATE TRIGGER trg_connection_setup_auto_control_mode BEFORE INSERT OR UPDATE OF session_status, requires_user_action, user_action_required, browser_session_id, control_mode ON public.integration_setup_sessions FOR EACH ROW EXECUTE FUNCTION public.enforce_connection_setup_control_mode_v1();