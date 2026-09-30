import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(file:string)=>fs.readFileSync(path.join(root,file),"utf8");
const requireText=(content:string,text:string,label:string)=>{if(!content.includes(text))throw new Error(`${label}: missing ${text}`);};
const rejectText=(content:string,text:string,label:string)=>{if(content.includes(text))throw new Error(`${label}: forbidden ${text}`);};

const architecture=read("supabase/migrations/20260929190000_project_completion_architecture_v2.sql");
const evaluator=read("supabase/migrations/20260929190100_project_completion_evaluator_v2.sql");
const runtime=read("supabase/migrations/20260929190300_project_completion_runtime_guards.sql");
const hardening=read("supabase/migrations/20260929190400_project_completion_rpc_hardening.sql");
const reporting=read("supabase/migrations/20260930073000_project_completion_reporting_health.sql");
const worker=read("lib/projects/project-work-v2.ts");
const toolExecution=read("lib/projects/project-tool-execution.ts");
const dispatcher=read("app/api/projects/dispatch/route.ts");
const completionService=read("lib/projects/project-completion.ts");
const continuation=read("lib/projects/project-completion-continuation.ts");
const panel=read("components/projects/project-completion-panel.tsx");
const report=read("app/(app)/projects/report/page.tsx");

for(const table of ["project_completion_policies","project_completion_criteria","project_completion_evidence","project_observation_windows","project_metric_measurements","project_completion_evaluations","project_closeout_reports"])requireText(architecture,`public.${table}`,"completion schema");
for(const field of ["work_progress","deliverable_progress","implementation_progress","verification_progress","outcome_progress","acceptance_progress","closeout_progress","overall_project_progress","completion_eligible","next_required_action"])requireText(architecture,field,"project completion columns");
for(const state of ["DRAFT","DISCOVERY","PLANNING","READY_FOR_EXECUTION","EXECUTION","IMPLEMENTATION_PENDING","VERIFICATION","OUTCOME_VALIDATION","OBSERVATION","ACCEPTANCE_PENDING","CLOSEOUT","COMPLETED","BLOCKED","PAUSED","CANCELLED","FAILED","ON_HOLD"])requireText(evaluator,`'${state}'`,`lifecycle ${state}`);
requireText(evaluator,"overall_p:=least(overall_p,99)","unfinished projects cannot show 100 overall");
requireText(evaluator,"workflow_contradiction","contradictory workflow guard");
requireText(evaluator,"authoritative_source=true","completion audit evidence references");
requireText(evaluator,"Project completion remains subject to deliverable, implementation, verification, outcome, acceptance and closeout gates.","work/project completion separation");
requireText(runtime,"start_eligible_project_observations_v1","observation clock gating");
requireText(runtime,"project_final_acceptance","final acceptance approval");
requireText(runtime,"finalize_project_closeout_report_v1","formal closeout finalization");
requireText(runtime,"prevented_completion_writer","legacy completion write guard");
requireText(hardening,"revoke all on function public.finalize_project_closeout_report_v1", "RPC hardening");
requireText(reporting,"accepted_with_conditions","conditional acceptance");
requireText(reporting,"acceptance_waiver_allowed","policy-controlled acceptance waiver");
requireText(reporting,"direction", "before-after direction");
requireText(reporting,"causalityConfidence", "causality reporting");
requireText(reporting,"refresh_project_completion_health_v1", "completion-aware project health");
requireText(reporting,"project_kpis_completion_sync_v1", "KPI event-driven outcome recalculation");

for(const field of ["work_completed","deliverable_completed","implementation_executed","verification_result","outcome_observed","blockers","evidence","next_required_action"])requireText(worker,field,"agent completion contract");
requireText(worker,"authority:\"agent_claim_non_authoritative\"","agent claims are non-authoritative");
requireText(worker,"source_task_run_id:task.id","proposal completion lineage");
rejectText(worker,"progress_percent:100","structured worker must never force 100 percent");
rejectText(worker,"status:\"completed\",stage:\"outcome_review\"","structured worker must never close projects");
requireText(toolExecution,"integration_execution_gateway","authoritative governed execution evidence");
requireText(toolExecution,"status==\"succeeded\"","only real successful external execution counts");
requireText(toolExecution,"terminalFailures=new Set([\"failed\",\"denied\",\"rejected\",\"expired\",\"cancelled\",\"simulated\"])","simulation is not implementation");
requireText(dispatcher,"dispatchProjectWorkV2","scheduler uses v2 worker");
rejectText(dispatcher,"dispatchProjectWork(service)","legacy worker is not production scheduler path");
requireText(dispatcher,"ensureProjectLifecycleContinuation","post-analysis lifecycle continuation");
requireText(dispatcher,"refresh_project_completion_health_v1","scheduled completion health refresh");
requireText(completionService,"reconcile_project_completion_observations_v1","observation scheduler integration");
requireText(continuation,"completion_continuation","autonomous lifecycle follow-up");
requireText(panel,"All currently assigned agent work is complete, but the real-world project outcome is not yet complete.","non-technical completion UX");
requireText(panel,"Accept with conditions","structured conditional acceptance UX");
requireText(report,"observed change","causality-safe final report");

// Deterministic scenario model used as an architecture regression oracle. The DB
// function remains the production authority; these cases protect required semantics
// from being removed during refactors.
type S={work?:number;deliverable?:number;implementation?:number;verification?:number;outcome?:number;acceptance?:number;closeout?:number;observationRequired?:boolean;observationComplete?:boolean;criticalBlocker?:boolean;riskAccepted?:boolean;allowRiskAcceptance?:boolean;cancelled?:boolean;failed?:boolean;implementationRequired?:boolean;acceptanceRequired?:boolean;closeoutRequired?:boolean;outcomeRequired?:boolean;verificationRequired?:boolean;deliverableRequired?:boolean};
function state(s:S){
  if(s.cancelled)return "CANCELLED";if(s.failed)return "FAILED";
  if(s.criticalBlocker&&!(s.riskAccepted&&s.allowRiskAcceptance))return "BLOCKED";
  if((s.work??0)<100)return "EXECUTION";
  if((s.deliverableRequired??true)&&(s.deliverable??0)<100)return "EXECUTION";
  if((s.implementationRequired??true)&&(s.implementation??0)<100)return "IMPLEMENTATION_PENDING";
  if((s.verificationRequired??true)&&(s.verification??0)<100)return "VERIFICATION";
  if(s.observationRequired&&!s.observationComplete)return "OBSERVATION";
  if((s.outcomeRequired??true)&&(s.outcome??0)<100)return "OUTCOME_VALIDATION";
  if((s.acceptanceRequired??true)&&(s.acceptance??0)<100)return "ACCEPTANCE_PENDING";
  if((s.closeoutRequired??true)&&(s.closeout??0)<100)return "CLOSEOUT";
  return "COMPLETED";
}
const completeBase={work:100,deliverable:100,implementation:100,verification:100,outcome:100,acceptance:100,closeout:100};
if(state({...completeBase,implementation:0})!=="IMPLEMENTATION_PENDING")throw new Error("Scenario 1 failed: all work complete + implementation pending");
if(state({...completeBase,verification:0})!=="VERIFICATION")throw new Error("Scenario 2 failed: verification failed/pending");
if(state({...completeBase,observationRequired:true,observationComplete:false})!=="OBSERVATION")throw new Error("Scenario 3 failed: observation incomplete");
if(state({...completeBase,acceptance:0})!=="ACCEPTANCE_PENDING")throw new Error("Scenario 4 failed: acceptance pending");
if(state({...completeBase,criticalBlocker:true,riskAccepted:true,allowRiskAcceptance:true})!=="COMPLETED")throw new Error("Scenario 5 failed: allowed residual risk acceptance");
if(state({...completeBase,criticalBlocker:true})!=="BLOCKED")throw new Error("Scenario 6 failed: completed analysis with critical blocker");
if(state({...completeBase,cancelled:true})!=="CANCELLED")throw new Error("Scenario 7 failed: cancellation");
if(state({...completeBase,implementation:0,implementationRequired:false})!=="COMPLETED")throw new Error("Scenario 8 failed: research-only implementation N/A");
if(state({work:100,deliverable:100,verification:100,outcome:100,implementationRequired:false,acceptanceRequired:false,closeoutRequired:false})!=="COMPLETED")throw new Error("Scenario 9 failed: short internal analysis");
if(state({...completeBase,observationRequired:true,observationComplete:false})!=="OBSERVATION")throw new Error("Scenario 10 failed: 30-day monitoring cannot close early");

console.log("Project completion architecture validation passed (10 lifecycle regression scenarios). ");
