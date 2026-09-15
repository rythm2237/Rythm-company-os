-- RYTHM Customer Connection Platform — Phase 2 hardening
-- Remove overlapping SELECT policy on the new event table and cover Phase 2 foreign keys.

begin;

-- The Phase 2 event table has one member SELECT policy. Owner mutation authority is
-- intentionally split by command so it does not also create a second permissive SELECT path.
drop policy if exists connection_setup_session_events_owner_write on public.connection_setup_session_events;
drop policy if exists connection_setup_session_events_owner_insert on public.connection_setup_session_events;
drop policy if exists connection_setup_session_events_owner_update on public.connection_setup_session_events;
drop policy if exists connection_setup_session_events_owner_delete on public.connection_setup_session_events;

create policy connection_setup_session_events_owner_insert
  on public.connection_setup_session_events
  for insert to authenticated
  with check (public.is_org_owner(organization_id));

create policy connection_setup_session_events_owner_update
  on public.connection_setup_session_events
  for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

create policy connection_setup_session_events_owner_delete
  on public.connection_setup_session_events
  for delete to authenticated
  using (public.is_org_owner(organization_id));

-- Cover the foreign keys introduced/actively exercised by Connection Setup Agent sessions.
create index if not exists connection_setup_session_events_org_idx
  on public.connection_setup_session_events(organization_id);
create index if not exists connection_setup_session_events_project_idx
  on public.connection_setup_session_events(project_id) where project_id is not null;
create index if not exists connection_setup_session_events_connection_idx
  on public.connection_setup_session_events(connection_id) where connection_id is not null;
create index if not exists connection_setup_session_events_provider_idx
  on public.connection_setup_session_events(provider_key);
create index if not exists connection_setup_session_events_actor_user_idx
  on public.connection_setup_session_events(actor_user_id) where actor_user_id is not null;

create index if not exists integration_setup_sessions_connection_idx
  on public.integration_setup_sessions(connection_id) where connection_id is not null;
create index if not exists integration_setup_sessions_provider_idx
  on public.integration_setup_sessions(provider_key);
create index if not exists integration_setup_sessions_project_idx
  on public.integration_setup_sessions(project_id) where project_id is not null;
create index if not exists integration_setup_sessions_started_by_idx
  on public.integration_setup_sessions(started_by_user_id) where started_by_user_id is not null;
create index if not exists integration_setup_sessions_created_by_idx
  on public.integration_setup_sessions(created_by_user_id) where created_by_user_id is not null;

commit;
