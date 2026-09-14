import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectProgressSnapshot={
  progressPercent:number;
  outcomeProgressPercent:number|null;
  hasApprovedRoadmap:boolean;
  roadmapVersion:number|null;
  roadmapStatus:string|null;
  currentPhase:string|null;
  nextMilestone:string|null;
  completedTasks:number;
  totalTasks:number;
  taskCompletionPercent:number;
  runningTasks:number;
  queuedTasks:number;
  awaitingApproval:number;
  blockedTasks:number;
  failedTasks:number;
  lastActivityAt:string|null;
};

type TaskRow={project_id:string;execution_id:string|null;status:string;roadmap_id?:string|null;roadmap_phase_id?:string|null;work_weight?:number|string|null;started_at?:string|null;completed_at?:string|null;updated_at?:string|null};
type ExecutionRow={id:string;project_id:string;execution_no:number;status:string;roadmap_id?:string|null;started_at?:string|null;last_heartbeat_at?:string|null;updated_at?:string|null};
type ApprovalRow={project_id:string|null;status:string};
type ActivityRow={project_id:string;created_at:string};
type ProjectSeed={id:string;status?:string|null;updated_at?:string|null};
type RoadmapRow={id:string;project_id:string;version:number;status:string;is_baseline:boolean};
type PhaseRow={id:string;project_id:string;roadmap_id:string;phase_order:number;title:string;milestone?:string|null;weight:number|string;status:string;outcome_progress_percent?:number|string|null};

const terminalExcluded=new Set(["cancelled"]);
const queuedStatuses=new Set(["queued","pending","retrying"]);
const blockedStatuses=new Set(["blocked","waiting_for_connection","waiting_for_data"]);
const timestamp=(...values:Array<string|null|undefined>)=>values.filter(Boolean).sort().at(-1)??null;
const clamp=(value:number)=>Math.max(0,Math.min(100,value));

export function calculateProjectProgressSnapshot(
  tasks:TaskRow[],
  pendingApprovals=0,
  projectStatus?:string|null,
  lastActivityAt?:string|null,
  roadmap?:{id:string;version:number;status:string;phases:PhaseRow[]}|null,
):ProjectProgressSnapshot{
  const executable=tasks.filter(task=>!terminalExcluded.has(task.status));
  const completedTasks=executable.filter(task=>task.status==="completed").length;
  const totalTasks=executable.length;
  const taskCompletionPercent=totalTasks?Math.round((completedTasks/totalTasks)*100):(projectStatus==="completed"?100:0);
  let progressPercent=projectStatus==="completed"?100:0;
  let outcomeProgressPercent:number|null=null;
  let currentPhase:string|null=null;
  let nextMilestone:string|null=null;

  if(roadmap?.phases.length){
    const phases=[...roadmap.phases].sort((a,b)=>a.phase_order-b.phase_order);
    const totalPhaseWeight=phases.reduce((sum,phase)=>sum+Math.max(0,Number(phase.weight)||0),0);
    let weightedExecution=0;
    let weightedOutcome=0;
    let outcomeWeight=0;
    for(const phase of phases){
      const phaseTasks=executable.filter(task=>task.roadmap_id===roadmap.id&&task.roadmap_phase_id===phase.id);
      const phaseTaskWeight=phaseTasks.reduce((sum,task)=>sum+Math.max(0.1,Number(task.work_weight)||1),0);
      const completedWeight=phaseTasks.filter(task=>task.status==="completed").reduce((sum,task)=>sum+Math.max(0.1,Number(task.work_weight)||1),0);
      const phaseProgress=phaseTaskWeight>0?clamp((completedWeight/phaseTaskWeight)*100):(phase.status==="completed"?100:0);
      weightedExecution+=Math.max(0,Number(phase.weight)||0)*phaseProgress;
      if(phase.outcome_progress_percent!=null){weightedOutcome+=Math.max(0,Number(phase.weight)||0)*clamp(Number(phase.outcome_progress_percent));outcomeWeight+=Math.max(0,Number(phase.weight)||0);}
      if(!currentPhase&&phaseProgress<100&&(phaseProgress>0||phase.status==="in_progress"||phaseTasks.some(task=>["running","waiting_for_approval","blocked","queued","retrying","waiting_for_connection","waiting_for_data"].includes(task.status)))){currentPhase=phase.title;nextMilestone=phase.milestone??null;}
    }
    progressPercent=totalPhaseWeight?Math.round(weightedExecution/totalPhaseWeight):0;
    outcomeProgressPercent=outcomeWeight?Math.round(weightedOutcome/outcomeWeight):null;
    if(!currentPhase){const next=phases.find(phase=>phase.status!=="completed");currentPhase=next?.title??phases.at(-1)?.title??null;nextMilestone=next?.milestone??null;}
  }

  return {
    progressPercent:clamp(progressPercent),
    outcomeProgressPercent,
    hasApprovedRoadmap:Boolean(roadmap),
    roadmapVersion:roadmap?.version??null,
    roadmapStatus:roadmap?.status??null,
    currentPhase,
    nextMilestone,
    completedTasks,
    totalTasks,
    taskCompletionPercent,
    runningTasks:executable.filter(task=>task.status==="running").length,
    queuedTasks:executable.filter(task=>queuedStatuses.has(task.status)).length,
    awaitingApproval:Math.max(pendingApprovals,executable.filter(task=>task.status==="waiting_for_approval").length),
    blockedTasks:executable.filter(task=>blockedStatuses.has(task.status)).length,
    failedTasks:executable.filter(task=>task.status==="failed").length,
    lastActivityAt:timestamp(lastActivityAt,...executable.flatMap(task=>[task.completed_at,task.updated_at,task.started_at])),
  };
}

export async function getProjectProgressSnapshots(
  supabase:SupabaseClient,
  organizationId:string,
  projects:ProjectSeed[],
):Promise<Map<string,ProjectProgressSnapshot>>{
  const ids=projects.map(project=>project.id);
  const snapshots=new Map<string,ProjectProgressSnapshot>();
  if(!ids.length)return snapshots;
  const [executionsResult,tasksResult,approvalsResult,activityResult,roadmapsResult,phasesResult]=await Promise.all([
    supabase.from("project_executions").select("id,project_id,execution_no,status,roadmap_id,started_at,last_heartbeat_at,updated_at").eq("organization_id",organizationId).in("project_id",ids).order("execution_no",{ascending:false}),
    supabase.from("project_task_runs").select("project_id,execution_id,status,roadmap_id,roadmap_phase_id,work_weight,started_at,completed_at,updated_at").eq("organization_id",organizationId).in("project_id",ids),
    supabase.from("approval_requests").select("project_id,status").eq("organization_id",organizationId).in("project_id",ids).eq("status","pending"),
    supabase.from("project_activity_events").select("project_id,created_at").eq("organization_id",organizationId).in("project_id",ids).order("created_at",{ascending:false}),
    supabase.from("project_roadmaps").select("id,project_id,version,status,is_baseline").eq("organization_id",organizationId).in("project_id",ids).eq("status","approved").eq("is_baseline",true).order("version",{ascending:false}),
    supabase.from("project_roadmap_phases").select("id,project_id,roadmap_id,phase_order,title,milestone,weight,status,outcome_progress_percent").eq("organization_id",organizationId).in("project_id",ids).order("phase_order"),
  ]);
  const executions=(executionsResult.data??[]) as ExecutionRow[];
  const tasks=(tasksResult.data??[]) as TaskRow[];
  const approvals=(approvalsResult.data??[]) as ApprovalRow[];
  const activities=(activityResult.data??[]) as ActivityRow[];
  const roadmaps=(roadmapsResult.data??[]) as RoadmapRow[];
  const phases=(phasesResult.data??[]) as PhaseRow[];
  for(const project of projects){
    const latestExecution=executions.find(execution=>execution.project_id===project.id);
    const projectTasks=tasks.filter(task=>task.project_id===project.id&&(!latestExecution||task.execution_id===latestExecution.id));
    const baseline=roadmaps.find(roadmap=>roadmap.project_id===project.id);
    const roadmap=baseline?{id:baseline.id,version:baseline.version,status:baseline.status,phases:phases.filter(phase=>phase.roadmap_id===baseline.id)}:null;
    const pendingApprovals=approvals.filter(approval=>approval.project_id===project.id).length;
    const latestActivity=activities.find(activity=>activity.project_id===project.id)?.created_at??null;
    const lastActivityAt=timestamp(project.updated_at,latestActivity,latestExecution?.updated_at,latestExecution?.last_heartbeat_at,latestExecution?.started_at);
    snapshots.set(project.id,calculateProjectProgressSnapshot(projectTasks,pendingApprovals,project.status,lastActivityAt,roadmap));
  }
  return snapshots;
}

export async function getProjectProgressSnapshot(
  supabase:SupabaseClient,
  organizationId:string,
  project:ProjectSeed,
):Promise<ProjectProgressSnapshot>{
  const snapshots=await getProjectProgressSnapshots(supabase,organizationId,[project]);
  return snapshots.get(project.id)??calculateProjectProgressSnapshot([],0,project.status,project.updated_at,null);
}
