import type { SupabaseClient } from '@supabase/supabase-js';
import { COMPANY_CORE_VERSION } from './contract';
export async function ensureCompanyCore(db:SupabaseClient, organizationId:string){
  const result=await db.rpc('ensure_company_operating_core_v1',{target_org:organizationId});
  if(result.error)throw new Error(`Company ownership could not be resolved: ${result.error.message}`);
  return String(result.data);
}
export async function planningContext(db:SupabaseClient,organizationId:string,projectId:string){
  const owner=await ensureCompanyCore(db,organizationId);
  const assignment=await db.from('project_agents').upsert({organization_id:organizationId,project_id:projectId,agent_id:owner,assignment_role:'Executive Director / accountable owner',status:'active',authority_scope:{project_execution:true,external_actions:false}},{onConflict:'project_id,agent_id'});
  if(assignment.error)throw new Error(assignment.error.message);
  const capacity=await db.from('project_agent_capacity').select('agent_id').eq('organization_id',organizationId).eq('project_id',projectId).eq('agent_id',owner).maybeSingle();
  if(capacity.error)throw new Error(capacity.error.message);
  if(!capacity.data){const allocated=await db.from('project_agent_capacity').insert({organization_id:organizationId,project_id:projectId,agent_id:owner,allocation_percent:10,priority:2});if(allocated.error)throw new Error(allocated.error.message);}
  const [gaps,agents,installation,budgets]=await Promise.all([
    db.from('project_clarification_requests').select('*').eq('organization_id',organizationId).eq('project_id',projectId),
    db.from('agents').select('id,role_title,purpose,skills,enabled,agent_status,system_instructions').eq('organization_id',organizationId).eq('enabled',true).eq('agent_status','enabled'),
    db.from('organization_template_installations').select('template_key').eq('organization_id',organizationId).order('installed_at',{ascending:false}).limit(1).maybeSingle(),
    db.from('project_budget_accounts').select('*').eq('organization_id',organizationId).eq('project_id',projectId),
  ]);
  for(const r of [gaps,agents,installation,budgets])if(r.error)throw new Error(r.error.message);
  const unresolved=(gaps.data??[]).filter(q=>q.status==='open'&&q.materiality==='required'&&['planning','intake'].includes(q.required_stage??'planning'));
  if(unresolved.length)throw new Error(`Manager clarification required before roadmap planning: ${unresolved.length} material question(s).`);
  const policy=installation.data?await db.from('company_operating_template_contracts').select('configuration').eq('template_key',installation.data.template_key).eq('core_version',COMPANY_CORE_VERSION).maybeSingle():{data:null,error:null};
  if(policy.error)throw new Error(policy.error.message);
  return {coreVersion:COMPANY_CORE_VERSION,executiveDirectorId:owner,template:policy.data?.configuration??{family:'general',intake:['objective','scope','budget','authority','acceptance'],evidence:['authoritative_references','quality_review'],acceptance:'explicit_recorded_acceptance'},answers:gaps.data??[],available_agents:agents.data??[],budget:budgets.data??[]};
}
export async function recordObligation(db:SupabaseClient,input:{organizationId:string;projectId:string;key:string;action:string;resume:string;owner?:string|null}){
  const owner=input.owner??await ensureCompanyCore(db,input.organizationId);
  const r=await db.from('project_operating_obligations').upsert({organization_id:input.organizationId,project_id:input.projectId,obligation_key:input.key,owner_agent_id:owner,next_action:input.action,resume_condition:input.resume,follow_up_at:new Date(Date.now()+86400000).toISOString(),escalation:'Human CEO',status:'waiting'},{onConflict:'project_id,obligation_key'});
  if(r.error)throw new Error(r.error.message);
}
