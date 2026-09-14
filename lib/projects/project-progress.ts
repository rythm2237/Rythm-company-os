import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectProgressSnapshot={
  progressPercent:number;
  completedTasks:number;
  totalTasks:number;
  runningTasks:number;
  queuedTasks:number;
  awaitingApproval:number;
  blockedTasks:number;
  failedTasks:number;
  lastActivityAt:string|null;
};

type TaskRow={project_id:string;execution_id:string|null;status:string;started_at?:string|null;completed_at?:string|null;updated_at?:string|null};
type ExecutionRow={id:string;project_id:string;execution_no:number;status:string;started_at?:string|null;last_heartbeat_at?:string|null;updated_at?:string|null};
type ApprovalRow={project_id:string|null;status:string};
type ActivityRow={project_id:string;created_at:string};
type ProjectSeed={id:string;status?:string|null;updated_at?:string|null};

const terminalExcluded=new Set(["cancelled"]);
const queuedStatuses=new Set(["queued","pending","retrying"]);
const blockedStatuses=new Set(["blocked","waiting_for_connection","waiting_for_data"]);
const timestamp=(...values:Array<string|null|undefined>)=>values.filter(Boolean).sort().at(-1)??null;

export function calculateProjectProgressSnapshot(
  tasks:TaskRow[],
  pendingApprovals=0,
  projectStatus?:string|null,
  lastActivityAt?:string|null,
):ProjectProgressSnapshot{
  const executable=tasks.filter(task=>!terminalExcluded.has(task.status));
  const completedTasks=executable.filter(task=>task.status==="completed").length;
  const totalTasks=executable.length;
  const raw=totalTasks?Math.round((completedTasks/totalTasks)*100):(projectStatus==="completed"?100:0);
  const progressPercent=completedTasks>0&&completedTasks<totalTasks?Math.max(1,raw):raw;
  return {
    progressPercent,
    completedTasks,
    totalTasks,
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
  const [executionsResult,tasksResult,approvalsResult,activityResult]=await Promise.all([
    supabase.from("project_executions").select("id,project_id,execution_no,status,started_at,last_heartbeat_at,updated_at").eq("organization_id",organizationId).in("project_id",ids).order("execution_no",{ascending:false}),
    supabase.from("project_task_runs").select("project_id,execution_id,status,started_at,completed_at,updated_at").eq("organization_id",organizationId).in("project_id",ids),
    supabase.from("approval_requests").select("project_id,status").eq("organization_id",organizationId).in("project_id",ids).eq("status","pending"),
    supabase.from("project_activity_events").select("project_id,created_at").eq("organization_id",organizationId).in("project_id",ids).order("created_at",{ascending:false}),
  ]);
  const executions=(executionsResult.data??[]) as ExecutionRow[];
  const tasks=(tasksResult.data??[]) as TaskRow[];
  const approvals=(approvalsResult.data??[]) as ApprovalRow[];
  const activities=(activityResult.data??[]) as ActivityRow[];
  for(const project of projects){
    const latestExecution=executions.find(execution=>execution.project_id===project.id);
    const projectTasks=tasks.filter(task=>task.project_id===project.id&&(!latestExecution||task.execution_id===latestExecution.id));
    const pendingApprovals=approvals.filter(approval=>approval.project_id===project.id).length;
    const latestActivity=activities.find(activity=>activity.project_id===project.id)?.created_at??null;
    const lastActivityAt=timestamp(project.updated_at,latestActivity,latestExecution?.updated_at,latestExecution?.last_heartbeat_at,latestExecution?.started_at);
    snapshots.set(project.id,calculateProjectProgressSnapshot(projectTasks,pendingApprovals,project.status,lastActivityAt));
  }
  return snapshots;
}

export async function getProjectProgressSnapshot(
  supabase:SupabaseClient,
  organizationId:string,
  project:ProjectSeed,
):Promise<ProjectProgressSnapshot>{
  const snapshots=await getProjectProgressSnapshots(supabase,organizationId,[project]);
  return snapshots.get(project.id)??calculateProjectProgressSnapshot([],0,project.status,project.updated_at);
}
