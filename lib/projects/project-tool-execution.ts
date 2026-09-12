import { createExecutionServiceClient, executeApprovedToolRequest } from "@/lib/integrations/service-runner";
import { syncToolExecutionApproval } from "@/lib/integrations/execution-gateway";

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const proposalIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function reconcileProposalContinuation(supabase:ReturnType<typeof createExecutionServiceClient>,request:{organization_id:string;project_id:string|null;originating_request_id:string|null}){
  const proposalId=String(request.originating_request_id??"");
  if(!request.project_id||!proposalIdPattern.test(proposalId))return;
  const proposal=await supabase.from("project_proposals").select("id,status,title,execution_result,created_by_agent_id").eq("organization_id",request.organization_id).eq("project_id",request.project_id).eq("id",proposalId).maybeSingle();
  if(!proposal.data)return;
  const executions=await supabase.from("tool_execution_requests").select("id,status,capability_key,approval_request_id,safe_result,sanitized_error").eq("organization_id",request.organization_id).eq("project_id",request.project_id).eq("originating_request_id",proposalId).order("created_at");
  if(executions.error||!(executions.data??[]).length)return;
  const rows=executions.data??[];
  const statuses=rows.map(row=>String(row.status));
  const terminalFailure=statuses.some(status=>["failed","denied","rejected","expired","cancelled","simulated"].includes(status));
  const allSucceeded=statuses.every(status=>status==="succeeded");
  const now=new Date().toISOString();
  const taskRows=await supabase.from("project_task_runs").select("id,input").eq("organization_id",request.organization_id).eq("project_id",request.project_id).contains("input",{approved_proposal_id:proposalId});
  const currentResult=record(proposal.data.execution_result);

  if(allSucceeded){
    for(const task of taskRows.data??[]){
      await supabase.from("project_task_runs").update({status:"completed",safe_result:{proposal_id:proposalId,external_actions:rows.map(row=>({id:row.id,status:row.status,capability_key:row.capability_key,safe_result:row.safe_result}))},completed_at:now,error_class:null,error_message:null,lease_owner:null,lease_expires_at:null,updated_at:now}).eq("id",task.id).in("status",["waiting_for_agent","waiting_for_data","queued","retrying","blocked"]);
    }
    await supabase.from("project_proposals").update({status:"completed",execution_result:{...currentResult,bridge_status:"completed",bridge_completed_at:now,tool_execution_requests:rows.map(row=>({id:row.id,status:row.status,capability_key:row.capability_key,approval_request_id:row.approval_request_id,safe_result:row.safe_result}))},updated_at:now}).eq("id",proposalId).eq("organization_id",request.organization_id);
    await supabase.from("project_activity_events").insert({organization_id:request.organization_id,project_id:request.project_id,agent_id:proposal.data.created_by_agent_id,event_type:"proposal.execution.completed",headline:`Approved proposal executed: ${proposal.data.title}`,detail:`${rows.length} governed external action${rows.length===1?"":"s"} completed and verified.`,importance:"major",metadata:{proposal_id:proposalId,tool_execution_request_ids:rows.map(row=>row.id)}});
    return;
  }

  if(terminalFailure){
    const failures=rows.filter(row=>["failed","denied","rejected","expired","cancelled","simulated"].includes(String(row.status)));
    const message=failures.map(row=>`${row.capability_key}: ${row.sanitized_error||row.status}`).join(" · ").slice(0,1800)||"A governed external action could not complete.";
    for(const task of taskRows.data??[]){
      await supabase.from("project_task_runs").update({status:"blocked",error_class:"external_action_failed",error_message:message,lease_owner:null,lease_expires_at:null,updated_at:now}).eq("id",task.id).in("status",["waiting_for_agent","waiting_for_data","queued","retrying"]);
    }
    await supabase.from("project_proposals").update({execution_result:{...currentResult,bridge_status:"blocked",bridge_error:message,bridge_blocked_at:now,tool_execution_requests:rows.map(row=>({id:row.id,status:row.status,capability_key:row.capability_key,approval_request_id:row.approval_request_id}))},updated_at:now}).eq("id",proposalId).eq("organization_id",request.organization_id);
    await supabase.from("project_activity_events").insert({organization_id:request.organization_id,project_id:request.project_id,agent_id:proposal.data.created_by_agent_id,event_type:"proposal.execution.blocked",headline:`Approved proposal needs attention: ${proposal.data.title}`,detail:message,importance:"attention",metadata:{proposal_id:proposalId,tool_execution_request_ids:failures.map(row=>row.id)}});
    return;
  }

  for(const task of taskRows.data??[]){
    await supabase.from("project_task_runs").update({status:"waiting_for_agent",input:{...record(task.input),external_execution_state:"in_progress",tool_execution_request_ids:rows.map(row=>row.id)},waiting_on_approval_id:null,lease_owner:null,lease_expires_at:null,updated_at:now}).eq("id",task.id).in("status",["queued","retrying","waiting_for_agent","waiting_for_approval"]);
  }
}

export async function dispatchApprovedProjectToolExecutions(){
  const supabase=createExecutionServiceClient();
  const {data:requests,error}=await supabase.from("tool_execution_requests")
    .select("id,organization_id,project_id,status,approval_request_id,agent_id,tool,capability_key,target_ref,correlation_id,originating_request_id")
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
      if(!["approved","authorized"].includes(status)){
        await reconcileProposalContinuation(supabase,request);
        continue;
      }
      await executeApprovedToolRequest(request.id);
      await supabase.from("project_activity_events").insert({
        organization_id:request.organization_id,
        project_id:request.project_id,
        agent_id:request.agent_id,
        event_type:"external_action.completed",
        headline:`Governed action completed: ${request.capability_key}`,
        detail:`${request.tool}${request.target_ref?` · ${request.target_ref}`:""}`,
        importance:"major",
        correlation_id:request.correlation_id,
        metadata:{tool_execution_request_id:request.id,status:"succeeded"},
      });
      await reconcileProposalContinuation(supabase,request);
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
      await reconcileProposalContinuation(supabase,request);
      results.push({id:request.id,status:"blocked",error:message});
    }
  }
  return results;
}
