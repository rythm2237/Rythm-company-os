alter table public.aiw_accounts
  add column if not exists plan_region text not null default 'INTL';

create table if not exists public.aiw_plan_catalog (
  plan_code text primary key,
  display_name text not null,
  allowed_modes text[] not null,
  allowed_prompt_profiles text[] not null,
  max_request_micros bigint not null,
  sort_order integer not null default 100,
  most_popular boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aiw_plan_prices (
  plan_code text not null references public.aiw_plan_catalog(plan_code) on delete cascade,
  region_code text not null,
  currency text not null,
  price_amount numeric(18,2) not null,
  billing_interval text not null default 'month',
  fast_token_equivalent bigint not null,
  smart_token_equivalent bigint not null,
  credit_limit_micros bigint not null,
  payment_provider text not null,
  checkout_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(plan_code,region_code),
  constraint aiw_plan_prices_positive check(price_amount>0 and fast_token_equivalent>0 and smart_token_equivalent>0 and credit_limit_micros>0)
);

alter table public.aiw_plan_catalog enable row level security;
alter table public.aiw_plan_prices enable row level security;
revoke all on public.aiw_plan_catalog from anon, authenticated;
revoke all on public.aiw_plan_prices from anon, authenticated;
grant all on public.aiw_plan_catalog to service_role;
grant all on public.aiw_plan_prices to service_role;

insert into public.aiw_plan_catalog(plan_code,display_name,allowed_modes,allowed_prompt_profiles,max_request_micros,sort_order,most_popular,active)
values
  ('starter','RYTHM AI Starter',array['fast','auto']::text[],array['normal']::text[],125000,10,false,true),
  ('pro','RYTHM AI Pro',array['fast','auto']::text[],array['normal','professional']::text[],250000,20,true,true),
  ('power','RYTHM AI Power',array['fast','auto','best']::text[],array['normal','professional']::text[],400000,30,false,true)
on conflict(plan_code) do update set
  display_name=excluded.display_name,
  allowed_modes=excluded.allowed_modes,
  allowed_prompt_profiles=excluded.allowed_prompt_profiles,
  max_request_micros=excluded.max_request_micros,
  sort_order=excluded.sort_order,
  most_popular=excluded.most_popular,
  active=excluded.active,
  updated_at=now();

insert into public.aiw_plan_prices(plan_code,region_code,currency,price_amount,billing_interval,fast_token_equivalent,smart_token_equivalent,credit_limit_micros,payment_provider,checkout_enabled)
values
  ('starter','INTL','EUR',9.90,'month',6600000,660000,3000000,'stripe',true),
  ('pro','INTL','EUR',19.90,'month',14400000,1440000,6500000,'stripe',true),
  ('power','INTL','EUR',39.90,'month',29300000,2930000,13200000,'stripe',true),
  ('starter','IR','IRR',8900000,'month',2400000,240000,1100000,'iran_local',false),
  ('pro','IR','IRR',16900000,'month',5000000,500000,2275000,'iran_local',false),
  ('power','IR','IRR',31900000,'month',9500000,950000,4320000,'iran_local',false)
on conflict(plan_code,region_code) do update set
  currency=excluded.currency,
  price_amount=excluded.price_amount,
  billing_interval=excluded.billing_interval,
  fast_token_equivalent=excluded.fast_token_equivalent,
  smart_token_equivalent=excluded.smart_token_equivalent,
  credit_limit_micros=excluded.credit_limit_micros,
  payment_provider=excluded.payment_provider,
  checkout_enabled=excluded.checkout_enabled,
  updated_at=now();

insert into public.commercial_offers(offer_code,name,category,status,audience,summary,price_label,currency,base_price,billing_interval,contact_sales,self_serve,cta_label,cta_href,features,sort_order)
values
  ('ai_workspace_starter','RYTHM AI Starter','subscription','public','Individuals who want a focused personal AI workspace with governed usage.','Fast + Smart AI modes with a shared monthly token allowance.','€9.90 / month · ≈6.6M Fast/Luna or ≈660K Smart/Terra token-equivalent','EUR',9.90,'month',false,true,'Start AI Starter','/billing','["≈6.6M Fast/Luna or ≈660K Smart/Terra token-equivalent","Fast + Smart modes","Normal mode","No rollover"]'::jsonb,5),
  ('ai_workspace_pro','RYTHM AI Pro','subscription','public','Frequent AI users who want more capacity and Professional prompt enhancement.','Higher monthly token allowance with Professional mode.','€19.90 / month · ≈14.4M Fast/Luna or ≈1.44M Smart/Terra token-equivalent','EUR',19.90,'month',false,true,'Start AI Pro','/billing','["≈14.4M Fast/Luna or ≈1.44M Smart/Terra token-equivalent","Fast + Smart modes","Normal + Professional modes","No rollover"]'::jsonb,6),
  ('ai_workspace_power','RYTHM AI Power','subscription','public','Power users who need the largest allowance and Best routing.','Largest monthly token allowance with Professional mode and Best routing.','€39.90 / month · ≈29.3M Fast/Luna or ≈2.93M Smart/Terra token-equivalent','EUR',39.90,'month',false,true,'Start AI Power','/billing','["≈29.3M Fast/Luna or ≈2.93M Smart/Terra token-equivalent","Fast + Smart + Best modes","Normal + Professional modes","No rollover"]'::jsonb,7)
on conflict(offer_code) do update set
  name=excluded.name,
  category=excluded.category,
  status=excluded.status,
  audience=excluded.audience,
  summary=excluded.summary,
  price_label=excluded.price_label,
  currency=excluded.currency,
  base_price=excluded.base_price,
  billing_interval=excluded.billing_interval,
  contact_sales=excluded.contact_sales,
  self_serve=excluded.self_serve,
  cta_label=excluded.cta_label,
  cta_href=excluded.cta_href,
  features=excluded.features,
  sort_order=excluded.sort_order,
  updated_at=now();

create or replace function public.aiw_apply_paid_plan_invoice(
  p_account uuid,
  p_wallet uuid,
  p_user uuid,
  p_subscription text,
  p_invoice text,
  p_plan_code text,
  p_region text,
  p_period_start timestamptz,
  p_period_end timestamptz
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  a public.aiw_accounts;
  w public.usage_wallets;
  c public.aiw_plan_catalog;
  pr public.aiw_plan_prices;
  inserted uuid;
  gkey text;
  trial_spend bigint:=0;
  unused_trial bigint:=0;
  old_plan text;
  old_start timestamptz;
  old_end timestamptz;
  old_limit bigint;
begin
  if p_invoice is null or p_subscription is null or p_period_end is null then return false; end if;
  select * into c from public.aiw_plan_catalog where plan_code=p_plan_code and active=true;
  if not found then return false; end if;
  select * into pr from public.aiw_plan_prices where plan_code=p_plan_code and region_code=coalesce(nullif(p_region,''),'INTL');
  if not found then return false; end if;
  select * into a from public.aiw_accounts where id=p_account and user_id=p_user for update;
  if not found then return false; end if;
  select * into w from public.usage_wallets where id=p_wallet and personal_account_id=p_account and payer_type='personal' for update;
  if not found or w.status<>'active' then return false; end if;

  old_plan:=a.plan_code;
  old_start:=a.plan_period_start;
  old_end:=a.plan_period_end;
  old_limit:=coalesce(a.plan_credit_limit_micros,0);
  gkey:='invoice:'||p_invoice;

  insert into public.aiw_plan_credit_grants(account_id,wallet_id,grant_key,grant_type,amount_micros,currency,metadata)
  values(p_account,p_wallet,gkey,p_plan_code||'_cycle',pr.credit_limit_micros,'USD',jsonb_build_object('invoice',p_invoice,'subscription',p_subscription,'plan',p_plan_code,'region',pr.region_code))
  on conflict(grant_key) do nothing returning id into inserted;

  if inserted is not null then
    if old_plan='free_trial' and old_start is not null then
      select coalesce(sum(actual_micros),0) into trial_spend
      from public.ai_usage_requests
      where wallet_id=p_wallet and status='settled' and created_at>=old_start and (old_end is null or created_at<old_end);
      unused_trial:=greatest(old_limit-trial_spend,0);
      if unused_trial>0 then
        insert into public.usage_ledger(wallet_id,transaction_type,amount_micros,currency,source,metadata,actor_user_id)
        values(p_wallet,'reconciliation',-unused_trial,'USD','ai_workspace_trial_expiry',jsonb_build_object('reason','Unused Free Trial credit expired on paid plan activation','subscription',p_subscription,'invoice',p_invoice,'trial_spend_micros',trial_spend),p_user);
      end if;
    end if;
    insert into public.usage_ledger(wallet_id,transaction_type,amount_micros,currency,source,metadata,actor_user_id)
    values(p_wallet,'purchase',pr.credit_limit_micros,'USD','ai_workspace_paid_plan',jsonb_build_object('plan',p_plan_code,'region',pr.region_code,'invoice',p_invoice,'subscription',p_subscription),p_user);
  end if;

  update public.aiw_accounts set
    plan_code=p_plan_code,
    plan_region=pr.region_code,
    plan_status='active',
    plan_period_start=coalesce(p_period_start,now()),
    plan_period_end=p_period_end,
    plan_credit_limit_micros=pr.credit_limit_micros,
    plan_request_limit=0,
    allowed_modes=c.allowed_modes,
    allowed_prompt_profiles=c.allowed_prompt_profiles,
    max_request_micros=c.max_request_micros,
    stripe_subscription_id=p_subscription,
    expires_at=null
  where id=p_account;
  return true;
end
$$;

create or replace function public.aiw_apply_paid_plan_payment_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.billing_subscriptions;
  m jsonb;
  plan_code text;
  region_code text;
  ok boolean;
begin
  if new.status<>'succeeded' or new.subscription_id is null then return new; end if;
  select * into s from public.billing_subscriptions where id=new.subscription_id;
  if not found then return new; end if;
  m:=coalesce(s.metadata,'{}'::jsonb);
  if coalesce(m->>'offer_code','') not like 'ai_workspace_%' then return new; end if;
  plan_code:=replace(m->>'offer_code','ai_workspace_','');
  region_code:=coalesce(nullif(m->>'billing_region',''),'INTL');
  if nullif(m->>'aiw_account_id','') is null or nullif(m->>'aiw_wallet_id','') is null or nullif(m->>'user_id','') is null then return new; end if;
  select public.aiw_apply_paid_plan_invoice((m->>'aiw_account_id')::uuid,(m->>'aiw_wallet_id')::uuid,(m->>'user_id')::uuid,s.provider_subscription_id,new.provider_invoice_id,plan_code,region_code,s.current_period_start,s.current_period_end) into ok;
  return new;
end
$$;

create or replace function public.aiw_sync_paid_plan_subscription_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  m jsonb;
  mapped text;
  plan_code text;
begin
  m:=coalesce(new.metadata,'{}'::jsonb);
  if coalesce(m->>'offer_code','') not like 'ai_workspace_%' or nullif(m->>'aiw_account_id','') is null then return new; end if;
  plan_code:=replace(m->>'offer_code','ai_workspace_','');
  if not exists(select 1 from public.aiw_plan_catalog where plan_code=plan_code) then return new; end if;
  mapped:=case when new.status='canceled' then 'canceled' when new.status in ('past_due','unpaid') then 'past_due' when new.status='active' then 'active' else null end;
  if mapped is not null then
    update public.aiw_accounts set plan_status=mapped,stripe_subscription_id=new.provider_subscription_id where id=(m->>'aiw_account_id')::uuid and plan_code=plan_code;
  end if;
  return new;
end
$$;

drop trigger if exists aiw_apply_starter_payment on public.billing_payments;
drop trigger if exists aiw_sync_starter_subscription on public.billing_subscriptions;
drop trigger if exists aiw_apply_paid_plan_payment on public.billing_payments;
drop trigger if exists aiw_sync_paid_plan_subscription on public.billing_subscriptions;
create trigger aiw_apply_paid_plan_payment after insert or update of status on public.billing_payments for each row execute function public.aiw_apply_paid_plan_payment_trigger();
create trigger aiw_sync_paid_plan_subscription after insert or update of status on public.billing_subscriptions for each row execute function public.aiw_sync_paid_plan_subscription_trigger();
