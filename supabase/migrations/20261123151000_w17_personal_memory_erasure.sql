begin;

-- This log contains identifiers and decisions only. Memory text and export
-- payloads must never be stored in privacy evidence.
create table public.privacy_memory_dispositions (
  request_id uuid not null references public.privacy_requests(id),
  memory_id uuid not null,
  disposition text not null check (disposition in ('erased', 'retained')),
  retention_basis text check (retention_basis in ('legal_obligation', 'legal_claims')),
  review_at timestamptz,
  released_at timestamptz,
  released_by text,
  release_request_id uuid references public.privacy_requests(id),
  recorded_at timestamptz not null default now(),
  recorded_by text not null default current_user,
  primary key (request_id, memory_id),
  check (
    (released_at is null and released_by is null and release_request_id is null)
    or (disposition = 'retained' and released_at is not null
        and released_by is not null and release_request_id is not null)
  ),
  check (
    (disposition = 'erased' and retention_basis is null and review_at is null)
    or (disposition = 'retained' and retention_basis is not null and review_at is not null)
  )
);

alter table public.privacy_memory_dispositions enable row level security;
revoke all on table public.privacy_memory_dispositions from public, anon, authenticated, service_role;

create index privacy_memory_dispositions_active_hold_idx
  on public.privacy_memory_dispositions (memory_id)
  where disposition = 'retained' and released_at is null;

-- The trigger reads the private retention ledger without granting callers
-- access to the ledger. It covers direct and cascading memory removal.
create function public.privacy_enforce_memory_hold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.privacy_memory_dispositions
    where memory_id = old.id and disposition = 'retained' and released_at is null
  ) then
    raise exception 'Memory retention hold requires operator review' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.privacy_enforce_memory_hold()
  from public, anon, authenticated, service_role;

create trigger privacy_memory_hold
before update or delete on public.aiw_memories
for each row execute function public.privacy_enforce_memory_hold();

-- Invoked from the database operator session after verifying identity and
-- reviewing the documented scope. No browser or service-role execute grant.
create function public.privacy_dispose_personal_memory(
  p_request_id uuid,
  p_memory_id uuid,
  p_disposition text,
  p_retention_basis text default null,
  p_review_at timestamptz default null
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subject_id uuid;
  previous public.privacy_memory_dispositions%rowtype;
begin
  select requested_by_user_id into subject_id
  from public.privacy_requests
  where id = p_request_id
    and request_type = 'deletion' and scope = 'account' and organization_id is null
    and status = 'in_progress' and verified_at is not null and verified_at <= now()
  for update;

  if not found then
    raise exception 'Verified account erasure case required' using errcode = '42501';
  end if;

  if p_disposition is null
    or p_disposition not in ('erase', 'retain')
    or (p_disposition = 'erase' and (p_retention_basis is not null or p_review_at is not null))
    or (p_disposition = 'retain' and (
      p_retention_basis is null or p_retention_basis not in ('legal_obligation', 'legal_claims')
      or p_review_at is null or p_review_at <= now()
    ))
  then
    raise exception 'Documented disposition decision required' using errcode = '22023';
  end if;

  -- An idempotent retry must come through the same verified case.
  select * into previous
  from public.privacy_memory_dispositions
  where request_id = p_request_id and memory_id = p_memory_id;

  if previous.disposition = 'erased' and p_disposition = 'erase' then
    return 'erased';
  end if;

  if previous.disposition is not null then
    raise exception 'Existing disposition requires operator review' using errcode = '55000';
  end if;

  -- Lock the memory to serialize decisions across separate cases. The join
  -- excludes company workspaces and data whose authorship is unverified.
  perform 1
  from public.aiw_memories as memory
  join public.aiw_workspaces as workspace on workspace.id = memory.workspace_id
  join public.aiw_accounts as account on account.id = workspace.account_id
  where memory.id = p_memory_id and memory.created_by = subject_id
    and workspace.kind = 'personal' and workspace.organization_id is null
    and account.kind = 'personal' and account.user_id = subject_id
  for update of memory;

  if not found then
    raise exception 'Memory is outside verified account scope' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.privacy_memory_dispositions
    where memory_id = p_memory_id and disposition = 'retained' and released_at is null
  ) then
    raise exception 'Existing retention decision requires operator review' using errcode = '55000';
  end if;

  if p_disposition = 'erase' then
    delete from public.aiw_memories where id = p_memory_id;
    insert into public.privacy_memory_dispositions (request_id, memory_id, disposition)
    values (p_request_id, p_memory_id, 'erased');
    return 'erased';
  end if;

  insert into public.privacy_memory_dispositions (
    request_id, memory_id, disposition, retention_basis, review_at
  ) values (p_request_id, p_memory_id, 'retained', p_retention_basis, p_review_at);
  return 'retained';
end;
$$;

revoke all on function public.privacy_dispose_personal_memory(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated, service_role;

commit;
