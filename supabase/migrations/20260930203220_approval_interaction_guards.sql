-- Preserve history and suppress identical pending/rejected authority gates.
alter table public.approval_requests add column if not exists request_fingerprint text;

create or replace function public.project_approval_fingerprint_v1(p jsonb)
returns text language sql immutable security invoker set search_path=''
as $$
  select pg_catalog.md5(jsonb_build_object(
    'type',p->>'subject_type',
    'subject',case when p->>'subject_type'='project_proposal' then null else p->>'subject_id' end,
    'title',lower(regexp_replace(btrim(coalesce(p->>'title','')),'\s+',' ','g')),
    'summary',lower(regexp_replace(btrim(coalesce(p->>'summary','')),'\s+',' ','g')),
    'risk',p->>'risk_level','conditions',p->'conditions',
    'payload',p->>'execution_payload_digest','scope',p->>'execution_scope_digest',
    'target',p->>'execution_target','operation',p->>'execution_operation',
    'tool',p->>'execution_tool','payload_summary',p->'execution_payload_summary'
  )::text)
$$;
revoke all on function public.project_approval_fingerprint_v1(jsonb) from public,anon,authenticated;
grant execute on function public.project_approval_fingerprint_v1(jsonb) to service_role;

update public.approval_requests a
set request_fingerprint=public.project_approval_fingerprint_v1(to_jsonb(a))
where project_id is not null and request_fingerprint is null;
create index if not exists project_approval_fingerprint_lookup_idx
on public.approval_requests(organization_id,project_id,request_fingerprint)
where status in ('pending','rejected');

create or replace function public.guard_project_approval_loop_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_previous public.approval_requests%rowtype; v_repeat integer;
begin
  if new.project_id is null or new.status<>'pending' then return new; end if;
  new.request_fingerprint:=public.project_approval_fingerprint_v1(to_jsonb(new));
  -- Serialize competing generators, including independent worker processes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    new.organization_id::text||new.project_id::text||new.request_fingerprint,0));
  select * into v_previous from public.approval_requests a
  where a.organization_id=new.organization_id and a.project_id=new.project_id
    and a.request_fingerprint=new.request_fingerprint and a.status in ('pending','rejected')
  order by a.created_at desc limit 1;
  if not found then return new; end if;

  select count(*)+1 into v_repeat from public.project_activity_events e
  where e.project_id=new.project_id and e.organization_id=new.organization_id
    and e.event_type='approval.loop_blocked'
    and e.metadata->>'proposal_fingerprint'=new.request_fingerprint;
  insert into public.project_activity_events(organization_id,project_id,agent_id,event_type,headline,detail,importance,metadata)
  values(new.organization_id,new.project_id,new.requested_by_agent_id,'approval.loop_blocked',
    'Identical decision request suppressed',
    'The prior decision remains authoritative. Revise the proposal or its scoped context before requesting a new decision.',
    'attention',jsonb_build_object('proposal_fingerprint',new.request_fingerprint,'repeat_count',v_repeat,
      'previous_approval_id',v_previous.id,'previous_status',v_previous.status,
      'last_rejection_at',case when v_previous.status='rejected' then v_previous.resolved_at else null end,
      'responsible_agent_id',new.requested_by_agent_id,'suppressed_subject_id',new.subject_id));
  if new.subject_type='project_proposal' then
    update public.project_proposals set status='needs_revision',updated_at=now()
    where id=new.subject_id and organization_id=new.organization_id and project_id=new.project_id
      and status in ('draft','internal_review','ready_for_executive');
  end if;
  return null;
end;
$$;
revoke all on function public.guard_project_approval_loop_v1() from public,anon,authenticated;
grant execute on function public.guard_project_approval_loop_v1() to service_role;
drop trigger if exists trg_zz_project_approval_loop_guard on public.approval_requests;
create trigger trg_zz_project_approval_loop_guard before insert on public.approval_requests
for each row execute function public.guard_project_approval_loop_v1();

-- Recovery and meeting gates must converge in the same transaction too.
-- Resolve the linked task and action in the same transaction as the approval.
-- The API must update the approval only; this trigger owns the state transition.
create or replace function public.resume_project_tasks_after_approval_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_execution_id uuid;
  v_affected integer := 0;
  v_task record;
begin
  if old.status is not distinct from new.status or new.subject_type not in ('project_task','project_recovery','meeting_action') then
    return new;
  end if;

  select tr.execution_id into v_execution_id
  from public.project_task_runs tr
  where tr.waiting_on_approval_id = new.id and tr.status = 'waiting_for_approval'
  order by tr.created_at
  limit 1;

  if new.status = 'approved' then
    for v_task in
      update public.project_task_runs tr
      set status = 'queued', waiting_on_approval_id = null,
          next_attempt_at = now(), error_class = null, error_message = null, updated_at = now()
      where tr.waiting_on_approval_id = new.id and tr.status = 'waiting_for_approval'
      returning tr.action_item_id
    loop
      v_affected := v_affected + 1;
      if v_task.action_item_id is not null then
        update public.action_items ai set status = 'open'
        where ai.id = v_task.action_item_id and ai.organization_id = new.organization_id;
      end if;
    end loop;
  elsif new.status = 'rejected' then
    for v_task in
      update public.project_task_runs tr
      set status = 'blocked', error_class = 'approval_rejected',
          error_message = coalesce(nullif(new.response_note, ''), 'Required approval was rejected. Manager recovery/re-planning is required.'),
          next_attempt_at = null, updated_at = now()
      where tr.waiting_on_approval_id = new.id and tr.status = 'waiting_for_approval'
      returning tr.action_item_id
    loop
      v_affected := v_affected + 1;
      if v_task.action_item_id is not null then
        update public.action_items ai set status = 'blocked'
        where ai.id = v_task.action_item_id and ai.organization_id = new.organization_id;
      end if;
    end loop;
  end if;

  if new.status in ('approved', 'rejected') and v_affected = 0 and new.subject_type in ('project_task','project_recovery') then
    raise exception 'Project task approval has no waiting task';
  end if;

  if v_affected > 0 and new.status in ('approved', 'rejected') then
    update public.approval_requests
    set consumed_at = coalesce(consumed_at, new.resolved_at, now()),
        consumed_by_execution_id = coalesce(consumed_by_execution_id, v_execution_id)
    where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.resume_project_tasks_after_approval_v1() from public, anon, authenticated;
grant execute on function public.resume_project_tasks_after_approval_v1() to service_role;
