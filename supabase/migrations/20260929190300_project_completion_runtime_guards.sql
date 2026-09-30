begin;

create or replace function public.ensure_project_completion_criteria_v1(p_project_id uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid;
  v_policy_id uuid;
  v_required jsonb;
  v_added integer:=0;
  v_dim text;
  v_description text;
begin
  select organization_id,coalesce(completion_policy_id,public.assign_project_completion_policy_v1(id))
    into v_org,v_policy_id
  from public.projects where id=p_project_id;
  if v_org is null or v_policy_id is null then return 0; end if;

  select required_dimensions into v_required from public.project_completion_policies where id=v_policy_id;
  foreach v_dim in array array['deliverable','implementation','verification','outcome','acceptance','closeout'] loop
    if coalesce((v_required->>v_dim)::boolean,false) and not exists(
      select 1 from public.project_completion_criteria
      where project_id=p_project_id and dimension=v_dim and required=true
    ) then
      v_description:=case v_dim
        when 'deliverable' then 'Required project deliverables are structurally complete and supported by project records.'
        when 'implementation' then 'The intended real-world change is executed in the authoritative target system.'
        when 'verification' then 'Required implementation/deliverable results are independently verified against acceptance criteria.'
        when 'outcome' then 'The required measurable project outcome is supported by sufficient evidence.'
        when 'acceptance' then 'The authorized stakeholder has accepted the project result.'
        when 'closeout' then 'The final closeout record has been generated, reviewed, and finalized.'
      end;
      insert into public.project_completion_criteria(
        organization_id,project_id,dimension,criterion_key,description,required,
        validator_type,state,metadata
      ) values(
        v_org,p_project_id,v_dim,'policy-default-'||v_dim,v_description,true,
        case when v_dim='acceptance' then 'authorized_stakeholder'
             when v_dim='closeout' then 'structured_closeout_record'
             else 'authoritative_evidence' end,
        'pending',jsonb_build_object('source','completion_policy_default','policy_id',v_policy_id)
      ) on conflict(project_id,criterion_key) do nothing;
      if found then v_added:=v_added+1; end if;
    end if;
  end loop;
  return v_added;
end $$;

create or replace function public.start_eligible_project_observations_v1()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  r record;
  v_count integer:=0;
  v_required jsonb;
begin
  for r in
    select w.id,w.project_id,w.required_duration_days,p.completion_policy_id,
           p.implementation_progress,p.verification_progress,p.lifecycle_state
    from public.project_observation_windows w
    join public.projects p on p.id=w.project_id
    where w.status='pending' and w.observation_start is null
      and p.lifecycle_state not in('CANCELLED','FAILED','ON_HOLD','BLOCKED','PAUSED','COMPLETED')
    for update of w skip locked
  loop
    select required_dimensions into v_required
    from public.project_completion_policies where id=r.completion_policy_id;
    if (not coalesce((v_required->>'implementation')::boolean,false) or r.implementation_progress=100)
       and (not coalesce((v_required->>'verification')::boolean,false) or r.verification_progress=100) then
      update public.project_observation_windows
      set observation_start=now(),
          observation_end=now()+make_interval(days=>required_duration_days),
          status='in_progress',updated_at=now()
      where id=r.id;
      perform public.evaluate_project_completion_v1(r.project_id,'observation_started','project_observation_window',r.id);
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end $$;

create or replace function public.ensure_project_final_acceptance_v1(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_project public.projects%rowtype;
  v_criterion uuid;
  v_approval uuid;
begin
  select * into v_project from public.projects where id=p_project_id;
  if not found or v_project.lifecycle_state<>'ACCEPTANCE_PENDING' then return null; end if;

  perform public.ensure_project_completion_criteria_v1(p_project_id);
  select id into v_criterion
  from public.project_completion_criteria
  where project_id=p_project_id and dimension='acceptance' and required=true
    and state not in('passed','waived','not_applicable')
  order by created_at limit 1;
  if v_criterion is null then return null; end if;

  select id into v_approval from public.approval_requests
  where project_id=p_project_id and subject_type='project_final_acceptance'
    and subject_id=v_criterion and status='pending'
  order by created_at desc limit 1;
  if v_approval is not null then return v_approval; end if;

  insert into public.approval_requests(
    organization_id,project_id,subject_type,subject_id,title,summary,risk_level,status,
    conditions,attention_tier,decision_group,execution_reversibility
  ) values(
    v_project.organization_id,p_project_id,'project_final_acceptance',v_criterion,
    'Final project acceptance required',
    'Review the verified project result and accept, conditionally accept through documented residual-risk handling, or reject it before closeout.',
    'medium','pending',
    jsonb_build_array('Acceptance confirms the project result, not merely completion of agent work.'),
    'executive','project_acceptance','not_applicable'
  ) returning id into v_approval;
  return v_approval;
end $$;

create or replace function public.sync_project_final_acceptance_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_state text;
begin
  if new.subject_type<>'project_final_acceptance' or old.status is not distinct from new.status then return new; end if;
  if new.status='approved' then v_state:='passed';
  elsif new.status='rejected' then v_state:='failed';
  elsif new.status in('cancelled','expired') then v_state:='blocked';
  else return new;
  end if;

  update public.project_completion_criteria
  set state=v_state,
      failure_reason=case when v_state='passed' then null else coalesce(new.response_note,'Final acceptance was not granted.') end,
      metadata=metadata||jsonb_build_object('approval_request_id',new.id,'approval_status',new.status,'resolved_at',new.resolved_at),
      updated_at=now()
  where id=new.subject_id and project_id=new.project_id and dimension='acceptance';
  perform public.evaluate_project_completion_v1(new.project_id,'final_acceptance_'||new.status,'approval_request',new.id);
  return new;
end $$;

drop trigger if exists approval_requests_sync_project_final_acceptance_v1 on public.approval_requests;
create trigger approval_requests_sync_project_final_acceptance_v1
after update of status on public.approval_requests
for each row execute function public.sync_project_final_acceptance_v1();

create or replace function public.finalize_project_closeout_report_v1(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_report public.project_closeout_reports%rowtype;
  v_project public.projects%rowtype;
begin
  select * into v_report from public.project_closeout_reports where id=p_report_id for update;
  if not found then raise exception 'Closeout report not found'; end if;
  select * into v_project from public.projects where id=v_report.project_id;
  if auth.role()<>'service_role' and not public.is_org_owner(v_report.organization_id) then
    raise exception 'Owner authorization required';
  end if;
  if v_project.lifecycle_state<>'CLOSEOUT' then raise exception 'Project is not in closeout'; end if;

  update public.project_closeout_reports
  set status='final',reviewed_at=now(),closure_date=current_date,updated_at=now()
  where id=p_report_id;
  update public.project_completion_criteria
  set state='passed',failure_reason=null,
      metadata=metadata||jsonb_build_object('closeout_report_id',p_report_id,'finalized_at',now()),updated_at=now()
  where project_id=v_report.project_id and dimension='closeout' and required=true;
  return public.evaluate_project_completion_v1(v_report.project_id,'closeout_finalized','project_closeout_report',p_report_id);
end $$;

create or replace function public.guard_project_completed_transition_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if not coalesce(new.completion_eligible,false) then
    if new.status='completed' and old.status is distinct from 'completed' then
      new.status:=old.status;
      new.stage:=old.stage;
      new.completion_metadata:=coalesce(new.completion_metadata,'{}'::jsonb)||jsonb_build_object(
        'prevented_completion_write_at',now(),
        'prevented_completion_writer','database_guard'
      );
    end if;
    if new.progress_percent>=100 then new.progress_percent:=least(99,coalesce(old.progress_percent,99)); end if;
    if new.overall_project_progress>=100 then new.overall_project_progress:=99; end if;
  end if;
  return new;
end $$;

drop trigger if exists projects_guard_completed_transition_v1 on public.projects;
create trigger projects_guard_completed_transition_v1
before update of status,progress_percent,overall_project_progress,completion_eligible on public.projects
for each row execute function public.guard_project_completed_transition_v1();

create or replace function public.normalize_legacy_project_completion_activity_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_eligible boolean;
begin
  if new.event_type='project.execution.completed' then
    select completion_eligible into v_eligible from public.projects where id=new.project_id;
    if not coalesce(v_eligible,false) then
      new.event_type:='project.execution.work_completed';
      new.headline:='Project execution work completed';
      new.detail:=coalesce(new.detail,'All assigned work reached a terminal state.')||' Project completion remains subject to lifecycle gates.';
      new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('legacy_completion_event_normalized',true);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists project_activity_normalize_completion_v1 on public.project_activity_events;
create trigger project_activity_normalize_completion_v1
before insert on public.project_activity_events
for each row execute function public.normalize_legacy_project_completion_activity_v1();

create or replace function public.ensure_project_completion_runtime_v1()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare r record; v_count integer:=0;
begin
  for r in
    select id from public.projects
    where lifecycle_state not in('CANCELLED','FAILED','COMPLETED')
      and not (status='completed' and legacy_completion_classification='legacy_completion_unknown')
  loop
    perform public.ensure_project_completion_criteria_v1(r.id);
    perform public.evaluate_project_completion_v1(r.id,'runtime_criteria_sync','project',r.id);
    perform public.ensure_project_final_acceptance_v1(r.id);
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

select public.ensure_project_completion_runtime_v1();
select public.start_eligible_project_observations_v1();

revoke all on function public.ensure_project_completion_criteria_v1(uuid) from public,anon,authenticated;
revoke all on function public.start_eligible_project_observations_v1() from public,anon,authenticated;
revoke all on function public.ensure_project_final_acceptance_v1(uuid) from public,anon,authenticated;
revoke all on function public.sync_project_final_acceptance_v1() from public,anon,authenticated;
revoke all on function public.ensure_project_completion_runtime_v1() from public,anon,authenticated;
revoke all on function public.normalize_legacy_project_completion_activity_v1() from public,anon,authenticated;
grant execute on function public.ensure_project_completion_criteria_v1(uuid) to service_role;
grant execute on function public.start_eligible_project_observations_v1() to service_role;
grant execute on function public.ensure_project_final_acceptance_v1(uuid) to service_role;
grant execute on function public.ensure_project_completion_runtime_v1() to service_role;
grant execute on function public.finalize_project_closeout_report_v1(uuid) to authenticated,service_role;

commit;
