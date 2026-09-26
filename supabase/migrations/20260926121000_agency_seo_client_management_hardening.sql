create unique index if not exists crm_accounts_org_id_id_uidx on public.crm_accounts (organization_id, id);
create unique index if not exists integration_resources_org_id_id_uidx on public.integration_resources (organization_id, id);
create unique index if not exists agency_seo_sites_org_id_id_uidx on public.agency_seo_sites (organization_id, id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agency_seo_sites_org_account_fk') then
    alter table public.agency_seo_sites add constraint agency_seo_sites_org_account_fk foreign key (organization_id, crm_account_id) references public.crm_accounts(organization_id, id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agency_seo_bindings_org_site_fk') then
    alter table public.agency_seo_provider_bindings add constraint agency_seo_bindings_org_site_fk foreign key (organization_id, site_id) references public.agency_seo_sites(organization_id, id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agency_seo_bindings_org_resource_fk') then
    alter table public.agency_seo_provider_bindings add constraint agency_seo_bindings_org_resource_fk foreign key (organization_id, integration_resource_id) references public.integration_resources(organization_id, id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agency_seo_snapshots_org_site_fk') then
    alter table public.agency_seo_snapshots add constraint agency_seo_snapshots_org_site_fk foreign key (organization_id, site_id) references public.agency_seo_sites(organization_id, id) on delete cascade not valid;
  end if;
end $$;

alter table public.agency_seo_sites validate constraint agency_seo_sites_org_account_fk;
alter table public.agency_seo_provider_bindings validate constraint agency_seo_bindings_org_site_fk;
alter table public.agency_seo_provider_bindings validate constraint agency_seo_bindings_org_resource_fk;
alter table public.agency_seo_snapshots validate constraint agency_seo_snapshots_org_site_fk;

revoke all on public.agency_seo_sites from public, anon, authenticated;
revoke all on public.agency_seo_provider_bindings from public, anon, authenticated;
revoke all on public.agency_seo_snapshots from public, anon, authenticated;
grant select, insert, update, delete on public.agency_seo_sites to authenticated;
grant select, insert, update, delete on public.agency_seo_provider_bindings to authenticated;
grant select, insert on public.agency_seo_snapshots to authenticated;
grant all on public.agency_seo_sites to service_role;
grant all on public.agency_seo_provider_bindings to service_role;
grant all on public.agency_seo_snapshots to service_role;
