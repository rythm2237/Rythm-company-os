insert into public.commercial_offers(offer_code,name,category,status,audience,summary,price_label,currency,base_price,billing_interval,contact_sales,self_serve,cta_label,cta_href,features,sort_order,updated_at)
values('ai_workspace_starter','RYTHM AI Starter','subscription','public','Individuals who want a focused personal AI workspace with governed usage.','$3 monthly RYTHM AI credit, Fast + Smart modes, Projects, Memory and Knowledge. Professional Mode is not included.','€9.90 / month','EUR',9.90,'month',false,true,'Start AI Starter','/billing',jsonb_build_array('$3 AI credit each billing cycle','Fast (Luna) mode','Smart (Auto) mode','Projects, Memory and Knowledge','No credit rollover','Professional Mode not included'),5,now())
on conflict(offer_code) do update set name=excluded.name,category=excluded.category,status=excluded.status,audience=excluded.audience,summary=excluded.summary,price_label=excluded.price_label,currency=excluded.currency,base_price=excluded.base_price,billing_interval=excluded.billing_interval,contact_sales=excluded.contact_sales,self_serve=excluded.self_serve,cta_label=excluded.cta_label,cta_href=excluded.cta_href,features=excluded.features,sort_order=excluded.sort_order,updated_at=now();

create or replace function public.aiw_reserve_usage(p_wallet uuid,p_workspace uuid,p_request uuid,p_idempotency text,p_amount bigint,p_kind text,p_mode text,p_profile text,p_user uuid default null,p_organization uuid default null,p_agent uuid default null,p_conversation uuid default null,p_client_request_key text default null)
returns boolean language plpgsql set search_path=''
as $function$
declare w public.usage_wallets; account public.aiw_accounts; posted bigint; pending bigint; daily_spend bigint; monthly_spend bigint; plan_spend bigint; plan_pending bigint; plan_requests bigint;
begin
  if p_amount<=0 or length(p_idempotency)>240 or (p_client_request_key is not null and length(p_client_request_key)>120) then return false; end if;
  select * into w from public.usage_wallets where id=p_wallet for update;
  if not found or w.status<>'active' then return false; end if;
  if exists(select 1 from public.ai_usage_requests where idempotency_key=p_idempotency or id=p_request) then return false; end if;
  if w.personal_account_id is not null then
    select * into account from public.aiw_accounts where id=w.personal_account_id for update;
    if not found or account.status<>'active' or (account.expires_at is not null and account.expires_at<=now()) then return false; end if;
    if account.plan_code='free_trial' and p_kind='answer' then p_amount:=least(p_amount,10000); end if;
    if p_amount>account.max_request_micros then return false; end if;
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
  end if;
  select coalesce(sum(amount_micros),0) into posted from public.usage_ledger where wallet_id=p_wallet;
  select coalesce(sum(reserved_micros),0) into pending from public.ai_usage_requests where wallet_id=p_wallet and status in ('reserved','provider_started','uncertain');
  if posted-pending<p_amount then return false; end if;
  if w.personal_account_id is not null then
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

create or replace function public.aiw_apply_starter_payment_trigger()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare s public.billing_subscriptions; m jsonb; ok boolean;
begin
  if new.status<>'succeeded' or new.subscription_id is null then return new; end if;
  select * into s from public.billing_subscriptions where id=new.subscription_id;
  if not found then return new; end if;
  m:=coalesce(s.metadata,'{}'::jsonb);
  if m->>'offer_code'<>'ai_workspace_starter' then return new; end if;
  if nullif(m->>'aiw_account_id','') is null or nullif(m->>'aiw_wallet_id','') is null or nullif(m->>'user_id','') is null then return new; end if;
  select public.aiw_apply_starter_invoice((m->>'aiw_account_id')::uuid,(m->>'aiw_wallet_id')::uuid,(m->>'user_id')::uuid,s.provider_subscription_id,new.provider_invoice_id,s.current_period_start,s.current_period_end) into ok;
  return new;
end $function$;

drop trigger if exists aiw_apply_starter_payment on public.billing_payments;
create trigger aiw_apply_starter_payment after insert or update of status on public.billing_payments for each row execute function public.aiw_apply_starter_payment_trigger();

create or replace function public.aiw_sync_starter_subscription_trigger()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare m jsonb; mapped text;
begin
  m:=coalesce(new.metadata,'{}'::jsonb);
  if m->>'offer_code'<>'ai_workspace_starter' or nullif(m->>'aiw_account_id','') is null then return new; end if;
  mapped:=case when new.status='canceled' then 'canceled' when new.status in ('past_due','unpaid') then 'past_due' when new.status='active' then 'active' else null end;
  if mapped is not null then update public.aiw_accounts set plan_status=mapped,stripe_subscription_id=new.provider_subscription_id where id=(m->>'aiw_account_id')::uuid and plan_code='starter'; end if;
  return new;
end $function$;

drop trigger if exists aiw_sync_starter_subscription on public.billing_subscriptions;
create trigger aiw_sync_starter_subscription after insert or update of status on public.billing_subscriptions for each row execute function public.aiw_sync_starter_subscription_trigger();
