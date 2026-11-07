-- STAGING RESTORE ONLY. Exact existing main policies omitted by W01 schema restore.
-- Sources: 202608180001 agent attachments, 20260926221427 logos, 20261022153241 CRM.
-- Never apply this fixture restoration script to production.
insert into storage.buckets (id, name, public, file_size_limit)
values ('agent-attachments', 'agent-attachments', false, 12582912)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists agent_attachments_storage_member_read on storage.objects;
create policy agent_attachments_storage_member_read on storage.objects
  for select using (
    bucket_id = 'agent-attachments'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists agent_attachments_storage_owner_insert on storage.objects;
create policy agent_attachments_storage_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'agent-attachments'
    and public.is_org_owner(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists agent_attachments_storage_owner_update on storage.objects;
create policy agent_attachments_storage_owner_update on storage.objects
  for update using (
    bucket_id = 'agent-attachments'
    and public.is_org_owner(((storage.foldername(name))[1])::uuid)
  ) with check (
    bucket_id = 'agent-attachments'
    and public.is_org_owner(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists agent_attachments_storage_owner_delete on storage.objects;
create policy agent_attachments_storage_owner_delete on storage.objects
  for delete using (
    bucket_id = 'agent-attachments'
    and public.is_org_owner(((storage.foldername(name))[1])::uuid)
  );


insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('company-logos','company-logos',false,2097152,array['image/webp']);
create policy company_logos_read on storage.objects for select to authenticated using (
 bucket_id='company-logos' and (public.is_org_owner(case when split_part(name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(name,'/',1)::uuid else null end) or exists(select 1 from public.organization_branding b where b.logo_path=name and (public.is_org_member(b.organization_id) or public.is_platform_admin())))
);
create policy company_logos_insert on storage.objects for insert to authenticated with check (bucket_id='company-logos' and public.is_org_owner(case when split_part(name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(name,'/',1)::uuid else null end) and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$');
create policy company_logos_delete on storage.objects for delete to authenticated using (bucket_id='company-logos' and public.is_org_owner(case when split_part(name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(name,'/',1)::uuid else null end));

create policy crm_project_storage_gate on storage.objects as restrictive for select to authenticated using(bucket_id<>'project-files' or exists(select 1 from public.project_documents d where d.storage_path=name and public.is_org_member(d.organization_id)));
