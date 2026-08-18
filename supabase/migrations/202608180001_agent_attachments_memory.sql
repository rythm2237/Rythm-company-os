begin;

create table if not exists public.agent_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  uploaded_by uuid not null default auth.uid(),
  filename text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 12582912),
  storage_path text not null unique,
  status text not null default 'active' check (status in ('active','removed')),
  created_at timestamptz not null default now()
);

create index if not exists agent_attachments_agent_created_idx
  on public.agent_attachments(agent_id, created_at desc);

alter table public.agent_attachments enable row level security;

drop policy if exists agent_attachments_member_read on public.agent_attachments;
create policy agent_attachments_member_read on public.agent_attachments
  for select using (public.is_org_member(organization_id));

drop policy if exists agent_attachments_owner_write on public.agent_attachments;
create policy agent_attachments_owner_write on public.agent_attachments
  for all using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

create table if not exists public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  source_attachment_id uuid references public.agent_attachments(id) on delete set null,
  memory_type text not null default 'experience' check (memory_type in ('experience','file','preference','fact')),
  title text not null,
  content text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists agent_memories_agent_created_idx
  on public.agent_memories(agent_id, created_at desc);

alter table public.agent_memories enable row level security;

drop policy if exists agent_memories_member_read on public.agent_memories;
create policy agent_memories_member_read on public.agent_memories
  for select using (public.is_org_member(organization_id));

drop policy if exists agent_memories_owner_write on public.agent_memories;
create policy agent_memories_owner_write on public.agent_memories
  for all using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

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

commit;
