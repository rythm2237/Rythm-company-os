begin;

create table public.assisted_billing_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  quote_reference text not null,
  product_code text not null,
  net_amount numeric(12,2) not null check (net_amount > 0),
  currency text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  agent_limit integer,
  signed_order_reference text,
  review_reference text,
  invoice_reference text,
  vat_amount numeric(12,2) check (vat_amount >= 0),
  due_at timestamptz,
  payment_reference text unique,
  payment_id uuid references public.billing_payments(id),
  refund_reference text unique,
  state text not null default 'quoted' check (state in ('quoted','signed','approved','late','paid','void','refunded')),
  unique (organization_id, quote_reference),
  unique (organization_id, invoice_reference)
);

alter table public.assisted_billing_orders enable row level security;
revoke all on public.assisted_billing_orders from public, anon, authenticated, service_role;
grant select on public.assisted_billing_orders to authenticated;
create policy assisted_billing_platform_read on public.assisted_billing_orders
  for select to authenticated using ((select public.is_platform_admin()));

-- Preserve the tested atomic settlement primitive. Only the governed function below can call it.
revoke execute on function public.platform_confirm_company_payment_v1(uuid,text,numeric,text,timestamptz,timestamptz)
  from public, anon, authenticated, service_role;

-- Match direct billing reads to the billing page's active-owner boundary.
drop policy billing_accounts_member_read on public.billing_accounts;
drop policy billing_checkout_member_read on public.billing_checkout_sessions;
drop policy billing_payments_member_read on public.billing_payments;
drop policy billing_items_member_read on public.billing_subscription_items;
drop policy billing_subscriptions_member_read on public.billing_subscriptions;
do $$
declare
  v_table text;
begin
  foreach v_table in array array['billing_accounts','billing_subscriptions','billing_subscription_items','billing_payments','billing_checkout_sessions'] loop
    execute format(
      'create policy billing_owner_read on public.%1$I for select to authenticated using
       (exists (select 1 from public.organization_members m where m.organization_id=%1$I.organization_id
        and m.user_id=(select auth.uid()) and m.role=''owner'' and m.membership_status=''active''))', v_table);
    execute format('grant select on public.%I to authenticated', v_table);
    execute format('revoke insert,update,delete,truncate,references,trigger on public.%I from public,anon,authenticated', v_table);
  end loop;
end $$;

create function public.platform_assisted_billing_v1(
  p_organization_id uuid, p_action text, p_order_id uuid, p_details jsonb
) returns uuid
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare
  v_entitlement public.organization_entitlements;
  v_order public.assisted_billing_orders;
  v_reference text := trim(coalesce(p_details->>'reference',''));
  v_invoice text := trim(coalesce(p_details->>'invoice',''));
  v_amount numeric;
  v_start timestamptz;
  v_end timestamptz;
  v_due timestamptz;
  v_limit integer;
  v_payment_id uuid;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator required' using errcode='42501';
  end if;
  v_amount := (p_details->>'amount')::numeric;
  v_start := (p_details->>'start')::timestamptz;
  v_end := (p_details->>'end')::timestamptz;
  v_due := (p_details->>'due')::timestamptz;
  v_limit := (p_details->>'agentLimit')::integer;
  if length(v_reference) not between 3 and 160 or v_reference ~ '[[:cntrl:]]' then
    raise exception 'A valid external evidence reference is required';
  end if;
  select * into v_entitlement from public.organization_entitlements where organization_id=p_organization_id for update;
  if not found or v_entitlement.product_code not in ('ready_company','company_studio')
    or v_entitlement.billing_interval <> 'month' then
    raise exception 'Unsupported company entitlement';
  end if;
  if p_action not in ('refund','offboard') and v_entitlement.status='cancelled' then
    raise exception 'Company is offboarded';
  end if;

  if p_action in ('sign','approve','late','settle','refund','void') then
    select * into v_order from public.assisted_billing_orders
      where id=p_order_id and organization_id=p_organization_id for update;
    if not found then raise exception 'Order unavailable for this company'; end if;
  end if;

  case p_action
    when 'quote' then
      if not exists(select 1 from public.organizations where id=p_organization_id and status='approved') then
        raise exception 'An approved company is required';
      end if;
      if v_start is null or v_end is null or v_end <= greatest(v_start, now())
        or not isfinite(v_start) or not isfinite(v_end) or v_end > v_start + interval '1 month 1 day'
        or v_amount is null or (v_limit is null and v_amount < v_entitlement.base_price)
        or (v_limit is not null and v_amount > v_entitlement.base_price)
        or v_amount <= 0 or v_amount > 9999999999.99 or v_amount <> round(v_amount,2)
        or (v_limit is not null and (v_limit < 1 or v_limit >= v_entitlement.max_active_agents)) then
        raise exception 'Invalid quote price, period or reduced agent limit';
      end if;
      insert into public.assisted_billing_orders
        (organization_id, quote_reference, product_code, net_amount, currency, period_start, period_end, agent_limit)
      values (p_organization_id,v_reference,v_entitlement.product_code,v_amount,upper(v_entitlement.currency),v_start,v_end,v_limit)
      returning * into v_order;
    when 'sign' then
      if v_order.state <> 'quoted' then raise exception 'A recorded quote is required'; end if;
      update public.assisted_billing_orders set state='signed', signed_order_reference=v_reference where id=v_order.id;
    when 'approve' then
      if v_order.state <> 'signed' then raise exception 'A signed order is required'; end if;
      if length(v_invoice) not between 3 and 160 or v_invoice ~ '[[:cntrl:]]'
        or v_due is null or not isfinite(v_due) or v_amount is null or v_amount < 0 or v_amount > 9999999999.99 - v_order.net_amount
        or v_amount <> round(v_amount,2) then
        raise exception 'Reviewed invoice, VAT total and due date are required';
      end if;
      if exists(select 1 from public.billing_payments where organization_id=p_organization_id
        and provider='manual' and provider_invoice_id=v_invoice) then
        raise exception 'Invoice already has a payment';
      end if;
      update public.assisted_billing_orders set state='approved', review_reference=v_reference,
        invoice_reference=v_invoice, vat_amount=v_amount, due_at=v_due where id=v_order.id;
    when 'late' then
      if v_order.state <> 'approved' or v_order.due_at > now() then
        raise exception 'An overdue approved invoice is required';
      end if;
      update public.assisted_billing_orders set state='late' where id=v_order.id;
      update public.billing_subscriptions set status='past_due', updated_at=now()
        where organization_id=p_organization_id and provider='manual' and status='active' and current_period_end <= now();
    when 'settle' then
      if v_order.vat_amount is null or v_amount is null or v_amount <> v_order.net_amount + v_order.vat_amount
        or upper(trim(coalesce(p_details->>'currency',''))) <> v_order.currency then
        raise exception 'Confirmed receipt must match the reviewed invoice gross amount and currency';
      end if;
      if v_order.state = 'paid' and v_order.payment_reference = v_reference then return v_order.id; end if;
      if v_order.state not in ('approved','late') or v_order.product_code <> v_entitlement.product_code
        or upper(v_entitlement.currency) <> v_order.currency
        or (v_order.agent_limit is null and v_order.net_amount < v_entitlement.base_price)
        or (v_order.agent_limit is not null and (v_order.agent_limit >= v_entitlement.max_active_agents
          or v_order.net_amount > v_entitlement.base_price)) then
        raise exception 'An approved unpaid order matching the current entitlement is required';
      end if;
      if v_order.agent_limit is not null and (select count(*) from public.agents
        where organization_id=p_organization_id and agent_status<>'archived') > v_order.agent_limit then
        raise exception 'Archive surplus agents with the company owner before applying the reduced limit';
      end if;
      if v_order.agent_limit is not null then
        update public.organization_entitlements set max_active_agents=v_order.agent_limit,base_price=v_order.net_amount
          where organization_id=p_organization_id;
      end if;
      v_payment_id := (public.platform_confirm_company_payment_v1(
        p_organization_id,v_order.invoice_reference,v_amount,v_order.currency,v_order.period_start,v_order.period_end
      )->>'payment_id')::uuid;
      update public.assisted_billing_orders set state='paid', payment_reference=v_reference, payment_id=v_payment_id where id=v_order.id;
      update public.billing_subscriptions set cancel_at_period_end=false,canceled_at=null
        where organization_id=p_organization_id and provider='manual';
    when 'void' then
      if v_order.state not in ('quoted','signed','approved','late') then
        raise exception 'Only an unpaid order can be voided';
      end if;
      update public.assisted_billing_orders set state='void' where id=v_order.id;
    when 'cancel' then
      update public.billing_subscriptions set cancel_at_period_end=true,updated_at=now()
        where organization_id=p_organization_id and provider='manual' and status in ('active','past_due')
          and not cancel_at_period_end;
      if not found then raise exception 'No eligible assisted subscription'; end if;
      update public.assisted_billing_orders set state='void' where organization_id=p_organization_id
        and state in ('quoted','signed','approved','late');
    when 'refund' then
      if v_amount is null or v_amount <> v_order.net_amount + v_order.vat_amount or v_order.vat_amount is null
        or upper(trim(coalesce(p_details->>'currency',''))) <> v_order.currency then
        raise exception 'Refund must match the original gross payment and currency';
      end if;
      if v_order.state='refunded' and v_order.refund_reference=v_reference then return v_order.id; end if;
      if v_order.state <> 'paid' then raise exception 'A paid order is required'; end if;
      update public.billing_payments set refunded_amount=amount,status='refunded',updated_at=now()
        where id=v_order.payment_id and organization_id=p_organization_id and provider='manual' and status='succeeded';
      if not found then raise exception 'Payment unavailable for refund'; end if;
      update public.assisted_billing_orders set state='refunded',refund_reference=v_reference where id=v_order.id;
      update public.billing_subscriptions set status='canceled', canceled_at=now(),updated_at=now()
        where organization_id=p_organization_id and provider='manual' and latest_provider_invoice_id=v_order.invoice_reference;
      if found and v_entitlement.status <> 'cancelled' then
        update public.organization_entitlements set status='expired', ends_at=least(ends_at,now()),renews_at=null,updated_at=now()
          where organization_id=p_organization_id;
      end if;
    when 'offboard' then
      if v_entitlement.status='cancelled' then raise exception 'Company is already offboarded'; end if;
      if exists(select 1 from public.billing_subscriptions where organization_id=p_organization_id and provider<>'manual'
        and status in ('active','trialing','past_due','unpaid')) then
        raise exception 'Existing provider subscription requires billing review';
      end if;
      update public.assisted_billing_orders set state='void' where organization_id=p_organization_id
        and state in ('quoted','signed','approved','late');
      update public.billing_subscriptions set status='canceled',cancel_at_period_end=false,canceled_at=now(),updated_at=now()
        where organization_id=p_organization_id and provider='manual' and status <> 'canceled';
      update public.organization_entitlements set status='cancelled',ends_at=least(ends_at,now()),renews_at=null,updated_at=now()
        where organization_id=p_organization_id;
    else raise exception 'Unsupported billing action';
  end case;

  insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
    values(p_organization_id,'user',auth.uid(),'billing.assisted.'||p_action,
      case when v_order.id is null then 'organization' else 'assisted_billing_order' end,
      coalesce(v_order.id,p_organization_id)::text,'high',jsonb_build_object('reference',v_reference));
  return v_order.id;
end $$;

revoke all on function public.platform_assisted_billing_v1(uuid,text,uuid,jsonb) from public,anon,service_role;
grant execute on function public.platform_assisted_billing_v1(uuid,text,uuid,jsonb) to authenticated;

commit;
