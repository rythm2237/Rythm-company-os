-- Human CEO decision discussions for Project Operating System approval gates.
-- A discussion is advisory only: it never changes approval status or releases blocked work.

create table if not exists public.project_approval_discussion_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  approval_id uuid not null references public.approval_requests(id) on delete cascade,
  speaker_type text not null,
  user_id uuid references auth.users(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  content text not null,
  ai_correlation_id uuid,
  model text,
  created_at timestamptz not null default now(),
  constraint project_approval_discussion_speaker_check check (speaker_type in ('ceo','agent','system')),
  constraint project_approval_discussion_content_check check (char_length(content) between 1 and 12000),
  constraint project_approval_discussion_actor_check check (
    (speaker_type='ceo' and user_id is not null and agent_id is null)
    or (speaker_type='agent' and agent_id is not null)
    or speaker_type='system'
  )
);

create index if not exists project_approval_discussion_thread_idx
  on public.project_approval_discussion_messages(organization_id,project_id,approval_id,created_at,id);

alter table public.project_approval_discussion_messages enable row level security;
drop policy if exists project_approval_discussion_messages_member_read on public.project_approval_discussion_messages;
create policy project_approval_discussion_messages_member_read
  on public.project_approval_discussion_messages for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists project_approval_discussion_messages_owner_write on public.project_approval_discussion_messages;
create policy project_approval_discussion_messages_owner_write
  on public.project_approval_discussion_messages for all to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

comment on table public.project_approval_discussion_messages is
  'Durable inline CEO-agent discussion attached to a pending approval. Discussion is non-authorizing and cannot mutate the approval gate.';
