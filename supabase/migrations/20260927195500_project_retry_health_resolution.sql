-- Retry exhaustion is a transient health condition. Once the failed task leaves
-- `failed` because the supervisor recovered/replanned it, close the matching health event.

create or replace function public.resolve_project_retry_health_v1()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
begin
  if old.status='failed' and new.status<>'failed' then
    update public.project_health_events h
    set status='resolved',resolved_at=coalesce(h.resolved_at,now())
    where h.execution_id=new.execution_id
      and h.health_type='retry_exhausted'
      and h.status='open'
      and h.details->>'task_run_id'=new.id::text;
  end if;
  return new;
end;
$$;

revoke all on function public.resolve_project_retry_health_v1() from public,anon,authenticated;
grant execute on function public.resolve_project_retry_health_v1() to service_role;

drop trigger if exists project_task_retry_health_resolution_v1 on public.project_task_runs;
create trigger project_task_retry_health_resolution_v1
after update of status on public.project_task_runs
for each row
when (old.status is distinct from new.status)
execute function public.resolve_project_retry_health_v1();

-- Reconcile tasks that were already recovered before this trigger was installed.
update public.project_health_events h
set status='resolved',resolved_at=coalesce(h.resolved_at,now())
where h.health_type='retry_exhausted'
  and h.status='open'
  and exists(
    select 1
    from public.project_task_runs tr
    where tr.id=(h.details->>'task_run_id')::uuid
      and tr.execution_id=h.execution_id
      and tr.status<>'failed'
  );
