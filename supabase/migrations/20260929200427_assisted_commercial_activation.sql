begin;
-- Signup reserves a company; self_serve means payment checkout, not signup.
update public.commercial_offers set self_serve=false,contact_sales=true,
 cta_label=case offer_code
  when 'ready_ai_company' then 'Request Ready Company activation'
  when 'custom_ai_company' then 'Request Custom Company activation'
  else 'Ask about paid plan availability' end,
 cta_href=case when offer_code like 'ai_workspace_%'
  then '/contact?topic=activation&offer=' || offer_code else cta_href end,
 updated_at=now()
where offer_code in ('ready_ai_company','custom_ai_company','ai_workspace_starter','ai_workspace_pro','ai_workspace_power');
update public.aiw_plan_prices set checkout_enabled=false where checkout_enabled;

-- Provider identifiers and checkout status are trusted infrastructure records.
drop policy if exists billing_accounts_admin_write on public.billing_accounts;
drop policy if exists billing_checkout_admin_access on public.billing_checkout_sessions;
create policy billing_checkout_member_read on public.billing_checkout_sessions for select to authenticated
 using(exists(select 1 from public.organization_members m where m.organization_id=billing_checkout_sessions.organization_id and m.user_id=auth.uid() and m.membership_status='active'));
revoke insert,update,delete,truncate,references,trigger on public.billing_accounts,public.billing_checkout_sessions from public,anon,authenticated;

alter table public.billing_payments add column if not exists confirmation_details jsonb not null default '{}'::jsonb;
create unique index if not exists billing_manual_invoice_reference_unique
 on public.billing_payments(organization_id,provider_invoice_id) where provider='manual';

-- Allowlisted platform authority may attest a verified external invoice/payment.
-- Company owners, tenant admins, anon and service credentials without an admin
-- identity cannot attest. Payment, service period, entitlement and audit commit
-- together or roll back together. No personal AI credit is granted here.
create or replace function public.platform_confirm_company_payment_v1(
 p_organization_id uuid, p_invoice_reference text, p_amount numeric,
 p_currency text, p_period_start timestamptz, p_period_end timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_e public.organization_entitlements;
 v_payment public.billing_payments;
 v_subscription_id uuid;
 v_reference text := trim(coalesce(p_invoice_reference,''));
 v_currency text := upper(trim(coalesce(p_currency,'')));
 v_offer text;
 v_details jsonb;
begin
 if auth.uid() is null or not public.is_platform_admin() then
  raise exception 'Platform administrator required' using errcode='42501';
 end if;
 if length(v_reference)<3 or length(v_reference)>160 or v_reference ~ '[[:cntrl:]]' then
  raise exception 'A valid confirmed invoice/payment reference is required';
 end if;
 if p_amount is null or p_amount<=0 or p_amount>9999999999.99 or p_amount<>round(p_amount,2) or v_currency !~ '^[A-Z]{3}$' then
  raise exception 'Invalid payment amount or currency';
 end if;
 if p_period_start is null or p_period_end is null or p_period_start>now() or p_period_end<=now() or p_period_end<=p_period_start
  or p_period_end>p_period_start + interval '1 month 1 day' then
  raise exception 'Confirm one current monthly service period';
 end if;
 select * into v_e from public.organization_entitlements where organization_id=p_organization_id for update;
 if not found or v_e.product_code not in ('ready_company','company_studio') or v_e.billing_interval<>'month'
  or v_e.status not in ('pending','active','past_due','expired') then
  raise exception 'This company is not eligible for invoice activation';
 end if;
 if not exists(select 1 from public.organizations where id=p_organization_id and status='approved') then
  raise exception 'An approved company is required';
 end if;
 if v_e.base_price is null or p_amount<v_e.base_price or v_currency<>upper(v_e.currency) then
  raise exception 'Payment must cover the recorded subscription price in its currency';
 end if;
 v_offer := case v_e.product_code when 'ready_company' then 'ready_ai_company' else 'custom_ai_company' end;
 v_details := jsonb_build_object('product_code',v_e.product_code,'period_start',p_period_start,'period_end',p_period_end);
 select * into v_payment from public.billing_payments
  where organization_id=p_organization_id and provider='manual' and provider_invoice_id=v_reference;
 if found then
  if v_payment.status<>'succeeded' or v_payment.amount<>p_amount or v_payment.currency<>v_currency or v_payment.confirmation_details<>v_details then
   raise exception 'Invoice reference was already recorded with different details';
  end if;
  return jsonb_build_object('payment_id',v_payment.id,'already_recorded',true);
 end if;
 if exists(select 1 from public.billing_subscriptions where organization_id=p_organization_id and provider<>'manual'
  and status in ('active','trialing','past_due','unpaid')) then
  raise exception 'Existing provider subscription requires billing review';
 end if;
 if exists(select 1 from public.billing_subscriptions where organization_id=p_organization_id and provider='manual'
  and (current_period_end>=p_period_end or current_period_end>p_period_start)) then
  raise exception 'A confirmed service period cannot be shortened or charged twice';
 end if;
 insert into public.billing_subscriptions(organization_id,provider,provider_subscription_id,status,currency,current_period_start,current_period_end,latest_provider_invoice_id,metadata)
 values(p_organization_id,'manual','manual:company:'||p_organization_id::text,'active',v_currency,p_period_start,p_period_end,v_reference,
  jsonb_build_object('offer_code',v_offer,'activation_model','assisted'))
 on conflict(provider_subscription_id) do update set status='active',currency=excluded.currency,
 current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,
 latest_provider_invoice_id=excluded.latest_provider_invoice_id,metadata=excluded.metadata,updated_at=now()
 returning id into v_subscription_id;
 insert into public.billing_payments(organization_id,subscription_id,provider,provider_invoice_id,amount,currency,status,paid_at,confirmation_details)
 values(p_organization_id,v_subscription_id,'manual',v_reference,p_amount,v_currency,'succeeded',now(),v_details)
 returning * into v_payment;
 update public.organization_entitlements set status='active',starts_at=p_period_start,renews_at=p_period_end,ends_at=p_period_end,updated_at=now()
 where organization_id=p_organization_id;
 insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
 values(p_organization_id,'user',auth.uid(),'billing.manual_payment_confirmed','billing_payment',v_payment.id::text,'high',
  v_details || jsonb_build_object('invoice_reference',v_reference,'amount',p_amount,'currency',v_currency,'subscription_id',v_subscription_id));
 return jsonb_build_object('payment_id',v_payment.id,'already_recorded',false);
end $$;
revoke all on function public.platform_confirm_company_payment_v1(uuid,text,numeric,text,timestamptz,timestamptz) from public,anon,service_role;
grant execute on function public.platform_confirm_company_payment_v1(uuid,text,numeric,text,timestamptz,timestamptz) to authenticated;
comment on function public.platform_confirm_company_payment_v1(uuid,text,numeric,text,timestamptz,timestamptz) is 'Allowlisted platform-admin attestation of a verified external payment. Atomic company activation; does not grant personal AI credits.';
commit;
