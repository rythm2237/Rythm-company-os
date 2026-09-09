-- Cover the platform integration actor foreign key for operational maintenance.
create index if not exists platform_integrations_connected_by_user_id_idx
  on public.platform_integrations (connected_by_user_id)
  where connected_by_user_id is not null;
