-- Harden Admin Studio membership predicate: callers can only test their own auth identity.
drop function if exists public.is_platform_admin(uuid);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = auth.uid() and pa.enabled = true
  );
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;

-- Recreate policies against the self-only predicate.
drop policy if exists platform_admins_admin_read on public.platform_admins;
drop policy if exists automation_tasks_admin_all on public.automation_tasks;
drop policy if exists automation_task_runs_admin_all on public.automation_task_runs;

create policy platform_admins_admin_read on public.platform_admins
for select to authenticated using (public.is_platform_admin());
create policy automation_tasks_admin_all on public.automation_tasks
for all to authenticated using (public.is_platform_admin())
with check (public.is_platform_admin());
create policy automation_task_runs_admin_all on public.automation_task_runs
for all to authenticated using (public.is_platform_admin())
with check (public.is_platform_admin());
