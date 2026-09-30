begin;

-- Cover foreign keys introduced by the completion architecture so project closeout,
-- evidence tracing and legacy cleanup do not require avoidable sequential scans.
create index if not exists projects_completion_policy_idx on public.projects(completion_policy_id) where completion_policy_id is not null;
create index if not exists project_completion_criteria_org_idx on public.project_completion_criteria(organization_id);
create index if not exists project_completion_criteria_waiver_approver_idx on public.project_completion_criteria(waiver_approver_user_id) where waiver_approver_user_id is not null;
create index if not exists project_completion_evidence_org_idx on public.project_completion_evidence(organization_id);
create index if not exists project_completion_evidence_task_idx on public.project_completion_evidence(task_run_id) where task_run_id is not null;
create index if not exists project_completion_evidence_milestone_idx on public.project_completion_evidence(milestone_id) where milestone_id is not null;
create index if not exists project_completion_evidence_criterion_idx on public.project_completion_evidence(criterion_id) where criterion_id is not null;
create index if not exists project_completion_evidence_artifact_idx on public.project_completion_evidence(artifact_id) where artifact_id is not null;
create index if not exists project_observation_windows_org_idx on public.project_observation_windows(organization_id);
create index if not exists project_observation_windows_criterion_idx on public.project_observation_windows(criterion_id) where criterion_id is not null;
create index if not exists project_metric_measurements_org_idx on public.project_metric_measurements(organization_id);
create index if not exists project_metric_measurements_evidence_idx on public.project_metric_measurements(evidence_id) where evidence_id is not null;
create index if not exists project_completion_evaluations_org_idx on public.project_completion_evaluations(organization_id);
create index if not exists project_closeout_reports_org_idx on public.project_closeout_reports(organization_id);
create index if not exists project_closeout_reports_artifact_idx on public.project_closeout_reports(artifact_id) where artifact_id is not null;
create index if not exists project_closeout_reports_accepted_by_idx on public.project_closeout_reports(accepted_by_user_id) where accepted_by_user_id is not null;

-- Owner write policies are split by mutation verb. Using FOR ALL alongside a member
-- SELECT policy makes Postgres evaluate multiple permissive SELECT policies for every
-- row even though the owner policy exists only to authorize writes.
drop policy if exists project_completion_policies_owner_write on public.project_completion_policies;
drop policy if exists project_completion_criteria_owner_write on public.project_completion_criteria;
drop policy if exists project_completion_evidence_owner_write on public.project_completion_evidence;
drop policy if exists project_observation_windows_owner_write on public.project_observation_windows;
drop policy if exists project_metric_measurements_owner_write on public.project_metric_measurements;
drop policy if exists project_completion_evaluations_owner_write on public.project_completion_evaluations;
drop policy if exists project_closeout_reports_owner_write on public.project_closeout_reports;

drop policy if exists project_completion_policies_owner_insert on public.project_completion_policies;
create policy project_completion_policies_owner_insert on public.project_completion_policies
  for insert to authenticated with check (organization_id is not null and public.is_org_owner(organization_id));
drop policy if exists project_completion_policies_owner_update on public.project_completion_policies;
create policy project_completion_policies_owner_update on public.project_completion_policies
  for update to authenticated using (organization_id is not null and public.is_org_owner(organization_id))
  with check (organization_id is not null and public.is_org_owner(organization_id));
drop policy if exists project_completion_policies_owner_delete on public.project_completion_policies;
create policy project_completion_policies_owner_delete on public.project_completion_policies
  for delete to authenticated using (organization_id is not null and public.is_org_owner(organization_id));

do $$
declare t text;
begin
  foreach t in array array[
    'project_completion_criteria','project_completion_evidence','project_observation_windows',
    'project_metric_measurements','project_closeout_reports'
  ] loop
    execute format('drop policy if exists %I_owner_insert on public.%I',t,t);
    execute format('create policy %I_owner_insert on public.%I for insert to authenticated with check (public.is_org_owner(organization_id))',t,t);
    execute format('drop policy if exists %I_owner_update on public.%I',t,t);
    execute format('create policy %I_owner_update on public.%I for update to authenticated using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id))',t,t);
    execute format('drop policy if exists %I_owner_delete on public.%I',t,t);
    execute format('create policy %I_owner_delete on public.%I for delete to authenticated using (public.is_org_owner(organization_id))',t,t);
  end loop;
end $$;

-- Evaluations are append-only system audit records. Authenticated users read through
-- the member policy; service_role writes bypass RLS. No user mutation policy exists.
revoke insert,update,delete on public.project_completion_evaluations from authenticated,anon;

commit;
