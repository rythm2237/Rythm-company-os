import { createExecutionServiceClient, executeApprovedToolRequest } from "@/lib/integrations/service-runner";
import { syncToolExecutionApproval } from "@/lib/integrations/execution-gateway";

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const proposalIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidPattern=proposalIdPattern;
const terminalFailures=new Set(["failed","denied","rejected","expired","cancelled","simulated"]);
const verificationPassed=(value:unknown)=>["verified","passed","success","succeeded"].includes(String(record(value).status??"").toLowerCase());

async function completionContextForProposal(supabase:ReturnType<typeof createExecutionServiceClient>,organizationId:string,projectId:string,taskRunId:string|null){
  if(!taskRunId)return null;
  const task=await supabase.from("project_task_runs").select("id,input").eq("organization_id",organizationId).eq("project_id",projectId).eq("id",taskRunId).maybeSingle();
  if(!task.data)return null;
  const input=record(task.data.input);
  const criterionId=String(input.completion_criterion_id??"");
  const dimension=String(input.completion_dimension??"");
  if(!uuidPattern.test(criterionId)||!["implementation","verification"].includes(dimension))return null;
  const criterion=await supabase.from("project_completion_criteria").select("id,dimension,state").eq("organization_id",organizationId).eq("project_id",projectId).eq("id",criterionId).maybeSingle();
  if(!criterion.data||criterion.data.dimension!==dimension)return null;
  return {taskRunId:task.data.id,criterionId,dimension};
}

async function recordCompletionExecutionEvidence(
  supabase:ReturnType<typeof createExecutionServiceClient>,
  input:{organizationId:string;projectId:string;proposalId:string;sourceTaskRunId:string|null;rows:any[];succeeded:boolean;failureMessage?:string},
){
  const context=await completionContextForProposal(supabase,input.organizationId,input.projectId,input.sourceTaskRunId);
  if(!context)return;
  const now=new Date().toISOString();
  if(input.succeeded){
    for(const row of input.rows){
      await supabase.from("project_completion_evidence").insert({
        organization_id:input.organizationId,
        project_id:input.projectId,
        task_run_id:context.taskRunId,
        criterion_id:context.criterionId,
        lifecycle_dimension:context.dimension,
        evidence_type:context.dimension==="implementation"?"governed_external_execution":"governed_verification_execution",
        source:"integration_execution_gateway",
        authoritative_source:true,
        collected_at:row.completed_at??now,
        validator:"integration_execution_gateway",
        verification_result:context.dimension==="implementation"?"succeeded":String(record(row.verification_result).status??"not_verified"),
        external_system_reference:String(row.external_reference_id??row.id),
        structured_data:{proposal_id:input.proposalId,tool_execution_request_id:row.id,capability_key:row.capability_key,status:row.status,safe_result:row.safe_result,verification_result:row.verification_result},
      });
    }
    const criterionSatisfied=context.dimension==="implementation"||input.rows.every(row=>verificationPassed(row.verification_result));
    if(criterionSatisfied){
      await supabase.from("project_completion_criteria").update({
        state:"passed",failure_reason:null,
        metadata:{validated_by:"integration_execution_gateway",proposal_id:input.proposalId,tool_execution_request_ids:input.rows.map(row=>row.id),validated_at:now},
        updated_at:now,
      }).eq("organization_id",input.organizationId).eq("project_id",input.projectId).eq("id",context.criterionId);
    }
  }else{
    await supabase.from("project_completion_criteria").update({
      state:"blocked",failure_reason:input.failureMessage??"Governed external action did not execute.",
      metadata:{blocked_by:"integration_execution_gateway",proposal_id:input.proposalId,tool_execution_request_ids:input.rows.map(row=>row.id),blocked_at:now},
      updated_at:now,
    }).eq("organization_id",input.organizationId).eq("project_id",input.projectId).eq("id",context.criterionId);
  }
  await supabase.rpc("evaluate_project_completion_v1",{p_project_id:input.projectId,p_trigger_event:input.succeeded?"governed_execution_succeeded":"governed_execution_blocked",p_source_type:"project_proposal",p_source_id:input.proposalId});
}

async function reconcileProjectProposal(supabase:ReturnType<typeof createExecutionServiceClient>,organizationId:string,projectId:string,proposalId:string){
  if(!proposalIdPattern.test(proposalId))return "not_proposal";
  const proposal=await supabase.from("project_proposals").select("id,status,title,execution_result,created_by_agent_id,source_task_run_id").eq("organization_id",organizationId).eq("project_id",projectId).eq("id",proposalId).maybeSingle();
  if(!proposal.data)return "not_found";
  const currentResult=record(proposal.data.execution_result);
  if(["completed","blocked"].includes(String(currentResult.bridge_status??"")))return String(currentResult.bridge_status);
  const executions=await supabase.from("tool_execution_requests").select("id,status,capability_key,approval_request_id,safe_result,sanitized_error,policy_reason_code,verification_result,external_reference_id,completed_at").eq("organization_id",organizationId).eq("project_id",projectId).eq("originating_request_id",proposalId).order("created_at");
  if(executions.error||!(executions.data??[]).length)return "no_requests";
  const rows=executions.data??[];
  const statuses=rows.map(row=>String(row.status));
  const terminalFailure=statuses.some(status=>terminalFailures.has(status));
  const allSucceeded=statuses.every(status=>status==="succeeded");
  const now=new Date().toISOString();
  const taskRows=await supabase.from("project_task_runs").select("id,input").eq("organization_id",organizationId).eq("project_id",projectId).contains("input",{approved_proposal_id:proposalId});

  if(allSucceeded){
    for(const task of taskRows.data??[]){
      await supabase.from("project_task_runs").update({status:"completed",safe_result:{proposal_id:proposalId,external_actions:rows.map(row=>({id:row.id,status:row.status,capability_key:row.capability_key,safe_result:row.safe_result}))},completed_at:now,error_class:null,error_message:null,lease_owner:null,lease_expires_at:null,updated_at:now}).eq("id",task.id).in("status",["waiting_for_agent","waiting_for_data","queued","retrying","blocked"]);
    }
    await recordCompletionExecutionEvidence(supabase,{organizationId,projectId,proposalId,sourceTaskRunId:proposal.data.source_task_run_id,rows,succeeded:true});
    await supabase.from("project_proposals").update({status:"completed",execution_result:{...currentResult,bridge_status:"completed",bridge_completed_at:now,tool_execution_requests:rows.map(row=>({id:row.id,status:row.status,capability_key:row.capability_key,approval_request_id:row.approval_request_id,safe_result:row.safe_result,verification_result:row.verification_result}))},updated_at:now}).eq("id",proposalId).eq("organization_id",organizationId);
    await supabase.from("project_activity_events").insert({organization_id:organizationId,project_id:projectId,agent_id:proposal.data.created_by_agent_id,event_type:"proposal.execution.completed",headline:`Approved proposal executed: ${proposal.data.title}`,detail:`${rows.length} governed external action${rows.length===1?"":"s"} completed. Completion evidence was recorded separately from verification/outcome gates.`,importance:"major",metadata:{proposal_id:proposalId,tool_execution_request_ids:rows.map(row=>row.id)}});
    return "completed";
  }

  if(terminalFailure){
    const failures=rows.filter(row=>terminalFailures.has(String(row.status)));
    const message=failures.map(row=>`${row.capability_key}: ${row.sanitized_error||row.policy_reason_code||row.status}`).join(" · ").slice(0,1800)||"A governed external action could not complete.";
    for(const task of taskRows.data??[]){
      await supabase.from("project_task_runs").update({status:"blocked",error_class:"external_action_not_executed",error_message:message,lease_owner:null,lease_expires_at:null,updated_at:now}).eq("id",task.id).in("status",["waiting_for_agent","waiting_for_data","queued","retrying","waiting_for_approval"]);
    }
    await recordCompletionExecutionEvidence(supabase,{organizationId,projectId,proposalId,sourceTaskRunId:proposal.data.source_task_run_id,rows:failures,succeeded:false,failureMessage:message});
    await supabase.from("project_proposals").update({execution_result:{...currentResult,bridge_status:"blocked",bridge_error:message,bridge_blocked_at:now,tool_execution_requests:rows.map(row=>({id:row.id,status:row.status,capability_key:row.capability_key,approval_request_id:row.approval_request_id,policy_reason_code:row.policy_reason_code}))},updated_at:now}).eq("id",proposalId).eq("organization_id",organizationId);
    await supabase.from("project_activity_events").insert({organization_id:organizationId,project_id:projectId,agent_id:proposal.data.created_by_agent_id,event_type:"proposal.execution.blocked",headline:`Approved proposal needs attention: ${proposal.data.title}`,detail:message,importance:"attention",metadata:{proposal_id:proposalId,tool_execution_request_ids:failures.map(row=>row.id)}});
    return "blocked";
  }

  for(const task of taskRows.data??[]){
    await supabase.from("project_task_runs").update({status:"waiting_for_agent",input:{...record(task.input),external_execution_state:"in_progress",tool_execution_request_ids:rows.map(row=>row.id)},waiting_on_approval_id:null,lease_owner:null,lease_expires_at:null,updated_at:now}).eq("id",task.id).in("status",["queued","retrying","waiting_for_agent","waiting_for_approval"]);
  }
  return "in_progress";
}

async function reconcileProposalContinuation(supabase:ReturnType<typeof createExecutionServiceClient>,request:{organization_id:string;project_id:string|null;originating_request_id:string|null}){
  const proposalId=String(request.originating_request_id??"");
  if(!request.project_id||!proposalIdPattern.test(proposalId))return;
  await reconcileProjectProposal(supabase,request.organization_id,request.project_id,proposalId);
}

export async function reconcileDispatchedProjectProposals(limit=16){
  const supabase=createExecutionServiceClient();
  const proposals=await supabase.from("project_proposals").select("id,organization_id,project_id").eq("status","approved").contains("execution_result",{bridge_status:"dispatched"}).order("decided_at",{ascending:true}).limit(Math.max(1,Math.min(limit,50)));
  if(proposals.error)throw new Error(`Dispatched proposal convergence could not be loaded: ${proposals.error.message}`);
  const results:Array<{proposalId:string;status:string}>=[];
  for(const proposal of proposals.data??[]){
    const status=await reconcileProjectProposal(supabase,proposal.organization_id,proposal.project_id,proposal.id);
    results.push({proposalId:proposal.id,status});
  }
  return results;
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
