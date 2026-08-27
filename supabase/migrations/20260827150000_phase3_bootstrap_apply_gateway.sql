-- RYTHM OS — Phase 3 Company Auto-Bootstrap apply boundary.
-- Applying a confirmed proposal is an internal high-risk governed tool action.
-- V1 only applies to an empty company structure so rollback is exact and non-destructive.

alter table public.company_bootstrap_runs
  add column if not exists apply_execution_id uuid references public.tool_execution_requests(id) on delete set null,
  add column if not exists applied_resources jsonb not null default '{"department_ids":[],"agent_ids":[]}'::jsonb,
  add column if not exists rolled_back_at timestamptz;

create or replace function public.apply_company_bootstrap_service_v1(
  target_run_id uuid,
  target_execution_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_role text := coalesce(v_claims->>'role', current_setting('request.jwt.claim.role', true));
  v_run public.company_bootstrap_runs%rowtype;
  v_entitlement public.organization_entitlements%rowtype;
  v_department jsonb;
  v_agent jsonb;
  v_department_id uuid;
  v_agent_id uuid;
  v_department_ids jsonb := '[]'::jsonb;
  v_agent_ids jsonb := '[]'::jsonb;
  v_agent_code text;
  v_proposal_digest text;
  v_department_count integer;
  v_agent_count integer;
begin
  if v_role is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;

  select * into v_run
  from public.company_bootstrap_runs
  where id = target_run_id
  for update;

  if v_run.id is null then
    raise exception 'Bootstrap run not found';
  end if;
  if v_run.status = 'applied' and v_run.apply_execution_id = target_execution_id then
    return jsonb_build_object(
      'run_id', v_run.id,
      'status', 'applied',
      'already_applied', true,
      'resources', v_run.applied_resources
    );
  end if;
  if v_run.status <> 'confirmed' then
    raise exception 'Bootstrap run must be exactly confirmed before apply';
  end if;
  if v_run.confirmed_by_user_id is null or v_run.confirmed_at is null then
    raise exception 'Human CEO confirmation evidence is missing';
  end if;
  if v_run.proposal_digest is null then
    raise exception 'Bootstrap proposal digest is missing';
  end if;

  v_proposal_digest := encode(
    digest(convert_to(coalesce(v_run.proposal, '{}'::jsonb)::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_proposal_digest is distinct from v_run.proposal_digest then
    raise exception 'Bootstrap proposal changed after Human CEO confirmation';
  end if;

  if exists (
    select 1 from public.tool_execution_requests e
    where e.id = target_execution_id
      and e.organization_id = v_run.organization_id
      and e.tool = 'internal.company_bootstrap'
      and e.capability_key = 'company_bootstrap.apply'
      and e.status = 'executing'
  ) is not true then
    raise exception 'Matching governed execution claim is required';
  end if;

  select * into v_entitlement
  from public.organization_entitlements
  where organization_id = v_run.organization_id;

  if v_entitlement.id is null
     or v_entitlement.status <> 'active'
     or not v_entitlement.company_builder_enabled then
    raise exception 'Company Builder entitlement is not active';
  end if;

  -- V1 is deliberately conservative: no overlay onto an existing workforce/structure.
  if exists (select 1 from public.agents where organization_id = v_run.organization_id) then
    raise exception 'Company already contains Agents; Phase 3 V1 overlay is blocked';
  end if;
  if exists (select 1 from public.departments where organization_id = v_run.organization_id) then
    raise exception 'Company already contains departments; Phase 3 V1 overlay is blocked';
  end if;

  v_department_count := jsonb_array_length(coalesce(v_run.proposal->'proposed_structure'->'departments', '[]'::jsonb));
  v_agent_count := jsonb_array_length(coalesce(v_run.proposal->'proposed_structure'->'agents', '[]'::jsonb));

  if v_department_count = 0 or v_agent_count = 0 then
    raise exception 'Bootstrap proposal must contain at least one department and Agent';
  end if;
  if v_department_count > v_entitlement.max_departments then
    raise exception 'Proposed department count exceeds entitlement';
  end if;
  if v_agent_count > v_entitlement.max_active_agents then
    raise exception 'Proposed Agent count exceeds entitlement';
  end if;

  update public.company_bootstrap_runs
  set status = 'applying',
      apply_execution_id = target_execution_id,
      updated_at = now()
  where id = v_run.id;

  for v_department in
    select value
    from jsonb_array_elements(coalesce(v_run.proposal->'proposed_structure'->'departments', '[]'::jsonb))
  loop
    if nullif(trim(v_department->>'name'), '') is null then
      raise exception 'Proposed department name is invalid';
    end if;

    insert into public.departments (
      organization_id, template_key, name, description
    ) values (
      v_run.organization_id,
      coalesce(
        nullif(v_department->>'key', ''),
        lower(regexp_replace(v_department->>'name', '[^a-zA-Z0-9]+', '_', 'g'))
      ),
      v_department->>'name',
      coalesce(v_department->>'description', 'Provisioned by Phase 3 Company Auto-Bootstrap.')
    )
    returning id into v_department_id;

    v_department_ids := v_department_ids || jsonb_build_array(v_department_id);
  end loop;

  for v_agent in
    select value
    from jsonb_array_elements(coalesce(v_run.proposal->'proposed_structure'->'agents', '[]'::jsonb))
  loop
    v_agent_code := upper(
      regexp_replace(
        coalesce(nullif(v_agent->>'role_code', ''), v_agent->>'role'),
        '[^a-zA-Z0-9]+', '_', 'g'
      )
    );
    if nullif(v_agent_code, '') is null or nullif(trim(v_agent->>'role'), '') is null then
      raise exception 'Proposed Agent identity is invalid';
    end if;

    insert into public.agents (
      organization_id,
      department_id,
      agent_code,
      name,
      role_title,
      purpose,
      authority_level,
      risk_ceiling,
      enabled,
      specification_version,
      identity,
      permissions,
      is_ai,
      responsibilities,
      skills,
      work_style,
      language,
      system_instructions,
      kpis,
      success_criteria,
      human_approval_requirements,
      allowed_tools,
      memory_scope,
      external_actions_allowed,
      runtime_provider,
      runtime_policy_key,
      budget_policy_key,
      agent_status,
      template_version
    ) values (
      v_run.organization_id,
      (
        select d.id
        from public.departments d
        where d.organization_id = v_run.organization_id
          and d.template_key = v_agent->>'department_key'
        limit 1
      ),
      v_agent_code,
      coalesce(nullif(v_agent->>'name', ''), v_agent->>'role'),
      v_agent->>'role',
      coalesce(v_agent->>'purpose', 'Support the organization within the Human CEO governed operating model.'),
      least(greatest(coalesce((v_agent->>'authority_level')::smallint, 1), 0), 2),
      case coalesce(v_agent->>'risk_ceiling', 'medium')
        when 'low' then 'low'::public.rythm_risk_level
        else 'medium'::public.rythm_risk_level
      end,
      false,
      '1.0',
      jsonb_build_object(
        'is_ai', true,
        'bootstrap_run_id', v_run.id,
        'bootstrap_proposal_digest', v_run.proposal_digest
      ),
      jsonb_build_object(
        'external_actions_allowed', false,
        'human_ceo_governed', true,
        'phase3_bootstrap', true
      ),
      true,
      coalesce(v_agent->'responsibilities', '[]'::jsonb),
      coalesce(v_agent->'skills', '[]'::jsonb),
      coalesce(v_agent->>'work_style', 'Structured, evidence-seeking and explicit about assumptions.'),
      coalesce(v_run.proposal->>'preferred_language', 'English'),
      coalesce(
        v_agent->>'system_instructions',
        'You are an AI Agent in a RYTHM governed company. You must identify yourself as AI, operate only within company context, keep external actions disabled, and escalate consequential decisions to the Human CEO.'
      ),
      coalesce(v_agent->'kpis', '[]'::jsonb),
      coalesce(v_agent->'success_criteria', '[]'::jsonb),
      coalesce(v_agent->'human_approval_requirements', '["Consequential external actions","Material financial commitments"]'::jsonb),
      coalesce(v_agent->'allowed_tools', '["company_memory","projects","meetings","decisions","actions"]'::jsonb),
      'organization',
      false,
      'OpenAI',
      'central_openai_v1',
      'organization_metered_v1',
      'paused',
      'phase3-bootstrap-v1'
    )
    returning id into v_agent_id;

    v_agent_ids := v_agent_ids || jsonb_build_array(v_agent_id);
  end loop;

  update public.company_bootstrap_runs
  set status = 'applied',
      applied_at = now(),
      rolled_back_at = null,
      applied_resources = jsonb_build_object(
        'department_ids', v_department_ids,
        'agent_ids', v_agent_ids
      ),
      updated_at = now()
  where id = v_run.id;

  insert into public.audit_events (
    organization_id, actor_type, event_type,
    object_type, object_id, risk_level, payload
  ) values (
    v_run.organization_id,
    'system',
    'company_bootstrap.applied',
    'company_bootstrap_run',
    v_run.id::text,
    'high',
    jsonb_build_object(
      'execution_id', target_execution_id,
      'proposal_digest', v_run.proposal_digest,
      'departments_created', v_department_count,
      'agents_created', v_agent_count,
      'agents_initial_status', 'paused',
      'external_actions_allowed', false,
      'rollback_supported', true
    )
  );

  return jsonb_build_object(
    'run_id', v_run.id,
    'status', 'applied',
    'departments_created', v_department_count,
    'agents_created', v_agent_count,
    'resources', jsonb_build_object(
      'department_ids', v_department_ids,
      'agent_ids', v_agent_ids
    )
  );
end;
$$;

create or replace function public.rollback_company_bootstrap_service_v1(
  target_run_id uuid,
  target_apply_execution_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_role text := coalesce(v_claims->>'role', current_setting('request.jwt.claim.role', true));
  v_run public.company_bootstrap_runs%rowtype;
  v_agent_id text;
  v_department_id text;
begin
  if v_role is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;

  select * into v_run
  from public.company_bootstrap_runs
  where id = target_run_id
  for update;

  if v_run.id is null then raise exception 'Bootstrap run not found'; end if;
  if v_run.status <> 'applied' then
    if v_run.status = 'confirmed' and v_run.rolled_back_at is not null then
      return jsonb_build_object('run_id', v_run.id, 'status', 'confirmed', 'already_rolled_back', true);
    end if;
    raise exception 'Bootstrap run is not rollback eligible';
  end if;
  if v_run.apply_execution_id is distinct from target_apply_execution_id then
    raise exception 'Rollback reference does not match the applied execution';
  end if;

  -- Delete only exact resources recorded by the apply transaction.
  for v_agent_id in
    select jsonb_array_elements_text(coalesce(v_run.applied_resources->'agent_ids', '[]'::jsonb))
  loop
    delete from public.agents
    where id = v_agent_id::uuid
      and organization_id = v_run.organization_id
      and identity->>'bootstrap_run_id' = v_run.id::text;
  end loop;

  for v_department_id in
    select jsonb_array_elements_text(coalesce(v_run.applied_resources->'department_ids', '[]'::jsonb))
  loop
    delete from public.departments
    where id = v_department_id::uuid
      and organization_id = v_run.organization_id
      and not exists (
        select 1 from public.agents a where a.department_id = v_department_id::uuid
      );
  end loop;

  update public.company_bootstrap_runs
  set status = 'confirmed',
      applied_at = null,
      rolled_back_at = now(),
      applied_resources = '{"department_ids":[],"agent_ids":[]}'::jsonb,
      updated_at = now()
  where id = v_run.id;

  insert into public.audit_events (
    organization_id, actor_type, event_type,
    object_type, object_id, risk_level, payload
  ) values (
    v_run.organization_id,
    'system',
    'company_bootstrap.rolled_back',
    'company_bootstrap_run',
    v_run.id::text,
    'high',
    jsonb_build_object(
      'apply_execution_id', target_apply_execution_id,
      'proposal_digest', v_run.proposal_digest,
      'restored_status', 'confirmed'
    )
  );

  return jsonb_build_object('run_id', v_run.id, 'status', 'confirmed', 'rolled_back', true);
end;
$$;

revoke all on function public.apply_company_bootstrap_service_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rollback_company_bootstrap_service_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_company_bootstrap_service_v1(uuid, uuid) to service_role;
grant execute on function public.rollback_company_bootstrap_service_v1(uuid, uuid) to service_role;

insert into public.integration_tool_registry(
  tool_id,integration_key,name,version,category,adapter_version,metadata,enabled,kill_switch,updated_at
) values (
  'internal.company_bootstrap','internal','RYTHM Company Bootstrap Apply','3.0.0-pilot','internal_control',
  'internal-company-bootstrap-v1',
  '{"operations":["company_bootstrap.apply"],"human_ceo_confirmation_required":true,"rollback_supported":true}'::jsonb,
  true,false,now()
)
on conflict(tool_id) do update set
  integration_key=excluded.integration_key,name=excluded.name,version=excluded.version,
  category=excluded.category,adapter_version=excluded.adapter_version,metadata=excluded.metadata,
  enabled=excluded.enabled,updated_at=now();

insert into public.integration_capabilities(
  provider_key,capability_key,risk_level,default_approval_mode,description,tool_id,operation,
  internal_external,read_write,external_side_effect,financial_impact,data_sensitivity,risk_ceiling,reversibility,
  required_agent_permissions,required_user_permissions,required_scopes,idempotency_supported,timeout_ms,retry_policy,
  rate_limits,adapter_version,rollback_supported,enabled,kill_switch
) values (
  'internal','company_bootstrap.apply','high','approval_required',
  'Apply an exact Human CEO confirmed Company Auto-Bootstrap proposal to an empty company structure.',
  'internal.company_bootstrap','company_bootstrap.apply','internal','write',false,false,'confidential','high','reversible',
  array['apply_company_bootstrap']::text[],array['privileged']::text[],'{}'::text[],true,30000,
  '{"maxAttempts":1,"baseDelayMs":250,"maxDelayMs":250}'::jsonb,
  '{"userPerHour":5,"organizationPerHour":10,"agentPerHour":5,"integrationPerHour":10,"operationPerHour":10}'::jsonb,
  'internal-company-bootstrap-v1',true,true,false
)
on conflict(provider_key,capability_key) do update set
  risk_level=excluded.risk_level,default_approval_mode=excluded.default_approval_mode,description=excluded.description,
  tool_id=excluded.tool_id,operation=excluded.operation,internal_external=excluded.internal_external,read_write=excluded.read_write,
  external_side_effect=excluded.external_side_effect,financial_impact=excluded.financial_impact,data_sensitivity=excluded.data_sensitivity,
  risk_ceiling=excluded.risk_ceiling,reversibility=excluded.reversibility,required_agent_permissions=excluded.required_agent_permissions,
  required_user_permissions=excluded.required_user_permissions,required_scopes=excluded.required_scopes,
  idempotency_supported=excluded.idempotency_supported,timeout_ms=excluded.timeout_ms,retry_policy=excluded.retry_policy,
  rate_limits=excluded.rate_limits,adapter_version=excluded.adapter_version,rollback_supported=excluded.rollback_supported,
  enabled=excluded.enabled,kill_switch=excluded.kill_switch;
