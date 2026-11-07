-- W03 production ledger reconciliation (applied via Supabase on 2026-11-07).
-- The actual schema definitions are in 20261104190228_w03_project_tenant_relationships.sql.
-- This version ensures a fresh environment has the prerequisite constraints.
do $w03_check$ begin
  if not exists (select 1 from pg_constraint where conname='projects_id_organization_w03_key' and conrelid='public.projects'::regclass)
     or not exists (select 1 from pg_constraint where conname='project_task_runs_execution_tenant_w03_fk' and conrelid='public.project_task_runs'::regclass)
  then raise exception 'W03 project-relationship migration was not applied in order'; end if;
end $w03_check$;
