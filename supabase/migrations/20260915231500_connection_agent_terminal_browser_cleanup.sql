-- Clear stale browser-session references once a Connection Setup Agent session is terminal.
-- The browser session is already closed by the runtime; this prevents closed viewer URLs
-- from being surfaced again by status endpoints or refreshed UI.

create or replace function public.clear_terminal_connection_browser_session_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.session_status in ('completed','failed','cancelled','expired') then
    new.browser_session_id := null;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_terminal_connection_browser_session_v1() from public, anon, authenticated;
grant execute on function public.clear_terminal_connection_browser_session_v1() to service_role;

drop trigger if exists trg_clear_terminal_connection_browser_session on public.integration_setup_sessions;
create trigger trg_clear_terminal_connection_browser_session
before insert or update of session_status, browser_session_id
on public.integration_setup_sessions
for each row
execute function public.clear_terminal_connection_browser_session_v1();

update public.integration_setup_sessions
set browser_session_id = null,
    updated_at = now()
where session_status in ('completed','failed','cancelled','expired')
  and browser_session_id is not null;
