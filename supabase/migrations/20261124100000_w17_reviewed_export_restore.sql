begin;

-- The operator reviews the draft outside the application before delivery.
-- Keep the payload out of the case, audit log and application logs.
create function public.privacy_collect_personal_export(p_request_id uuid)
returns table (section text, record jsonb)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  subject_id uuid;
  personal_workspace_id uuid;
begin
  select requested_by_user_id into subject_id
  from public.privacy_requests
  where id = p_request_id and request_type in ('access', 'export', 'portability')
    and scope = 'account' and organization_id is null and status = 'in_progress'
    and verified_at is not null and verified_at <= now();

  if not found then
    raise exception 'Verified account access case required' using errcode = '42501';
  end if;

  select w.id into personal_workspace_id
  from public.aiw_workspaces w
  join public.aiw_accounts a on a.id = w.account_id
  where a.user_id = subject_id and a.kind = 'personal'
    and w.kind = 'personal' and w.organization_id is null;

  return query
  select 'account'::text, jsonb_build_object(
    'id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at
  ) from auth.users u where u.id = subject_id
  union all
  select 'profile', jsonb_build_object(
    'full_name', p.full_name, 'company_name', p.company_name, 'country_code', p.country_code,
    'preferred_language', p.preferred_language, 'created_at', p.created_at, 'updated_at', p.updated_at
  ) from public.customer_profiles p where p.user_id = subject_id
  union all
  select 'preferences', jsonb_build_object(
    'preferred_language', p.preferred_language, 'updated_at', p.updated_at
  ) from public.user_ai_preferences p where p.user_id = subject_id
  union all
  select 'project', jsonb_build_object(
    'id', p.id, 'name', p.name, 'description', p.description, 'instructions', p.instructions,
    'archived', p.archived, 'created_at', p.created_at
  ) from public.aiw_projects p where p.workspace_id = personal_workspace_id
  union all
  select 'conversation', jsonb_build_object(
    'id', c.id, 'project_id', c.project_id, 'title', c.title, 'archived', c.archived,
    'pinned', c.pinned, 'created_at', c.created_at
  ) from public.aiw_conversations c where c.workspace_id = personal_workspace_id
  union all
  select 'message', jsonb_build_object(
    'id', m.id, 'conversation_id', m.conversation_id, 'role', m.role, 'content', m.content,
    'created_at', m.created_at
  ) from public.aiw_messages m
  join public.aiw_conversations c on c.id = m.conversation_id and c.workspace_id = m.workspace_id
  where m.workspace_id = personal_workspace_id
  union all
  select 'memory', jsonb_build_object(
    'id', m.id, 'project_id', m.project_id, 'scope', m.scope, 'title', m.title,
    'content', m.content, 'created_at', m.created_at
  ) from public.aiw_memories m
  where m.workspace_id = personal_workspace_id and m.created_by = subject_id
  union all
  select 'saved_prompt', jsonb_build_object(
    'id', p.id, 'name', p.name, 'content', p.content, 'created_at', p.created_at
  ) from public.aiw_saved_prompts p where p.workspace_id = personal_workspace_id
  union all
  select 'file', jsonb_build_object(
    'id', f.id, 'project_id', f.project_id, 'filename', f.filename, 'mime_type', f.mime_type,
    'byte_size', f.byte_size, 'created_at', f.created_at
  ) from public.aiw_files f
  where f.workspace_id = personal_workspace_id and f.created_by = subject_id
  union all
  select 'file_chunk', jsonb_build_object(
    'file_id', c.file_id, 'chunk_index', c.chunk_index, 'content', c.content
  ) from public.aiw_file_chunks c
  join public.aiw_files f on f.id = c.file_id and f.workspace_id = c.workspace_id
  where c.workspace_id = personal_workspace_id and f.created_by = subject_id;
end;
$$;

revoke all on function public.privacy_collect_personal_export(uuid)
  from public, anon, authenticated, service_role;

-- Count direct references without reading record contents or changing data.
-- Cascading and nullable references also require a disposition decision.
create function public.privacy_inventory_account_dependencies(p_request_id uuid)
returns table (schema_name text, relation_name text, field_name text, on_delete text, matching_rows bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  subject_id uuid;
  dependency record;
  row_count bigint;
begin
  select requested_by_user_id into subject_id
  from public.privacy_requests
  where id = p_request_id and request_type = 'deletion' and scope = 'account'
    and organization_id is null and status = 'in_progress'
    and verified_at is not null and verified_at <= now();

  if not found then
    raise exception 'Verified account erasure case required for dependency inventory' using errcode = '42501';
  end if;

  for dependency in
    select n.nspname::text as schema_name, t.relname::text as relation_name,
           a.attname::text as field_name,
           case c.confdeltype when 'c' then 'cascade' when 'n' then 'set_null'
             when 'd' then 'set_default' when 'r' then 'restrict' else 'no_action' end as on_delete
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
    join pg_catalog.pg_attribute target
      on target.attrelid = c.confrelid and target.attnum = c.confkey[1] and target.attname = 'id'
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
      and cardinality(c.conkey) = 1 and c.conparentid = 0
      and n.nspname in ('public', 'storage')
    order by n.nspname, t.relname, a.attname
  loop
    execute format('select count(*) from %I.%I where %I = $1',
      dependency.schema_name, dependency.relation_name, dependency.field_name)
      into row_count using subject_id;
    if row_count > 0 then
      return query select dependency.schema_name, dependency.relation_name,
        dependency.field_name, dependency.on_delete, row_count;
    end if;
  end loop;
end;
$$;

revoke all on function public.privacy_inventory_account_dependencies(uuid)
  from public, anon, authenticated, service_role;

-- Run while the restore remains isolated, after importing authoritative
-- post-backup case and disposition evidence. A retained record stays protected.
create function public.privacy_reconcile_restored_memory(p_request_id uuid, p_memory_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subject_id uuid;
begin
  select r.requested_by_user_id into subject_id
  from public.privacy_requests r
  join public.privacy_memory_dispositions d on d.request_id = r.id
  where r.id = p_request_id and d.memory_id = p_memory_id and d.disposition = 'erased'
    and r.request_type = 'deletion' and r.scope = 'account' and r.organization_id is null
    and r.verified_at is not null and r.verified_at <= d.recorded_at
  for update of r, d;

  if not found then
    raise exception 'Recorded account erasure required for restore reconciliation' using errcode = '42501';
  end if;

  perform 1 from public.aiw_memories where id = p_memory_id for update;
  if not found then
    return 'already_absent';
  end if;

  delete from public.aiw_memories m
  using public.aiw_workspaces w, public.aiw_accounts a
  where m.id = p_memory_id and m.created_by = subject_id
    and w.id = m.workspace_id and w.kind = 'personal' and w.organization_id is null
    and a.id = w.account_id and a.kind = 'personal' and a.user_id = subject_id;

  if not found then
    raise exception 'Restored memory is outside verified account scope' using errcode = '42501';
  end if;
  return 'erased';
end;
$$;

revoke all on function public.privacy_reconcile_restored_memory(uuid, uuid)
  from public, anon, authenticated, service_role;

commit;
