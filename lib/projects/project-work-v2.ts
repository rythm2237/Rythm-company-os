import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeAiRequest } from "@/lib/ai/request-gateway";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { evaluateProjectCompletion } from "@/lib/projects/project-completion";

const object=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const list=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const text=(value:unknown,fallback="")=>typeof value==="string"?value.trim():fallback;
const bool=(value:unknown)=>value===true;
const cleanJson=(value:string)=>{
  const stripped=value.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/i,"").trim();
  try{JSON.parse(stripped);return stripped;}catch{}
  const start=stripped.indexOf("{");
  const end=stripped.lastIndexOf("}");
  return start>=0&&end>start?stripped.slice(start,end+1).replace(/,\s*([}\]])/g,"$1"):stripped;
};

async function executeStructuredTask(supabase:SupabaseClient,task:any){
  const [project,agent,context,decisions]=await Promise.all([
    supabase.from("projects").select("id,name,description,objective,scope,success_criteria,constraints,autonomy_mode,budget_cap_usd,lifecycle_state,next_required_action").eq("id",task.project_id).single(),
    task.assigned_agent_id?supabase.from("agents").select("id,agent_code,name,display_name,role_title,purpose,authority_level,risk_ceiling,permissions").eq("id",task.assigned_agent_id).maybeSingle():Promise.resolve({data:null}),
    supabase.from("project_context_documents").select("context_type,title,summary,evidence").eq("project_id",task.project_id).order("created_at",{ascending:false}).limit(12),
    supabase.from("project_decision_memory").select("decision,rationale,constraints,outcome,created_at").eq("project_id",task.project_id).order("created_at",{ascending:false}).limit(12),
  ]);
  if(!project.data)throw new Error("Project context unavailable.");
  const config=getRuntimeConfig();
  if(!config.openAIConfigured||!config.dryRunModel)throw new Error("Project intelligence provider is unavailable.");
  const agentRow=(agent as any).data;
  const response=await executeAiRequest({
    organizationId:task.organization_id,
    actor:{type:"system"},
    context:{projectId:task.project_id},
    feature:"internal.unspecified",
    systemInstructions:`You are ${agentRow?.display_name||agentRow?.name||"a RYTHM project agent"}, ${agentRow?.role_title||"Project Specialist"}. Complete the assigned work within your professional authority. Distinguish finishing your assigned work from completion of the real-world project outcome. Never claim an external action, production implementation, verification, measurement, or business outcome unless the supplied evidence proves it occurred. A plan, recommendation, approval, implementation package, HOLD decision, or blocked assessment is not implementation. If a governed external action is required, create a proposal instead of claiming it happened. Return exactly one JSON object and no Markdown.`,
    prompt:`Execute this project task using the supplied Project Knowledge. Return exactly this contract:
{
 "summary":"string",
 "findings":[],
 "deliverables":[],
 "decisions":[],
 "work_completed":true,
 "deliverable_completed":false,
 "implementation_executed":false,
 "verification_result":"verified|failed|not_verified|not_applicable",
 "outcome_observed":false,
 "blockers":[{"summary":"string","severity":"low|medium|high|critical","dimension":"deliverable|implementation|verification|outcome|acceptance|closeout","blocking":true,"next_required_action":"string"}],
 "evidence":[{"evidence_type":"string","lifecycle_dimension":"work|deliverable|implementation|verification|outcome","source":"string","verification_result":"string","confidence":0.0,"external_system_reference":"string"}],
 "next_required_action":"string|null",
 "proposal":null|{"proposal_type":"string","title":"string","executive_summary":"string","rationale":"string","expected_impact":{},"estimated_cost":null,"cost_currency":null,"risk_level":"low|medium|high|critical","required_permissions":[],"alternatives_considered":[]},
 "meeting_request":null|{"title":"string","purpose":"string","participant_roles":[]},
 "follow_up_tasks":[]
}
Rules: work_completed means only that you finished this assignment. Keep implementation_executed=false unless the authoritative target system changed. Keep verification_result=not_verified unless independent evidence verifies the result. Keep outcome_observed=false unless a defined measured outcome was actually observed. If time/data are insufficient, report a blocker/next action rather than success.
Task=${JSON.stringify({title:task.title,input:task.input})}
Project=${JSON.stringify(project.data)}
Knowledge=${JSON.stringify(context.data??[]).slice(0,18000)}
Decision memory=${JSON.stringify(decisions.data??[]).slice(0,10000)}`,
    attachmentFailurePolicy:"fail",
    mode:"task",
    maxOutputTokens:5500,
    timeoutMs:config.agentTimeoutMs,
    legacyFallback:{provider:"openai",model:config.dryRunModel,reason:"compatibility"},
    telemetryPolicy:"required",
  });
  const data=object(JSON.parse(cleanJson(response.outputText)));
  const blockers=list(data.blockers).map(object);
  const evidence=list(data.evidence).map(object);
  const verification=text(data.verification_result,"not_verified").toLowerCase();
  const implementationExecuted=bool(data.implementation_executed);
  const outcomeObserved=bool(data.outcome_observed);
  const deliverableCompleted=bool(data.deliverable_completed);
  const nextRequiredAction=text(data.next_required_action)||null;
  const hasBlocking=blockers.some(item=>item.blocking===true||["high","critical"].includes(text(item.severity).toLowerCase()));

  if(data.proposal&&typeof data.proposal==="object"){
    const p=object(data.proposal);
    const proposal=await supabase.from("project_proposals").insert({
      organization_id:task.organization_id,project_id:task.project_id,created_by_agent_id:task.assigned_agent_id,
      department:agentRow?.role_title??null,proposal_type:text(p.proposal_type,"Strategic Recommendation"),title:text(p.title,task.title),
      executive_summary:text(p.executive_summary,"Agent recommendation requires executive attention."),rationale:text(p.rationale),
      expected_impact:p.expected_impact&&typeof p.expected_impact==="object"?p.expected_impact:{summary:p.expected_impact},
      estimated_cost:typeof p.estimated_cost==="number"?p.estimated_cost:null,cost_currency:text(p.cost_currency)||null,
      risk_level:text(p.risk_level,"medium"),required_permissions:list(p.required_permissions),alternatives_considered:list(p.alternatives_considered),status:"ready_for_executive",
    }).select("id").single();
    if(proposal.data){
      const approval=await supabase.from("approval_requests").insert({
        organization_id:task.organization_id,project_id:task.project_id,subject_type:"project_proposal",subject_id:proposal.data.id,
        title:text(p.title,task.title),summary:text(p.executive_summary,"Executive decision required."),risk_level:text(p.risk_level,"medium"),
        requested_by_agent_id:task.assigned_agent_id,status:"pending",conditions:["Approval authorizes only the scoped proposal; downstream high-risk actions remain governed by the Execution Gateway."],
      }).select("id").single();
      await supabase.from("project_proposals").update({approval_request_id:approval.data?.id??null}).eq("id",proposal.data.id);
    }
  }

  if(data.meeting_request&&typeof data.meeting_request==="object"){
    const m=object(data.meeting_request);
    const meeting=await supabase.from("meetings").insert({organization_id:task.organization_id,project_id:task.project_id,title:text(m.title,`Working session: ${task.title}`),purpose:text(m.purpose,"Resolve project task collaboratively."),status:"draft",human_join_allowed:true,agenda:list(m.participant_roles),chair_agent_id:task.assigned_agent_id}).select("id").single();
    if(meeting.data)await supabase.from("project_activity_events").insert({organization_id:task.organization_id,project_id:task.project_id,execution_id:task.execution_id,agent_id:task.assigned_agent_id,event_type:"meeting.requested",headline:"Agent requested a working session",detail:text(m.purpose),metadata:{meeting_id:meeting.data.id}});
  }

  const completedAt=new Date().toISOString();
  const semantics={
    work_completed:data.work_completed===undefined?true:bool(data.work_completed),
    deliverable_completed:deliverableCompleted,
    implementation_executed:implementationExecuted,
    verification_result:verification,
    outcome_observed:outcomeObserved,
    blockers,evidence,
    authority:"agent_claim_non_authoritative",
    recorded_at:completedAt,
  };
  const taskUpdate=await supabase.from("project_task_runs").update({
    status:"completed",safe_result:data,result_semantics:semantics,
    outcome_status:hasBlocking?"blocked":outcomeObserved?"observed":"pending",
    implementation_status:implementationExecuted?"reported_executed":"not_reported",
    verification_status:verification,
    next_required_action:nextRequiredAction,completion_evidence:evidence,
    completed_at:completedAt,lease_owner:null,lease_expires_at:null,updated_at:completedAt,
  }).eq("id",task.id).eq("lease_owner",task.lease_owner);
  if(taskUpdate.error)throw new Error(taskUpdate.error.message);
  if(task.action_item_id)await supabase.from("action_items").update({status:"completed",completed_at:completedAt}).eq("id",task.action_item_id).in("status",["open","in_progress","blocked"]);

  for(const item of evidence){
    const dimension=text(item.lifecycle_dimension);
    await supabase.from("project_completion_evidence").insert({
      organization_id:task.organization_id,project_id:task.project_id,task_run_id:task.id,
      lifecycle_dimension:["work","deliverable","implementation","verification","outcome"].includes(dimension)?dimension:null,
      evidence_type:text(item.evidence_type,"agent_report"),source:text(item.source,"project_task_agent"),
      authoritative_source:false,validator:"agent_structured_claim",verification_result:text(item.verification_result)||null,
      confidence:typeof item.confidence==="number"?Math.max(0,Math.min(1,item.confidence)):null,
      external_system_reference:text(item.external_system_reference)||null,structured_data:item,
    });
  }
  for(let index=0;index<blockers.length;index++){
    const blocker=blockers[index];
    if(!(blocker.blocking===true||["high","critical"].includes(text(blocker.severity).toLowerCase())))continue;
    const description=text(blocker.summary,"Task reported a blocking condition.");
    await supabase.from("project_completion_criteria").upsert({
      organization_id:task.organization_id,project_id:task.project_id,
      dimension:["deliverable","implementation","verification","outcome","acceptance","closeout"].includes(text(blocker.dimension))?text(blocker.dimension):"outcome",
      criterion_key:`task-blocker-${task.id}-${index}`,description,required:true,validator_type:"manager_or_authoritative_evidence",state:"blocked",
      failure_reason:description,source_entity_type:"project_task_run",source_entity_id:task.id,
      metadata:{blocker_type:"agent_reported",severity:text(blocker.severity,"high"),next_required_action:text(blocker.next_required_action)||nextRequiredAction},
    },{onConflict:"project_id,criterion_key"});
  }
  await supabase.from("project_activity_events").insert({
    organization_id:task.organization_id,project_id:task.project_id,execution_id:task.execution_id,agent_id:task.assigned_agent_id,
    event_type:"task.completed",headline:task.title,detail:text(data.summary,"Task work completed."),importance:hasBlocking?"attention":"normal",
    correlation_id:response.correlationId,metadata:{task_run_id:task.id,work_completed:true,implementation_executed:implementationExecuted,verification_result:verification,outcome_observed:outcomeObserved},
  });
  await evaluateProjectCompletion(supabase,task.project_id,"task_completed_structured","project_task_run",task.id);
}

export async function dispatchProjectWorkV2(supabase:SupabaseClient,workerId=`project-worker-v2-${randomUUID()}`){
  await supabase.rpc("recover_stale_project_task_runs_v1");
  const claimed=await supabase.rpc("claim_project_task_runs_v1",{worker_id:workerId,claim_limit:6,lease_seconds:240});
  if(claimed.error)throw new Error(claimed.error.message);
  const results:Array<{id:string;status:string;error?:string}>=[];
  for(const task of claimed.data??[]){
    try{
      await executeStructuredTask(supabase,task);
      results.push({id:task.id,status:"completed"});
    }catch(error){
      const exhausted=Number(task.attempt_count??1)>=Number(task.max_attempts??5);
      const delay=Math.min(1800,30*(2**Math.min(Number(task.attempt_count??1),6)));
      await supabase.from("project_task_runs").update({
        status:exhausted?"failed":"retrying",error_class:exhausted?"retry_exhausted":"transient_or_unknown",
        error_message:error instanceof Error?error.message:"Project task execution failed.",lease_owner:null,lease_expires_at:null,
        next_attempt_at:exhausted?null:new Date(Date.now()+delay*1000).toISOString(),updated_at:new Date().toISOString(),
      }).eq("id",task.id);
      await supabase.from("project_activity_events").insert({
        organization_id:task.organization_id,project_id:task.project_id,execution_id:task.execution_id,agent_id:task.assigned_agent_id,
        event_type:exhausted?"task.failed":"task.retrying",headline:exhausted?`Task failed: ${task.title}`:`Task retry scheduled: ${task.title}`,
        detail:error instanceof Error?error.message:"Execution error",importance:exhausted?"attention":"normal",metadata:{task_run_id:task.id,attempt_count:task.attempt_count},
      });
      await evaluateProjectCompletion(supabase,task.project_id,exhausted?"task_failed":"task_retrying","project_task_run",task.id);
      results.push({id:task.id,status:exhausted?"failed":"retrying",error:error instanceof Error?error.message:"failed"});
    }
  }
  // Execution terminality is reconciled centrally by reconcile_project_execution_terminal_states_v1.
  // This worker deliberately never writes project status=completed or project progress=100.
  return results;
}
