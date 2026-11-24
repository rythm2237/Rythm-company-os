begin;

-- Account erasure defaults to deletion for explicitly owned personal memories.
-- Existing, unreleased record holds must be reviewed through their own cases.
create function public.privacy_erase_account_memories(p_request_id uuid, p_batch_size integer default 100)
returns table (erased_count integer, remaining_count bigint, held_count bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subject_id uuid;
  personal_workspace_id uuid;
  candidate_id uuid;
begin
  if p_batch_size is null or p_batch_size not between 1 and 500 then
    raise exception 'Batch size must be between 1 and 500' using errcode = '22023';
  end if;

  select r.requested_by_user_id into subject_id
  from public.privacy_requests r
  where r.id = p_request_id and r.request_type = 'deletion' and r.scope = 'account'
    and r.organization_id is null and r.status = 'in_progress'
    and r.verified_at is not null and r.verified_at <= now()
  for update;

  if not found then
    raise exception 'Verified account erasure case required' using errcode = '42501';
  end if;

  select w.id into personal_workspace_id
  from public.aiw_workspaces w
  join public.aiw_accounts a on a.id = w.account_id
  where a.user_id = subject_id and a.kind = 'personal'
    and w.kind = 'personal' and w.organization_id is null;

  erased_count := 0;
  for candidate_id in
    select m.id from public.aiw_memories m
    where m.workspace_id = personal_workspace_id and m.created_by = subject_id
      and not exists (
        select 1 from public.privacy_memory_dispositions d
        where d.memory_id = m.id and d.disposition = 'retained' and d.released_at is null
      )
    order by m.id
    limit p_batch_size
    for update of m
  loop
    if exists (
      select 1 from public.privacy_memory_dispositions d
      where d.request_id = p_request_id and d.memory_id = candidate_id and d.disposition = 'erased'
    ) then
      perform public.privacy_reconcile_restored_memory(p_request_id, candidate_id);
    else
      perform public.privacy_dispose_personal_memory(p_request_id, candidate_id, 'erase');
    end if;
    erased_count := erased_count + 1;
  end loop;

  select count(*) filter (where not pending.held), count(*) filter (where pending.held)
  into remaining_count, held_count
  from (
    select exists (
      select 1 from public.privacy_memory_dispositions d
      where d.memory_id = m.id and d.disposition = 'retained' and d.released_at is null
    ) as held
    from public.aiw_memories m
    where m.workspace_id = personal_workspace_id and m.created_by = subject_id
  ) pending;
  return next;
end;
$$;

revoke all on function public.privacy_erase_account_memories(uuid, integer)
  from public, anon, authenticated, service_role;

commit;
