import type { SupabaseClient } from "@supabase/supabase-js";

type TaskRow={
  id:string;
  organization_id:string;
  project_id:string;
  execution_id:string;
  action_item_id:string|null;
  task_key:string;
  title:string;
  assigned_agent_id:string|null;
  status:string;
  dependencies:unknown;
  waiting_on_approval_id:string|null;
  attempt_count:number;
  max_attempts:number;
  next_attempt_at:string|null;
  error_class:string|null;
  error_message:string|null;
  input:Record<string,unknown>|null;
  safe_result:Record<string,unknown>|null;
  roadmap_id:string|null;
  roadmap_phase_id:string|null;
  work_weight:number|string|null;
};

type ExecutionRow={
  id:string;
  organization_id:string;
  project_id:string;
  execution_no:number;
  status:string;
  recovery_count:number;
  last_progress_at?:string|null;
};

type AgentRow={
  id:string;
  agent_code:string;
  role_title:string;
  reports_to_agent_id:string|null;
  enabled:boolean;
  agent_status:string;
};

type SupervisorResult={kind:string;projectId:string;taskId?:string;jobId?:string;detail?:string};

const asObject=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const asList=(value:unknown):string[]=>Array.isArray(value)?value.map(String).filter(Boolean):[];
const errorText=(task:Pick<TaskRow,"error_class"|"error_message">)=>`${task.error_class??""} ${task.error_message??""}`.toLowerCase();
const transientPattern=/(rate.?limit|429|timeout|timed out|invalid structured|invalid json|provider|network|temporar|overload|5\d\d|lease expir|connection reset|fetch failed)/i;
const rateLimitPattern=/(rate.?limit|429|quota)/i;
const structuredPattern=/(invalid structured|invalid json|json)/i;
const isTransient=(task:Pick<TaskRow,"error_class"|"error_message">)=>transientPattern.test(errorText(task));
const recoveryCount=(input:Record<string,unknown>|null)=>Math.max(0,Number(asObject(input).supervisor_recovery_count??0)||0);
const nowIso=()=>new Date().toISOString();

async function activity(supabase:SupabaseClient,input:{organizationId:string;projectId:string;executionId:string;agentId?:string|null;eventType:string;headline:string;detail?:string;importance?:"normal"|"attention"|"major";metadata?:Record<string,unknown>}){
  await supabase.from("project_activity_events").insert({
    organization_id:input.organizationId,
    project_id:input.projectId,
    execution_id:input.executionId,
    agent_id:input.agentId??null,
    event_type:input.eventType,
    headline:input.headline,
    detail:input.detail??null,
    importance:input.importance??"normal",
    metadata:input.metadata??{},
  });
}

async function loadProjectAgents(supabase:SupabaseClient,execution:ExecutionRow){
  const result=await supabase
    .from("project_agents")
    .select("agent_id,status,agents(id,agent_code,role_title,reports_to_agent_id,enabled,agent_status)")
    .eq("organization_id",execution.organization_id)
    .eq("project_id",execution.project_id)
    .in("status",["assigned","active"]);
  const agents:AgentRow[]=[];
  for(const row of result.data??[]){
    const raw=Array.isArray((row as any).agents)?(row as any).agents[0]:(row as any).agents;
    if(raw?.id&&raw.enabled===true&&raw.agent_status==="enabled")agents.push(raw as AgentRow);
  }
  return agents;
}

async function ensureManagerCapacity(supabase:SupabaseClient,execution:ExecutionRow,agentId:string){
  const existing=await supabase.from("project_agent_capacity").select("allocation_percent").eq("project_id",execution.project_id).eq("agent_id",agentId).maybeSingle();
  if(Number(existing.data?.allocation_percent??0)>0)return true;
  const all=await supabase.from("project_agent_capacity").select("allocation_percent").eq("agent_id",agentId);
  const used=(all.data??[]).reduce((sum,row)=>sum+Number(row.allocation_percent??0),0);
  const available=Math.max(0,100-used);
  if(available<=0)return false;
  const allocation=Math.min(25,available);
  const assignment=await supabase.from("project_agents").upsert({
    organization_id:execution.organization_id,
    project_id:execution.project_id,
    agent_id:agentId,
    assignment_role:"Recovery manager",
    status:"active",
    assigned_at:nowIso(),
    authority_scope:{project_execution:true,project_recovery:true},
  },{onConflict:"project_id,agent_id"});
  if(assignment.error)return false;
  const capacity=await supabase.from("project_agent_capacity").upsert({
    organization_id:execution.organization_id,
    project_id:execution.project_id,
    agent_id:agentId,
    allocation_percent:allocation,
    priority:1,
  },{onConflict:"project_id,agent_id"});
  return !capacity.error;
}

async function chooseRecoveryManager(supabase:SupabaseClient,execution:ExecutionRow,task:TaskRow,projectAgents:AgentRow[]){
  const assigned=task.assigned_agent_id?await supabase.from("agents").select("id,reports_to_agent_id").eq("id",task.assigned_agent_id).maybeSingle():{data:null};
  const directManagerId=(assigned.data as any)?.reports_to_agent_id as string|undefined;
  if(directManagerId){
    const manager=await supabase.from("agents").select("id,agent_code,role_title,reports_to_agent_id,enabled,agent_status").eq("id",directManagerId).eq("organization_id",execution.organization_id).maybeSingle();
    if(manager.data?.enabled&&manager.data.agent_status==="enabled"&&await ensureManagerCapacity(supabase,execution,manager.data.id))return manager.data.id as string;
  }

  const ranked=[...projectAgents].sort((a,b)=>{
    const score=(agent:AgentRow)=>{
      const haystack=`${agent.agent_code} ${agent.role_title}`.toLowerCase();
      if(/director|department manager|manager/.test(haystack))return 0;
      if(/lead|head|orchestrator/.test(haystack))return 1;
      return 2;
    };
    return score(a)-score(b);
  });
  for(const candidate of ranked){
    if(await ensureManagerCapacity(supabase,execution,candidate.id))return candidate.id;
  }
  return task.assigned_agent_id;
}

async function markExecutionRecovery(supabase:SupabaseClient,execution:ExecutionRow){
  execution.recovery_count=Number(execution.recovery_count??0)+1;
  await supabase.from("project_executions").update({recovery_count:execution.recovery_count,updated_at:nowIso()}).eq("id",execution.id);
  await supabase.from("projects").update({stage:"execution",updated_at:nowIso()}).eq("id",execution.project_id).eq("organization_id",execution.organization_id);
}

async function retryTransientTask(supabase:SupabaseClient,execution:ExecutionRow,task:TaskRow,results:SupervisorResult[]){
  const count=recoveryCount(task.input);
  if(count>=4)return false;
  const error=errorText(task);
  const delaySeconds=rateLimitPattern.test(error)?900:structuredPattern.test(error)?120:300;
  const input={...asObject(task.input),supervisor_recovery_count:count+1,supervisor_last_recovery_at:nowIso(),supervisor_last_error:{class:task.error_class,message:task.error_message},supervisor_recovery_mode:"transient_retry"};
  const nextAttempt=new Date(Date.now()+delaySeconds*1000).toISOString();
  const update=await supabase.from("project_task_runs").update({
    status:"retrying",
    attempt_count:0,
    next_attempt_at:nextAttempt,
    lease_owner:null,
    lease_expires_at:null,
    error_class:"supervisor_transient_retry",
    input,
    updated_at:nowIso(),
  }).eq("id",task.id).eq("status","failed");
  if(update.error)return false;
  if(task.action_item_id)await supabase.from("action_items").update({status:"open",completed_at:null}).eq("id",task.action_item_id);
  await markExecutionRecovery(supabase,execution);
  await activity(supabase,{organizationId:task.organization_id,projectId:task.project_id,executionId:task.execution_id,agentId:task.assigned_agent_id,eventType:"task.supervisor_retry",headline:`Supervisor recovered task: ${task.title}`,detail:`Retry exhaustion was classified as transient. Retry ${count+1}/4 is scheduled automatically.`,importance:"normal",metadata:{task_run_id:task.id,next_attempt_at:nextAttempt,previous_error:task.error_message}});
  results.push({kind:"task_retry",projectId:task.project_id,taskId:task.id,detail:task.error_message??undefined});
  return true;
}

async function ensureRecoveryTask(supabase:SupabaseClient,execution:ExecutionRow,task:TaskRow,projectAgents:AgentRow[],results:SupervisorResult[],options?:{replaceDependencies?:boolean;reason?:string}){
  const taskRows=await supabase.from("project_task_runs").select("id,task_key,status,input").eq("execution_id",execution.id);
  const existing=(taskRows.data??[]).find(row=>asObject(row.input).recovery_for_task_id===task.id&&row.status!=="cancelled");
  if(existing)return existing.id as string;

  const managerId=await chooseRecoveryManager(supabase,execution,task,projectAgents);
  if(!managerId)return null;
  const recoveryKey=`supervisor-recovery-${task.id}`.slice(0,180);
  const description=[
    `Diagnose and safely recover the blocked project task \"${task.title}\".`,
    `Original status: ${task.status}.`,
    task.error_message?`Failure/blocker: ${task.error_message}.`:"",
    options?.reason?`Dependency context: ${options.reason}.`:"",
    "Produce a concrete re-plan using existing project decisions and governance. Do not perform external side effects; create a governed proposal when authorization is required.",
  ].filter(Boolean).join(" ");

  const action=await supabase.from("action_items").insert({
    organization_id:task.organization_id,
    project_id:task.project_id,
    action_code:`RECOVERY-${task.id}`.slice(0,120),
    title:`Recovery review: ${task.title}`.slice(0,240),
    description,
    status:"open",
    priority:1,
    assigned_agent_id:managerId,
    dependencies:[],
    success_criteria:["A safe executable path is defined without bypassing approvals, access controls, or previous Human CEO decisions."],
    evidence_required:["Recovery rationale and resulting task plan are persisted."],
    risk_level:"low",
    handoff_source:"autonomous_project_supervisor",
  }).select("id").maybeSingle();

  const inserted=await supabase.from("project_task_runs").insert({
    organization_id:task.organization_id,
    project_id:task.project_id,
    execution_id:task.execution_id,
    action_item_id:action.data?.id??null,
    task_key:recoveryKey,
    title:`Recovery review: ${task.title}`.slice(0,240),
    assigned_agent_id:managerId,
    status:"queued",
    priority:1,
    dependencies:[],
    attempt_count:0,
    max_attempts:5,
    idempotency_key:`project:${task.project_id}:execution:${execution.execution_no}:supervisor-recovery:${task.id}`,
    input:{
      description,
      risk:"low",
      supervisor_recovery_task:true,
      recovery_for_task_id:task.id,
      recovery_for_task_key:task.task_key,
      recovery_replace_dependencies:Boolean(options?.replaceDependencies),
      original_dependencies:asList(task.dependencies),
      original_error_class:task.error_class,
      original_error_message:task.error_message,
    },
    work_weight:0.1,
  }).select("id").single();
  if(inserted.error||!inserted.data)return null;

  await supabase.from("project_task_runs").update({status:"blocked",error_class:"supervisor_recovery_pending",error_message:"Autonomous manager recovery is in progress.",next_attempt_at:null,lease_owner:null,lease_expires_at:null,updated_at:nowIso()}).eq("id",task.id).in("status",["failed","blocked","queued","retrying"]);
  if(task.action_item_id)await supabase.from("action_items").update({status:"blocked",assigned_agent_id:managerId}).eq("id",task.action_item_id);
  await markExecutionRecovery(supabase,execution);
  await activity(supabase,{organizationId:task.organization_id,projectId:task.project_id,executionId:task.execution_id,agentId:managerId,eventType:"task.supervisor_replan",headline:`Manager recovery assigned: ${task.title}`,detail:"The project supervisor assigned a bounded internal recovery/re-planning task instead of stopping the project.",importance:"attention",metadata:{blocked_task_run_id:task.id,recovery_task_run_id:inserted.data.id,replace_dependencies:Boolean(options?.replaceDependencies)}});
  results.push({kind:"manager_recovery",projectId:task.project_id,taskId:task.id});
  return inserted.data.id as string;
}

async function applyCompletedRecoveryTasks(supabase:SupabaseClient,execution:ExecutionRow,tasks:TaskRow[],results:SupervisorResult[]){
  for(const recoveryTask of tasks.filter(task=>task.status==="completed"&&Boolean(asObject(task.input).supervisor_recovery_task))){
    const input=asObject(recoveryTask.input);
    const targetId=typeof input.recovery_for_task_id==="string"?input.recovery_for_task_id:null;
    if(!targetId)continue;
    const target=tasks.find(task=>task.id===targetId);
    if(!target||!["failed","blocked","cancelled"].includes(target.status))continue;
    // A recovery report is knowledge, not new Human CEO authorization.
    // Keep this branch closed; a materially revised proposal needs its own gate.
    if(input.original_error_class==="approval_rejected"){
      if(target.error_class!=="approval_rejected_closed"){
        await supabase.from("project_task_runs").update({status:"blocked",error_class:"approval_rejected_closed",next_attempt_at:null,updated_at:nowIso()}).eq("id",target.id).eq("status","blocked");
        await activity(supabase,{organizationId:target.organization_id,projectId:target.project_id,executionId:target.execution_id,agentId:recoveryTask.assigned_agent_id,eventType:"task.rejection_respected",headline:`Rejected branch remains closed: ${target.title}`,detail:"Manager recovery is recorded. The original rejected authorization was not renewed; any revised proposal requires a separate decision.",importance:"attention",metadata:{task_run_id:target.id,recovery_task_run_id:recoveryTask.id}});
      }
      continue;
    }
    const targetInput={...asObject(target.input),supervisor_recovery_count:recoveryCount(target.input)+1,supervisor_last_recovery_at:nowIso(),supervisor_recovery_mode:"manager_replan",supervisor_recovery_evidence:recoveryTask.safe_result??{},supervisor_previous_error:{class:target.error_class,message:target.error_message}};
    const replaceDependencies=Boolean(input.recovery_replace_dependencies);
    const dependencies=replaceDependencies?[recoveryTask.task_key]:asList(target.dependencies);
    const update=await supabase.from("project_task_runs").update({
      status:"retrying",
      assigned_agent_id:recoveryTask.assigned_agent_id??target.assigned_agent_id,
      dependencies,
      waiting_on_approval_id:null,
      attempt_count:0,
      next_attempt_at:nowIso(),
      lease_owner:null,
      lease_expires_at:null,
      error_class:"supervisor_replanned",
      error_message:null,
      input:targetInput,
      updated_at:nowIso(),
    }).eq("id",target.id).in("status",["failed","blocked","cancelled"]);
    if(update.error)continue;
    if(target.action_item_id)await supabase.from("action_items").update({status:"open",assigned_agent_id:recoveryTask.assigned_agent_id??target.assigned_agent_id,completed_at:null}).eq("id",target.action_item_id);
    await markExecutionRecovery(supabase,execution);
    await activity(supabase,{organizationId:target.organization_id,projectId:target.project_id,executionId:target.execution_id,agentId:recoveryTask.assigned_agent_id,eventType:"task.supervisor_resumed",headline:`Recovered task resumed: ${target.title}`,detail:"Manager recovery completed; the original roadmap work was resumed with persisted recovery evidence.",importance:"normal",metadata:{task_run_id:target.id,recovery_task_run_id:recoveryTask.id,dependencies}});
    results.push({kind:"task_resumed",projectId:target.project_id,taskId:target.id});
  }
}

async function escalateRecovery(supabase:SupabaseClient,execution:ExecutionRow,task:TaskRow,results:SupervisorResult[]){
  if(task.waiting_on_approval_id)return;
  const existing=await supabase.from("approval_requests").select("id").eq("project_id",task.project_id).eq("subject_type","project_recovery").eq("subject_id",task.id).eq("status","pending").maybeSingle();
  if(existing.data)return;
  const approval=await supabase.from("approval_requests").insert({
    organization_id:task.organization_id,
    project_id:task.project_id,
    subject_type:"project_recovery",
    subject_id:task.id,
    title:`Recovery decision required: ${task.title}`.slice(0,240),
    summary:`Autonomous retries and manager recovery could not establish a safe continuation path. Last blocker: ${task.error_message??task.error_class??"unknown"}`,
    risk_level:"high",
    requested_by_agent_id:task.assigned_agent_id,
    status:"pending",
    conditions:["Approval authorizes another bounded recovery attempt only; it does not authorize external side effects, spend, production changes, legal commitments, or scope expansion."],
    attention_tier:"executive_critical",
    decision_group:"strategy_scope",
  }).select("id").single();
  if(!approval.data)return;
  await supabase.from("project_task_runs").update({status:"waiting_for_approval",waiting_on_approval_id:approval.data.id,next_attempt_at:null,updated_at:nowIso()}).eq("id",task.id);
  await activity(supabase,{organizationId:task.organization_id,projectId:task.project_id,executionId:task.execution_id,agentId:task.assigned_agent_id,eventType:"task.supervisor_escalated",headline:`Executive recovery decision required: ${task.title}`,detail:"Only after autonomous retry and manager recovery were exhausted was the blocker escalated to the Human CEO.",importance:"major",metadata:{task_run_id:task.id,approval_request_id:approval.data.id}});
  results.push({kind:"executive_escalation",projectId:task.project_id,taskId:task.id});
}

async function recoverFailedMeetingJobs(supabase:SupabaseClient,execution:ExecutionRow,results:SupervisorResult[]){
  const jobs=await supabase.from("project_autonomous_meeting_jobs").select("id,status,attempt_count,max_attempts,error_message,result,requested_by_agent_id,meeting_id").eq("project_id",execution.project_id).eq("organization_id",execution.organization_id).eq("status","failed").limit(8);
  for(const job of jobs.data??[]){
    const result=asObject(job.result);
    const count=Math.max(0,Number(result.supervisor_recovery_count??0)||0);
    const error=String(job.error_message??"");
    if(!transientPattern.test(error)||count>=4){
      const existing=await supabase.from("project_health_events").select("id").eq("execution_id",execution.id).eq("health_type","meeting_recovery_exhausted").eq("status","open").contains("details",{meeting_job_id:job.id}).maybeSingle();
      if(!existing.data)await supabase.from("project_health_events").insert({organization_id:execution.organization_id,project_id:execution.project_id,execution_id:execution.id,health_type:"meeting_recovery_exhausted",severity:"warning",status:"open",summary:"An autonomous internal meeting could not be recovered automatically.",details:{meeting_job_id:job.id,meeting_id:job.meeting_id,error_message:error}});
      continue;
    }
    const delaySeconds=rateLimitPattern.test(error)?900:structuredPattern.test(error)?120:300;
    const nextAttempt=new Date(Date.now()+delaySeconds*1000).toISOString();
    await supabase.from("project_autonomous_meeting_jobs").update({status:"retrying",attempt_count:0,next_attempt_at:nextAttempt,error_message:`Supervisor retry scheduled after: ${error}`,result:{...result,supervisor_recovery_count:count+1,supervisor_last_recovery_at:nowIso(),previous_error:error},lease_owner:null,lease_expires_at:null,updated_at:nowIso()}).eq("id",job.id).eq("status","failed");
    await activity(supabase,{organizationId:execution.organization_id,projectId:execution.project_id,executionId:execution.id,agentId:job.requested_by_agent_id,eventType:"meeting.supervisor_retry",headline:"Autonomous meeting recovery scheduled",detail:error,importance:"normal",metadata:{meeting_job_id:job.id,next_attempt_at:nextAttempt,recovery_count:count+1}});
    results.push({kind:"meeting_retry",projectId:execution.project_id,jobId:job.id,detail:error});
  }
}

export async function superviseProjectExecutions(supabase:SupabaseClient){
  const executionResult=await supabase.from("project_executions").select("id,organization_id,project_id,execution_no,status,recovery_count,last_progress_at").in("status",["queued","running"]).order("updated_at",{ascending:true}).limit(20);
  if(executionResult.error)throw new Error(executionResult.error.message);
  const results:SupervisorResult[]=[];

  for(const rawExecution of executionResult.data??[]){
    const execution=rawExecution as ExecutionRow;
    const taskResult=await supabase.from("project_task_runs").select("id,organization_id,project_id,execution_id,action_item_id,task_key,title,assigned_agent_id,status,dependencies,waiting_on_approval_id,attempt_count,max_attempts,next_attempt_at,error_class,error_message,input,safe_result,roadmap_id,roadmap_phase_id,work_weight").eq("execution_id",execution.id).order("created_at");
    if(taskResult.error)continue;
    const tasks=(taskResult.data??[]) as TaskRow[];
    if(!tasks.length)continue;
    const projectAgents=await loadProjectAgents(supabase,execution);

    await applyCompletedRecoveryTasks(supabase,execution,tasks,results);

    const scheduled=new Set<string>();
    for(const task of tasks.filter(task=>task.status==="failed")){
      const count=recoveryCount(task.input);
      if(isTransient(task)&&await retryTransientTask(supabase,execution,task,results)){scheduled.add(task.task_key);continue;}
      if(Boolean(asObject(task.input).supervisor_recovery_task)&&count>=2){await escalateRecovery(supabase,execution,task,results);continue;}
      const recoveryId=await ensureRecoveryTask(supabase,execution,task,projectAgents,results);
      if(recoveryId)scheduled.add(task.task_key);
      else if(count>=2)await escalateRecovery(supabase,execution,task,results);
    }

    for(const task of tasks.filter(task=>task.status==="blocked"&&task.error_class==="approval_rejected")){
      await ensureRecoveryTask(supabase,execution,task,projectAgents,results,{reason:"The Human CEO rejected the prior authorization. Re-plan without bypassing that decision."});
      scheduled.add(task.task_key);
    }

    const byKey=new Map(tasks.map(task=>[task.task_key,task]));
    for(const task of tasks.filter(task=>["queued","retrying"].includes(task.status))){
      const badDependencies=asList(task.dependencies).filter(key=>{
        const dependency=byKey.get(key);
        if(!dependency)return true;
        if(scheduled.has(key))return false;
        return dependency.status==="cancelled";
      });
      if(!badDependencies.length)continue;
      await ensureRecoveryTask(supabase,execution,task,projectAgents,results,{replaceDependencies:true,reason:`Unresolvable dependencies: ${badDependencies.join(", ")}`});
    }

    await recoverFailedMeetingJobs(supabase,execution,results);
  }

  return results;
}
