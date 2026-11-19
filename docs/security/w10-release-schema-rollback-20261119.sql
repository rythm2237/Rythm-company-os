-- PROPOSAL ONLY. Never executed by W10 review.
-- Captured production baseline: main 55a1377e348c2d9ac0082c8b1f3acbba26acbc45, 2026-11-19.
-- Requires separate owner approval, fresh catalog comparison, quiescent workers,
-- prior application restored, and dependency inspection. Do not use CASCADE.
-- Preserve all customer/workflow records and existing migration history.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local search_path=public,pg_temp;

CREATE OR REPLACE FUNCTION public.enforce_action_item_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.status in ('completed', 'cancelled') and row(new.*) is distinct from row(old.*) then
    raise exception 'Completed or cancelled action items are immutable';
  end if;

  if row(new.*) is distinct from row(old.*)
     and not public.is_org_owner(old.organization_id)
     and coalesce(auth.role(),'') <> 'service_role'
     and current_user not in ('postgres','supabase_admin') then
    raise exception 'Only an organization owner or governed internal service may update an action item';
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
$function$;

CREATE OR REPLACE FUNCTION public.enforce_active_commercial_entitlement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_organization_id uuid;
begin
  -- Migrations and trusted service-role operations do not carry an end-user auth.uid().
  -- Customer-originated writes always do and must resolve an active entitlement.
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_organization_id := case
    when tg_op = 'DELETE' then old.organization_id
    else new.organization_id
  end;

  if not public.has_active_organization_entitlement(v_organization_id) then
    raise exception 'Commercial entitlement is not active'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_enabled_agents_before_session_run()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_total integer;
  v_enabled integer;
  v_b001 integer;
begin
  if new.status = 'running' and old.status is distinct from 'running' then
    select
      count(*),
      count(*) filter (where a.enabled),
      count(*) filter (where a.enabled and a.agent_code = 'B-001')
    into v_total, v_enabled, v_b001
    from public.meeting_agent_participants p
    join public.agents a
      on a.id = p.agent_id
     and a.organization_id = p.organization_id
    where p.session_id = new.id
      and p.organization_id = new.organization_id
      and p.explicitly_authorized_by_ceo = true;

    if v_total < 2 then
      raise exception 'At least two enabled CEO-authorized agents are required';
    end if;

    if v_enabled <> v_total then
      raise exception 'A selected meeting agent is paused';
    end if;

    if v_b001 < 1 then
      raise exception 'Enabled B-001 Executive Orchestrator is required for governed meeting synthesis';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_meeting_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.status in ('completed', 'cancelled') and new is distinct from old then
    raise exception 'Completed or cancelled meetings are immutable';
  end if;

  if new.status is distinct from old.status then
    if not public.is_org_owner(old.organization_id) then
      raise exception 'Only an organization owner may transition a meeting';
    end if;

    if not (
      (old.status = 'draft' and new.status in ('scheduled', 'running', 'cancelled'))
      or (old.status = 'scheduled' and new.status in ('running', 'cancelled'))
      or (old.status = 'running' and new.status in ('completed', 'cancelled'))
    ) then
      raise exception 'Invalid meeting lifecycle transition from % to %', old.status, new.status;
    end if;
  end if;

  if new.status = 'scheduled' and new.scheduled_for is null then
    raise exception 'Scheduled meetings require a scheduled timestamp';
  end if;

  if new.status = 'running' and new.started_at is null then
    raise exception 'Running meetings require a start timestamp';
  end if;

  if new.status = 'completed' then
    if new.started_at is null then
      raise exception 'Completed meetings require a start timestamp';
    end if;

    if new.ended_at is null then
      raise exception 'Completed meetings require an end timestamp';
    end if;

    if new.minutes is null or new.minutes = '{}'::jsonb then
      raise exception 'Completed meetings require minutes';
    end if;
  end if;

  if new.status = 'cancelled' and new.ended_at is null then
    new.ended_at := now();
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_project_execution_terminal_states_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare reconciled integer:=0;execution_row record;total_count integer;terminal_count integer;begin for execution_row in select e.id,e.organization_id,e.project_id from public.project_executions e where e.status in('queued','running') for update skip locked loop select count(*),count(*) filter(where status in('completed','cancelled')) into total_count,terminal_count from public.project_task_runs where execution_id=execution_row.id;if total_count>0 and total_count=terminal_count then update public.project_executions set status='completed',completed_at=coalesce(completed_at,now()),last_heartbeat_at=now(),updated_at=now() where id=execution_row.id and status in('queued','running');if not exists(select 1 from public.project_activity_events where execution_id=execution_row.id and event_type='project.execution.work_completed') then insert into public.project_activity_events(organization_id,project_id,execution_id,event_type,headline,detail,importance,metadata) values(execution_row.organization_id,execution_row.project_id,execution_row.id,'project.execution.work_completed','Project work execution completed','All assigned work in this execution reached a terminal work state. Project completion remains subject to deliverable, implementation, verification, outcome, acceptance and closeout gates.','major',jsonb_build_object('terminal_work_states',jsonb_build_array('completed','cancelled')));end if;perform public.evaluate_project_completion_v1(execution_row.project_id,'execution_work_completed','project_execution',execution_row.id);reconciled:=reconciled+1;end if;end loop;return reconciled;end $function$;

CREATE OR REPLACE FUNCTION public.claim_project_autonomous_meeting_jobs_v1(worker_id text, claim_limit integer DEFAULT 2, lease_seconds integer DEFAULT 240)
 RETURNS SETOF project_autonomous_meeting_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(worker_id,'')='' then raise exception 'worker_id required'; end if;
  return query
  with candidates as(
    select j.id from public.project_autonomous_meeting_jobs j
    join public.projects p on p.id=j.project_id and p.status='active'
    join public.meetings m on m.id=j.meeting_id and m.involvement_mode='AUTONOMOUS'
    where j.status in('queued','retrying') and (j.next_attempt_at is null or j.next_attempt_at<=now()) and (j.lease_expires_at is null or j.lease_expires_at<now())
    order by p.priority asc,j.created_at asc for update of j skip locked limit greatest(1,least(claim_limit,5))
  )
  update public.project_autonomous_meeting_jobs j set status='running',attempt_count=attempt_count+1,lease_owner=worker_id,lease_expires_at=now()+make_interval(secs=>greatest(60,lease_seconds)),updated_at=now()
  from candidates c where j.id=c.id returning j.*;
end $function$;

CREATE OR REPLACE FUNCTION public.claim_project_task_runs_v1(worker_id text, claim_limit integer DEFAULT 8, lease_seconds integer DEFAULT 240)
 RETURNS SETOF project_task_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(worker_id,'')='' then raise exception 'worker_id required'; end if;
  return query
  with candidates as (
    select tr.id
    from public.project_task_runs tr
    join public.project_executions pe on pe.id=tr.execution_id and pe.status in('queued','running')
    join public.projects p on p.id=tr.project_id and p.status='active'
    where tr.status in('queued','retrying')
      and (tr.next_attempt_at is null or tr.next_attempt_at<=now())
      and (tr.lease_expires_at is null or tr.lease_expires_at<now())
      -- Every declared dependency must exist in this execution and be complete.
      and not exists(
        select 1 from jsonb_array_elements_text(tr.dependencies) d(task_key)
        where not exists(
          select 1 from public.project_task_runs dep
          where dep.execution_id=tr.execution_id and dep.task_key=d.task_key and dep.status='completed'
        )
      )
      -- An assigned agent with no project capacity stays queued. Unassigned internal tasks may run.
      and (tr.assigned_agent_id is null or exists(
        select 1 from public.project_agent_capacity pac
        where pac.project_id=tr.project_id and pac.agent_id=tr.assigned_agent_id and pac.allocation_percent>0
      ))
    order by tr.priority asc, coalesce(pe.last_heartbeat_at,pe.created_at) asc, tr.created_at asc
    for update of tr skip locked
    limit greatest(1,least(claim_limit,32))
  )
  update public.project_task_runs tr
  set status='running',lease_owner=worker_id,lease_expires_at=now()+make_interval(secs=>greatest(30,lease_seconds)),attempt_count=attempt_count+1,started_at=coalesce(started_at,now()),updated_at=now()
  from candidates c where tr.id=c.id
  returning tr.*;
end $function$;

alter policy crm_create on public.project_contracts
 with check (crm_can(organization_id, 'contract.create'::text, 'contract'::text, id));

alter policy crm_read on public.project_contracts
 using (crm_can(organization_id, 'contract.read'::text, 'contract'::text, id));

update public.agent_templates set default_specializations=ARRAY[]::text[],updated_at=now()
 where template_key='advertising_account_manager' and version='1.0' and role_family='marketing'
 and default_specializations=ARRAY['b2b_marketing']::text[];

update public.agent_templates set default_specializations=ARRAY[]::text[],updated_at=now()
 where template_key='advertising_content_specialist' and version='1.0' and role_family='marketing'
 and default_specializations=ARRAY['content_marketing']::text[];

update public.agent_templates set default_specializations=ARRAY[]::text[],updated_at=now()
 where template_key='advertising_copywriter' and version='1.0' and role_family='marketing'
 and default_specializations=ARRAY['content_marketing']::text[];

update public.agent_templates set default_specializations=ARRAY[]::text[],updated_at=now()
 where template_key='advertising_performance_marketing' and version='1.0' and role_family='marketing'
 and default_specializations=ARRAY['performance_marketing']::text[];

update public.agent_templates set default_specializations=ARRAY[]::text[],updated_at=now()
 where template_key='advertising_strategy_director' and version='1.0' and role_family='marketing'
 and default_specializations=ARRAY['b2b_marketing']::text[];

drop function if exists public.assign_project_specialist_v1(uuid,uuid,integer);
drop function if exists public.complete_project_task_work_v1(uuid,uuid,uuid,text,jsonb,jsonb);
drop function if exists public.project_internal_work_authorized_v1(uuid,uuid);
commit;
