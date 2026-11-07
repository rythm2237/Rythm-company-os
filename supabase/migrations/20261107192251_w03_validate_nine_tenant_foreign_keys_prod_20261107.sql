-- W03 production legacy-data validation (applied 2026-11-07 after nine zero-orphan preflights).
-- Strictly idempotent for validated or NOT VALID constraints; no data modification.
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.project_decision_memory validate constraint project_decision_memory_project_tenant_w03_fk;
alter table public.project_task_runs validate constraint project_task_runs_project_tenant_w03_fk;
alter table public.project_task_runs validate constraint project_task_runs_execution_tenant_w03_fk;
alter table public.tool_execution_requests validate constraint tool_execution_requests_project_tenant_w03_fk;
alter table public.project_task_runs validate constraint project_task_runs_agent_tenant_w03_fk;
alter table public.project_task_runs validate constraint project_task_runs_action_tenant_w03_fk;
alter table public.agent_memories validate constraint agent_memories_agent_tenant_w03_fk;
alter table public.agent_attachments validate constraint agent_attachments_agent_tenant_w03_fk;
alter table public.agent_memories validate constraint agent_memories_source_tenant_w03_fk;
