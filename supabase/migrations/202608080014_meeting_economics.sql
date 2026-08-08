-- Batch 2.5 — Meeting Economics & Cost Visibility
-- Business/customer currency is EUR. Provider reconciliation remains USD.

alter table public.meeting_agent_sessions
  add column if not exists accounting_usd_to_eur numeric(12,6),
  add column if not exists ai_budget_eur numeric(12,2),
  add column if not exists customer_price_eur numeric(12,2),
  add column if not exists pricing_basis text;

update public.meeting_agent_sessions
set
  accounting_usd_to_eur = coalesce(accounting_usd_to_eur, 0.878735),
  ai_budget_eur = coalesce(ai_budget_eur, round((budget_cap_usd * 0.878735)::numeric, 2)),
  customer_price_eur = coalesce(customer_price_eur, 19.00),
  pricing_basis = coalesce(pricing_basis, 'internal_mvp_hypothesis')
where accounting_usd_to_eur is null
   or ai_budget_eur is null
   or customer_price_eur is null
   or pricing_basis is null;

alter table public.meeting_agent_sessions
  alter column accounting_usd_to_eur set default 0.878735,
  alter column accounting_usd_to_eur set not null,
  alter column ai_budget_eur set default 1.32,
  alter column ai_budget_eur set not null,
  alter column customer_price_eur set default 19.00,
  alter column customer_price_eur set not null,
  alter column pricing_basis set default 'internal_mvp_hypothesis',
  alter column pricing_basis set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'meeting_agent_sessions_accounting_fx_positive'
  ) then
    alter table public.meeting_agent_sessions
      add constraint meeting_agent_sessions_accounting_fx_positive
      check (accounting_usd_to_eur > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'meeting_agent_sessions_ai_budget_eur_nonnegative'
  ) then
    alter table public.meeting_agent_sessions
      add constraint meeting_agent_sessions_ai_budget_eur_nonnegative
      check (ai_budget_eur >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'meeting_agent_sessions_customer_price_eur_nonnegative'
  ) then
    alter table public.meeting_agent_sessions
      add constraint meeting_agent_sessions_customer_price_eur_nonnegative
      check (customer_price_eur >= 0);
  end if;
end $$;

comment on column public.meeting_agent_sessions.accounting_usd_to_eur is
  'Accounting snapshot used to convert internal provider USD cost to business-facing EUR. Historical sessions retain their snapshot.';
comment on column public.meeting_agent_sessions.ai_budget_eur is
  'Business-facing AI budget in EUR for this meeting session.';
comment on column public.meeting_agent_sessions.customer_price_eur is
  'Internal commercial price hypothesis in EUR; not a billing or checkout commitment.';
comment on column public.meeting_agent_sessions.pricing_basis is
  'Provenance/meaning of customer_price_eur, e.g. internal_mvp_hypothesis.';
