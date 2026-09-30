begin;

alter table public.project_completion_policies
  add column if not exists acceptance_waiver_allowed boolean not null default false;

alter table public.project_completion_criteria
  add column if not exists acceptance_disposition text,
  add column if not exists acceptance_conditions jsonb not null default '[]'::jsonb;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='project_completion_criteria_acceptance_disposition_check') then
    alter table public.project_completion_criteria add constraint project_completion_criteria_acceptance_disposition_check
      check (acceptance_disposition is null or acceptance_disposition in ('pending','accepted','accepted_with_conditions','rejected','waived'));
  end if;
end $$;

update public.project_completion_criteria
set acceptance_disposition=case state when 'passed' then 'accepted' when 'failed' then 'rejected' when 'waived' then 'waived' else 'pending' end
where dimension='acceptance' and acceptance_disposition is null;

create or replace function public.sync_project_final_acceptance_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_state text;
  v_existing_disposition text;
  v_disposition text;
begin
  if new.subject_type<>'project_final_acceptance' or old.status is not distinct from new.status then return new; end if;
  select acceptance_disposition into v_existing_disposition from public.project_completion_criteria where id=new.subject_id and project_id=new.project_id;
  if new.status='approved' then
    v_state:='passed';
    v_disposition:=case when v_existing_disposition='accepted_with_conditions' then 'accepted_with_conditions' else 'accepted' end;
  elsif new.status='rejected' then
    v_state:='failed';v_disposition:='rejected';
  elsif new.status in('cancelled','expired') and v_existing_disposition='waived' then
    v_state:='waived';v_disposition:='waived';
  elsif new.status in('cancelled','expired') then
    v_state:='blocked';v_disposition:='pending';
  else return new;
  end if;

  update public.project_completion_criteria
  set state=v_state,
      acceptance_disposition=v_disposition,
      failure_reason=case when v_state in('passed','waived') then null else coalesce(new.response_note,'Final acceptance was not granted.') end,
      metadata=metadata||jsonb_build_object('approval_request_id',new.id,'approval_status',new.status,'resolved_at',new.resolved_at,'acceptance_disposition',v_disposition),
      updated_at=now()
  where id=new.subject_id and project_id=new.project_id and dimension='acceptance';
  perform public.evaluate_project_completion_v1(new.project_id,'final_acceptance_'||new.status,'approval_request',new.id);
  return new;
end $$;

create or replace function public.record_project_acceptance_v1(
  p_project_id uuid,
  p_disposition text,
  p_conditions jsonb default '[]'::jsonb,
  p_residual_risk text default null,
  p_note text default null,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.projects%rowtype;
  c public.project_completion_criteria%rowtype;
  pol public.project_completion_policies%rowtype;
  approval_id uuid;
  target_state text;
  approval_state public.rythm_approval_status;
begin
  select * into p from public.projects where id=p_project_id;
  if not found then raise exception 'Project not found'; end if;
  if p.lifecycle_state<>'ACCEPTANCE_PENDING' then raise exception 'Project is not awaiting final acceptance'; end if;
  if p_disposition not in('accepted','accepted_with_conditions','rejected','waived') then raise exception 'Unsupported acceptance disposition'; end if;
  select * into pol from public.project_completion_policies where id=p.completion_policy_id;
  if p_disposition='waived' and not coalesce(pol.acceptance_waiver_allowed,false) then raise exception 'Acceptance waiver is not allowed by this project completion policy'; end if;
  if p_disposition='accepted_with_conditions' and jsonb_array_length(coalesce(p_conditions,'[]'::jsonb))=0 then raise exception 'Accepted with conditions requires at least one explicit condition'; end if;

  select * into c from public.project_completion_criteria
  where project_id=p_project_id and dimension='acceptance' and required=true
  order by created_at limit 1 for update;
  if not found then raise exception 'Required acceptance criterion not found'; end if;

  target_state:=case p_disposition when 'accepted' then 'passed' when 'accepted_with_conditions' then 'passed' when 'rejected' then 'failed' else 'waived' end;
  update public.project_completion_criteria
  set state=target_state,
      acceptance_disposition=p_disposition,
      acceptance_conditions=coalesce(p_conditions,'[]'::jsonb),
      residual_risk=case when p_disposition in('accepted_with_conditions','waived') then p_residual_risk else residual_risk end,
      waiver_reason=case when p_disposition='waived' then coalesce(p_note,'Acceptance explicitly waived under project policy.') else waiver_reason end,
      waived_at=case when p_disposition='waived' then now() else waived_at end,
      waiver_approver_user_id=case when p_disposition='waived' then p_actor_user_id else waiver_approver_user_id end,
      failure_reason=case when p_disposition='rejected' then coalesce(p_note,'Final acceptance rejected.') else null end,
      metadata=metadata||jsonb_build_object('acceptance_disposition',p_disposition,'acceptance_recorded_at',now(),'recorded_by_user_id',p_actor_user_id,'acceptance_note',p_note),
      updated_at=now()
  where id=c.id;

  select id into approval_id from public.approval_requests
  where project_id=p_project_id and subject_type='project_final_acceptance' and subject_id=c.id and status='pending'
  order by created_at desc limit 1;
  if approval_id is not null then
    approval_state:=case when p_disposition in('accepted','accepted_with_conditions') then 'approved'::public.rythm_approval_status
                         when p_disposition='rejected' then 'rejected'::public.rythm_approval_status
                         else 'cancelled'::public.rythm_approval_status end;
    update public.approval_requests
    set status=approval_state,response_note=coalesce(p_note,case p_disposition when 'accepted_with_conditions' then 'Accepted with explicit conditions.' when 'waived' then 'Acceptance waived under completion policy.' else initcap(replace(p_disposition,'_',' ')) end),
        resolved_at=now(),approver_user_id=p_actor_user_id
    where id=approval_id and status='pending';
  end if;

  return public.evaluate_project_completion_v1(p_project_id,'acceptance_'||p_disposition,'project_completion_criterion',c.id);
end $$;

create or replace function public.generate_project_closeout_report_v1(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.projects%rowtype;
  report_id uuid;
  report jsonb;
  baseline jsonb;
  outcomes jsonb;
  comparisons jsonb;
begin
  select * into p from public.projects where id=p_project_id;
  if not found then raise exception 'Project not found'; end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.metric_name,m.measurement_start),'[]'::jsonb) into baseline
  from public.project_metric_measurements m where m.project_id=p_project_id and m.measurement_kind='baseline';
  select coalesce(jsonb_agg(to_jsonb(m) order by m.metric_name,m.measurement_start),'[]'::jsonb) into outcomes
  from public.project_metric_measurements m where m.project_id=p_project_id and m.measurement_kind='outcome';
  select coalesce(jsonb_agg(jsonb_build_object(
    'metricName',b.metric_name,
    'unit',coalesce(o.unit,b.unit),
    'segmentation',case when o.segmentation<>'{}'::jsonb then o.segmentation else b.segmentation end,
    'beforeValue',b.value,
    'afterValue',o.value,
    'absoluteChange',case when b.value is not null and o.value is not null then o.value-b.value else null end,
    'percentageChange',case when b.value is not null and b.value<>0 and o.value is not null then round(((o.value-b.value)/abs(b.value))*100,2) else null end,
    'direction',case when b.value is null or o.value is null then 'unknown' when o.value>b.value then 'increase' when o.value<b.value then 'decrease' else 'unchanged' end,
    'baselineConfidence',b.confidence,
    'outcomeConfidence',o.confidence,
    'interpretation','Observed change only; causal project impact is not established without separate causal evidence.',
    'causalityConfidence','not_established',
    'limitations',jsonb_build_array(
      'Metric movement alone does not establish causality.',
      case when b.confidence is null or o.confidence is null then 'One or more measurement confidence values were not recorded.' else 'Recorded confidence values describe measurement confidence, not causal attribution.' end,
      case when b.measurement_start is null or o.measurement_end is null then 'The complete measurement window was not recorded for one or more measurements.' else 'Comparison uses the recorded baseline and outcome measurement windows.' end
    )
  )),'[]'::jsonb) into comparisons
  from public.project_metric_measurements b
  join lateral(
    select * from public.project_metric_measurements x
    where x.project_id=b.project_id and x.metric_name=b.metric_name and x.measurement_kind='outcome'
    order by x.measurement_end desc nulls last,x.created_at desc limit 1
  )o on true
  where b.project_id=p_project_id and b.measurement_kind='baseline';

  report:=jsonb_build_object(
    'executiveSummary',jsonb_build_object('lifecycleState',p.lifecycle_state,'overallProjectProgress',p.overall_project_progress,'eligibleForCompletion',p.completion_eligible),
    'originalObjective',p.objective,
    'scope',p.scope,
    'startingBaseline',baseline,
    'workPerformed',(select coalesce(jsonb_agg(jsonb_build_object('task',title,'workStatus',status,'completedAt',completed_at) order by created_at),'[]'::jsonb) from public.project_task_runs where project_id=p_project_id and status='completed'),
    'deliverablesProduced',(select coalesce(jsonb_agg(jsonb_build_object('criterion',description,'state',state,'evidenceRequirement',evidence_requirement) order by created_at),'[]'::jsonb) from public.project_completion_criteria where project_id=p_project_id and dimension='deliverable'),
    'implementationsExecuted',(select coalesce(jsonb_agg(jsonb_build_object('criterion',description,'state',state) order by created_at),'[]'::jsonb) from public.project_completion_criteria where project_id=p_project_id and dimension='implementation' and state in('passed','waived','not_applicable')),
    'verificationResults',(select coalesce(jsonb_agg(jsonb_build_object('criterion',description,'state',state,'failureReason',failure_reason) order by created_at),'[]'::jsonb) from public.project_completion_criteria where project_id=p_project_id and dimension='verification'),
    'beforeAfterMetrics',comparisons,
    'outcomeMeasurements',outcomes,
    'outcomeAssessment',jsonb_build_object('progress',p.outcome_progress,'causalityStatement','Observed changes are reported separately from causal attribution.'),
    'outstandingIssues',p.completion_blocking_reasons,
    'acceptedResidualRisks',(select coalesce(jsonb_agg(jsonb_build_object('criterion',description,'risk',residual_risk,'waiverReason',waiver_reason) order by created_at),'[]'::jsonb) from public.project_completion_criteria where project_id=p_project_id and state='waived'),
    'limitations',jsonb_build_array('Missing evidence is never treated as passed.','Planned work is not reported as executed.','Incomplete observation windows are not reported as measured outcomes.','Observed metric changes are not automatically attributed to the project.'),
    'recommendationsNextCycle',jsonb_build_array(coalesce(p.next_required_action,'No next action recorded.')),
    'finalAcceptance',(select coalesce(jsonb_agg(jsonb_build_object('criterion',description,'state',state,'disposition',acceptance_disposition,'conditions',acceptance_conditions,'residualRisk',residual_risk,'waiverReason',waiver_reason) order by created_at),'[]'::jsonb) from public.project_completion_criteria where project_id=p_project_id and dimension='acceptance'),
    'closureDate',case when p.lifecycle_state='COMPLETED' then current_date else null end
  );
  insert into public.project_closeout_reports(organization_id,project_id,status,report_data) values(p.organization_id,p_project_id,'draft',report) returning id into report_id;
  return report_id;
end $$;

create or replace function public.sync_project_kpi_completion_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_project_id uuid:=coalesce(new.project_id,old.project_id);
  v_org uuid:=coalesce(new.organization_id,old.organization_id);
  v_count integer;
  v_achieved integer;
  v_kpi_id uuid:=coalesce(new.id,old.id);
begin
  if tg_op<>'DELETE' and new.status='achieved' then
    if not exists(select 1 from public.project_completion_evidence where project_id=v_project_id and external_system_reference='project_kpi:'||new.id::text) then
      insert into public.project_completion_evidence(
        organization_id,project_id,lifecycle_dimension,evidence_type,source,authoritative_source,collected_at,validator,verification_result,
        external_system_reference,after_value,unit,structured_data
      ) values(
        v_org,v_project_id,'outcome','project_kpi_achieved','project_kpis',true,now(),'structured_kpi_status','achieved',
        'project_kpi:'||new.id::text,new.current_value,new.unit,jsonb_build_object('kpi_id',new.id,'name',new.name,'target_value',new.target_value,'current_value',new.current_value,'status',new.status)
      );
    end if;
  end if;
  select count(*),count(*) filter(where status='achieved') into v_count,v_achieved from public.project_kpis where project_id=v_project_id;
  if v_count>0 and v_count=v_achieved then
    update public.project_completion_criteria
    set state='passed',failure_reason=null,metadata=metadata||jsonb_build_object('validated_by','project_kpis','validated_at',now()),updated_at=now()
    where project_id=v_project_id and dimension='outcome' and criterion_key='policy-default-outcome' and state not in('waived','not_applicable');
  else
    update public.project_completion_criteria
    set state='pending',failure_reason=case when v_count=0 then 'No achieved project KPI evidence is currently recorded.' else 'One or more required project KPIs are not achieved.' end,
        metadata=metadata||jsonb_build_object('validated_by','project_kpis','rechecked_at',now()),updated_at=now()
    where project_id=v_project_id and dimension='outcome' and criterion_key='policy-default-outcome' and metadata->>'validated_by'='project_kpis' and state='passed';
  end if;
  perform public.evaluate_project_completion_v1(v_project_id,'project_kpi_changed','project_kpi',v_kpi_id);
  return coalesce(new,old);
end $$;

drop trigger if exists project_kpis_completion_sync_v1 on public.project_kpis;
create trigger project_kpis_completion_sync_v1
after insert or update of current_value,status,target_value or delete on public.project_kpis
for each row execute function public.sync_project_kpi_completion_v1();

drop trigger if exists project_completion_evidence_recalc_v1 on public.project_completion_evidence;
create trigger project_completion_evidence_recalc_v1
after insert or update or delete on public.project_completion_evidence
for each row execute function public.project_completion_recalc_trigger_v1();

drop trigger if exists project_metric_measurements_recalc_v1 on public.project_metric_measurements;
create trigger project_metric_measurements_recalc_v1
after insert or update or delete on public.project_metric_measurements
for each row execute function public.project_completion_recalc_trigger_v1();

create or replace function public.refresh_project_completion_health_v1()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  p record;
  v_count integer:=0;
  v_failed_verification integer;
  v_pending_evidence integer;
  v_stale_observation integer;
  v_overdue_approval integer;
begin
  update public.project_health_events
  set status='resolved',resolved_at=now()
  where status='open' and health_type in('completion_blocked','completion_missing_evidence','completion_verification_failed','completion_observation_stale','completion_acceptance_overdue','completion_inconsistent_state');

  for p in select * from public.projects loop
    if p.lifecycle_state in('BLOCKED','ON_HOLD') then
      insert into public.project_health_events(organization_id,project_id,health_type,severity,status,summary,details)
      values(p.organization_id,p.id,'completion_blocked',case when p.lifecycle_state='BLOCKED' then 'critical' else 'warning' end,'open',
        case when p.lifecycle_state='BLOCKED' then 'Project completion is blocked' else 'Project completion is on hold' end,
        jsonb_build_object('lifecycle_state',p.lifecycle_state,'blocking_reasons',p.completion_blocking_reasons,'next_required_action',p.next_required_action));
      v_count:=v_count+1;
    end if;

    select count(*) into v_failed_verification from public.project_completion_criteria where project_id=p.id and dimension='verification' and required=true and state='failed';
    if v_failed_verification>0 then
      insert into public.project_health_events(organization_id,project_id,health_type,severity,status,summary,details)
      values(p.organization_id,p.id,'completion_verification_failed','critical','open','Required project verification failed',jsonb_build_object('failed_criteria',v_failed_verification,'next_required_action',p.next_required_action));
      v_count:=v_count+1;
    end if;

    select count(*) into v_pending_evidence from public.project_completion_criteria where project_id=p.id and required=true and state='pending';
    if p.work_progress=100 and p.overall_project_progress<100 and v_pending_evidence>0 and p.lifecycle_state not in('COMPLETED','CANCELLED','FAILED') then
      insert into public.project_health_events(organization_id,project_id,health_type,severity,status,summary,details)
      values(p.organization_id,p.id,'completion_missing_evidence','warning','open','Agent work is complete but required project evidence is still missing',jsonb_build_object('pending_criteria',v_pending_evidence,'lifecycle_state',p.lifecycle_state,'next_required_action',p.next_required_action));
      v_count:=v_count+1;
    end if;

    select count(*) into v_stale_observation from public.project_observation_windows where project_id=p.id and status in('in_progress','insufficient_data') and observation_end<=now() and (status<>'complete' or sufficient_data=false);
    if v_stale_observation>0 then
      insert into public.project_health_events(organization_id,project_id,health_type,severity,status,summary,details)
      values(p.organization_id,p.id,'completion_observation_stale','warning','open','Observation period ended without sufficient completion evidence',jsonb_build_object('stale_observation_windows',v_stale_observation,'next_required_action',p.next_required_action));
      v_count:=v_count+1;
    end if;

    select count(*) into v_overdue_approval from public.approval_requests where project_id=p.id and status='pending' and expires_at is not null and expires_at<now();
    if v_overdue_approval>0 then
      insert into public.project_health_events(organization_id,project_id,health_type,severity,status,summary,details)
      values(p.organization_id,p.id,'completion_acceptance_overdue','warning','open','A required project approval is overdue',jsonb_build_object('overdue_approvals',v_overdue_approval));
      v_count:=v_count+1;
    end if;

    if (p.status='completed' and (p.lifecycle_state<>'COMPLETED' or not p.completion_eligible)) or (p.lifecycle_state='COMPLETED' and not p.completion_eligible) then
      insert into public.project_health_events(organization_id,project_id,health_type,severity,status,summary,details)
      values(p.organization_id,p.id,'completion_inconsistent_state','critical','open','Project completion state is internally inconsistent',jsonb_build_object('status',p.status,'lifecycle_state',p.lifecycle_state,'completion_eligible',p.completion_eligible));
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end $$;

revoke all on function public.record_project_acceptance_v1(uuid,text,jsonb,text,text,uuid) from public,anon,authenticated;
revoke all on function public.sync_project_kpi_completion_v1() from public,anon,authenticated;
revoke all on function public.refresh_project_completion_health_v1() from public,anon,authenticated;
grant execute on function public.record_project_acceptance_v1(uuid,text,jsonb,text,text,uuid) to service_role;
grant execute on function public.refresh_project_completion_health_v1() to service_role;

commit;
