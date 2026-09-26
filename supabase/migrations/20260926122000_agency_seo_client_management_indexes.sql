create index if not exists agency_seo_sites_account_idx on public.agency_seo_sites (crm_account_id);
create index if not exists agency_seo_sites_created_by_idx on public.agency_seo_sites (created_by_user_id) where created_by_user_id is not null;
create index if not exists agency_seo_bindings_resource_idx on public.agency_seo_provider_bindings (integration_resource_id);
create index if not exists agency_seo_bindings_org_resource_idx on public.agency_seo_provider_bindings (organization_id, integration_resource_id);
create index if not exists agency_seo_bindings_created_by_idx on public.agency_seo_provider_bindings (created_by_user_id) where created_by_user_id is not null;
create index if not exists agency_seo_snapshots_site_idx on public.agency_seo_snapshots (site_id);
create index if not exists agency_seo_snapshots_created_by_idx on public.agency_seo_snapshots (created_by_user_id) where created_by_user_id is not null;
