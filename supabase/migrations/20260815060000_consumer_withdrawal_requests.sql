create table if not exists public.consumer_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid null references auth.users(id) on delete set null,
  consumer_name text not null check (char_length(consumer_name) between 1 and 200),
  consumer_email text not null check (char_length(consumer_email) between 3 and 320),
  contract_reference text not null check (char_length(contract_reference) between 1 and 200),
  withdrawal_statement text not null default 'I withdraw from the identified distance contract.',
  submitted_at timestamptz not null default now(),
  status text not null default 'received' check (status in ('received','reviewing','accepted','rejected','refunded','closed')),
  operator_note text null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.consumer_withdrawal_requests enable row level security;

revoke all on table public.consumer_withdrawal_requests from public, anon, authenticated;

create index if not exists consumer_withdrawal_requests_submitted_at_idx
  on public.consumer_withdrawal_requests (submitted_at desc);
create index if not exists consumer_withdrawal_requests_email_idx
  on public.consumer_withdrawal_requests (lower(consumer_email));
create index if not exists consumer_withdrawal_requests_contract_reference_idx
  on public.consumer_withdrawal_requests (contract_reference);

comment on table public.consumer_withdrawal_requests is
  'Operator-side register for consumer distance-contract withdrawal statements. Public clients have no direct table grants; submissions enter through the server API.';
