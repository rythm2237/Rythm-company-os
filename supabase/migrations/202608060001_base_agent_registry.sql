insert into public.agents (
  organization_id,
  agent_code,
  name,
  role_title,
  purpose,
  authority_level,
  risk_ceiling,
  enabled,
  specification_version,
  identity,
  permissions
)
select
  organization.id,
  registry.agent_code,
  registry.name,
  registry.role_title,
  registry.purpose,
  registry.authority_level,
  registry.risk_ceiling::public.rythm_risk_level,
  registry.enabled,
  '1.0',
  registry.identity,
  registry.permissions
from public.organizations organization
cross join (
  values
    (
      'T-001',
      'Runtime Validation Agent',
      'Dry-Run Validation Specialist',
      'Validate runtime controls, structured inputs, risk ceilings, budget caps, and audit behavior without executing external actions.',
      1::smallint,
      'low',
      true,
      '{"class":"validation","execution_mode":"dry_run_only"}'::jsonb,
      '{"read":["company_memory","agent_runs","audit_events"],"write":["agent_runs"],"external_actions":false}'::jsonb
    ),
    (
      'A-101',
      'Strategy Analyst',
      'Strategic Analysis Agent',
      'Prepare structured strategic options, assumptions, trade-offs, and recommendations for Human CEO review.',
      1::smallint,
      'medium',
      false,
      '{"class":"strategy","execution_mode":"dry_run_only"}'::jsonb,
      '{"read":["company_memory","decisions"],"write":[],"external_actions":false}'::jsonb
    ),
    (
      'A-102',
      'Operations Analyst',
      'Operational Planning Agent',
      'Analyze operating workflows, bottlenecks, service levels, and execution plans for governed review.',
      1::smallint,
      'medium',
      false,
      '{"class":"operations","execution_mode":"dry_run_only"}'::jsonb,
      '{"read":["company_memory","meetings","action_items"],"write":[],"external_actions":false}'::jsonb
    ),
    (
      'A-103',
      'Finance Controller',
      'Financial Control Agent',
      'Evaluate budgets, cost exposure, unit economics, and financial controls without initiating transactions.',
      1::smallint,
      'medium',
      false,
      '{"class":"finance","execution_mode":"dry_run_only"}'::jsonb,
      '{"read":["company_memory","decisions","agent_runs"],"write":[],"external_actions":false}'::jsonb
    ),
    (
      'A-104',
      'Risk and Compliance Analyst',
      'Governance and Risk Agent',
      'Identify control gaps, policy conflicts, compliance risks, and approval requirements for Human CEO review.',
      1::smallint,
      'high',
      false,
      '{"class":"risk_compliance","execution_mode":"dry_run_only"}'::jsonb,
      '{"read":["company_memory","approvals","decisions","audit_events"],"write":[],"external_actions":false}'::jsonb
    ),
    (
      'A-105',
      'Research Analyst',
      'Evidence Synthesis Agent',
      'Synthesize internal evidence, identify uncertainty, and prepare source-grounded findings for governed decisions.',
      1::smallint,
      'low',
      false,
      '{"class":"research","execution_mode":"dry_run_only"}'::jsonb,
      '{"read":["company_memory"],"write":[],"external_actions":false}'::jsonb
    )
) as registry(
  agent_code,
  name,
  role_title,
  purpose,
  authority_level,
  risk_ceiling,
  enabled,
  identity,
  permissions
)
on conflict (organization_id, agent_code) do update
set
  name = excluded.name,
  role_title = excluded.role_title,
  purpose = excluded.purpose,
  authority_level = excluded.authority_level,
  risk_ceiling = excluded.risk_ceiling,
  enabled = excluded.enabled,
  specification_version = excluded.specification_version,
  identity = excluded.identity,
  permissions = excluded.permissions,
  updated_at = now();
