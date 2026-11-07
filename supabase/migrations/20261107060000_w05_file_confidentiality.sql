-- W05: Keep private Storage reads request-authorized and prevent forged metadata
-- from directing service-role downloaders at another tenant's object.
-- REVIEW ONLY: do not apply to Production without explicit owner approval.
begin;

-- Signed URLs are bearer capabilities and remain usable after membership
-- revocation until expiry. All restricted buckets must use authenticated
-- downloads or a server proxy that checks access at request time.
-- Existing signed URLs cannot be recalled by changing an RLS policy.
drop policy if exists w05_no_signed_private_downloads on storage.objects;
create policy w05_no_signed_private_downloads on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id not in ('project-files','company-knowledge','agent-artifacts','agent-attachments','ai-workspace-private')
    or not storage.allow_any_operation(array['object.sign','object.sign_many'])
  );

-- Earlier CRM migration correctly used RESTRICTIVE policies for document
-- classification. Do not replace those restrictive gates with permissive ORs.
-- The object path itself must be immutable and belong to the row's tenant.
create or replace function crm_private.project_document_storage_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  org_prefix text := new.organization_id::text || '/';
begin
  if tg_op = 'UPDATE' and (
    new.storage_path is distinct from old.storage_path or
    new.organization_id is distinct from old.organization_id
  ) then
    raise exception 'Document storage identity is immutable' using errcode = '23514';
  end if;

  if new.storage_path is null or left(new.storage_path, length(org_prefix)) <> org_prefix
     or position('// ' in new.storage_path) > 0
     or position('/../' in new.storage_path) > 0
     or position('/./' in new.storage_path) > 0 then
    raise exception 'Invalid tenant-scoped document storage path' using errcode = '23514';
  end if;

  if (new.project_id is not null and
      left(new.storage_path, length(org_prefix || new.project_id::text || '/')) =
           org_prefix || new.project_id::text || '/')
     or (new.contract_id is not null and
      left(new.storage_path, length(org_prefix || 'contracts/' || new.contract_id::text || '/')) =
           org_prefix || 'contracts/' || new.contract_id::text || '/') then
    return new;
  end if;
  raise exception 'Document storage path does not match its project or contract'
    using errcode = '23514';
end;
$$;

revoke all on function crm_private.project_document_storage_boundary() from public, anon, authenticated;

drop trigger if exists w05_project_document_storage_guard on public.project_documents;
create trigger w05_project_document_storage_guard
before insert or update of storage_path, organization_id, project_id, contract_id
on public.project_documents for each row
execute function crm_private.project_document_storage_boundary();

comment on function crm_private.project_document_storage_boundary() is
'W05 guard: never allow a client-writable project_documents row to redirect privileged downloads to another tenant or resource.';

commit;
