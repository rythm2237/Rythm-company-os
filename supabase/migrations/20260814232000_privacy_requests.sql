-- GDPR/DSAR request intake for RYTHM Public Beta.
-- Additive only: no existing production data is modified or deleted.

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by_user_id uuid not null,
  organization_id uuid references public.organizations(id) on delete set null,
  request_type text not null check (request_type in ('access','export','correction','deletion','restriction','objection','portability')),
  scope text not null default 'account' check (scope in ('account','organization')),
  status text not null default 'received' check (status in ('received','identity_verification','in_progress','waiting_customer','completed','partially_completed','rejected','cancelled')),
  requester_note text,
  operator_note text,
  received_at timestamptz not null default now(),
  due_at timestamptz not null default (now() + interval '1 month'),
  verified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists privacy_requests_requester_idx
  on public.privacy_requests (requested_by_user_id, created_at desc);

create index if not exists privacy_requests_org_idx
  on public.privacy_requests (organization_id, created_at desc)
  where organization_id is not null;

create index if not exists privacy_requests_open_due_idx
  on public.privacy_requests (due_at)
  where status not in ('completed','partially_completed','rejected','cancelled');

alter table public.privacy_requests enable row level security;

revoke all on table public.privacy_requests from anon;
revoke all on table public.privacy_requests from authenticated;
grant select, insert on table public.privacy_requests to authenticated;

create policy privacy_requests_select_own
  on public.privacy_requests
  for select
  to authenticated
  using (
    requested_by_user_id = auth.uid()
  );

create policy privacy_requests_insert_own
  on public.privacy_requests
  for insert
  to authenticated
  with check (
    requested_by_user_id = auth.uid()
    and (
      organization_id is null
      or public.is_org_owner(organization_id)
    )
    and (
      (scope = 'account' and organization_id is null)
      or (scope = 'organization' and organization_id is not null)
    )
  );

comment on table public.privacy_requests is
  'Data-subject/customer privacy requests. Customer users may create and read only their own requests; processing/status changes are performed through privileged operational workflows.';
