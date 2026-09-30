import type { SupabaseClient } from "@supabase/supabase-js";

const terminalProjectStates=new Set(["COMPLETED","CANCELLED","FAILED","ON_HOLD","PAUSED"]);
const terminalCriterionStates=new Set(["passed","waived","not_applicable"]);
const nowIso=()=>new Date().toISOString();

function dimensionForProject(project:any,criterion:any){
  if(project.lifecycle_state==="IMPLEMENTATION_PENDING")return "implementation";
  if(project.lifecycle_state==="VERIFICATION")return "verification";
  if(project.lifecycle_state==="OUTCOME_VALIDATION")return "outcome";
  if(project.lifecycle_state==="EXECUTION"&&Number(project.work_progress??0)>=100&&Number(project.deliverable_progress??0)<100)return "deliverable";
  if(project.lifecycle_state==="BLOCKED"&&criterion?.dimension)return String(criterion.dimension);
  return null;
}

async function chooseManager(supabase:SupabaseClient,projectId:string){
  const team=await supabase.from("project_agents")
    .select("agent_id,assignment_role,status,agents(id,agent_code,role_title,enabled)")
    .eq("project_id",projectId).in("status",["assigned","active"]);
  const rows=team.data??[];
  const ranked=[...rows].sort((left:any,right:any)=>{
    const score=(row:any)=>{
      const agent=Array.isArray(row.agents)?row.agents[0]:row.agents;
      const text=`${row.assignment_role??""} ${agent?.agent_code??""} ${agent?.role_title??""}`.toLowerCase();
      if(/department manager|project manager|director|manager/.test(text))return 0;
      if(/lead|head|orchestrat/.test(text))return 1;
      return 2;
    };
    return score(left)-score(right);
  });
  const selected=ranked.find((row:any)=>{
    const agent=Array.isArray(row.agents)?row.agents[0]:row.agents;
    return agent?.enabled!==false;
  });
  return selected?.agent_id??null;
}

export async function ensureProjectLifecycleContinuation(supabase:SupabaseClient,limit=20){
  const candidates=await supabase.from("projects")
    .select("id,organization_id,project_code,name,lifecycle_state,work_progress,deliverable_progress,implementation_progress,verification_progress,outcome_progress,status,budget_cap_usd,next_required_action")
    .in("lifecycle_state",["EXECUTION","IMPLEMENTATION_PENDING","VERIFICATION","OUTCOME_VALIDATION","BLOCKED"])
    .limit(limit);
  if(candidates.error)throw new Error(`Completion continuation lookup failed: ${candidates.error.message}`);
  const results:Array<{projectId:string;status:string;dimension?:string;criterionId?:string}>=[];

  for(const project of candidates.data??[]){
    if(terminalProjectStates.has(project.lifecycle_state))continue;
    const activeExecution=await supabase.from("project_executions").select("id").eq("project_id",project.id).in("status",["queued","running","paused"]).limit(1).maybeSingle();
    if(activeExecution.data)continue;

    const criteriaResult=await supabase.from("project_completion_criteria")
      .select("id,dimension,criterion_key,description,state,failure_reason,metadata,created_at")
      .eq("project_id",project.id).eq("required",true).order("created_at");
    if(criteriaResult.error)continue;
    const criteria=(criteriaResult.data??[]).filter((criterion:any)=>!terminalCriterionStates.has(criterion.state));
    const blockedCriterion=criteria.find((criterion:any)=>criterion.state==="blocked"&&criterion.metadata?.blocker_type!=="governance_hold");
    const inferredDimension=dimensionForProject(project,blockedCriterion);
    if(!inferredDimension)continue;
    const criterion=blockedCriterion?.dimension===inferredDimension?blockedCriterion:criteria.find((item:any)=>item.dimension===inferredDimension);
    if(!criterion)continue;

    const idempotencyKey=`completion:${project.id}:criterion:${criterion.id}`;
    const existing=await supabase.from("project_task_runs").select("id,status").eq("idempotency_key",idempotencyKey).limit(1).maybeSingle();
    if(existing.data){results.push({projectId:project.id,status:"already_reserved",dimension:inferredDimension,criterionId:criterion.id});continue;}

    const managerId=await chooseManager(supabase,project.id);
    const latest=await supabase.from("project_executions").select("execution_no").eq("project_id",project.id).order("execution_no",{ascending:false}).limit(1).maybeSingle();
    const executionNo=Number(latest.data?.execution_no??0)+1;
    const now=nowIso();
    const description=[
      `Continue the project lifecycle by resolving the required ${inferredDimension} criterion: ${criterion.description}`,
      criterion.failure_reason?`Current blocker/failure: ${criterion.failure_reason}`:"",
      `Project lifecycle state: ${project.lifecycle_state}.`,
      `Current next required action: ${project.next_required_action??"not recorded"}.`,
      "Use authoritative systems and evidence where available. Do not mark the criterion passed merely because analysis or a plan was completed.",
      "If production/external action, spend, publishing, or other governed authority is required, create the appropriate proposal/approval request and keep the project open until execution and verification are evidenced.",
    ].filter(Boolean).join(" ");

    const execution=await supabase.from("project_executions").insert({
      organization_id:project.organization_id,project_id:project.id,execution_no:executionNo,status:"running",
      execution_context:{completion_continuation:true,lifecycle_state:project.lifecycle_state,completion_dimension:inferredDimension,completion_criterion_id:criterion.id},
      plan_snapshot:{source:"completion_evaluator",criterion:{id:criterion.id,key:criterion.criterion_key,description:criterion.description,dimension:inferredDimension}},
      budget_snapshot:{ai_budget_usd:project.budget_cap_usd},started_at:now,last_heartbeat_at:now,last_progress_at:now,
    }).select("id").single();
    if(execution.error||!execution.data){results.push({projectId:project.id,status:"execution_create_failed",dimension:inferredDimension,criterionId:criterion.id});continue;}

    const action=await supabase.from("action_items").insert({
      organization_id:project.organization_id,project_id:project.id,
      action_code:`COMP-${criterion.id}`.slice(0,120),title:`Resolve ${inferredDimension}: ${criterion.description}`.slice(0,240),
      description,status:"open",priority:1,assigned_agent_id:managerId,dependencies:[],
      success_criteria:[criterion.description],evidence_required:["Authoritative evidence satisfying the completion criterion is persisted before the criterion can pass."],
      risk_level:"low",handoff_source:"project_completion_evaluator",
    }).select("id").maybeSingle();

    const task=await supabase.from("project_task_runs").insert({
      organization_id:project.organization_id,project_id:project.id,execution_id:execution.data.id,action_item_id:action.data?.id??null,
      task_key:`completion-${inferredDimension}-${criterion.id}`.slice(0,180),title:`Resolve ${inferredDimension} completion criterion`.slice(0,240),
      assigned_agent_id:managerId,status:"queued",priority:1,dependencies:[],attempt_count:0,max_attempts:5,
      idempotency_key:idempotencyKey,input:{description,risk:"low",completion_continuation:true,completion_dimension:inferredDimension,completion_criterion_id:criterion.id},work_weight:1,
    }).select("id").single();
    if(task.error){
      await supabase.from("project_executions").update({status:"cancelled",cancelled_at:nowIso(),updated_at:nowIso()}).eq("id",execution.data.id);
      if(action.data?.id)await supabase.from("action_items").update({status:"cancelled"}).eq("id",action.data.id);
      results.push({projectId:project.id,status:"task_create_failed",dimension:inferredDimension,criterionId:criterion.id});
      continue;
    }

    await supabase.from("project_activity_events").insert({
      organization_id:project.organization_id,project_id:project.id,execution_id:execution.data.id,agent_id:managerId,
      event_type:"project.completion.continuation_started",headline:`Lifecycle continuation: ${inferredDimension}`,
      detail:`RYTHM created follow-up work because agent work terminality did not satisfy the required ${inferredDimension} completion gate.`,
      importance:"normal",metadata:{criterion_id:criterion.id,criterion_key:criterion.criterion_key,lifecycle_state:project.lifecycle_state},
    });
    results.push({projectId:project.id,status:"created",dimension:inferredDimension,criterionId:criterion.id});
  }
  return results;
}
