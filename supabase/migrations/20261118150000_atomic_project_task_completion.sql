-- Preserve owner-only human mutation while allowing trusted internal service execution.
create or replace function public.enforce_action_item_lifecycle()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if old.status in ('completed', 'cancelled') and row(new.*) is distinct from row(old.*) then
    raise exception 'Completed or cancelled action items are immutable';
  end if;

  if row(new.*) is distinct from row(old.*)
     and coalesce(auth.role(),'') <> 'service_role'
     and current_user not in ('postgres','supabase_admin') then
    if not public.is_org_owner(old.organization_id) then
      raise exception 'Only an organization owner or governed internal service may update an action item';
    end if;
  end if;

  if new.priority < 1 or new.priority > 5 then
    raise exception 'Action priority must be between 1 and 5';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'open' and new.status in ('in_progress', 'blocked', 'completed', 'cancelled'))
      or (old.status = 'in_progress' and new.status in ('open', 'blocked', 'completed', 'cancelled'))
      or (old.status = 'blocked' and new.status in ('open', 'in_progress', 'completed', 'cancelled'))
    ) then
      raise exception 'Invalid action item lifecycle transition from % to %', old.status, new.status;
    end if;
  end if;

  if new.status = 'completed' and new.completed_at is null then
    raise exception 'Completed action items require a completion timestamp';
  end if;

  if new.status <> 'completed' then new.completed_at := null; end if;
  return new;
end;
$$;
-- Finish a leased internal task and its linked action in one transaction.
-- This records advisory work only, never authoritative implementation/outcome proof.
create or replace function public.complete_project_task_work_v1(
 p_task_id uuid,p_organization_id uuid,p_project_id uuid,p_lease_owner text,
 p_safe_result jsonb,p_result_semantics jsonb
) returns uuid language plpgsql security invoker set search_path='' as $$
declare task_row public.project_task_runs; action_row public.action_items; now_at timestamptz:=now(); has_blocker boolean;
begin
 if jsonb_typeof(p_safe_result)<>'object' or jsonb_typeof(p_result_semantics)<>'object'
    or p_safe_result is null or p_result_semantics is null then
  raise exception 'Task completion requires structured output' using errcode='22023';
 end if;
 select tr.* into task_row from public.project_task_runs tr
 join public.project_executions e on e.id=tr.execution_id and e.organization_id=tr.organization_id and e.project_id=tr.project_id
 where tr.id=p_task_id and tr.organization_id=p_organization_id and tr.project_id=p_project_id
   and tr.status='running' and tr.lease_owner=p_lease_owner and tr.lease_expires_at>now_at
   and e.status in ('queued','running') for update of tr;
 if not found then raise exception 'Leased tenant task is unavailable' using errcode='42501'; end if;
 if task_row.waiting_on_approval_id is not null and not exists(
  select 1 from public.approval_requests a where a.id=task_row.waiting_on_approval_id
   and a.organization_id=p_organization_id and a.project_id=p_project_id and a.status='approved'
 ) then raise exception 'Human approval is required' using errcode='42501'; end if;
 if task_row.action_item_id is not null then
  select * into action_row from public.action_items a where a.id=task_row.action_item_id
   and a.organization_id=p_organization_id and (a.project_id is null or a.project_id=p_project_id) for update;
  if not found or action_row.status='cancelled' then
   raise exception 'Linked tenant action is unavailable' using errcode='42501';
  end if;
  if action_row.status<>'completed' then
   update public.action_items set status='completed',completed_at=now_at where id=action_row.id;
  end if;
 end if;
 select exists(select 1 from jsonb_array_elements(coalesce(p_result_semantics->'blockers','[]'::jsonb)) b
   where b->>'blocking'='true' or lower(b->>'severity') in ('high','critical')) into has_blocker;
 update public.project_task_runs set status='completed',safe_result=p_safe_result,
  result_semantics=p_result_semantics||jsonb_build_object('authority','agent_claim_non_authoritative'),
  outcome_status=case when has_blocker then 'blocked' when p_result_semantics->>'outcome_observed'='true' then 'observed' else 'pending' end,
  implementation_status=case when p_result_semantics->>'implementation_executed'='true' then 'reported_executed' else 'not_reported' end,
  verification_status=coalesce(nullif(p_result_semantics->>'verification_result',''),'not_verified'),
  next_required_action=nullif(p_safe_result->>'next_required_action',''),completion_evidence=coalesce(p_result_semantics->'evidence','[]'::jsonb),
  completed_at=now_at,lease_owner=null,lease_expires_at=null,updated_at=now_at where id=task_row.id;
 return task_row.id;
end $$;
revoke all on function public.complete_project_task_work_v1(uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_project_task_work_v1(uuid,uuid,uuid,text,jsonb,jsonb) to service_role;
