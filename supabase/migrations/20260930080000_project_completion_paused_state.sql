begin;

-- Completion evaluator v2.1: preserve an explicitly paused project as a first-class
-- lifecycle state. Pausing is never interpreted as completion and cannot produce 100%.
create or replace function public.evaluate_project_completion_v1(
  p_project_id uuid,
  p_trigger_event text default 'manual',
  p_source_type text default null,
  p_source_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
 p public.projects%rowtype;pol public.project_completion_policies%rowtype;v_policy_id uuid;
 req_work boolean;req_deliverable boolean;req_implementation boolean;req_verification boolean;req_outcome boolean;req_acceptance boolean;req_closeout boolean;
 w_work numeric;w_deliverable numeric;w_implementation numeric;w_verification numeric;w_outcome numeric;w_acceptance numeric;w_closeout numeric;total_weight numeric;
 work_p integer;deliverable_p integer;implementation_p integer;verification_p integer;outcome_p integer;acceptance_p integer;closeout_p integer;overall_p integer;
 observation_required boolean;observation_complete boolean:=true;has_blocker boolean:=false;has_hold boolean:=false;workflow_contradiction boolean:=false;has_roadmap boolean:=false;has_execution boolean:=false;
 blocking jsonb:='[]'::jsonb;satisfied jsonb:='[]'::jsonb;evidence_refs jsonb:='[]'::jsonb;lifecycle text;previous_lifecycle text;eligible boolean:=false;next_action text;final_report_exists boolean:=false;
 evaluator_version constant text:='completion-v2.1';
begin
 select * into p from public.projects where id=p_project_id for update;if not found then raise exception 'Project not found';end if;
 previous_lifecycle:=p.lifecycle_state;v_policy_id:=coalesce(p.completion_policy_id,public.assign_project_completion_policy_v1(p_project_id));select * into pol from public.project_completion_policies where id=v_policy_id;if not found then raise exception 'Completion policy unavailable';end if;
 req_work:=coalesce((pol.required_dimensions->>'work')::boolean,true);req_deliverable:=coalesce((pol.required_dimensions->>'deliverable')::boolean,true);req_implementation:=coalesce((pol.required_dimensions->>'implementation')::boolean,true);req_verification:=coalesce((pol.required_dimensions->>'verification')::boolean,true);req_outcome:=coalesce((pol.required_dimensions->>'outcome')::boolean,true);req_acceptance:=coalesce((pol.required_dimensions->>'acceptance')::boolean,true);req_closeout:=coalesce((pol.required_dimensions->>'closeout')::boolean,true);
 w_work:=coalesce((pol.weights->>'work')::numeric,0);w_deliverable:=coalesce((pol.weights->>'deliverable')::numeric,0);w_implementation:=coalesce((pol.weights->>'implementation')::numeric,0);w_verification:=coalesce((pol.weights->>'verification')::numeric,0);w_outcome:=coalesce((pol.weights->>'outcome')::numeric,0);w_acceptance:=coalesce((pol.weights->>'acceptance')::numeric,0);w_closeout:=coalesce((pol.weights->>'closeout')::numeric,0);
 select exists(select 1 from public.project_roadmaps r where r.project_id=p_project_id and r.status='approved' and r.is_baseline=true) into has_roadmap;select exists(select 1 from public.project_executions e where e.project_id=p_project_id) into has_execution;
 work_p:=public.project_work_progress_v1(p_project_id);deliverable_p:=public.project_dimension_progress_v1(p_project_id,'deliverable',req_deliverable,pol.allow_residual_risk_acceptance);implementation_p:=public.project_dimension_progress_v1(p_project_id,'implementation',req_implementation,pol.allow_residual_risk_acceptance);verification_p:=public.project_dimension_progress_v1(p_project_id,'verification',req_verification,pol.allow_residual_risk_acceptance);outcome_p:=public.project_dimension_progress_v1(p_project_id,'outcome',req_outcome,pol.allow_residual_risk_acceptance);acceptance_p:=public.project_dimension_progress_v1(p_project_id,'acceptance',req_acceptance,pol.allow_residual_risk_acceptance);
 select exists(select 1 from public.project_closeout_reports where project_id=p_project_id and status in('final','accepted')) into final_report_exists;closeout_p:=case when not req_closeout then 100 when final_report_exists then 100 else public.project_dimension_progress_v1(p_project_id,'closeout',true,pol.allow_residual_risk_acceptance) end;
 observation_required:=coalesce((p.completion_overrides->>'observation_required')::boolean,pol.observation_required);if observation_required then select coalesce(bool_and(status='complete' and sufficient_data),false) into observation_complete from public.project_observation_windows where project_id=p_project_id and status<>'cancelled';if not exists(select 1 from public.project_observation_windows where project_id=p_project_id and status<>'cancelled') then observation_complete:=false;end if;end if;
 select exists(select 1 from public.project_completion_criteria c where c.project_id=p_project_id and c.required and c.state in('failed','blocked')) into has_blocker;select exists(select 1 from public.project_completion_criteria c where c.project_id=p_project_id and c.required and c.state='blocked' and c.metadata->>'blocker_type'='governance_hold') into has_hold;has_blocker:=has_blocker or p.blocker_type is not null;workflow_contradiction:=coalesce(p.workflow_state,'') in('DECISION_PENDING','APPROVAL_PENDING','LEGAL_REVIEW','DELIBERATION','BLOCKED');
 select coalesce(jsonb_agg(jsonb_build_object('criterionKey',criterion_key,'dimension',dimension,'reason',coalesce(failure_reason,description),'state',state) order by created_at),'[]'::jsonb) into blocking from public.project_completion_criteria where project_id=p_project_id and required and state in('failed','blocked','pending');
 if observation_required and not observation_complete then blocking:=blocking||jsonb_build_array(jsonb_build_object('dimension','outcome','reason','Required observation window is incomplete or lacks sufficient data','state','pending'));end if;
 if p.blocker_type is not null then blocking:=blocking||jsonb_build_array(jsonb_build_object('dimension','project','reason',coalesce(p.blocker_summary,p.blocker_type),'state','blocked'));end if;
 if workflow_contradiction then blocking:=blocking||jsonb_build_array(jsonb_build_object('dimension','workflow','reason','Workflow state '||p.workflow_state||' is not compatible with project completion','state','blocked'));end if;
 select coalesce(jsonb_agg(jsonb_build_object('criterionKey',criterion_key,'dimension',dimension,'state',state) order by created_at),'[]'::jsonb) into satisfied from public.project_completion_criteria where project_id=p_project_id and required and(state in('passed','not_applicable') or(state='waived' and pol.allow_residual_risk_acceptance));
 select coalesce(jsonb_agg(id),'[]'::jsonb) into evidence_refs from public.project_completion_evidence where project_id=p_project_id and authoritative_source=true;
 total_weight:=(case when req_work then w_work else 0 end)+(case when req_deliverable then w_deliverable else 0 end)+(case when req_implementation then w_implementation else 0 end)+(case when req_verification then w_verification else 0 end)+(case when req_outcome then w_outcome else 0 end)+(case when req_acceptance then w_acceptance else 0 end)+(case when req_closeout then w_closeout else 0 end);if total_weight<=0 then total_weight:=1;end if;
 overall_p:=round(((case when req_work then w_work*work_p else 0 end)+(case when req_deliverable then w_deliverable*deliverable_p else 0 end)+(case when req_implementation then w_implementation*implementation_p else 0 end)+(case when req_verification then w_verification*verification_p else 0 end)+(case when req_outcome then w_outcome*outcome_p else 0 end)+(case when req_acceptance then w_acceptance*acceptance_p else 0 end)+(case when req_closeout then w_closeout*closeout_p else 0 end))/total_weight)::integer;
 if p.status='cancelled' then lifecycle:='CANCELLED';next_action:='No action — project is cancelled.';
 elsif p.status='failed' then lifecycle:='FAILED';next_action:='Review failure and decide whether to restart or close the project.';
 elsif p.status='paused' or p.lifecycle_state='PAUSED' then lifecycle:='PAUSED';next_action:='Resume the project when work is authorized to continue.';
 elsif has_hold then lifecycle:='ON_HOLD';next_action:='Resolve the active governance HOLD and its unmet completion gates.';
 elsif has_blocker and pol.unresolved_blockers_prevent_closure then lifecycle:='BLOCKED';next_action:=coalesce(p.resolution_required,(select coalesce(failure_reason,description) from public.project_completion_criteria where project_id=p_project_id and required and state in('failed','blocked') order by created_at desc limit 1),'Resolve blocking completion criteria.');
 elsif not has_roadmap then lifecycle:=case when p.status='idea' then 'DRAFT' when p.status='planning' then 'PLANNING' else 'DISCOVERY' end;next_action:='Complete project analysis and approve the baseline roadmap.';
 elsif not has_execution then lifecycle:='READY_FOR_EXECUTION';next_action:='Start execution from the approved roadmap.';
 elsif req_work and work_p<100 then lifecycle:='EXECUTION';next_action:='Complete remaining planned work.';
 elsif req_deliverable and deliverable_p<100 then lifecycle:='EXECUTION';next_action:='Complete and validate mandatory deliverables.';
 elsif req_implementation and implementation_p<100 then lifecycle:='IMPLEMENTATION_PENDING';next_action:='Execute and evidence mandatory real-world implementation items.';
 elsif req_verification and verification_p<100 then lifecycle:='VERIFICATION';next_action:='Verify implementation against mandatory acceptance criteria.';
 elsif observation_required and not observation_complete then lifecycle:='OBSERVATION';next_action:=coalesce((select 'Continue observation until '||to_char(observation_end,'YYYY-MM-DD') from public.project_observation_windows where project_id=p_project_id and status in('pending','in_progress','insufficient_data') order by observation_end desc nulls last limit 1),'Start the required observation window and collect authoritative measurements.');
 elsif req_outcome and outcome_p<100 then lifecycle:='OUTCOME_VALIDATION';next_action:='Validate measurable project outcomes from authoritative evidence.';
 elsif req_acceptance and acceptance_p<100 then lifecycle:='ACCEPTANCE_PENDING';next_action:='Obtain the required authorized stakeholder acceptance.';
 elsif req_closeout and closeout_p<100 then lifecycle:='CLOSEOUT';next_action:='Generate and review the final project closeout report.';
 elsif workflow_contradiction then lifecycle:=case when p.workflow_state='BLOCKED' then 'BLOCKED' else 'ACCEPTANCE_PENDING' end;next_action:='Resolve the pending governed workflow state before closure.';
 else lifecycle:='COMPLETED';eligible:=true;overall_p:=100;next_action:='Project closed with required evidence and acceptance.';end if;
 if not eligible then overall_p:=least(overall_p,99);end if;
 update public.projects set completion_policy_id=v_policy_id,lifecycle_state=lifecycle,work_progress=work_p,deliverable_progress=deliverable_p,implementation_progress=implementation_p,verification_progress=verification_p,outcome_progress=outcome_p,acceptance_progress=acceptance_p,closeout_progress=closeout_p,overall_project_progress=overall_p,progress_percent=overall_p,completion_eligible=eligible,completion_evaluated_at=now(),completion_evaluator_version=evaluator_version,next_required_action=next_action,completion_blocking_reasons=blocking,completion_satisfied_criteria=satisfied,status=case when lifecycle='COMPLETED' then 'completed' when lifecycle='CANCELLED' then 'cancelled' when lifecycle='FAILED' then 'failed' when lifecycle in('BLOCKED','ON_HOLD') then 'blocked' else case when status='completed' then 'active' else status end end,stage=lower(lifecycle),updated_at=now() where id=p_project_id;
 insert into public.project_completion_evaluations(organization_id,project_id,previous_state,new_state,eligible_for_completion,work_progress,deliverable_progress,implementation_progress,verification_progress,outcome_progress,acceptance_progress,closeout_progress,overall_project_progress,blocking_reasons,satisfied_criteria,next_required_action,evaluator_version,triggered_event,source_type,source_id,evidence_references) values(p.organization_id,p_project_id,previous_lifecycle,lifecycle,eligible,work_p,deliverable_p,implementation_p,verification_p,outcome_p,acceptance_p,closeout_p,overall_p,blocking,satisfied,next_action,evaluator_version,coalesce(p_trigger_event,'manual'),p_source_type,p_source_id,evidence_refs);
 return jsonb_build_object('eligibleForCompletion',eligible,'currentLifecycleState',lifecycle,'workProgress',work_p,'deliverableProgress',deliverable_p,'implementationProgress',implementation_p,'verificationProgress',verification_p,'outcomeProgress',outcome_p,'acceptanceProgress',acceptance_p,'closeoutProgress',closeout_p,'overallProjectProgress',overall_p,'blockingReasons',blocking,'satisfiedCriteria',satisfied,'nextRequiredAction',next_action,'evaluatorVersion',evaluator_version,'observationRequired',observation_required,'observationComplete',observation_complete,'requiredDimensions',pol.required_dimensions);
end $$;

revoke all on function public.evaluate_project_completion_v1(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.evaluate_project_completion_v1(uuid,text,text,uuid) to service_role;

commit;
