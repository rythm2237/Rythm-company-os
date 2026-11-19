-- The operating view uses security-invoker timeline and tenant-scoped tables.
begin;
grant select on public.project_operating_timeline, public.entity_relationships,
  public.company_events, public.project_progress_events to authenticated;
commit;
