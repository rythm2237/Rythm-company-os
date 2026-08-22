-- RYTHM Company OS — Finance Center operational ledger
-- This is an operational finance layer, not a statutory general ledger.

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('revenue','expense')),
  status text not null default 'posted' check (status in ('planned','pending','posted','void')),
  category text not null default 'other',
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'EUR',
  occurred_on date not null default current_date,
  due_on date,
  counterparty_name text,
  source_type text,
  source_id uuid,
  external_provider text,
  external_reference text,
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  internal_reference text not null,
  official_invoice_number text,
  direction text not null default 'receivable' check (direction in ('receivable','payable')),
  status text not null default 'draft' check (status in ('draft','issued','paid','overdue','failed','void','refunded')),
  customer_name text,
  customer_email text,
  customer_tax_id text,
  customer_vat_id text,
  customer_address jsonb not null default '{}'::jsonb,
  currency text not null default 'EUR',
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax_total numeric(14,2) not null default 0 check (tax_total >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  external_provider text,
  external_invoice_id text,
  nav_submission_status text not null default 'not_connected',
  nav_transaction_id text,
  source_type text,
  source_id uuid,
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, internal_reference)
);

create table if not exists public.finance_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.finance_invoices(id) on delete cascade,
  description text not null,
  quantity numeric(14,4) not null default 1 check (quantity > 0),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  tax_rate numeric(7,4) not null default 0 check (tax_rate >= 0),
  line_subtotal numeric(14,2) not null default 0 check (line_subtotal >= 0),
  line_tax numeric(14,2) not null default 0 check (line_tax >= 0),
  line_total numeric(14,2) not null default 0 check (line_total >= 0),
  source_type text,
  source_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text not null default 'general',
  period_start date not null,
  period_end date not null,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'EUR',
  status text not null default 'active' check (status in ('draft','active','closed','cancelled')),
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index if not exists idx_finance_transactions_org_date on public.finance_transactions(organization_id, occurred_on desc);
create index if not exists idx_finance_transactions_org_type on public.finance_transactions(organization_id, transaction_type, status);
create index if not exists idx_finance_invoices_org_status on public.finance_invoices(organization_id, status, due_at);
create index if not exists idx_finance_invoice_lines_invoice on public.finance_invoice_lines(invoice_id);
create index if not exists idx_finance_budgets_org_period on public.finance_budgets(organization_id, period_start, period_end);

alter table public.finance_transactions enable row level security;
alter table public.finance_invoices enable row level security;
alter table public.finance_invoice_lines enable row level security;
alter table public.finance_budgets enable row level security;

create policy finance_transactions_authorized_select on public.finance_transactions
for select to authenticated using (exists (
  select 1 from public.organization_members m
  where m.organization_id=finance_transactions.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')
));
create policy finance_transactions_authorized_write on public.finance_transactions
for all to authenticated using (exists (
  select 1 from public.organization_members m
  where m.organization_id=finance_transactions.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')
)) with check (exists (
  select 1 from public.organization_members m
  where m.organization_id=finance_transactions.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')
));

create policy finance_invoices_authorized_select on public.finance_invoices
for select to authenticated using (exists (
  select 1 from public.organization_members m
  where m.organization_id=finance_invoices.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')
));
create policy finance_invoices_authorized_write on public.finance_invoices
for all to authenticated using (exists (
  select 1 from public.organization_members m
  where m.organization_id=finance_invoices.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')
)) with check (exists (
  select 1 from public.organization_members m
  where m.organization_id=finance_invoices.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')
));

create policy finance_invoice_lines_authorized_select on public.finance_invoice_lines
for select to authenticated using (exists (
  select 1 from public.organization_members m
  where m.organization_id=finance_invoice_lines.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')
));
create policy finance_invoice_lines_authorized_write on public.finance_invoice_lines
for all to authenticated using (exists (
  select 1 from public.organization_members m
  where m.organization_id=finance_invoice_lines.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')
)) with check (exists (
  select 1 from public.organization_members m
  where m.organization_id=finance_invoice_lines.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')
));

create policy finance_budgets_authorized_select on public.finance_budgets
for select to authenticated using (exists (
  select 1 from public.organization_members m
  where m.organization_id=finance_budgets.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')
));
create policy finance_budgets_authorized_write on public.finance_budgets
for all to authenticated using (exists (
  select 1 from public.organization_members m
  where m.organization_id=finance_budgets.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')
)) with check (exists (
  select 1 from public.organization_members m
  where m.organization_id=finance_budgets.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')
));

comment on table public.finance_transactions is 'Operational revenue/expense ledger. Not a statutory general ledger.';
comment on column public.finance_invoices.internal_reference is 'RYTHM internal invoice reference; not a statutory invoice number.';
comment on column public.finance_invoices.official_invoice_number is 'Official invoice number returned by a compliant invoicing/accounting provider when connected.';
