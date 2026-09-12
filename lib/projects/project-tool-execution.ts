import { createExecutionServiceClient, executeApprovedToolRequest } from "@/lib/integrations/service-runner";
import { syncToolExecutionApproval } from "@/lib/integrations/execution-gateway";

export async function dispatchApprovedProjectToolExecutions(){
  const supabase=createExecutionServiceClient();
  const {data:requests,error}=await supabase.from("tool_execution_requests")
    .select("id,organization_id,project_id,status,approval_request_id,agent_id,tool,capability_key,target_ref,correlation_id")
    .not("project_id","is",null)
    .in("status",["waiting_approval","approved","authorized"])
    .order("created_at",{ascending:true})
    .limit(12);
  if(error)throw new Error(`Project tool execution queue could not be loaded: ${error.message}`);
  const results:Array<{id:string;status:string;error?:string}>=[];
  for(const request of requests??[]){
    try{
      let status=request.status;
      if(status==="waiting_approval"){
        const synced=await syncToolExecutionApproval(supabase,request.organization_id,request.id);
        status=String(synced?.status??status);
      }
      if(!["approved","authorized"].includes(status))continue;
      const result=await executeApprovedToolRequest(request.id);
      await supabase.from("project_activity_events").insert({
        organization_id:request.organization_id,
        project_id:request.project_id,
        agent_id:request.agent_id,
        event_type:"external_action.completed",
        headline:`Governed action completed: ${request.capability_key}`,
        detail:`${request.tool}${request.target_ref?` · ${request.target_ref}`:""}`,
        importance:"major",
        correlation_id:request.correlation_id,
        metadata:{tool_execution_request_id:request.id,status:(result as {status?:string})?.status??"succeeded"},
      });
      results.push({id:request.id,status:"completed"});
    }catch(error){
      const message=error instanceof Error?error.message:"Governed execution failed.";
      await supabase.from("project_activity_events").insert({
        organization_id:request.organization_id,
        project_id:request.project_id,
        agent_id:request.agent_id,
        event_type:"external_action.blocked",
        headline:`Governed action did not execute: ${request.capability_key}`,
        detail:message,
        importance:"attention",
        correlation_id:request.correlation_id,
        metadata:{tool_execution_request_id:request.id},
      });
      results.push({id:request.id,status:"blocked",error:message});
    }
  }
  return results;
}
