-- Project OS security hardening after production advisor review.
-- execution_capability_catalog is intentionally readable by authenticated users,
-- but must still be protected by RLS because it lives in the exposed public schema.

alter table public.execution_capability_catalog enable row level security;

drop policy if exists execution_capability_catalog_authenticated_read
  on public.execution_capability_catalog;
create policy execution_capability_catalog_authenticated_read
  on public.execution_capability_catalog
  for select
  to authenticated
  using (true);

-- Preserve least privilege: no client-side writes.
revoke insert, update, delete, truncate, references, trigger
  on public.execution_capability_catalog
  from authenticated, anon;
revoke all on public.execution_capability_catalog from anon;
grant select on public.execution_capability_catalog to authenticated, service_role;

comment on table public.execution_capability_catalog is
  'Read-only execution capability metadata. RLS-protected; mutation remains server/service controlled.';
