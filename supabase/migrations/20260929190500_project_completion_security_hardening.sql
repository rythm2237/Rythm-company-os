begin;

create or replace function public.get_project_completion_explanation_v1(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path=public
as $$
  select jsonb_build_object(
    'eligibleForCompletion',p.completion_eligible,
    'currentLifecycleState',p.lifecycle_state,
    'workProgress',p.work_progress,
    'deliverableProgress',p.deliverable_progress,
    'implementationProgress',p.implementation_progress,
    'verificationProgress',p.verification_progress,
    'outcomeProgress',p.outcome_progress,
    'acceptanceProgress',p.acceptance_progress,
    'closeoutProgress',p.closeout_progress,
    'overallProjectProgress',p.overall_project_progress,
    'blockingReasons',p.completion_blocking_reasons,
    'satisfiedCriteria',p.completion_satisfied_criteria,
    'nextRequiredAction',p.next_required_action,
    'evaluatorVersion',p.completion_evaluator_version,
    'evaluatedAt',p.completion_evaluated_at,
    'requiredDimensions',coalesce(pol.required_dimensions,'{}'::jsonb),
    'policyCode',pol.code
  )
  from public.projects p
  left join public.project_completion_policies pol on pol.id=p.completion_policy_id
  where p.id=p_project_id;
$$;

revoke all on function public.project_completion_recalc_trigger_v1() from public,anon,authenticated;
revoke all on function public.initialize_project_completion_policy_v1() from public,anon,authenticated;
revoke all on function public.refresh_project_progress_percent_v1(uuid) from public,anon,authenticated;
revoke all on function public.reconcile_project_execution_terminal_states_v1() from public,anon,authenticated;
revoke all on function public.guard_project_completed_transition_v1() from public,anon,authenticated;

grant execute on function public.refresh_project_progress_percent_v1(uuid) to service_role;
grant execute on function public.reconcile_project_execution_terminal_states_v1() to service_role;
grant execute on function public.get_project_completion_explanation_v1(uuid) to authenticated,service_role;

commit;
