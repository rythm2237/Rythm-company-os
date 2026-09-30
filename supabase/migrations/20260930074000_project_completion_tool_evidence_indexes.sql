begin;
-- Lookup paths used by the Integration & Execution Gateway completion bridge.
create index if not exists project_completion_evidence_external_ref_idx on public.project_completion_evidence(project_id,external_system_reference) where external_system_reference is not null;
create index if not exists project_proposals_source_task_run_idx on public.project_proposals(source_task_run_id) where source_task_run_id is not null;
commit;
