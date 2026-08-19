begin;

create table if not exists public.company_knowledge (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  category text not null default 'general' check (category in ('general','brand','people','contact','product','service','process','operations','analytics','finance','sales','legal','website','other')),
  source_type text not null default 'text' check (source_type in ('text','url','file','system')),
  content text,
  source_url text,
  storage_path text,
  mime_type text,
  confidentiality text not null default 'internal' check (confidentiality in ('public','internal','confidential','restricted')),
  allowed_departments text[] not null default '{}',
  allowed_role_keywords text[] not null default '{}',
  transferable boolean not null default false,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_knowledge_org_status_idx on public.company_knowledge(organization_id,status,updated_at desc);
create index if not exists company_knowledge_category_idx on public.company_knowledge(organization_id,category);

alter table public.company_knowledge enable row level security;

drop policy if exists company_knowledge_owner_read on public.company_knowledge;
create policy company_knowledge_owner_read on public.company_knowledge for select using (public.is_org_owner(organization_id));

drop policy if exists company_knowledge_owner_write on public.company_knowledge;
create policy company_knowledge_owner_write on public.company_knowledge for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

insert into storage.buckets (id,name,public,file_size_limit)
values ('company-knowledge','company-knowledge',false,15728640)
on conflict (id) do update set public=false,file_size_limit=15728640;

drop policy if exists company_knowledge_storage_owner_read on storage.objects;
create policy company_knowledge_storage_owner_read on storage.objects for select using (
  bucket_id='company-knowledge' and public.is_org_owner(((storage.foldername(name))[1])::uuid)
);
drop policy if exists company_knowledge_storage_owner_insert on storage.objects;
create policy company_knowledge_storage_owner_insert on storage.objects for insert with check (
  bucket_id='company-knowledge' and public.is_org_owner(((storage.foldername(name))[1])::uuid)
);
drop policy if exists company_knowledge_storage_owner_update on storage.objects;
create policy company_knowledge_storage_owner_update on storage.objects for update using (
  bucket_id='company-knowledge' and public.is_org_owner(((storage.foldername(name))[1])::uuid)
) with check (
  bucket_id='company-knowledge' and public.is_org_owner(((storage.foldername(name))[1])::uuid)
);
drop policy if exists company_knowledge_storage_owner_delete on storage.objects;
create policy company_knowledge_storage_owner_delete on storage.objects for delete using (
  bucket_id='company-knowledge' and public.is_org_owner(((storage.foldername(name))[1])::uuid)
);

alter table public.agent_memories add column if not exists source_company_id uuid references public.organizations(id) on delete set null;
alter table public.agent_memories add column if not exists confidentiality_level text not null default 'internal';
alter table public.agent_memories add column if not exists transferable boolean not null default false;

alter table public.agent_attachments add column if not exists source_company_id uuid references public.organizations(id) on delete set null;
alter table public.agent_attachments add column if not exists transferable boolean not null default false;

alter table public.agent_artifacts add column if not exists source_company_id uuid references public.organizations(id) on delete set null;
alter table public.agent_artifacts add column if not exists transferable boolean not null default false;

update public.agent_memories set source_company_id=organization_id where source_company_id is null;
update public.agent_attachments set source_company_id=organization_id where source_company_id is null;
update public.agent_artifacts set source_company_id=organization_id where source_company_id is null;

create or replace function public.sanitize_agent_company_data_for_transfer(target_agent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  org_id uuid;
  memories_removed integer:=0;
  attachments_removed integer:=0;
  artifacts_removed integer:=0;
begin
  select organization_id into org_id from public.agents where id=target_agent_id;
  if org_id is null or not public.is_org_owner(org_id) then raise exception 'not_authorized'; end if;
  delete from public.agent_memories where agent_id=target_agent_id and transferable=false;
  get diagnostics memories_removed=row_count;
  delete from public.agent_attachments where agent_id=target_agent_id and transferable=false;
  get diagnostics attachments_removed=row_count;
  delete from public.agent_artifacts where agent_id=target_agent_id and transferable=false;
  get diagnostics artifacts_removed=row_count;
  return jsonb_build_object('memories_removed',memories_removed,'attachments_removed',attachments_removed,'artifacts_removed',artifacts_removed);
end;
$$;
revoke all on function public.sanitize_agent_company_data_for_transfer(uuid) from public,anon,authenticated;
grant execute on function public.sanitize_agent_company_data_for_transfer(uuid) to authenticated;

commit;
