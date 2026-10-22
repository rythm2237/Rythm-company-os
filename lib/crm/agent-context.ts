import type { SupabaseClient } from "@supabase/supabase-js";
/** Shared work receives operational facts only. Confidential responses must stay in a private workflow. */
export async function loadCrmAgentOperationalContext(service:SupabaseClient,input:{organizationId:string;projectId:string;executionId:string;agentId:string|null}) {
 if(!input.agentId||!input.executionId)return null;
 const [project,execution]=await Promise.all([
 service.from("projects").select("customer_id").eq("organization_id",input.organizationId).eq("id",input.projectId).maybeSingle(),
 service.from("project_executions").select("started_by_user_id").eq("organization_id",input.organizationId).eq("project_id",input.projectId).eq("id",input.executionId).maybeSingle()]);
 if(project.error||execution.error||!project.data?.customer_id||!execution.data)return null;
 const {data,error}=await service.rpc("crm_agent_customer_context",{p_organization_id:input.organizationId,p_customer_id:project.data.customer_id,p_agent_id:input.agentId,p_user_id:execution.data.started_by_user_id||null,p_include_contracts:false,p_include_finance:false});
 return error?null:data;
}
