begin;

-- An operator preview of identified dependencies, not an execution plan.
-- Candidate dates are informational until the applicable policy is approved.
create function public.privacy_preview_account_erasure(p_request_id uuid)
returns table (
  resource text, record_id uuid, records bigint, proposed_action text, reason text,
  retention_from timestamptz, proposed_expiry timestamptz, review_at timestamptz,
  access_scope text, after_expiry text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  subject_id uuid;
begin
  select r.requested_by_user_id into subject_id
  from public.privacy_requests r
  where r.id = p_request_id and r.request_type = 'deletion' and r.scope = 'account'
    and r.organization_id is null and r.status = 'in_progress'
    and r.verified_at is not null and r.verified_at <= now();

  if not found then
    raise exception 'Verified account erasure case required for preview' using errcode = '42501';
  end if;

  return query
  with personal_workspaces as (
    select w.id
    from public.aiw_workspaces w join public.aiw_accounts a on a.id = w.account_id
    where a.user_id = subject_id and a.kind = 'personal'
      and w.kind = 'personal' and w.organization_id is null
  )
  select 'personal_file'::text, f.id, 1::bigint, 'erase_candidate'::text,
    'Subject-owned personal file. Verify binary and derivatives together.'::text,
    null::timestamptz, null::timestamptz, null::timestamptz,
    'verified subject and authorized operators'::text, 'erase via Private Storage workflow'::text
  from public.aiw_files f join personal_workspaces w on w.id = f.workspace_id
  where f.created_by = subject_id
  union all
  select 'personal_memory', m.id, 1::bigint,
    case when h.review_at is null then 'erase_candidate' else 'retain_hold' end,
    coalesce(h.retention_reason, 'Subject-owned personal memory without a recorded hold.'),
    h.retention_start, null::timestamptz, h.review_at,
    'authorized operators', case when h.review_at is null then 'erase via reviewed workflow' else 'review hold before deletion' end
  from public.aiw_memories m join personal_workspaces w on w.id = m.workspace_id
  left join lateral (
    select min(d.review_at) as review_at, min(d.recorded_at) as retention_start,
      string_agg(distinct d.retention_basis, ', ' order by d.retention_basis) as retention_reason
    from public.privacy_memory_dispositions d
    where d.memory_id = m.id and d.disposition = 'retained' and d.released_at is null
  ) h on true
  where m.created_by = subject_id and m.scope in ('personal', 'project')
  union all
  select 'audit_event', e.id, 1::bigint, 'review_audit_retention',
    'Event timestamp anchors the proposed 90-day review. Confirm retention basis and any hold.',
    e.created_at, e.created_at + interval '2160 hours', null::timestamptz,
    'authorized audit operators', 'erase or retain truly anonymous statistics after authorized review'
  from public.audit_events e where e.actor_user_id = subject_id
  union all
  select concat(d.schema_name, '.', d.relation_name, '.', d.field_name), null::uuid,
    d.matching_rows,
    case
      when d.schema_name = 'public' and (d.relation_name like 'finance\_%' or d.relation_name like 'billing\_%'
        or d.relation_name in ('assisted_billing_orders', 'usage_ledger')) then 'review_financial_basis'
      when d.schema_name = 'public' and d.relation_name in ('organizations', 'organization_members')
        then 'review_customer_instruction'
      else 'review_dependency'
    end,
    concat('Direct Auth reference with delete action ', d.on_delete, '. Review ownership and effect.'),
    null::timestamptz, null::timestamptz, null::timestamptz, 'authorized operators',
    'apply approved per-record disposition'
  from public.privacy_inventory_account_dependencies(p_request_id) d;
end;
$$;

revoke all on function public.privacy_preview_account_erasure(uuid)
  from public, anon, authenticated, service_role;

commit;
