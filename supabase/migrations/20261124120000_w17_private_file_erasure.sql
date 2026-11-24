begin;

-- The server calls this before and after deleting the binary through Storage.
-- File metadata is the retry anchor until the binary is gone and SQL can commit.
create function public.aiw_erase_personal_file(
  p_user_id uuid,
  p_file_id uuid,
  p_finalize boolean
) returns table (outcome text, object_path text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_file public.aiw_files%rowtype;
  usage_row public.ai_usage_requests%rowtype;
  expected_usage_key text;
begin
  select f.* into selected_file
  from public.aiw_files f
  join public.aiw_workspaces w on w.id = f.workspace_id
  join public.aiw_accounts a on a.id = w.account_id
  where f.id = p_file_id and (f.created_by is null or f.created_by = p_user_id)
    and w.kind = 'personal' and w.organization_id is null
    and a.kind = 'personal' and a.user_id = p_user_id
  for update of f;

  if not found then
    return query select 'not_found'::text, null::text;
    return;
  end if;

  if selected_file.storage_path !~ (
    '^' || selected_file.workspace_id::text || '/' || selected_file.id::text || '/[a-zA-Z0-9._-]+$'
  ) or split_part(selected_file.storage_path, '/', 3) in ('.', '..') then
    return query select 'scope_review'::text, null::text;
    return;
  end if;

  if selected_file.ingestion_status in ('pending', 'processing') then
    return query select 'processing'::text, null::text;
    return;
  end if;

  expected_usage_key := selected_file.workspace_id::text || ':file-' || selected_file.id::text || ':file_ingestion';
  -- Older failed ingestions may have written the usage row before linking it.
  select u.* into usage_row
  from public.ai_usage_requests u
  where u.idempotency_key = expected_usage_key
  for update;

  if (selected_file.usage_request_id is not null and
      selected_file.usage_request_id is distinct from usage_row.id)
    or (usage_row.id is not null and (
      usage_row.workspace_id <> selected_file.workspace_id or
      usage_row.user_id is distinct from p_user_id or usage_row.request_kind <> 'file_ingestion'
    )) then
    return query select 'scope_review'::text, null::text;
    return;
  end if;

  if usage_row.id is not null and usage_row.status not in ('settled', 'released', 'failed') then
    return query select 'processing'::text, null::text;
    return;
  end if;

  if p_finalize is not true then
    return query select 'ready'::text, selected_file.storage_path;
    return;
  end if;

  if exists (
    select 1 from storage.objects o
    where o.bucket_id = 'ai-workspace-private' and o.name = selected_file.storage_path
  ) then
    return query select 'object_present'::text, null::text;
    return;
  end if;

  update public.ai_usage_requests set internal_result = null where id = usage_row.id;
  delete from public.aiw_files where id = selected_file.id;
  return query select 'erased'::text, null::text;
end;
$$;

revoke all on function public.aiw_erase_personal_file(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.aiw_erase_personal_file(uuid, uuid, boolean) to service_role;

commit;
