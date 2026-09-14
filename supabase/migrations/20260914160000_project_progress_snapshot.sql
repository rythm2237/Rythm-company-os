-- Keep the legacy projects.progress_percent cache aligned with real executable work.
-- Execution Readiness remains a separate advisory metric and is never used here.

create or replace function public.refresh_project_progress_percent_v1(p_project_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_execution_id uuid;
  v_total integer := 0;
  v_completed integer := 0;
  v_percent integer := 0;
begin
  select id into v_execution_id
  from public.project_executions
  where project_id = p_project_id
  order by execution_no desc
  limit 1;

  select
    count(*) filter (where status <> 'cancelled'),
    count(*) filter (where status = 'completed')
  into v_total, v_completed
  from public.project_task_runs
  where project_id = p_project_id
    and (v_execution_id is null or execution_id = v_execution_id);

  v_percent := case
    when v_total = 0 then coalesce((select case when status = 'completed' then 100 else 0 end from public.projects where id = p_project_id), 0)
    else round((v_completed::numeric / v_total::numeric) * 100)::integer
  end;

  if v_completed > 0 and v_completed < v_total then
    v_percent := greatest(1, v_percent);
  end if;

  update public.projects
  set progress_percent = greatest(0, least(100, v_percent))
  where id = p_project_id
    and progress_percent is distinct from greatest(0, least(100, v_percent));

  return greatest(0, least(100, v_percent));
end;
$$;

create or replace function public.sync_project_progress_percent_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_project_progress_percent_v1(coalesce(new.project_id, old.project_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists project_task_runs_sync_progress_v1 on public.project_task_runs;
create trigger project_task_runs_sync_progress_v1
after insert or update of status or delete on public.project_task_runs
for each row execute function public.sync_project_progress_percent_v1();

do $$
declare
  v_project record;
begin
  for v_project in select id from public.projects loop
    perform public.refresh_project_progress_percent_v1(v_project.id);
  end loop;
end;
$$;

revoke all on function public.refresh_project_progress_percent_v1(uuid) from public, anon, authenticated;
revoke all on function public.sync_project_progress_percent_v1() from public, anon, authenticated;
grant execute on function public.refresh_project_progress_percent_v1(uuid) to service_role;
