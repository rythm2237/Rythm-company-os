import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(file:string)=>fs.readFileSync(path.join(root,file),"utf8");
const requireText=(content:string,text:string,label:string)=>{if(!content.includes(text))throw new Error(`${label}: missing ${text}`);};
const forbidText=(content:string,text:string,label:string)=>{if(content.includes(text))throw new Error(`${label}: forbidden ${text}`);};

const supervisor=read("lib/projects/project-supervisor.ts");
const dispatcher=read("app/api/projects/dispatch/route.ts");
const meetings=read("lib/projects/project-autonomous-meetings.ts");
const migration=read("supabase/migrations/20260927193000_project_autonomy_supervisor_recovery.sql");
const scheduledRecoveryHealth=read("supabase/migrations/20260927195000_project_scheduled_recovery_health_fix.sql");

requireText(supervisor,"superviseProjectExecutions","durable supervisor entrypoint");
requireText(supervisor,"supervisor_recovery_count","bounded autonomous recovery");
requireText(supervisor,"supervisor_transient_retry","retry-exhausted transient recovery");
requireText(supervisor,"Recovery manager","department/manager recovery assignment");
requireText(supervisor,"recovery_for_task_id","durable recovery-task linkage");
requireText(supervisor,"recovery_replace_dependencies","dependency deadlock re-plan");
requireText(supervisor,"project_recovery","executive escalation only after autonomous recovery");
requireText(supervisor,"meeting.supervisor_retry","failed autonomous meeting recovery");
requireText(supervisor,"rate.?limit","provider rate-limit classification");
requireText(supervisor,"attempt_count:0","retry budget reset after supervisor recovery");
forbidText(supervisor,"setInterval(","supervisor must remain server-side/durable");
forbidText(supervisor,"window.","supervisor must remain browser-independent");
forbidText(supervisor,"localStorage","supervisor must remain browser-independent");

requireText(dispatcher,'superviseProjectExecutions','dispatcher supervisor integration');
requireText(dispatcher,'"supervisor_pre"','pre-worker recovery pass');
requireText(dispatcher,'"supervisor_post"','same-cycle post-worker recovery pass');
requireText(dispatcher,'dispatchProjectWork','normal task worker remains canonical');
requireText(dispatcher,'dispatchAutonomousProjectMeetings','normal meeting worker remains canonical');
requireText(dispatcher,'dispatchApprovedProjectToolExecutions','external actions remain gateway-governed');

requireText(meetings,"parseStructuredJson","meeting JSON recovery parser");
requireText(meetings,"Output contract: emit exactly one valid JSON object","strict meeting structured-output contract");
requireText(meetings,'replace(/,\\s*([}\\]])/g,"$1")',"trailing-comma recovery");
requireText(meetings,"project_decision_memory","meeting decisions remain durable");
requireText(meetings,"approval_requests","meeting actions still obey approval governance");

requireText(migration,"last_progress_at","meaningful progress heartbeat");
requireText(migration,"refresh_project_roadmap_phase_status_v1","roadmap phase execution synchronization");
requireText(migration,"deadlocked_execution","deadlock health detection");
requireText(migration,"retry_exhausted","retry exhaustion health visibility");
requireText(migration,"consumed_at","approval consumption audit");
requireText(migration,"Manager recovery/re-planning is required","rejected approvals route to re-plan instead of silent deadlock");
requireText(migration,"revoke all on function public.refresh_project_execution_health_v1() from public,anon,authenticated","security-definer hardening");
requireText(migration,"grant execute on function public.refresh_project_execution_health_v1() to service_role","worker-only health RPC");

requireText(scheduledRecoveryHealth,"x.status='retrying'","scheduled retry health classification");
requireText(scheduledRecoveryHealth,"x.next_attempt_at>now()","future retry must prevent false deadlock");
requireText(scheduledRecoveryHealth,"no runnable or scheduled recovery branch","deadlock wording reflects scheduled recovery");
requireText(scheduledRecoveryHealth,"Normalize legacy heartbeat-based wording","legacy health wording correction");
requireText(scheduledRecoveryHealth,"grant execute on function public.refresh_project_execution_health_v1() to service_role","health hotfix remains worker-only");

console.log("Project autonomous supervisor recovery validation passed.");
