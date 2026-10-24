import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Stable identity makes a retried claim replay the same handoff, never duplicate it. */
export function handoffEventId(executionId:string,fromTaskId:string,toTaskId:string) {
  const hex=createHash("sha256").update(`project-handoff-v1:${executionId}:${fromTaskId}:${toTaskId}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

type ClaimedTask={id:string;organization_id:string;project_id:string;execution_id:string;task_key:string;title:string;assigned_agent_id:string|null;dependencies?:unknown;status?:string};

/** Called only after the durable scheduler has claimed runnable work. No visual inference creates events. */
export async function recordProjectTaskHandoffs(supabase:SupabaseClient,task:ClaimedTask) {
  const keys=Array.isArray(task.dependencies)?task.dependencies.filter((value):value is string=>typeof value==="string").slice(0,60):[];
  if(!keys.length||!task.assigned_agent_id)return;
  const dependencies=await supabase.from("project_task_runs")
    .select("id,task_key,title,assigned_agent_id,status,completed_at")
    .eq("organization_id",task.organization_id).eq("project_id",task.project_id).eq("execution_id",task.execution_id).in("task_key",keys);
  if(dependencies.error)throw new Error("Unable to record project work handoff.");
  for(const source of dependencies.data??[]){
    if(source.status!=="completed"||!source.assigned_agent_id||source.assigned_agent_id===task.assigned_agent_id)continue;
    const result=await supabase.from("project_activity_events").insert({
      id:handoffEventId(task.execution_id,source.id,task.id),
      organization_id:task.organization_id,project_id:task.project_id,execution_id:task.execution_id,agent_id:task.assigned_agent_id,
      event_type:"task.handoff",headline:`Work handed off: ${source.title} → ${task.title}`,
      detail:"A completed dependency released this work packet to the next assigned specialist.",importance:"normal",
      metadata:{version:1,source_task_id:source.id,target_task_id:task.id,source_agent_id:source.assigned_agent_id,target_agent_id:task.assigned_agent_id,source_completed_at:source.completed_at,target_status:"running",task_key:task.task_key},
    });
    if(result.error&&result.error.code!=="23505")throw new Error("Unable to persist project work handoff.");
  }
}
