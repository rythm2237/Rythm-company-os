import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeAiRequest } from "@/lib/ai/request-gateway";
import { getRuntimeConfig } from "@/lib/runtime-config";

const cleanJson=(value:string)=>value.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```$/i,"").trim();
const text=(value:unknown,fallback="")=>typeof value==="string"?value:fallback;
const list=(value:unknown)=>Array.isArray(value)?value:[];

type Agent={id:string;agent_code:string;name:string;display_name:string|null;role_title:string;purpose:string|null;work_style:string|null;enabled:boolean};

async function aiJson(input:{organizationId:string;projectId:string;meetingId:string;agent?:Agent|null;feature:"boardroom.deliberation"|"boardroom.summary";system:string;prompt:string;maxOutputTokens:number}){
  const config=getRuntimeConfig();
  if(!config.openAIConfigured||!config.dryRunModel)throw new Error("Meeting AI provider is unavailable.");
  const result=await executeAiRequest({organizationId:input.organizationId,actor:input.agent?{type:"agent",agentId:input.agent.id}:{type:"system"},context:{projectId:input.projectId,meetingId:input.meetingId},feature:input.feature,systemInstructions:input.system,prompt:input.prompt,mode:"task",maxOutputTokens:input.maxOutputTokens,timeoutMs:config.agentTimeoutMs,legacyFallback:{provider:"openai",model:config.dryRunModel,reason:"compatibility"},telemetryPolicy:"required"});
  try{return {data:JSON.parse(cleanJson(result.outputText)) as Record<string,unknown>,correlationId:result.correlationId,costUsd:result.actualCostUsd??0,inputTokens:Number(result.usage?.inputTokens??0),outputTokens:Number(result.usage?.outputTokens??0),model:result.routingDecision.selectedModel};}
  catch{throw new Error("Autonomous meeting returned invalid structured output.");}
}

async function runMeeting(supabase:SupabaseClient,job:any){
  const [meetingResult,projectResult,projectAgentsResult,knowledgeResult]=await Promise.all([
    supabase.from("meetings").select("id,title,purpose,agenda,chair_agent_id,involvement_mode,status").eq("id",job.meeting_id).eq("organization_id",job.organization_id).single(),
    supabase.from("projects").select("id,name,objective,constraints,autonomy_mode,budget_cap_usd,responsible_department").eq("id",job.project_id).eq("organization_id",job.organization_id).single(),
    supabase.from("project_agents").select("agent_id,assignment_role,status,agents(id,agent_code,name,display_name,role_title,purpose,work_style,enabled)").eq("project_id",job.project_id).eq("organization_id",job.organization_id).in("status",["assigned","active"]),
    supabase.from("project_context_documents").select("context_type,title,summary,evidence").eq("project_id",job.project_id).eq("organization_id",job.organization_id).order("created_at",{ascending:false}).limit(12),
  ]);
  if(!meetingResult.data||!projectResult.data)throw new Error("Meeting or project is unavailable.");
  const meeting=meetingResult.data,project=projectResult.data;
  if(meeting.involvement_mode!=="AUTONOMOUS")throw new Error("Meeting is not authorized for autonomous execution.");
  if(!["limited_autonomy","full_autonomy_within_policy","approval_required"].includes(project.autonomy_mode))throw new Error("Project autonomy policy does not permit autonomous internal meetings.");
  const agents=(projectAgentsResult.data??[]).map((row:any)=>Array.isArray(row.agents)?row.agents[0]:row.agents).filter((a:any):a is Agent=>Boolean(a?.id&&a.enabled));
  if(agents.length<2)throw new Error("At least two enabled project agents are required for an autonomous meeting.");
  const chair=agents.find(a=>a.id===meeting.chair_agent_id)||agents.find(a=>a.agent_code==="B-001")||agents[0];
  const participants=[chair,...agents.filter(a=>a.id!==chair.id)].slice(0,4);
  const session=await supabase.from("meeting_agent_sessions").insert({organization_id:job.organization_id,meeting_id:meeting.id,project_id:project.id,status:"running",decision_question:meeting.purpose,language:"English",model:"adaptive-routing",max_rounds:1,budget_cap_usd:Math.min(1.5,Math.max(0.25,Number(project.budget_cap_usd??1.5))),external_research_allowed:false,started_at:new Date().toISOString()}).select("id").single();
  if(session.error||!session.data)throw new Error(session.error?.message||"Meeting session could not be created.");
  await supabase.from("meetings").update({status:"running",started_at:new Date().toISOString()}).eq("id",meeting.id).eq("organization_id",job.organization_id);
  await supabase.from("meeting_agent_participants").insert(participants.map((a,index)=>({session_id:session.data.id,organization_id:job.organization_id,agent_id:a.id,seat_order:index+1,session_role:a.id===chair.id?"synthesizer":"advisor",explicitly_authorized_by_ceo:false,authorization_source:"project_policy"})));

  const knowledge=JSON.stringify(knowledgeResult.data??[]).slice(0,16000);
  const transcript:Array<{agent:Agent;position:Record<string,unknown>}>=[];
  let totalCost=0,totalInput=0,totalOutput=0,turn=0;
  for(const agent of participants){
    const response=await aiJson({organizationId:job.organization_id,projectId:project.id,meetingId:meeting.id,agent,feature:"boardroom.deliberation",maxOutputTokens:1800,
      system:`You are ${agent.display_name||agent.name}, RYTHM ${agent.role_title}. Participate as a professional employee in an internal autonomous working session authorized by project policy. Challenge weak assumptions. Stay inside your expertise. No external actions, spending, legal commitments, deployments or messages are authorized by this meeting. Return JSON only.`,
      prompt:`Meeting: ${meeting.title}\nPurpose: ${meeting.purpose}\nProject: ${project.name}\nObjective: ${project.objective||""}\nConstraints: ${JSON.stringify(project.constraints)}\nAgenda: ${JSON.stringify(meeting.agenda)}\nShared Project Knowledge: ${knowledge}\nPrior positions: ${JSON.stringify(transcript.map(t=>({role:t.agent.role_title,position:t.position}))).slice(0,9000)}\nReturn {position,rationale,risks,challenge,recommendation,action_items:[{title,description,risk,needs_approval}]}.`});
    totalCost+=response.costUsd;totalInput+=response.inputTokens;totalOutput+=response.outputTokens;turn+=1;
    transcript.push({agent,position:response.data});
    await supabase.from("meeting_agent_messages").insert({organization_id:job.organization_id,meeting_id:meeting.id,session_id:session.data.id,agent_id:agent.id,turn_index:turn,round_no:1,speaker_type:"agent",message_type:turn===1?"position":"challenge",content:JSON.stringify(response.data),model:response.model,input_tokens:response.inputTokens,output_tokens:response.outputTokens,estimated_cost_usd:response.costUsd,ai_correlation_id:response.correlationId});
  }
  const synthesis=await aiJson({organizationId:job.organization_id,projectId:project.id,meetingId:meeting.id,agent:chair,feature:"boardroom.summary",maxOutputTokens:2600,
    system:`You are ${chair.display_name||chair.name}, chairing a RYTHM internal project meeting. Synthesize the professional disagreement; do not manufacture consensus. Human CEO remains final authority for consequential decisions. Return JSON only.`,
    prompt:`Project=${JSON.stringify({name:project.name,objective:project.objective,constraints:project.constraints,autonomy_mode:project.autonomy_mode})}\nMeeting=${JSON.stringify({title:meeting.title,purpose:meeting.purpose,agenda:meeting.agenda})}\nPositions=${JSON.stringify(transcript.map(t=>({agent:t.agent.agent_code,role:t.agent.role_title,position:t.position}))).slice(0,22000)}\nReturn {executive_summary,consensus,disagreements,decision,recommendation,risks,action_items:[{title,description,owner_agent_id,risk,needs_approval}],required_approvals:[{title,reason,risk}],knowledge_updates:[{title,summary}]}.`});
  totalCost+=synthesis.costUsd;totalInput+=synthesis.inputTokens;totalOutput+=synthesis.outputTokens;
  const data=synthesis.data,now=new Date().toISOString();
  await supabase.from("meeting_agent_messages").insert({organization_id:job.organization_id,meeting_id:meeting.id,session_id:session.data.id,agent_id:chair.id,turn_index:turn+1,round_no:2,speaker_type:"agent",message_type:"synthesis",content:JSON.stringify(data),model:synthesis.model,input_tokens:synthesis.inputTokens,output_tokens:synthesis.outputTokens,estimated_cost_usd:synthesis.costUsd,ai_correlation_id:synthesis.correlationId});
  await supabase.from("meeting_agent_sessions").update({status:"completed",synthesis:text(data.executive_summary,"Meeting completed."),recommendation:text(data.recommendation),decision_options:list(data.disagreements),total_input_tokens:totalInput,total_output_tokens:totalOutput,estimated_cost_usd:totalCost,completed_at:now,updated_at:now}).eq("id",session.data.id);
  await supabase.from("meetings").update({status:"completed",ended_at:now,minutes:{executive_summary:data.executive_summary,consensus:data.consensus,disagreements:data.disagreements,decision:data.decision,recommendation:data.recommendation,risks:data.risks,action_items:data.action_items}}).eq("id",meeting.id).eq("organization_id",job.organization_id);

  if(text(data.decision)){
    const decision=await supabase.from("decisions").insert({organization_id:job.organization_id,project_id:project.id,decision_key:`PM-${meeting.id.slice(0,8)}-${Date.now()}`,title:meeting.title,context:text(data.executive_summary,meeting.purpose),options:list(data.disagreements),recommendation:{text:text(data.recommendation)},rationale:text(data.consensus),risk_level:"low",status:"approved",requires_human_approval:false,proposed_by_agent_id:chair.id,decided_at:now,source_meeting_session_id:session.data.id}).select("id").single();
    await supabase.from("project_decision_memory").insert({organization_id:job.organization_id,project_id:project.id,decision:text(data.decision),rationale:text(data.recommendation)||text(data.consensus),decision_maker_type:"autonomous_project_meeting",decision_maker_id:chair.id,constraints:list(project.constraints),outcome:{meeting_id:meeting.id,decision_id:decision.data?.id??null}});
  }
  for(const actionRaw of list(data.action_items).slice(0,12)){
    if(!actionRaw||typeof actionRaw!=="object")continue;const action=actionRaw as Record<string,unknown>;const title=text(action.title);if(!title)continue;
    const requestedOwner=text(action.owner_agent_id);const owner=participants.find(a=>a.id===requestedOwner)?.id||chair.id;const needsApproval=Boolean(action.needs_approval);let approvalId:string|null=null;
    if(needsApproval){const approval=await supabase.from("approval_requests").insert({organization_id:job.organization_id,project_id:project.id,subject_type:"meeting_action",subject_id:meeting.id,title:`Decision required: ${title}`,summary:text(action.description,"Meeting action requires authorization."),risk_level:text(action.risk,"medium"),requested_by_agent_id:chair.id,status:"pending",conditions:["Authorization is limited to the scoped project action."]}).select("id").single();approvalId=approval.data?.id??null;}
    const actionItem=await supabase.from("action_items").insert({organization_id:job.organization_id,project_id:project.id,meeting_id:meeting.id,title,description:text(action.description),status:"open",priority:3,assigned_agent_id:owner,dependencies:[],success_criteria:[],evidence_required:[],risk_level:text(action.risk,"low"),authorization_approval_id:approvalId}).select("id").single();
    if(actionItem.data){
      const execution=await supabase.from("project_executions").select("id,execution_no").eq("project_id",project.id).eq("organization_id",job.organization_id).eq("status","running").order("execution_no",{ascending:false}).limit(1).maybeSingle();
      if(execution.data)await supabase.from("project_task_runs").insert({organization_id:job.organization_id,project_id:project.id,execution_id:execution.data.id,action_item_id:actionItem.data.id,task_key:`meeting-${meeting.id.slice(0,8)}-${actionItem.data.id.slice(0,8)}`,title,assigned_agent_id:owner,status:approvalId?"waiting_for_approval":"queued",priority:3,dependencies:[],waiting_on_approval_id:approvalId,idempotency_key:`project:${project.id}:execution:${execution.data.execution_no}:meeting:${meeting.id}:action:${actionItem.data.id}`,input:{description:text(action.description),risk:text(action.risk,"low"),source_meeting_id:meeting.id}});
    }
  }
  for(const updateRaw of list(data.knowledge_updates).slice(0,8)){
    if(!updateRaw||typeof updateRaw!=="object")continue;const update=updateRaw as Record<string,unknown>;const title=text(update.title);if(!title)continue;
    await supabase.from("project_context_documents").upsert({organization_id:job.organization_id,project_id:project.id,context_type:"meeting_learning",title,summary:text(update.summary),source_name:`Meeting: ${meeting.title}`,evidence:{meeting_id:meeting.id,session_id:session.data.id,correlation_id:synthesis.correlationId},status:"validated",confidence:0.85},{onConflict:"project_id,title"});
  }
  await supabase.from("project_activity_events").insert({organization_id:job.organization_id,project_id:project.id,agent_id:chair.id,event_type:"meeting.completed",headline:`Internal meeting completed: ${meeting.title}`,detail:text(data.executive_summary),importance:list(data.required_approvals).length?"attention":"normal",correlation_id:synthesis.correlationId,metadata:{meeting_id:meeting.id,session_id:session.data.id,cost_usd:totalCost}});
  await supabase.from("project_autonomous_meeting_jobs").update({status:"completed",result:{meeting_id:meeting.id,session_id:session.data.id,summary:data.executive_summary,recommendation:data.recommendation,cost_usd:totalCost},lease_owner:null,lease_expires_at:null,updated_at:now}).eq("id",job.id).eq("lease_owner",job.lease_owner);
}

export async function dispatchAutonomousProjectMeetings(supabase:SupabaseClient,workerId=`project-meeting-${randomUUID()}`){
  const claimed=await supabase.rpc("claim_project_autonomous_meeting_jobs_v1",{worker_id:workerId,claim_limit:2,lease_seconds:240});
  if(claimed.error)throw new Error(claimed.error.message);
  const results:Array<{id:string;status:string;error?:string}>=[];
  for(const job of claimed.data??[]){
    try{await runMeeting(supabase,job);results.push({id:job.id,status:"completed"});}
    catch(error){const exhausted=Number(job.attempt_count??1)>=Number(job.max_attempts??3);const now=new Date();const delay=Math.min(1800,60*(2**Math.min(Number(job.attempt_count??1),5)));await supabase.from("project_autonomous_meeting_jobs").update({status:exhausted?"failed":"retrying",error_message:error instanceof Error?error.message:"Meeting execution failed.",lease_owner:null,lease_expires_at:null,next_attempt_at:exhausted?null:new Date(now.getTime()+delay*1000).toISOString(),updated_at:now.toISOString()}).eq("id",job.id);await supabase.from("project_activity_events").insert({organization_id:job.organization_id,project_id:job.project_id,agent_id:job.requested_by_agent_id,event_type:exhausted?"meeting.failed":"meeting.retrying",headline:exhausted?"Autonomous meeting failed":"Autonomous meeting retry scheduled",detail:error instanceof Error?error.message:"Meeting execution failed.",importance:exhausted?"attention":"normal",metadata:{meeting_id:job.meeting_id,meeting_job_id:job.id}});results.push({id:job.id,status:exhausted?"failed":"retrying",error:error instanceof Error?error.message:"failed"});}
  }
  return results;
}
