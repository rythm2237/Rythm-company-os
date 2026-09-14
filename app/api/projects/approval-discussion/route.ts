import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { executeAiRequest } from "@/lib/ai/request-gateway";
import { buildProductionAgentPolicy, buildProductionTenantPolicy, effectiveRequestCostLimit } from "@/lib/ai/production-path-policy";
import { getRuntimeConfig } from "@/lib/runtime-config";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=300;

const jsonError=(message:string,status:number)=>NextResponse.json({ok:false,error:message},{status});

type AgentRow={id:string;agent_code:string;display_name:string|null;name:string;role_title:string;purpose:string|null;work_style:string|null;enabled:boolean};
type DiscussionRow={id:string;speaker_type:"ceo"|"agent"|"system";user_id:string|null;agent_id:string|null;content:string;ai_correlation_id:string|null;model:string|null;created_at:string;agents?:AgentRow|AgentRow[]|null};

function normalizeAgent(value:unknown):AgentRow|null{
  if(Array.isArray(value))return (value[0]??null) as AgentRow|null;
  return (value??null) as AgentRow|null;
}

async function loadContext(projectId:string,approvalId:string){
  const auth=await resolveOwnerApiOrganizationContext();
  if(!auth.ok)return {ok:false as const,response:jsonError(auth.error,auth.status)};
  const {supabase,organizationId}=auth;
  const [projectResult,approvalResult]=await Promise.all([
    supabase.from("projects").select("id,name,project_code,description,objective,status,stage,autonomy_mode").eq("id",projectId).eq("organization_id",organizationId).maybeSingle(),
    supabase.from("approval_requests").select("id,project_id,subject_type,subject_id,title,summary,risk_level,status,conditions,created_at,expires_at").eq("id",approvalId).eq("project_id",projectId).eq("organization_id",organizationId).maybeSingle(),
  ]);
  if(!projectResult.data)return {ok:false as const,response:jsonError("Project not found.",404)};
  if(!approvalResult.data)return {ok:false as const,response:jsonError("Approval request not found.",404)};
  return {ok:true as const,auth,project:projectResult.data,approval:approvalResult.data};
}

export async function GET(request:Request){
  const url=new URL(request.url);
  const projectId=url.searchParams.get("projectId")?.trim()??"";
  const approvalId=url.searchParams.get("approvalId")?.trim()??"";
  if(!projectId||!approvalId)return jsonError("projectId and approvalId are required.",400);
  const context=await loadContext(projectId,approvalId);if(!context.ok)return context.response;
  const {auth}=context;
  const result=await auth.supabase.from("project_approval_discussion_messages")
    .select("id,speaker_type,user_id,agent_id,content,ai_correlation_id,model,created_at,agents(id,agent_code,display_name,name,role_title,purpose,work_style,enabled)")
    .eq("organization_id",auth.organizationId).eq("project_id",projectId).eq("approval_id",approvalId).order("created_at").order("id");
  if(result.error)return jsonError(`Decision discussion could not be loaded: ${result.error.message}`,500);
  return NextResponse.json({ok:true,approvalStatus:context.approval.status,messages:result.data??[]});
}

export async function POST(request:Request){
  let body:{projectId?:string;approvalId?:string;message?:string};
  try{body=await request.json();}catch{return jsonError("Invalid request.",400);}
  const projectId=String(body.projectId??"").trim();
  const approvalId=String(body.approvalId??"").trim();
  const message=String(body.message??"").trim();
  if(!projectId||!approvalId)return jsonError("projectId and approvalId are required.",400);
  if(message.length<2)return jsonError("Enter a question or comment for the project team.",400);
  if(message.length>4000)return jsonError("Decision discussion messages are limited to 4000 characters.",400);

  const context=await loadContext(projectId,approvalId);if(!context.ok)return context.response;
  const {auth,project,approval}=context;
  if(approval.status!=="pending")return jsonError("This decision is no longer pending. The discussion remains in history, but new questions cannot be added.",409);
  if(approval.expires_at&&new Date(approval.expires_at)<=new Date())return jsonError("This approval request has expired.",409);

  const config=getRuntimeConfig();
  if(!config.agentExecutionEnabled)return jsonError("Agent execution is disabled by environment policy.",503);
  if(!config.openAIConfigured||!config.dryRunModel)return jsonError("AI decision discussion is not configured in this environment.",503);
  let tenantPolicy:ReturnType<typeof buildProductionTenantPolicy>;
  try{tenantPolicy=buildProductionTenantPolicy(auth.entitlement);}catch{return jsonError("The active organization does not have an active AI entitlement.",403);}

  const [taskResult,projectAgentsResult,scopeResult,documentsResult,existingResult]=await Promise.all([
    auth.supabase.from("project_task_runs").select("id,title,task_key,status,assigned_agent_id,priority,dependencies,error_class,error_message").eq("organization_id",auth.organizationId).eq("project_id",projectId).eq("waiting_on_approval_id",approvalId).maybeSingle(),
    auth.supabase.from("project_agents").select("agent_id,status,assignment_role,agents(id,agent_code,display_name,name,role_title,purpose,work_style,enabled)").eq("organization_id",auth.organizationId).eq("project_id",projectId).eq("status","active"),
    auth.supabase.from("project_scope_versions").select("version,included,excluded,assumptions,dependencies,deliverables,success_criteria,status").eq("organization_id",auth.organizationId).eq("project_id",projectId).order("version",{ascending:false}).limit(1).maybeSingle(),
    auth.supabase.from("project_documents").select("file_name,category,extracted_summary,extraction_status").eq("organization_id",auth.organizationId).eq("project_id",projectId).order("created_at",{ascending:false}).limit(6),
    auth.supabase.from("project_approval_discussion_messages").select("id,speaker_type,user_id,agent_id,content,created_at,agents(id,agent_code,display_name,name,role_title,purpose,work_style,enabled)").eq("organization_id",auth.organizationId).eq("project_id",projectId).eq("approval_id",approvalId).order("created_at").order("id").limit(30),
  ]);

  const task=taskResult.data;
  const projectAgents=(projectAgentsResult.data??[]) as any[];
  let responderId=task?.assigned_agent_id??null;
  if(!responderId){
    const preferred=projectAgents.find(row=>/(manager|director|lead|strateg)/i.test(String(row.assignment_role??"")+" "+String(normalizeAgent(row.agents)?.role_title??"")))??projectAgents[0];
    responderId=preferred?.agent_id??null;
  }
  if(!responderId)return jsonError("No responsible project agent is available to answer this decision question.",409);

  const agentResult=await auth.supabase.from("agents").select("id,agent_code,display_name,name,role_title,purpose,work_style,enabled").eq("id",responderId).eq("organization_id",auth.organizationId).maybeSingle();
  const agent=agentResult.data as AgentRow|null;
  if(!agent)return jsonError("The responsible agent record is unavailable.",409);
  if(!agent.enabled)return jsonError(`Agent ${agent.agent_code} is paused. Enable the agent before starting a decision discussion.`,409);

  const userInsert=await auth.supabase.from("project_approval_discussion_messages").insert({
    organization_id:auth.organizationId,project_id:projectId,approval_id:approvalId,speaker_type:"ceo",user_id:auth.user.id,content:message,
  }).select("id,speaker_type,user_id,agent_id,content,ai_correlation_id,model,created_at").single();
  if(userInsert.error||!userInsert.data)return jsonError(userInsert.error?.message??"Your question could not be saved.",500);

  const history=((existingResult.data??[]) as DiscussionRow[]).slice(-16).map(row=>{
    const speaker=row.speaker_type==="ceo"?"Human CEO":normalizeAgent(row.agents)?.agent_code??"Project agent";
    return `${speaker}: ${row.content}`;
  }).join("\n\n");
  const docContext=(documentsResult.data??[]).filter(row=>row.extracted_summary).map(row=>`${row.category}: ${row.file_name}\n${String(row.extracted_summary).slice(0,1400)}`).join("\n\n");
  const scope=scopeResult.data;
  const scopeContext=scope?JSON.stringify({version:scope.version,status:scope.status,included:scope.included,excluded:scope.excluded,assumptions:scope.assumptions,dependencies:scope.dependencies,deliverables:scope.deliverables,success_criteria:scope.success_criteria}).slice(0,9000):"No structured scope is currently available.";
  const taskContext=task?JSON.stringify(task).slice(0,4000):"No directly linked project task was found; answer from the approval and project context only.";
  const approvalContext=JSON.stringify({title:approval.title,summary:approval.summary,risk_level:approval.risk_level,conditions:approval.conditions,subject_type:approval.subject_type,subject_id:approval.subject_id}).slice(0,5000);

  try{
    const gateway=await executeAiRequest({
      organizationId:auth.organizationId,
      actor:{type:"agent",userId:auth.user.id,agentId:agent.id},
      context:{projectId},
      feature:"internal.unspecified",
      systemInstructions:`You are ${agent.agent_code}, ${agent.display_name??agent.name}, the RYTHM ${agent.role_title}, answering the Human CEO inside a pending project decision gate. Your mandate is to clarify the recommendation so the CEO can make an informed decision. Answer the CEO's actual question directly. Explain rationale, evidence available in the supplied project context, material risks, trade-offs, alternatives, and what happens if the CEO approves, rejects, or waits when relevant. State uncertainty explicitly. Never claim evidence that is not present. Never approve, reject, release, execute, spend, message externally, or mutate project state. The decision must remain pending until the Human CEO explicitly presses Approve or Reject. Keep the answer concise and decision-oriented. Use the language of the CEO's latest message.`,
      prompt:`Project: ${project.name} (${project.project_code})\nObjective: ${project.objective??project.description??"Not specified"}\nProject status: ${project.status} / ${project.stage}\nAutonomy mode: ${project.autonomy_mode}\n\nPending decision:\n${approvalContext}\n\nLinked workstream:\n${taskContext}\n\nLatest approved/draft scope:\n${scopeContext}\n\nRelevant extracted project documents:\n${docContext||"No extracted document summaries available."}\n\nPrevious decision discussion:\n${history||"No previous discussion."}\n\nHuman CEO's latest question/comment:\n${message}\n\nRespond only with the clarification needed for this pending decision.`,
      mode:"chat",
      maxOutputTokens:1400,
      timeoutMs:config.agentTimeoutMs,
      agentPolicy:buildProductionAgentPolicy({agentId:agent.id,roleTitle:agent.role_title,riskCeiling:"high",maxCostPerRequest:auth.entitlement?effectiveRequestCostLimit(auth.entitlement):undefined,maxOutputTokens:1400}),
      tenantPolicy,
      legacyFallback:{provider:"openai",model:config.dryRunModel,reason:"compatibility"},
      telemetryPolicy:"required",
    });
    const answer=gateway.outputText.trim().slice(0,12000);
    if(!answer)return jsonError("The project agent returned no usable clarification. Your question is saved and can be retried.",502);
    const agentInsert=await auth.supabase.from("project_approval_discussion_messages").insert({
      organization_id:auth.organizationId,project_id:projectId,approval_id:approvalId,speaker_type:"agent",agent_id:agent.id,content:answer,ai_correlation_id:gateway.correlationId,model:gateway.routingDecision.selectedModel,
    }).select("id,speaker_type,user_id,agent_id,content,ai_correlation_id,model,created_at").single();
    if(agentInsert.error||!agentInsert.data)return jsonError(agentInsert.error?.message??"The agent response could not be saved.",500);

    await Promise.all([
      auth.supabase.from("audit_events").insert({organization_id:auth.organizationId,actor_type:"user",actor_user_id:auth.user.id,event_type:"approval.discussion",object_type:"approval_request",object_id:approvalId,risk_level:"low",payload:{project_id:projectId,agent_id:agent.id,ai_correlation_id:gateway.correlationId,approval_status:"pending",source:"project_operating_view"}}),
      auth.supabase.from("project_activity_events").insert({organization_id:auth.organizationId,project_id:projectId,agent_id:agent.id,event_type:"approval.discussion",headline:`CEO discussed pending decision with ${agent.agent_code}`,detail:`${approval.title} remains pending; no authorization was granted by the discussion.`,importance:"normal",correlation_id:gateway.correlationId}),
    ]);
    return NextResponse.json({ok:true,approvalStatus:"pending",responder:{id:agent.id,code:agent.agent_code,name:agent.display_name??agent.name,role:agent.role_title},messages:[userInsert.data,{...agentInsert.data,agents:agent}]});
  }catch(error){
    console.error("project_approval_discussion_agent_failed",{projectId,approvalId,agentId:agent.id,error:error instanceof Error?error.message:String(error)});
    return jsonError(error instanceof Error?error.message:"The project agent could not answer this question. Your message was saved and the approval remains pending.",502);
  }
}
