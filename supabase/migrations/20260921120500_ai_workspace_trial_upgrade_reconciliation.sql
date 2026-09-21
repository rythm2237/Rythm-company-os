create or replace function public.aiw_apply_starter_invoice(p_account uuid,p_wallet uuid,p_user uuid,p_subscription text,p_invoice text,p_period_start timestamptz,p_period_end timestamptz)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  a public.aiw_accounts;
  w public.usage_wallets;
  inserted uuid;
  gkey text;
  trial_spend bigint:=0;
  unused_trial bigint:=0;
  old_plan text;
  old_start timestamptz;
  old_end timestamptz;
begin
  if p_invoice is null or p_subscription is null or p_period_end is null then return false; end if;
  select * into a from public.aiw_accounts where id=p_account and user_id=p_user for update;
  if not found then return false; end if;
  select * into w from public.usage_wallets where id=p_wallet and personal_account_id=p_account and payer_type='personal' for update;
  if not found or w.status<>'active' then return false; end if;

  old_plan:=a.plan_code;
  old_start:=a.plan_period_start;
  old_end:=a.plan_period_end;
  gkey:='stripe_invoice:'||p_invoice;

  insert into public.aiw_plan_credit_grants(account_id,wallet_id,grant_key,grant_type,amount_micros,currency,metadata)
  values(p_account,p_wallet,gkey,'starter_cycle',3000000,'USD',jsonb_build_object('invoice',p_invoice,'subscription',p_subscription))
  on conflict(grant_key) do nothing returning id into inserted;

  if inserted is not null then
    if old_plan='free_trial' and old_start is not null then
      select coalesce(sum(actual_micros),0) into trial_spend
      from public.ai_usage_requests
      where wallet_id=p_wallet and status='settled' and created_at>=old_start and (old_end is null or created_at<old_end);
      unused_trial:=greatest(50000-trial_spend,0);
      if unused_trial>0 then
        insert into public.usage_ledger(wallet_id,transaction_type,amount_micros,currency,source,metadata,actor_user_id)
        values(p_wallet,'reconciliation',-unused_trial,'USD','ai_workspace_trial_expiry',jsonb_build_object('reason','Unused Free Trial credit expired on Starter activation','subscription',p_subscription,'invoice',p_invoice,'trial_spend_micros',trial_spend),p_user);
      end if;
    end if;
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
