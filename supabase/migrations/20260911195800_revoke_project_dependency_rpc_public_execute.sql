-- Harden project dependency maintenance functions.
-- These SECURITY DEFINER functions are internal maintenance primitives:
-- one is invoked from a database trigger and the other is its trigger wrapper.
-- They must not be callable through PostgREST by anonymous or ordinary signed-in users.

revoke execute on function public.refresh_project_action_dependencies(uuid) from public;
revoke execute on function public.refresh_project_action_dependencies(uuid) from anon;
revoke execute on function public.refresh_project_action_dependencies(uuid) from authenticated;

grant execute on function public.refresh_project_action_dependencies(uuid) to service_role;

revoke execute on function public.trg_refresh_project_action_dependencies() from public;
revoke execute on function public.trg_refresh_project_action_dependencies() from anon;
revoke execute on function public.trg_refresh_project_action_dependencies() from authenticated;

grant execute on function public.trg_refresh_project_action_dependencies() to service_role;
