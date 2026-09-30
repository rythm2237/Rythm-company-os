import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectCompletionExplanation={
  eligibleForCompletion:boolean;
  currentLifecycleState:string;
  workProgress:number;
  deliverableProgress:number;
  implementationProgress:number;
  verificationProgress:number;
  outcomeProgress:number;
  acceptanceProgress:number;
  closeoutProgress:number;
  overallProjectProgress:number;
  blockingReasons:Array<Record<string,unknown>>;
  satisfiedCriteria:Array<Record<string,unknown>>;
  nextRequiredAction:string|null;
  evaluatorVersion:string|null;
  evaluatedAt?:string|null;
  observationRequired?:boolean;
  observationComplete?:boolean;
  requiredDimensions?:Record<string,boolean>;
  policyCode?:string|null;
};

type StructuredTaskResult={
  work_completed?:unknown;
  deliverable_completed?:unknown;
  implementation_executed?:unknown;
  verification_result?:unknown;
  outcome_observed?:unknown;
  blockers?:unknown;
  evidence?:unknown;
  next_required_action?:unknown;
};

const object=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const list=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const text=(value:unknown)=>typeof value==="string"?value.trim():"";
const bool=(value:unknown)=>value===true;
const verification=(value:unknown)=>{
  const normalized=text(value).toLowerCase();
  return ["passed","verified","success"].includes(normalized)?"verified":["failed","rejected"].includes(normalized)?"failed":normalized||"not_verified";
};

export async function evaluateProjectCompletion(
  supabase:SupabaseClient,
  projectId:string,
  triggerEvent="application_event",
  sourceType?:string|null,
  sourceId?:string|null,
):Promise<ProjectCompletionExplanation>{
  const result=await supabase.rpc("evaluate_project_completion_v1",{
    p_project_id:projectId,
    p_trigger_event:triggerEvent,
    p_source_type:sourceType??null,
    p_source_id:sourceId??null,
  });
  if(result.error)throw new Error(`Completion evaluation failed: ${result.error.message}`);
  return result.data as ProjectCompletionExplanation;
}

export async function getProjectCompletionExplanation(
  supabase:SupabaseClient,
  projectId:string,
):Promise<ProjectCompletionExplanation|null>{
  const result=await supabase.rpc("get_project_completion_explanation_v1",{p_project_id:projectId});
  if(result.error)throw new Error(`Completion explanation failed: ${result.error.message}`);
  return result.data as ProjectCompletionExplanation|null;
}

export async function generateProjectCloseoutReport(supabase:SupabaseClient,projectId:string){
  const generated=await supabase.rpc("generate_project_closeout_report_v1",{p_project_id:projectId});
  if(generated.error)throw new Error(`Closeout report generation failed: ${generated.error.message}`);
  await evaluateProjectCompletion(supabase,projectId,"closeout_report_generated","project_closeout_report",generated.data as string);
  return generated.data as string;
}

/**
 * Converts task-agent completion claims into explicit semantics without treating
 * the claims as authoritative implementation/outcome evidence. The deterministic
 * completion evaluator remains the only project-completion authority.
 */
export async function reconcileTaskCompletionSemantics(supabase:SupabaseClient,limit=120){
  const tasks=await supabase.from("project_task_runs")
    .select("id,organization_id,project_id,status,safe_result,result_semantics,outcome_status,implementation_status,verification_status,next_required_action,updated_at")
    .eq("status","completed").order("updated_at",{ascending:false}).limit(limit);
  if(tasks.error)throw new Error(`Task completion semantics lookup failed: ${tasks.error.message}`);
  let updated=0;
  for(const row of tasks.data??[]){
    const existing=object(row.result_semantics);
    if(Object.keys(existing).length)continue;
    const data=object(row.safe_result) as StructuredTaskResult;
    const blockerRows=list(data.blockers).map(item=>object(item));
    const hasBlocking=blockerRows.some(item=>item.blocking===true||["critical","high"].includes(text(item.severity).toLowerCase()));
    const workCompleted=data.work_completed===undefined?true:bool(data.work_completed);
    const deliverableCompleted=bool(data.deliverable_completed);
    const implementationExecuted=bool(data.implementation_executed);
    const verificationResult=verification(data.verification_result);
    const outcomeObserved=bool(data.outcome_observed);
    const nextRequiredAction=text(data.next_required_action)||null;
    const semantics={work_completed:workCompleted,deliverable_completed:deliverableCompleted,implementation_executed:implementationExecuted,verification_result:verificationResult,outcome_observed:outcomeObserved,blockers:blockerRows,evidence:list(data.evidence),normalized_at:new Date().toISOString(),authority:"agent_claim_non_authoritative"};
    const update=await supabase.from("project_task_runs").update({
      result_semantics:semantics,
      outcome_status:hasBlocking?"blocked":outcomeObserved?"observed":"pending",
      implementation_status:implementationExecuted?"reported_executed":"not_reported",
      verification_status:verificationResult,
      next_required_action:nextRequiredAction,
      completion_evidence:list(data.evidence),
    }).eq("id",row.id).eq("organization_id",row.organization_id);
    if(update.error)continue;

    for(const rawEvidence of list(data.evidence)){
      const evidence=object(rawEvidence);
      const evidenceType=text(evidence.evidence_type)||text(evidence.type)||"agent_report";
      const source=text(evidence.source)||"project_task_agent";
      const dimension=text(evidence.lifecycle_dimension)||null;
      await supabase.from("project_completion_evidence").insert({
        organization_id:row.organization_id,
        project_id:row.project_id,
        task_run_id:row.id,
        lifecycle_dimension:["work","deliverable","implementation","verification","outcome","acceptance","closeout"].includes(dimension??"")?dimension:null,
        evidence_type:evidenceType,
        source,
        authoritative_source:false,
        validator:"agent_structured_claim",
        verification_result:text(evidence.verification_result)||null,
        confidence:typeof evidence.confidence==="number"?Math.max(0,Math.min(1,evidence.confidence)):null,
        evidence_url:text(evidence.evidence_url)||null,
        external_system_reference:text(evidence.external_system_reference)||null,
        structured_data:evidence,
      });
    }

    for(let index=0;index<blockerRows.length;index++){
      const blocker=blockerRows[index];
      if(!(blocker.blocking===true||["critical","high"].includes(text(blocker.severity).toLowerCase())))continue;
      const description=text(blocker.summary)||text(blocker.description)||"Task reported a blocking condition.";
      const criterionKey=`task-blocker-${row.id}-${index}`;
      await supabase.from("project_completion_criteria").upsert({
        organization_id:row.organization_id,
        project_id:row.project_id,
        dimension:["deliverable","implementation","verification","outcome","acceptance","closeout"].includes(text(blocker.dimension))?text(blocker.dimension):"outcome",
        criterion_key:criterionKey,
        description,
        required:true,
        validator_type:"manager_or_authoritative_evidence",
        state:"blocked",
        failure_reason:description,
        source_entity_type:"project_task_run",
        source_entity_id:row.id,
        metadata:{blocker_type:"agent_reported",severity:text(blocker.severity)||"high",next_required_action:text(blocker.next_required_action)||nextRequiredAction},
      },{onConflict:"project_id,criterion_key"});
    }
    await evaluateProjectCompletion(supabase,row.project_id,"task_semantics_normalized","project_task_run",row.id);
    updated+=1;
  }
  return updated;
}

export async function reconcileProjectCompletionRuntime(supabase:SupabaseClient){
  const observations=await supabase.rpc("reconcile_project_completion_observations_v1");
  if(observations.error)throw new Error(`Observation reconciliation failed: ${observations.error.message}`);
  const states=await supabase.rpc("reconcile_project_completion_states_v1");
  if(states.error)throw new Error(`Project completion state reconciliation failed: ${states.error.message}`);
  const normalizedTasks=await reconcileTaskCompletionSemantics(supabase);

  const closeoutCandidates=await supabase.from("projects").select("id").eq("lifecycle_state","CLOSEOUT").eq("completion_eligible",false).limit(20);
  if(closeoutCandidates.error)throw new Error(`Closeout candidate lookup failed: ${closeoutCandidates.error.message}`);
  let generatedReports=0;
  for(const project of closeoutCandidates.data??[]){
    const existing=await supabase.from("project_closeout_reports").select("id,status").eq("project_id",project.id).in("status",["draft","review","final","accepted"]).order("generated_at",{ascending:false}).limit(1).maybeSingle();
    if(existing.data)continue;
    await generateProjectCloseoutReport(supabase,project.id);
    generatedReports+=1;
  }
  return {observationWindows:Number(observations.data??0),projectsEvaluated:Number(states.data??0),normalizedTasks,generatedReports};
}
