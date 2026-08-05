-- Run after creating the Human CEO account in Supabase Auth.
-- Human CEO UUID for the initial RYTHM organization is recorded below.

do $$
declare
  ceo_user_id uuid := '30f4573e-e045-4740-b8d9-8bd7b592df46';
  org_id uuid := gen_random_uuid();
  orchestrator_id uuid := gen_random_uuid();
begin
  if exists (select 1 from public.organizations where slug = 'rythm') then
    raise notice 'RYTHM seed skipped: organization with slug rythm already exists.';
    return;
  end if;

  insert into public.organizations(id,name,slug,mission,vision,owner_user_id,status)
  values (
    org_id,
    'RYTHM',
    'rythm',
    'Build governed AI-native companies that improve human capability while keeping consequential authority under accountable human control.',
    'Become the trusted operating layer through which organizations coordinate humans, AI agents, decisions, knowledge, and execution.',
    ceo_user_id,
    'approved'
  );

  insert into public.organization_members(organization_id,user_id,role)
  values (org_id,ceo_user_id,'owner');

  insert into public.agents(
    id,organization_id,agent_code,name,role_title,purpose,authority_level,risk_ceiling,enabled,specification_version,identity,permissions
  ) values (
    orchestrator_id,org_id,'B-001','Executive Orchestrator','AI Chief of Staff',
    'Coordinate work, prepare decisions, convene governed meetings, maintain traceability, and escalate consequential choices to the Human CEO.',
    1,'low',false,'1.0',
    '{"display_name":"Executive Orchestrator","company":"RYTHM","visual_identity_status":"pending"}'::jsonb,
    '{"read":true,"analyze":true,"prepare":true,"external_write":false,"deploy":false,"delete":false,"financial_commitment":false}'::jsonb
  );

  insert into public.company_memory(
    organization_id,memory_type,title,content,source_type,confidence,status,created_by_user_id
  ) values
  (org_id,'constitution','RYTHM Foundation v1.0','{"human_authority":true,"explainability":true,"shared_memory":true,"mission_first":true,"simplicity":true}'::jsonb,'approved_specification',1,'approved',ceo_user_id),
  (org_id,'product','Career OS relationship','{"statement":"Career OS is the first product and operating environment governed through RYTHM Company OS."}'::jsonb,'approved_specification',1,'approved',ceo_user_id);
end $$;
