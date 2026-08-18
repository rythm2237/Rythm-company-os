begin;

create table if not exists public.agent_artifacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  created_by uuid not null default auth.uid(),
  artifact_type text not null check (artifact_type in ('text','report','image','chart','table','file')),
  title text not null,
  source_output_type text,
  text_content text,
  structured_content jsonb,
  storage_path text,
  mime_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_artifacts_agent_created_idx
  on public.agent_artifacts(agent_id, created_at desc);
create index if not exists agent_artifacts_org_created_idx
  on public.agent_artifacts(organization_id, created_at desc);

alter table public.agent_artifacts enable row level security;

drop policy if exists agent_artifacts_member_read on public.agent_artifacts;
create policy agent_artifacts_member_read on public.agent_artifacts
  for select using (public.is_org_member(organization_id));

drop policy if exists agent_artifacts_owner_write on public.agent_artifacts;
create policy agent_artifacts_owner_write on public.agent_artifacts
  for all using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

insert into storage.buckets (id, name, public, file_size_limit)
values ('agent-artifacts', 'agent-artifacts', false, 25165824)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists agent_artifacts_storage_member_read on storage.objects;
create policy agent_artifacts_storage_member_read on storage.objects
  for select using (
    bucket_id = 'agent-artifacts'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists agent_artifacts_storage_owner_insert on storage.objects;
create policy agent_artifacts_storage_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'agent-artifacts'
    and public.is_org_owner(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists agent_artifacts_storage_owner_update on storage.objects;
create policy agent_artifacts_storage_owner_update on storage.objects
  for update using (
    bucket_id = 'agent-artifacts'
    and public.is_org_owner(((storage.foldername(name))[1])::uuid)
  ) with check (
    bucket_id = 'agent-artifacts'
    and public.is_org_owner(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists agent_artifacts_storage_owner_delete on storage.objects;
create policy agent_artifacts_storage_owner_delete on storage.objects
  for delete using (
    bucket_id = 'agent-artifacts'
    and public.is_org_owner(((storage.foldername(name))[1])::uuid)
  );

commit;
