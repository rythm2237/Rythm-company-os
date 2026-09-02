begin;

-- Cover foreign keys reported by the Supabase performance advisor.
create index if not exists agent_position_contracts_approved_by_idx
on public.agent_position_contracts(approved_by_user_id)
where approved_by_user_id is not null;

create index if not exists agent_autonomy_profiles_reviewer_idx
on public.agent_autonomy_profiles(last_reviewed_by_user_id)
where last_reviewed_by_user_id is not null;

create index if not exists agent_work_assignments_contract_idx
on public.agent_work_assignments(position_contract_id);
create index if not exists agent_work_assignments_assigned_by_idx
on public.agent_work_assignments(assigned_by_user_id);
create index if not exists agent_work_assignments_verified_by_idx
on public.agent_work_assignments(verified_by_user_id)
where verified_by_user_id is not null;
create index if not exists agent_work_assignments_agent_run_idx
on public.agent_work_assignments(agent_run_id)
where agent_run_id is not null;
create index if not exists agent_work_assignments_tool_execution_idx
on public.agent_work_assignments(tool_execution_request_id)
where tool_execution_request_id is not null;
create index if not exists agent_work_assignments_ai_audit_event_idx
on public.agent_work_assignments(ai_request_audit_event_id)
where ai_request_audit_event_id is not null;

create index if not exists agent_work_assignment_events_org_idx
on public.agent_work_assignment_events(organization_id,created_at desc);
create index if not exists agent_work_assignment_events_agent_idx
on public.agent_work_assignment_events(agent_id,created_at desc);
create index if not exists agent_work_assignment_events_actor_user_idx
on public.agent_work_assignment_events(actor_user_id)
where actor_user_id is not null;
create index if not exists agent_work_assignment_events_actor_agent_idx
on public.agent_work_assignment_events(actor_agent_id)
where actor_agent_id is not null;

commit;
