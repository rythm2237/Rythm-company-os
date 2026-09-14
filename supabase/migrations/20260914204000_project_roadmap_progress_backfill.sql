-- Recalculate cached project progress after introducing roadmap baselines.
-- Existing active projects without an approved roadmap must no longer retain
-- misleading task-count percentages such as 12/16 = 75%.

do $$
declare
  v_project record;
begin
  for v_project in select id from public.projects loop
    perform public.refresh_project_progress_percent_v1(v_project.id);
  end loop;
end;
$$;
