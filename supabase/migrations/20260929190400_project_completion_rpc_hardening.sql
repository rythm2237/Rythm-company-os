begin;
revoke all on function public.finalize_project_closeout_report_v1(uuid) from public,anon,authenticated;
grant execute on function public.finalize_project_closeout_report_v1(uuid) to service_role;
revoke all on function public.guard_project_completed_transition_v1() from public,anon,authenticated;
revoke all on function public.sync_project_final_acceptance_v1() from public,anon,authenticated;
commit;
