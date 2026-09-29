-- Persist the advertised template choice on the organization entitlement.
-- Keep the legacy provisioning function for trusted infrastructure only; the
-- customer entrypoint below enforces the public offer and plan atomically.
alter table public.organization_entitlements
  add column if not exists selected_template_key text;

create or replace function public.provision_commercial_company_v1(
  target_company_name text,
  target_product_code text,
  target_template_key text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_template_key text := nullif(trim(coalesce(target_template_key, '')), '');
  v_product_code text := trim(coalesce(target_product_code, ''));
  v_offer_code text;
  v_offer public.commercial_offers%rowtype;
  v_template public.company_templates%rowtype;
  v_org_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_product_code not in ('ready_company', 'company_studio') then
    raise exception 'Unsupported public commercial product';
  end if;
  if v_template_key is not null then
    if v_template_key = 'ready_ai_advertising_agency_v1' then
      v_offer_code := 'ready_ai_company';
    elsif v_template_key = 'ready_software_company_v1' then
      v_offer_code := 'custom_ai_company';
    else
      raise exception 'Template is not available for public commercial selection';
    end if;
  else
    v_offer_code := case v_product_code when 'ready_company' then 'ready_ai_company' else 'custom_ai_company' end;
  end if;

  select * into v_offer from public.commercial_offers
  where offer_code = v_offer_code and status = 'public' and category = 'subscription';
  if v_offer.offer_code is null or v_offer.entitlement_product_code is distinct from v_product_code
    or v_offer.base_price is null or v_offer.billing_interval <> 'month' then
    raise exception 'Selected product does not match the public commercial offer';
  end if;

  if v_template_key is not null then
    select * into v_template from public.company_templates
    where template_key = v_template_key and version = '1.0' and status = 'active' and maturity = 'stable';
    if v_template.id is null or not (v_product_code = any(v_template.supported_product_codes)) then
      raise exception 'Selected template is unavailable for this product';
    end if;
    if cardinality(v_template.agent_template_refs) + 1 >
      (case v_product_code when 'ready_company' then 12 else 50 end) then
      raise exception 'Selected product has insufficient Agent capacity';
    end if;
  end if;

  v_org_id := public.provision_customer_organization(target_company_name, v_product_code, 'public_beta');
  update public.organization_entitlements
  set selected_template_key = v_template_key,
      base_price = v_offer.base_price,
      currency = v_offer.currency,
      billing_interval = v_offer.billing_interval,
      max_active_agents = case v_product_code when 'ready_company' then 12 else 50 end,
      updated_at = now()
  where organization_id = v_org_id and product_code = v_product_code and plan_code = 'public_beta';
  if not found then raise exception 'Commercial entitlement was not created'; end if;
  return v_org_id;
end;
$$;

revoke all on function public.provision_commercial_company_v1(text,text,text) from public, anon, authenticated;
grant execute on function public.provision_commercial_company_v1(text,text,text) to authenticated, service_role;
revoke execute on function public.provision_customer_organization(text,text,text) from authenticated;
grant execute on function public.provision_customer_organization(text,text,text) to service_role;

-- Existing organizations retain their negotiated capacity. New customer shells
-- receive twelve slots, enough for the eleven-role Agency plus communications.
