-- RYTHM Commercial Day 2 — corrective migration for customer provisioning
--
-- organizations.status uses public.rythm_record_status, whose valid lifecycle values are
-- draft, review, approved, rejected, archived. The initial commercial provisioning RPC
-- incorrectly attempted to insert `active`, causing PostgreSQL 22P02 and a fail-closed
-- provisioning error. Keep commercial entitlement activation separate; the Organization
-- record itself is created as `approved`.

create or replace function public.provision_customer_organization(
  target_company_name text,
  target_product_code text default 'company_studio',
  target_plan_code text default 'public_beta'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := gen_random_uuid();
  v_company_name text := trim(coalesce(target_company_name,''));
  v_product_code text := trim(coalesce(target_product_code,''));
  v_plan_code text := trim(coalesce(target_plan_code,'public_beta'));
  v_slug_base text;
  v_slug text;
  v_suffix integer := 0;
  v_base_price numeric(12,2);
  v_company_template_access boolean := false;
  v_company_builder_enabled boolean := false;
  v_agent_builder_enabled boolean := false;
  v_agent_create_enabled boolean := false;
  v_agent_clone_enabled boolean := false;
  v_agent_archive_enabled boolean := false;
  v_agent_structure_edit_enabled boolean := false;
  v_workflow_edit_enabled boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if length(v_company_name) < 2 or length(v_company_name) > 120 then
    raise exception 'Company name must contain 2 to 120 characters';
  end if;

  if v_product_code not in ('ready_company','custom_company','company_studio') then
    raise exception 'Unsupported commercial product';
  end if;

  if length(v_plan_code) < 2 or length(v_plan_code) > 50 then
    raise exception 'Invalid plan code';
  end if;

  v_slug_base := lower(regexp_replace(v_company_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug_base := trim(both '-' from v_slug_base);
  if v_slug_base = '' then
    v_slug_base := 'company';
  end if;
  v_slug_base := left(v_slug_base, 48);
  v_slug := v_slug_base;

  while exists (select 1 from public.organizations o where o.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := left(v_slug_base, 42) || '-' || v_suffix::text;
  end loop;

  case v_product_code
    when 'ready_company' then
      v_base_price := 249;
      v_company_template_access := true;
    when 'custom_company' then
      v_base_price := 399;
      v_company_template_access := true;
    when 'company_studio' then
      v_base_price := 699;
      v_company_template_access := true;
      v_company_builder_enabled := true;
      v_agent_builder_enabled := true;
      v_agent_create_enabled := true;
      v_agent_clone_enabled := true;
      v_agent_archive_enabled := true;
      v_agent_structure_edit_enabled := true;
      v_workflow_edit_enabled := true;
  end case;

  insert into public.customer_profiles (
    user_id,
    company_name,
    onboarding_status,
    updated_at
  ) values (
    v_user_id,
    v_company_name,
    'complete',
    now()
  )
  on conflict (user_id) do update
  set company_name = excluded.company_name,
      onboarding_status = 'complete',
      updated_at = now();

  insert into public.organizations (
    id,
    name,
    slug,
    status,
    owner_user_id
  ) values (
    v_org_id,
    v_company_name,
    v_slug,
    'approved',
    v_user_id
  );

  insert into public.organization_members (
    organization_id,
    user_id,
    role
  ) values (
    v_org_id,
    v_user_id,
    'owner'
  );

  insert into public.organization_entitlements (
    organization_id,
    product_code,
    plan_code,
    status,
    starts_at,
    currency,
    base_price,
    billing_interval,
    ai_usage_policy,
    ai_budget_limit,
    company_template_access,
    company_builder_enabled,
    agent_builder_enabled,
    agent_create_enabled,
    agent_clone_enabled,
    agent_archive_enabled,
    agent_structure_edit_enabled,
    workflow_edit_enabled,
    max_active_agents,
    max_departments,
    max_projects,
    support_tier
  ) values (
    v_org_id,
    v_product_code,
    v_plan_code,
    'pending',
    now(),
    'EUR',
    v_base_price,
    'month',
    'metered',
    25,
    v_company_template_access,
    v_company_builder_enabled,
    v_agent_builder_enabled,
    v_agent_create_enabled,
    v_agent_clone_enabled,
    v_agent_archive_enabled,
    v_agent_structure_edit_enabled,
    v_workflow_edit_enabled,
    case when v_product_code = 'company_studio' then 50 else 10 end,
    case when v_product_code = 'company_studio' then 25 else 10 end,
    case when v_product_code = 'company_studio' then 100 else 25 end,
    'beta'
  );

  insert into public.audit_events (
    organization_id,
    actor_type,
    actor_user_id,
    event_type,
    object_type,
    object_id,
    risk_level,
    payload
  ) values (
    v_org_id,
    'user',
    v_user_id,
    'organization.customer_provisioned',
    'organization',
    v_org_id::text,
    'low',
    jsonb_build_object(
      'product_code', v_product_code,
      'plan_code', v_plan_code,
      'entitlement_status', 'pending',
      'human_authority', 'Human CEO / Owner',
      'external_actions', false
    )
  );

  return v_org_id;
end;
$$;

revoke all on function public.provision_customer_organization(text,text,text) from public;
grant execute on function public.provision_customer_organization(text,text,text) to authenticated;
