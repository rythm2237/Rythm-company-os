alter table public.aiw_accounts
  add column if not exists plan_code text,
  add column if not exists plan_status text,
  add column if not exists plan_period_start timestamptz,
  add column if not exists plan_period_end timestamptz,
  add column if not exists plan_credit_limit_micros bigint,
  add column if not exists plan_request_limit integer,
  add column if not exists stripe_subscription_id text;

alter table public.aiw_accounts drop constraint if exists aiw_accounts_plan_code_check;
alter table public.aiw_accounts add constraint aiw_accounts_plan_code_check check (plan_code is null or plan_code in ('free_trial','starter'));
alter table public.aiw_accounts drop constraint if exists aiw_accounts_plan_status_check;
alter table public.aiw_accounts add constraint aiw_accounts_plan_status_check check (plan_status is null or plan_status in ('active','expired','canceled','past_due'));
alter table public.aiw_accounts drop constraint if exists aiw_accounts_plan_credit_limit_check;
alter table public.aiw_accounts add constraint aiw_accounts_plan_credit_limit_check check (plan_credit_limit_micros is null or plan_credit_limit_micros between 0 and 1000000000);
alter table public.aiw_accounts drop constraint if exists aiw_accounts_plan_request_limit_check;
alter table public.aiw_accounts add constraint aiw_accounts_plan_request_limit_check check (plan_request_limit is null or plan_request_limit between 0 and 100000);

create table if not exists public.aiw_plan_credit_grants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.aiw_accounts(id) on delete cascade,
  wallet_id uuid not null references public.usage_wallets(id) on delete cascade,
  grant_key text not null unique,
  grant_type text not null check (grant_type in ('free_trial','starter_cycle')),
  amount_micros bigint not null check (amount_micros > 0),
  currency text not null default 'USD',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.aiw_plan_credit_grants enable row level security;
revoke all on public.aiw_plan_credit_grants from anon, authenticated;
grant all on public.aiw_plan_credit_grants to service_role;

create or replace function public.aiw_activate_free_trial(p_account uuid,p_wallet uuid,p_user uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare a public.aiw_accounts; w public.usage_wallets; inserted uuid;
begin
  select * into a from public.aiw_accounts where id=p_account and user_id=p_user for update;
  if not found then return false; end if;
  select * into w from public.usage_wallets where id=p_wallet and personal_account_id=p_account and payer_type='personal' for update;
  if not found or w.status<>'active' then return false; end if;
  if a.plan_code is not null then return true; end if;
  update public.aiw_accounts set
    plan_code='free_trial', plan_status='active', plan_period_start=now(), plan_period_end=now()+interval '7 days',
    plan_credit_limit_micros=50000, plan_request_limit=15,
    allowed_modes=array['fast']::text[], allowed_prompt_profiles=array['normal']::text[],
    max_request_micros=10000
  where id=p_account;
  insert into public.aiw_plan_credit_grants(account_id,wallet_id,grant_key,grant_type,amount_micros,currency,metadata)
  values(p_account,p_wallet,'trial:'||p_account::text,'free_trial',50000,'USD',jsonb_build_object('expires_in_days',7,'request_limit',15))
  on conflict(grant_key) do nothing returning id into inserted;
  if inserted is not null then
    insert into public.usage_ledger(wallet_id,transaction_type,amount_micros,currency,source,metadata,actor_user_id)
    values(p_wallet,'promo_credit',50000,'USD','ai_workspace_free_trial',jsonb_build_object('plan','free_trial','grant_key','trial:'||p_account::text),p_user);
  end if;
  return true;
end $function$;
revoke all on function public.aiw_activate_free_trial(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.aiw_activate_free_trial(uuid,uuid,uuid) to service_role;

create or replace function public.aiw_apply_starter_invoice(p_account uuid,p_wallet uuid,p_user uuid,p_subscription text,p_invoice text,p_period_start timestamptz,p_period_end timestamptz)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare a public.aiw_accounts; w public.usage_wallets; inserted uuid; gkey text;
begin
  if p_invoice is null or p_subscription is null or p_period_end is null then return false; end if;
  select * into a from public.aiw_accounts where id=p_account and user_id=p_user for update;
  if not found then return false; end if;
  select * into w from public.usage_wallets where id=p_wallet and personal_account_id=p_account and payer_type='personal' for update;
  if not found or w.status<>'active' then return false; end if;
  gkey:='stripe_invoice:'||p_invoice;
  insert into public.aiw_plan_credit_grants(account_id,wallet_id,grant_key,grant_type,amount_micros,currency,metadata)
  values(p_account,p_wallet,gkey,'starter_cycle',3000000,'USD',jsonb_build_object('invoice',p_invoice,'subscription',p_subscription))
  on conflict(grant_key) do nothing returning id into inserted;
  if inserted is not null then
    insert into public.usage_ledger(wallet_id,transaction_type,amount_micros,currency,source,metadata,actor_user_id)
    values(p_wallet,'purchase',3000000,'USD','stripe_ai_starter',jsonb_build_object('plan','starter','invoice',p_invoice,'subscription',p_subscription),p_user);
  end if;
  update public.aiw_accounts set
    plan_code='starter', plan_status='active', plan_period_start=coalesce(p_period_start,now()), plan_period_end=p_period_end,
    plan_credit_limit_micros=3000000, plan_request_limit=0,
    allowed_modes=array['fast','auto']::text[], allowed_prompt_profiles=array['normal']::text[],
    max_request_micros=125000, stripe_subscription_id=p_subscription, expires_at=null
  where id=p_account;
  return true;
end $function$;
revoke all on function public.aiw_apply_starter_invoice(uuid,uuid,uuid,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.aiw_apply_starter_invoice(uuid,uuid,uuid,text,text,timestamptz,timestamptz) to service_role;

create or replace function public.aiw_reserve_usage(p_wallet uuid,p_workspace uuid,p_request uuid,p_idempotency text,p_amount bigint,p_kind text,p_mode text,p_profile text,p_user uuid default null,p_organization uuid default null,p_agent uuid default null,p_conversation uuid default null,p_client_request_key text default null)
returns boolean language plpgsql set search_path=''
as $function$
declare w public.usage_wallets; account public.aiw_accounts; posted bigint; pending bigint; daily_spend bigint; monthly_spend bigint; plan_spend bigint; plan_pending bigint; plan_requests bigint;
begin
  if p_amount<=0 or length(p_idempotency)>240 or (p_client_request_key is not null and length(p_client_request_key)>120) then return false; end if;
  select * into w from public.usage_wallets where id=p_wallet for update;
  if not found or w.status<>'active' then return false; end if;
  if exists(select 1 from public.ai_usage_requests where idempotency_key=p_idempotency or id=p_request) then return false; end if;
  select coalesce(sum(amount_micros),0) into posted from public.usage_ledger where wallet_id=p_wallet;
  select coalesce(sum(reserved_micros),0) into pending from public.ai_usage_requests where wallet_id=p_wallet and status in ('reserved','provider_started','uncertain');
  if posted-pending<p_amount then return false; end if;
  if w.personal_account_id is not null then
    select * into account from public.aiw_accounts where id=w.personal_account_id for update;
    if not found or account.status<>'active' or (account.expires_at is not null and account.expires_at<=now()) or p_amount>account.max_request_micros then return false; end if;
    if account.plan_code is not null then
      if account.plan_status<>'active' or account.plan_period_end is null or account.plan_period_end<=now() then return false; end if;
      if not (p_mode=any(account.allowed_modes)) or not (p_profile=any(account.allowed_prompt_profiles)) then return false; end if;
      select coalesce(sum(actual_micros),0) into plan_spend from public.ai_usage_requests where wallet_id=p_wallet and status='settled' and created_at>=account.plan_period_start and created_at<account.plan_period_end;
      select coalesce(sum(reserved_micros),0) into plan_pending from public.ai_usage_requests where wallet_id=p_wallet and status in ('reserved','provider_started','uncertain') and created_at>=account.plan_period_start and created_at<account.plan_period_end;
      if coalesce(account.plan_credit_limit_micros,0)>0 and plan_spend+plan_pending+p_amount>account.plan_credit_limit_micros then return false; end if;
      if p_kind='answer' and coalesce(account.plan_request_limit,0)>0 then
        select count(*) into plan_requests from public.ai_usage_requests where wallet_id=p_wallet and request_kind='answer' and status<>'released' and created_at>=account.plan_period_start and created_at<account.plan_period_end;
        if plan_requests>=account.plan_request_limit then return false; end if;
      end if;
    end if;
    select coalesce(-sum(amount_micros),0) into daily_spend from public.usage_ledger where wallet_id=p_wallet and transaction_type='ai_usage_debit' and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
    select coalesce(-sum(amount_micros),0) into monthly_spend from public.usage_ledger where wallet_id=p_wallet and transaction_type='ai_usage_debit' and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
    if account.daily_limit_micros>0 and daily_spend+pending+p_amount>account.daily_limit_micros then return false; end if;
    if account.monthly_limit_micros>0 and monthly_spend+pending+p_amount>account.monthly_limit_micros then return false; end if;
  end if;
  insert into public.ai_usage_requests(id,wallet_id,workspace_id,organization_id,user_id,agent_id,conversation_id,request_kind,routing_mode,prompt_profile,reserved_micros,status,idempotency_key,client_request_key)
  values(p_request,p_wallet,p_workspace,p_organization,p_user,p_agent,p_conversation,p_kind,p_mode,p_profile,p_amount,'reserved',p_idempotency,p_client_request_key);
  return true;
exception when unique_violation then return false;
end $function$;
