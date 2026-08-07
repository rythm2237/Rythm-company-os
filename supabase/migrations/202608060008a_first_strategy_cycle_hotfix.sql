-- Hotfix for first governed strategy cycle.
-- project_strategy_briefs does not define updated_at; complete SB-001 without touching a non-existent column.

update public.project_strategy_briefs
set status='completed'
where brief_code='SB-001'
  and project_id in (
    select id from public.projects where project_code='AI-PR-001'
  );

update public.project_milestones
set status='completed', completed_at=coalesce(completed_at, now())
where sequence_no=4
  and project_id in (
    select id from public.projects where project_code='AI-PR-001'
  );

update public.projects
set stage='executive_decision', progress_percent=65, updated_at=now()
where project_code='AI-PR-001';

update public.project_kpis
set current_value=1, status='achieved'
where name='Governed strategy cycles'
  and project_id in (
    select id from public.projects where project_code='AI-PR-001'
  );
