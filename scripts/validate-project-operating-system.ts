import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(file:string)=>fs.readFileSync(path.join(root,file),"utf8");
const requireFile=(file:string)=>{if(!fs.existsSync(path.join(root,file)))throw new Error(`Missing ${file}`);return read(file);};
const requireText=(content:string,text:string,label:string)=>{if(!content.includes(text))throw new Error(`${label}: missing ${text}`);};

const migration=requireFile("supabase/migrations/20260912203000_project_operating_system.sql");
const compat=requireFile("supabase/migrations/20260912204000_project_os_compatibility.sql");
const scheduler=requireFile("supabase/migrations/20260912205000_project_os_scheduler_hardening.sql");
const databaseScheduler=requireFile("supabase/migrations/20260912206000_project_os_database_scheduler.sql");
const engine=requireFile("lib/projects/project-operating-system.ts");
const intake=requireFile("app/(app)/projects/page.tsx");
const dashboard=requireFile("app/(app)/projects/operating/page.tsx");
const vercel=requireFile("vercel.json");
const authRoutes=["app/api/projects/analyze/route.ts","app/api/projects/run/route.ts","app/api/projects/files/route.ts","app/api/projects/connections/route.ts","app/api/projects/control/route.ts"].map(requireFile);
const dispatcher=requireFile("app/api/projects/dispatch/route.ts");

for(const table of ["project_clients","project_contracts","project_documents","project_connection_bindings","project_readiness_assessments","project_clarification_requests","project_scope_versions","project_executions","project_task_runs","project_proposals","project_decision_memory","project_agent_capacity","project_activity_events","project_health_events"])requireText(migration,`public.${table}`,"schema");
requireText(migration,"resume_project_tasks_after_approval_v1","approval auto-resume");
requireText(migration,"resume_project_tasks_after_connection_v1","connection auto-resume");
requireText(migration,"service_role","worker-only RPC boundary");
requireText(compat,"computer.use","reusable computer-use contract");
requireText(compat,"requires_cloud_provider,enabled","computer-use provider gate");
requireText(compat,"true,false","computer-use must remain disabled without provider");
requireText(scheduler,"for update of tr skip locked","concurrency-safe claiming");
requireText(scheduler,"Every declared dependency must exist","missing dependency fail-closed");
requireText(scheduler,"enforce_project_agent_capacity_v1","cross-project capacity guard");
requireText(scheduler,"refresh_project_execution_health_v1","heartbeat health monitor");
requireText(databaseScheduler,"pg_cron","database scheduler");
requireText(databaseScheduler,"pg_net","database HTTP dispatcher");
requireText(databaseScheduler,"vault.create_secret","scheduler secret storage");
requireText(databaseScheduler,"configure_project_os_scheduler_v1","explicit scheduler activation");
requireText(databaseScheduler,"*/%s * * * *","database scheduler cadence");
requireText(engine,"executeAiRequest","AI Request Gateway reuse");
requireText(engine,"organization_integrations","company-level connection reuse");
requireText(engine,"project_connection_bindings","project-scoped connections");
requireText(engine,"project_context_documents","shared Project Knowledge reuse");
requireText(engine,"approval_requests","Human CEO approval reuse");
requireText(engine,"project_proposals","proactive proposal path");
requireText(engine,"recover_stale_project_task_runs_v1","restart recovery");
requireText(intake,"Client / Counterparty","rich intake client section");
requireText(intake,"Contract & Commercial","rich intake contract section");
requireText(intake,'name="files" multiple',"multi-file intake");
requireText(dashboard,"Execution Readiness","readiness UX");
requireText(dashboard,"Executive Inbox","executive attention UX");
requireText(dashboard,"persisted server-side","offline execution UX");
if(vercel.includes('"path": "/api/projects/dispatch"'))throw new Error("Frequent project dispatch must not rely on Vercel Hobby Cron.");
for(const route of authRoutes){requireText(route,"resolveOwnerApiOrganizationContext","owner authorization");requireText(route,"organizationId","tenant scope");}
requireText(dispatcher,"CRON_SECRET","scheduler authentication");
requireText(dispatcher,"refresh_project_execution_health_v1","scheduler health refresh");

if(engine.includes("setInterval(")||engine.includes("window.")||engine.includes("localStorage"))throw new Error("Background execution must not depend on frontend/in-memory browser runtime.");
if(dashboard.includes("Watch Live")||dashboard.includes("Take Control"))throw new Error("Computer-use live controls must not be exposed before a real cloud provider exists.");
console.log("Project Operating System static architecture validation passed.");
