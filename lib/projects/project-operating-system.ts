import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeAiRequest } from "@/lib/ai/request-gateway";
import { getRuntimeConfig } from "@/lib/runtime-config";
import type { ApprovedCustomerCorrection } from "@/lib/projects/project-customer-context";
import { ensureProjectAgentReservation } from "@/lib/projects/project-agent-assignment";
import { buildBusinessContext, normalizeProjectDiagnosis, prioritizeProjectQuestions, PROJECT_DISCOVERY_INSTRUCTIONS, normalizeBusinessCorrection, essentialResourceQuestions, type EvidenceSource } from "@/lib/projects/project-intelligence";

const cleanJson = (value:string) => {
  const stripped=value.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/i,"").trim();
  try{JSON.parse(stripped);return stripped;}catch{}
  const starts=[stripped.indexOf("{"),stripped.indexOf("[")].filter(index=>index>=0).sort((a,b)=>a-b);
  for(const start of starts){
    const open=stripped[start];const close=open==="{"?"}":"]";let depth=0;let inString=false;let escaped=false;
    for(let i=start;i<stripped.length;i++){
      const ch=stripped[i];
      if(inString){if(escaped){escaped=false;continue;}if(ch==="\\"){escaped=true;continue;}if(ch==='"')inString=false;continue;}
      if(ch==='"'){inString=true;continue;}if(ch===open)depth+=1;else if(ch===close){depth-=1;if(depth===0)return stripped.slice(start,i+1).replace(/,\s*([}\]])/g,"$1");}
    }
  }
  return stripped.replace(/,\s*([}\]])/g,"$1");
};
const list = (value:unknown) => Array.isArray(value) ? value : [];
const str = (value:unknown,fallback="") => typeof value === "string" ? value : fallback;
const num = (value:unknown,fallback=0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

export type ProjectPlanTask = {
  key:string;
  title:string;
  description:string;
  priority:number;
  dependencies:string[];
  agentId?:string|null;
  risk:"low"|"medium"|"high"|"critical";
  requiresApproval?:boolean;
  approvalReason?:string;
};

async function gatewayJson(input:{organizationId:string;projectId:string;feature?:"company.document_extraction"|"internal.unspecified";system:string;prompt:string;attachments?:Array<{filename:string;mimeType:string;base64:string}>;maxOutputTokens?:number}) {
  const config=getRuntimeConfig();
  if(!config.openAIConfigured || !config.dryRunModel) throw new Error("Project intelligence requires the configured RYTHM AI Gateway provider.");
  const response=await executeAiRequest({
    organizationId:input.organizationId,
    actor:{type:"system"},
    context:{projectId:input.projectId},
    feature:input.feature??"internal.unspecified",
    systemInstructions:`${input.system}\nOutput contract: emit exactly one valid JSON object or array. Do not use Markdown fences, commentary, prefaces or trailing text.`,
    prompt:input.prompt,
    attachments:input.attachments,
    attachmentFailurePolicy:"fail",
    mode:"task",
    maxOutputTokens:input.maxOutputTokens??5000,
    timeoutMs:config.agentTimeoutMs,
    legacyFallback:{provider:"openai",model:config.dryRunModel,reason:"compatibility"},
    telemetryPolicy:"required",
  });
  try{
    const parsed=JSON.parse(cleanJson(response.outputText));
    if(!parsed||typeof parsed!=="object")throw new Error("Structured response must be an object or array.");
    return {data:parsed as Record<string,unknown>,correlationId:response.correlationId,costUsd:response.actualCostUsd??0};
  }catch{
    throw new Error(`Project intelligence returned an invalid structured response. Correlation: ${response.correlationId}`);
  }
}

export async function analyzeProjectOS(supabase:SupabaseClient,organizationId:string,projectId:string,options:{customerContext?:Record<string,unknown>|null;customerCorrections?:ApprovedCustomerCorrection[]}={}) {
  const [projectResult,clientResult,contractResult,documentsResult,resourcesResult,connectionsResult,integrationsResult,agentsResult,knowledgeResult,answersResult,activeExecutionResult,baselineResult]=await Promise.all([
    supabase.from("projects").select("*").eq("organization_id",organizationId).eq("id",projectId).single(),
    supabase.from("project_clients").select("id,client_name,trading_name,client_type,website,country,relationship_type,updated_at").eq("organization_id",organizationId).eq("project_id",projectId).maybeSingle(),
    Promise.resolve({data:null,error:null}), // Confidential contracts require a separate explicitly authorized principal.
    supabase.from("project_documents").select("id,category,file_name,storage_path,mime_type,byte_size,legal_document,extraction_status,extracted_summary,extracted_data").eq("organization_id",organizationId).eq("project_id",projectId).eq("confidentiality","operational").order("created_at"),
    supabase.from("project_resources").select("id,resource_type,name,url,external_reference,status,description,source,access_status,metadata").eq("organization_id",organizationId).eq("project_id",projectId),
    supabase.from("project_connection_bindings").select("id,integration_id,resource_type,resource_ref,display_name,permission_scope,access_status,recommendation_level").eq("organization_id",organizationId).eq("project_id",projectId),
    supabase.from("organization_integrations").select("id,provider_key,display_name,status,account_ref,base_url,metadata").eq("organization_id",organizationId),
    supabase.from("agents").select("id,agent_code,name,display_name,role_title,purpose,authority_level,risk_ceiling,enabled,permissions").eq("organization_id",organizationId).eq("enabled",true),
    supabase.from("project_context_documents").select("id,title,summary,evidence,status,created_at,source_name,context_type").eq("organization_id",organizationId).eq("project_id",projectId).eq("confidentiality","operational").neq("context_type","project_analysis").order("created_at",{ascending:false}).limit(20),
    supabase.from("project_clarification_requests").select("question_key,question,answer,status,answered_at").eq("organization_id",organizationId).eq("project_id",projectId).eq("status","answered"),
    supabase.from("project_executions").select("id").eq("organization_id",organizationId).eq("project_id",projectId).in("status",["queued","running","paused"]).limit(1).maybeSingle(),
    supabase.from("project_roadmaps").select("id").eq("organization_id",organizationId).eq("project_id",projectId).eq("status","approved").eq("is_baseline",true).limit(1).maybeSingle(),
  ]);
  if(projectResult.error || !projectResult.data) throw new Error("Project not found or unavailable.");
  for(const result of [documentsResult,resourcesResult,connectionsResult,integrationsResult,agentsResult,knowledgeResult,answersResult,activeExecutionResult,baselineResult])if(result.error)throw new Error(`Project analysis context unavailable: ${result.error.message}`);
  const project=projectResult.data;
  const documents=documentsResult.data??[];
  // The caller supplies only CRM fields readable through the authenticated principal's RLS.
  const customer=options.customerContext??null;
  const reusableCorrections=options.customerCorrections??[];
  const sources:EvidenceSource[]=[
    ...reusableCorrections.map(correction=>correction.source),
    {id:"brief",kind:"brief",summary:String(project.description||project.objective||""),recordedAt:project.updated_at??null,verification:"submitted"},
    ...(customer?[{id:`crm:${customer.id}`,kind:"crm" as const,summary:JSON.stringify(customer),recordedAt:typeof customer.updated_at==="string"?customer.updated_at:null,verification:"recorded" as const}]:[]),
    ...(knowledgeResult.data??[]).map((row:any)=>({id:`knowledge:${row.id}`,kind:"knowledge" as const,summary:String(row.summary??"").slice(0,3000),recordedAt:row.created_at??null,verification:row.status==="approved"?"approved" as const:"recorded" as const})),
    ...(answersResult.data??[]).map((row:any)=>({id:`answer:${row.question_key}`,kind:"answer" as const,summary:JSON.stringify({question:row.question,answer:row.answer}).slice(0,3000),recordedAt:row.answered_at??null,verification:"recorded" as const})),
    ...(resourcesResult.data??[]).map((row:any)=>({id:`resource:${row.id}`,kind:"resource" as const,summary:JSON.stringify({type:row.resource_type,name:row.name,url:row.url,status:row.status}).slice(0,1500),recordedAt:null,verification:"submitted" as const})),
  ];
  if(clientResult.data?.website)sources.push({id:`client:${clientResult.data.id}`,kind:"brief",summary:JSON.stringify(clientResult.data),recordedAt:clientResult.data.updated_at??null,verification:"recorded"});
  const businessContext=buildBusinessContext({description:String(project.description??""),objective:String(project.objective??""),customer,sources});
  for(const correction of reusableCorrections){
    businessContext.claims=businessContext.claims.filter(claim=>claim.key!==correction.key);
    businessContext.claims.push({key:correction.key,value:correction.value,status:"recorded",sourceIds:[correction.source.id],reliability:"source_record",scope:"project"});
  }
  for(const row of knowledgeResult.data??[]){
    if(row.context_type!=="business_context_correction"||row.status!=="approved")continue;
    const evidence=row.evidence as Record<string,unknown>|null;
    const correction=normalizeBusinessCorrection(evidence);
    if(!correction)continue;
    businessContext.claims=businessContext.claims.filter(claim=>claim.key!==correction.key);
    businessContext.claims.push({key:correction.key,value:correction.value,status:"recorded",sourceIds:[`knowledge:${row.id}`],reliability:"source_record",scope:"project"});
  }
  // Do not pass legal attachments, commercial terms or their summaries into shared analysis.
  const legalAnalysis:Record<string,unknown>|null=null;
  const legalCorrelationId:string|null=null;

  const analysisInput={
    project:{name:project.name,description:project.description,project_type:project.project_type,objective:project.objective,priority:project.priority,target_date:project.target_date,start_date:project.start_date,scope:project.scope,success_criteria:project.success_criteria,constraints:project.constraints,notes:project.notes,autonomy_mode:project.autonomy_mode},
    client:clientResult.data??null,
    business_context:businessContext,
    answered_clarifications:answersResult.data??[],
    contract:contractResult.data??null,
    legal_analysis:legalAnalysis,
    documents:documents.map((d:any)=>({category:d.category,file_name:d.file_name,summary:d.extracted_summary})),
    resources:resourcesResult.data??[],
    project_connections:connectionsResult.data??[],
    available_company_integrations:(integrationsResult.data??[]).map((i:any)=>({id:i.id,provider:i.provider_key,name:i.display_name,status:i.status})),
    available_agents:(agentsResult.data??[]).map((a:any)=>({id:a.id,code:a.agent_code,name:a.display_name||a.name,role:a.role_title,purpose:a.purpose,authority:a.authority_level,risk_ceiling:a.risk_ceiling})),
  };

  const intelligence=await gatewayJson({organizationId,projectId,maxOutputTokens:7000,
    system:`You are the RYTHM Project Operating System analyst. Understand business outcomes, not workflow jargon. Use only supplied evidence. Recommend connections and team members; never silently attach ambiguous resources. Respect Human CEO authority, entitlements and existing company agents. Return JSON only. ${PROJECT_DISCOVERY_INSTRUCTIONS}`,
    prompt:`Analyze this project intake and return JSON with exactly these keys: diagnosis (as specified in the system contract), understanding_summary (string), project_understanding (0-100), contract_understanding (0-100), execution_readiness (0-100), risks (array), missing_inputs (array following the system clarification contract), required_connections (array of {provider,resource_type,reason,capabilities}), recommended_connections (same shape), team_recommendation (array of {agent_id,reason,allocation_percent}), scope ({included,excluded,assumptions,dependencies,deliverables,success_criteria}), plan_outline (array of phases), success_definition (array). Evidence: ${JSON.stringify(analysisInput).slice(0,42000)}`});
  const data=intelligence.data;
  const resolvedKeys=new Set((answersResult.data??[]).map((row:any)=>String(row.question_key)));
  const resourceQuestions=essentialResourceQuestions(String(project.description??""),sources);
  const questions=prioritizeProjectQuestions([...resourceQuestions,...list(data.missing_inputs)],resolvedKeys);
  const missing=questions.selected;
  const diagnosis=normalizeProjectDiagnosis(data.diagnosis,{description:String(project.description??""),objective:String(project.objective??""),sources,questionCount:missing.length});
  diagnosis.uncertainties=[...new Set([...diagnosis.uncertainties,...missing.map(question=>`${question.key}: ${question.reason}`)])];
  const requiredConnections=list(data.required_connections);
  const connectedProviders=new Set((connectionsResult.data??[]).filter((c:any)=>c.access_status==="connected").map((c:any)=>c.resource_type));
  const availableConnections=requiredConnections.filter((c:any)=>connectedProviders.has(str(c.resource_type)||str(c.provider))).length;
  const team=list(data.team_recommendation);
  const enabledAgentIds=new Set((agentsResult.data??[]).map((a:any)=>a.id));
  const validTeam=team.filter((t:any)=>enabledAgentIds.has(str(t.agent_id)));
  const readiness=Math.max(0,Math.min(100,Math.round(num(data.execution_readiness,0))));

  const savedAssessment=await supabase.from("project_readiness_assessments").insert({
    organization_id:organizationId,project_id:projectId,
    project_understanding:Math.round(num(data.project_understanding,0)),contract_understanding:Math.round(num(data.contract_understanding,0)),
    required_inputs_total:missing.length,required_inputs_available:0,connections_total:requiredConnections.length,connections_available:availableConnections,
    team_readiness:validTeam.length===team.length?100:Math.round((validTeam.length/Math.max(1,team.length))*100),execution_readiness:readiness,
    risks:list(data.risks),missing_inputs:missing,required_connections:requiredConnections,recommended_connections:list(data.recommended_connections),team_recommendation:validTeam,
    evidence:{understanding_summary:data.understanding_summary,success_definition:data.success_definition,plan_outline:data.plan_outline,business_context:businessContext,diagnosis,deferred_questions:questions.deferred,ai_correlation_id:intelligence.correlationId,legal_correlation_id:legalCorrelationId}
  });
  if(savedAssessment.error)throw new Error(`Unable to save project intelligence: ${savedAssessment.error.message}`);

  for(const item of missing){
    if(!item || typeof item!=="object") continue;
    const row=item as Record<string,unknown>; const key=str(row.key); const question=str(row.question); if(!key||!question) continue;
    const existing=await supabase.from("project_clarification_requests").select("id").eq("organization_id",organizationId).eq("project_id",projectId).eq("question_key",key).eq("status","open").maybeSingle();
    if(!existing.data) await supabase.from("project_clarification_requests").insert({organization_id:organizationId,project_id:projectId,question_key:key,question,reason:str(row.reason,"Required for reliable execution."),input_type:str(row.input_type,"text"),options:list(row.options),materiality:str(row.materiality,"required")});
  }

  const previousScope=await supabase.from("project_scope_versions").select("version").eq("project_id",projectId).order("version",{ascending:false}).limit(1).maybeSingle();
  const scope=(data.scope&&typeof data.scope==="object"?data.scope:{}) as Record<string,unknown>;
  await supabase.from("project_scope_versions").insert({organization_id:organizationId,project_id:projectId,version:Number(previousScope.data?.version??0)+1,included:list(scope.included),excluded:list(scope.excluded),assumptions:list(scope.assumptions),dependencies:list(scope.dependencies),deliverables:list(scope.deliverables),success_criteria:list(scope.success_criteria),status:"draft",generated_from:{readiness_assessment:true,ai_correlation_id:intelligence.correlationId}});
  await supabase.from("projects").update({readiness_score:readiness,last_analyzed_at:new Date().toISOString(),...(!activeExecutionResult.data&&!baselineResult.data?{stage:missing.length?"clarification":"scope_review"}:{}),updated_at:new Date().toISOString()}).eq("id",projectId).eq("organization_id",organizationId);
  await supabase.from("project_context_documents").upsert({organization_id:organizationId,project_id:projectId,context_type:"project_analysis",title:"Project Operating System analysis",summary:str(data.understanding_summary,"Project analysis completed."),source_name:"RYTHM Project Operating System",evidence:{readiness,risks:data.risks,connections:requiredConnections,team:validTeam,business_context:businessContext,diagnosis,correlation_id:intelligence.correlationId},status:"draft",confidence:0},{onConflict:"project_id,title"});
  await supabase.from("project_activity_events").insert({organization_id:organizationId,project_id:projectId,event_type:"project.analysis.completed",headline:"Project analysis completed",detail:`Execution readiness ${readiness}%`,importance:readiness<60?"attention":"normal",correlation_id:intelligence.correlationId});
  return {readiness,missingInputs:missing.length,deferredQuestions:questions.deferred.length,requiredConnections:requiredConnections.length,team:validTeam,scope,businessContext,diagnosis,assignmentRequirements:{skills:businessContext.capabilities,domain:businessContext.domainProfiles[0]},correlationId:intelligence.correlationId};
}

export async function createDynamicExecutionPlan(supabase:SupabaseClient,organizationId:string,projectId:string):Promise<ProjectPlanTask[]> {
  const [project,readiness,scope,agents,existingActions]=await Promise.all([
    supabase.from("projects").select("id,name,project_code,project_type,description,objective,priority,target_date,constraints,autonomy_mode,readiness_score").eq("organization_id",organizationId).eq("id",projectId).single(),
    supabase.from("project_readiness_assessments").select("*").eq("organization_id",organizationId).eq("project_id",projectId).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("project_scope_versions").select("*").eq("organization_id",organizationId).eq("project_id",projectId).order("version",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("project_agents").select("agent_id,assignment_role,status,authority_scope,agents(id,agent_code,name,display_name,role_title,purpose,risk_ceiling,enabled)").eq("organization_id",organizationId).eq("project_id",projectId),
    supabase.from("action_items").select("id,action_code,title,description,priority,dependencies,risk_level,assigned_agent_id,status").eq("organization_id",organizationId).eq("project_id",projectId).neq("status","cancelled").order("execution_order",{ascending:true}),
  ]);
  if(project.error||!project.data) throw new Error("Project not found.");
  if((existingActions.data??[]).length){
    return (existingActions.data??[]).map((a:any,index:number)=>({key:a.action_code||`task-${index+1}`,title:a.title,description:a.description||"",priority:a.priority,dependencies:(Array.isArray(a.dependencies)?a.dependencies:[]).map(String),agentId:a.assigned_agent_id,risk:a.risk_level||"low"}));
  }
  const agentCatalog=(agents.data??[]).map((p:any)=>{const a=Array.isArray(p.agents)?p.agents[0]:p.agents;return {id:p.agent_id,role:p.assignment_role,code:a?.agent_code,title:a?.role_title,purpose:a?.purpose,risk_ceiling:a?.risk_ceiling,enabled:a?.enabled};}).filter((a:any)=>a.enabled!==false);
  const planned=await gatewayJson({organizationId,projectId,maxOutputTokens:6500,
    system:"You are the RYTHM Project Planner. Build a goal-specific execution plan, not a universal workflow. Tasks must have dependency keys, use only listed company agents, and preserve Human CEO authority. External communication, spend, legal commitments, destructive operations and material production changes require governance. Return JSON only.",
    prompt:`Create a dynamic execution plan for this project. Return {tasks:[{key,title,description,priority(1-5),dependencies:[task_key],agent_id,risk(low|medium|high|critical),requires_approval,approval_reason}]}. Project=${JSON.stringify(project.data)} Latest readiness=${JSON.stringify(readiness.data??{})} Approved/draft scope=${JSON.stringify(scope.data??{})} Available project agents=${JSON.stringify(agentCatalog)}`});
  const allowed=new Set(agentCatalog.map((a:any)=>a.id));
  const tasks=list(planned.data.tasks).slice(0,60).map((raw:any,index:number):ProjectPlanTask=>({
    key:str(raw.key,`task-${index+1}`).replace(/[^a-zA-Z0-9._-]/g,"-").slice(0,80),title:str(raw.title,`Project task ${index+1}`).slice(0,240),description:str(raw.description).slice(0,5000),priority:Math.max(1,Math.min(5,Math.round(num(raw.priority,3)))),dependencies:list(raw.dependencies).map(String),agentId:allowed.has(str(raw.agent_id))?str(raw.agent_id):null,risk:(['low','medium','high','critical'].includes(str(raw.risk))?str(raw.risk):'low') as ProjectPlanTask['risk'],requiresApproval:Boolean(raw.requires_approval),approvalReason:str(raw.approval_reason)
  }));
  if(!tasks.length) throw new Error("Project planner produced no executable tasks.");
  return tasks;
}

export async function startProjectExecution(supabase:SupabaseClient,organizationId:string,projectId:string,userId:string) {
  const project=await supabase.from("projects").select("id,name,project_code,readiness_score,status,autonomy_mode,budget_cap_usd").eq("organization_id",organizationId).eq("id",projectId).single();
  if(project.error||!project.data) throw new Error("Project not found.");
  const openClarifications=await supabase.from("project_clarification_requests").select("id",{count:"exact",head:true}).eq("project_id",projectId).eq("organization_id",organizationId).eq("status","open").eq("materiality","required");
  if((openClarifications.count??0)>0) throw new Error("Required project clarifications must be answered before execution.");
  const active=await supabase.from("project_executions").select("id,execution_no,status").eq("project_id",projectId).in("status",["queued","running","paused"]).maybeSingle();
  if(active.data) return active.data;
  const latest=await supabase.from("project_executions").select("execution_no").eq("project_id",projectId).order("execution_no",{ascending:false}).limit(1).maybeSingle();
  const tasks=await createDynamicExecutionPlan(supabase,organizationId,projectId);
  const agentIds=[...new Set(tasks.map(t=>t.agentId).filter(Boolean))] as string[];
  for(const agentId of agentIds){
    const reservation=await ensureProjectAgentReservation(supabase,{organizationId,projectId,actorId:userId,agentId,taskText:tasks.filter(task=>task.agentId===agentId).map(task=>`${task.title} ${task.description}`).join(" ")});
    if(!reservation.ok)throw new Error(reservation.reason||"Agent capacity could not be reserved.");
  }
  const executionNo=Number(latest.data?.execution_no??0)+1;
  const execution=await supabase.from("project_executions").insert({organization_id:organizationId,project_id:projectId,execution_no:executionNo,status:"running",execution_context:{project_code:project.data.project_code,autonomy_mode:project.data.autonomy_mode},plan_snapshot:{tasks},budget_snapshot:{ai_budget_usd:project.data.budget_cap_usd},started_by_user_id:userId,started_at:new Date().toISOString(),last_heartbeat_at:new Date().toISOString()}).select("id,execution_no,status").single();
  if(execution.error||!execution.data) throw new Error(execution.error?.message||"Unable to create project execution.");

  for(const task of tasks){
    let actionId:string|null=null;
    const action=await supabase.from("action_items").insert({organization_id:organizationId,project_id:projectId,action_code:`${project.data.project_code}-${task.key}`.slice(0,120),title:task.title,description:task.description,status:"open",priority:task.priority,assigned_agent_id:task.agentId??null,dependencies:task.dependencies,success_criteria:[],evidence_required:[],risk_level:task.risk}).select("id").maybeSingle();
    if(action.data) actionId=action.data.id;
    let approvalId:string|null=null;
    if(task.requiresApproval){
      const approval=await supabase.from("approval_requests").insert({organization_id:organizationId,project_id:projectId,subject_type:"project_task",subject_id:actionId??execution.data.id,title:`Decision required: ${task.title}`,summary:task.approvalReason||`Authorization is required before ${task.title} can execute.`,risk_level:task.risk,requested_by_agent_id:task.agentId??null,status:"pending",conditions:["Authorization applies only to this scoped project task."]}).select("id").single();
      approvalId=approval.data?.id??null;
    }
    await supabase.from("project_task_runs").insert({organization_id:organizationId,project_id:projectId,execution_id:execution.data.id,action_item_id:actionId,task_key:task.key,title:task.title,assigned_agent_id:task.agentId??null,status:approvalId?"waiting_for_approval":"queued",priority:task.priority,dependencies:task.dependencies,waiting_on_approval_id:approvalId,idempotency_key:`project:${projectId}:execution:${executionNo}:task:${task.key}`,input:{description:task.description,risk:task.risk}});
  }
  await supabase.from("projects").update({status:"active",stage:"execution",last_heartbeat_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",projectId).eq("organization_id",organizationId);
  await supabase.from("project_activity_events").insert({organization_id:organizationId,project_id:projectId,execution_id:execution.data.id,event_type:"project.execution.started",headline:"Project execution started",detail:`Execution #${executionNo} started with ${tasks.length} tasks. Readiness is advisory and does not globally block independent work.`,importance:"major"});
  return {...execution.data,taskCount:tasks.length};
}

async function executeClaimedTask(supabase:SupabaseClient,task:any) {
  const [project,agent,context,decisions]=await Promise.all([
    supabase.from("projects").select("id,name,description,objective,scope,success_criteria,constraints,autonomy_mode").eq("id",task.project_id).single(),
    task.assigned_agent_id?supabase.from("agents").select("id,agent_code,name,display_name,role_title,purpose,authority_level,risk_ceiling,permissions").eq("id",task.assigned_agent_id).maybeSingle():Promise.resolve({data:null}),
    supabase.from("project_context_documents").select("context_type,title,summary,evidence").eq("confidentiality","operational").eq("project_id",task.project_id).order("created_at",{ascending:false}).limit(12),
    supabase.from("project_decision_memory").select("decision,rationale,constraints,outcome,created_at").eq("project_id",task.project_id).order("created_at",{ascending:false}).limit(12),
  ]);
  if(!project.data) throw new Error("Project context unavailable.");
  const agentRow=(agent as any).data;
  const result=await gatewayJson({organizationId:task.organization_id,projectId:task.project_id,maxOutputTokens:5000,
    system:`You are ${agentRow?.display_name||agentRow?.name||"a RYTHM project agent"}, ${agentRow?.role_title||"Project Specialist"}. Execute internal knowledge work proactively within your professional authority. Do not claim external actions you did not perform. Do not spend money, send external communications, deploy production, delete data, sign contracts, or expand material scope without authorization. If such action is the best next step, create a proposal. Return JSON only.`,
    prompt:`Execute this project task using the supplied shared Project Knowledge. Return {summary,findings,deliverables,decisions,proposal:null|{proposal_type,title,executive_summary,rationale,expected_impact,estimated_cost,cost_currency,risk_level,required_permissions,alternatives_considered},meeting_request:null|{title,purpose,participant_roles},follow_up_tasks:[]}. Task=${JSON.stringify({title:task.title,input:task.input})} Project=${JSON.stringify(project.data)} Knowledge=${JSON.stringify(context.data??[]).slice(0,18000)} Decision memory=${JSON.stringify(decisions.data??[]).slice(0,10000)}`});
  const data=result.data;
  if(data.proposal && typeof data.proposal==="object"){
    const p=data.proposal as Record<string,unknown>;
    const proposal=await supabase.from("project_proposals").insert({organization_id:task.organization_id,project_id:task.project_id,created_by_agent_id:task.assigned_agent_id,department:agentRow?.role_title??null,proposal_type:str(p.proposal_type,"Strategic Recommendation"),title:str(p.title,task.title),executive_summary:str(p.executive_summary,"Agent recommendation requires executive attention."),rationale:str(p.rationale),expected_impact:p.expected_impact&&typeof p.expected_impact==="object"?p.expected_impact:{summary:p.expected_impact},estimated_cost:typeof p.estimated_cost==="number"?p.estimated_cost:null,cost_currency:str(p.cost_currency)||null,risk_level:str(p.risk_level,"medium"),required_permissions:list(p.required_permissions),alternatives_considered:list(p.alternatives_considered),status:"ready_for_executive"}).select("id").single();
    if(proposal.data){
      const approval=await supabase.from("approval_requests").insert({organization_id:task.organization_id,project_id:task.project_id,subject_type:"project_proposal",subject_id:proposal.data.id,title:str(p.title,task.title),summary:str(p.executive_summary,"Executive decision required."),risk_level:str(p.risk_level,"medium"),requested_by_agent_id:task.assigned_agent_id,status:"pending",conditions:["Approval authorizes only the scoped proposal; downstream high-risk actions remain governed by the Execution Gateway."]}).select("id").single();
      await supabase.from("project_proposals").update({approval_request_id:approval.data?.id??null}).eq("id",proposal.data.id);
    }
  }
  if(data.meeting_request && typeof data.meeting_request==="object"){
    const m=data.meeting_request as Record<string,unknown>;
    const meeting=await supabase.from("meetings").insert({organization_id:task.organization_id,project_id:task.project_id,title:str(m.title,`Working session: ${task.title}`),purpose:str(m.purpose,"Resolve project task collaboratively."),status:"draft",human_join_allowed:true,agenda:list(m.participant_roles),chair_agent_id:task.assigned_agent_id}).select("id").single();
    if(meeting.data) await supabase.from("project_activity_events").insert({organization_id:task.organization_id,project_id:task.project_id,execution_id:task.execution_id,agent_id:task.assigned_agent_id,event_type:"meeting.requested",headline:"Agent requested a working session",detail:str(m.purpose),metadata:{meeting_id:meeting.data.id}});
  }
  const completedAt=new Date().toISOString();
  await supabase.from("project_task_runs").update({status:"completed",safe_result:data,completed_at:completedAt,lease_owner:null,lease_expires_at:null,updated_at:completedAt}).eq("id",task.id).eq("lease_owner",task.lease_owner);
  if(task.action_item_id) await supabase.from("action_items").update({status:"completed",completed_at:completedAt}).eq("id",task.action_item_id).in("status",["open","in_progress","blocked"]);
  await supabase.from("project_activity_events").insert({organization_id:task.organization_id,project_id:task.project_id,execution_id:task.execution_id,agent_id:task.assigned_agent_id,event_type:"task.completed",headline:task.title,detail:str(data.summary,"Task completed."),importance:"normal",correlation_id:result.correlationId,metadata:{task_run_id:task.id}});
}

export async function dispatchProjectWork(supabase:SupabaseClient,workerId=`project-worker-${randomUUID()}`) {
  await supabase.rpc("recover_stale_project_task_runs_v1");
  const claimed=await supabase.rpc("claim_project_task_runs_v1",{worker_id:workerId,claim_limit:6,lease_seconds:240});
  if(claimed.error) throw new Error(claimed.error.message);
  const results:Array<{id:string;status:string;error?:string}>=[];
  for(const task of claimed.data??[]){
    try{await executeClaimedTask(supabase,task);results.push({id:task.id,status:"completed"});}
    catch(error){
      const exhausted=Number(task.attempt_count??1)>=Number(task.max_attempts??5);
      const delay=Math.min(1800,30*(2**Math.min(Number(task.attempt_count??1),6)));
      await supabase.from("project_task_runs").update({status:exhausted?"failed":"retrying",error_class:exhausted?"retry_exhausted":"transient_or_unknown",error_message:error instanceof Error?error.message:"Project task execution failed.",lease_owner:null,lease_expires_at:null,next_attempt_at:exhausted?null:new Date(Date.now()+delay*1000).toISOString(),updated_at:new Date().toISOString()}).eq("id",task.id);
      await supabase.from("project_activity_events").insert({organization_id:task.organization_id,project_id:task.project_id,execution_id:task.execution_id,agent_id:task.assigned_agent_id,event_type:exhausted?"task.failed":"task.retrying",headline:exhausted?`Task failed: ${task.title}`:`Task retry scheduled: ${task.title}`,detail:error instanceof Error?error.message:"Execution error",importance:exhausted?"attention":"normal",metadata:{task_run_id:task.id,attempt_count:task.attempt_count}});
      results.push({id:task.id,status:exhausted?"failed":"retrying",error:error instanceof Error?error.message:"failed"});
    }
  }
  const executions=await supabase.from("project_executions").select("id,project_id,organization_id,status").in("status",["queued","running"]);
  for(const execution of executions.data??[]){
    const taskStates=await supabase.from("project_task_runs").select("status").eq("execution_id",execution.id);
    const states=(taskStates.data??[]).map((r:any)=>r.status);
    if(states.length && states.every((s:string)=>s==="completed")){
      const now=new Date().toISOString();
      await supabase.from("project_executions").update({status:"completed",completed_at:now,last_heartbeat_at:now,updated_at:now}).eq("id",execution.id);
      await supabase.from("projects").update({status:"completed",stage:"outcome_review",progress_percent:100,last_heartbeat_at:now,updated_at:now}).eq("id",execution.project_id);
      await supabase.from("project_activity_events").insert({organization_id:execution.organization_id,project_id:execution.project_id,execution_id:execution.id,event_type:"project.execution.completed",headline:"Project execution completed",importance:"major"});
    }else{
      const now=new Date().toISOString();
      await supabase.from("project_executions").update({status:"running",last_heartbeat_at:now,updated_at:now}).eq("id",execution.id);
      await supabase.from("projects").update({last_heartbeat_at:now,updated_at:now}).eq("id",execution.project_id);
    }
  }
  return results;
}
