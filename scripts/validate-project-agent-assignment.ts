import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { scoreProjectAgents } from "../lib/projects/project-agent-assignment";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const org=id(1),other=id(2),owner=id(3),agent=id(4),alternative=id(5),project=id(6),otherProject=id(7),foreign=id(8);
const base={id:agent,organization_id:org,name:"Strategist",enabled:true,agent_status:"enabled",provisioning_status:"ready",skills:["Market research","Strategic analysis"],specializations:["hospitality"],updated_at:"2026-10-24T14:00:00.000Z"};
const requirements={skills:["market_research","strategic_analysis"],domain:"hospitality",allocationPercent:20};
function rank(overrides:Partial<Parameters<typeof scoreProjectAgents>[0]>={}){return scoreProjectAgents({organizationId:org,projectId:project,agents:[base,{...base,id:alternative,name:"Alternative"},{...base,id:foreign,organization_id:other}],commitments:[],tasks:[],requirements,...overrides});}
assert.equal(rank().length,2,"Other company agents are excluded");
assert.equal(rank()[0].evidence.skills,"declared","Listed skills are not verified skills");
assert.equal(rank()[0].scores.quality,null,"No fabricated quality for missing history");
assert.equal(rank({commitments:[{agent_id:agent,project_id:otherProject,allocation_percent:90}]}).find(row=>row.agentId===agent)?.eligible,false);
assert.equal(rank({tasks:[{assigned_agent_id:agent,project_id:otherProject,status:"running"}]}).find(row=>row.agentId===agent)?.eligible,false);
assert.equal(rank({agents:[{...base,enabled:false}]} )[0].eligible,false);
assert.equal(rank({requirements:{skills:["security_review"]}})[0].eligible,false);
assert.equal(rank({requirements:{skills:[]}})[0].eligible,false);
assert.equal(rank({agents:[{...base,id:alternative},{...base,id:agent}]})[0].agentId,agent,"Ties are stable by agent identity");
assert.equal(rank({readiness:[{agent_id:agent,verified_work_count:5,verified_work_success_rate:0.8}]}).find(row=>row.agentId===agent)?.scores.quality,0.8);
assert.throws(()=>rank({weights:{skill:-1,domain:25,capacity:20,quality:10,scheduling:5}}));

async function main(){
const db=new PGlite();
async function value(sql:string){return Object.values((await db.query<Record<string,unknown>>(sql)).rows[0])[0];}
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.projects(id uuid primary key,organization_id uuid,status text default 'active',priority integer default 3);
 create table public.organization_members(organization_id uuid,user_id uuid,role text,membership_status text);
 create table public.agents(id uuid primary key,organization_id uuid,enabled boolean,agent_status text,provisioning_status text,permissions jsonb default '{}',execution_capabilities jsonb default '{}',updated_at timestamptz);
 create table public.project_agents(organization_id uuid,project_id uuid,agent_id uuid,assignment_role text,status text,assigned_at timestamptz,authority_scope jsonb,primary key(project_id,agent_id));
 create table public.project_agent_capacity(organization_id uuid,project_id uuid,agent_id uuid,allocation_percent integer,priority integer,updated_at timestamptz,primary key(project_id,agent_id));
 create table public.project_task_runs(organization_id uuid,project_id uuid,assigned_agent_id uuid,status text);
 create table public.project_activity_events(id uuid primary key default gen_random_uuid(),organization_id uuid,project_id uuid,agent_id uuid,event_type text,headline text,detail text,metadata jsonb,created_at timestamptz default now());
 grant usage on schema public to service_role,authenticated,anon;grant all on all tables in schema public to service_role;
 insert into projects values('${project}','${org}','active',3),('${otherProject}','${org}','active',3),('${foreign}','${other}','active',3);
 insert into organization_members values('${org}','${owner}','owner','active');
 insert into agents(id,organization_id,enabled,agent_status,provisioning_status,updated_at) values('${agent}','${org}',true,'enabled','ready','2026-10-24T14:00:00Z'),('${alternative}','${org}',true,'enabled','ready','2026-10-24T14:00:00Z');`);
 await db.exec(readFileSync("supabase/migrations/20261024140353_universal_agent_assignment.sql","utf8"));
 const decision=JSON.stringify({requirements,scores:{skill:1},evidence:{profileUpdatedAt:base.updated_at},reason:"2/2 skills match"}).replace(/'/g,"''");
 const call=(a=agent,p=project,allocation=20)=>`select public.reserve_project_agent_assignment_v1('${org}','${p}','${a}','${owner}',${allocation},'lead','${decision}'::jsonb)`;
 await db.exec("set role authenticated"); await assert.rejects(()=>db.query(call()),/permission denied/); await db.exec("reset role;set role service_role");
 const result=await value(call()) as {ok:boolean};assert.equal(result.ok,true);
 await value(call()); assert.equal(Number(await value("select count(*) from project_activity_events")),1,"Idempotent retry preserves one event");
 const capacity=await value(call(agent,otherProject,90)) as {ok:boolean};assert.equal(capacity.ok,false,"Cross-project reservation cannot exceed 100%");
 await assert.rejects(()=>db.query(call(agent,foreign)),/Project not found/);
 await db.exec(`update agents set agent_status='paused' where id='${agent}'`);
 assert.equal((await value(call()) as {ok:boolean}).ok,false,"DB rechecks paused status");
 await db.exec(`update agents set agent_status='enabled',updated_at='2026-10-24T15:00:00Z' where id='${agent}'`);
 assert.equal((await value(call()) as {ok:boolean}).ok,false,"Stale capability evidence cannot reserve capacity");
 await db.exec(`update agents set updated_at='2026-10-24T14:00:00Z' where id='${agent}';insert into project_task_runs values('${org}','${otherProject}','${alternative}','running')`);
 assert.equal((await value(call(alternative)) as {ok:boolean}).ok,false,"DB rechecks real running task occupancy");
 await db.exec("delete from project_task_runs");await value(call(alternative));
 assert.equal(Number(await value(`select count(*) from project_agents where project_id='${project}' and assignment_role='AI Project Lead'`)),1,"One AI lead survives a replacement");
 await db.exec(`reset role;
 alter table project_task_runs add column id uuid primary key default gen_random_uuid(),add column execution_id uuid,add column task_key text default 'task',add column dependencies jsonb default '[]',add column priority integer default 3,add column created_at timestamptz default now(),add column next_attempt_at timestamptz,add column lease_expires_at timestamptz,add column lease_owner text,add column attempt_count integer default 0,add column started_at timestamptz,add column updated_at timestamptz default now();
 create table project_executions(id uuid primary key,organization_id uuid,status text,last_heartbeat_at timestamptz,created_at timestamptz default now());`);
 await db.exec(readFileSync("supabase/migrations/20261024141204_project_scheduler_capacity_enforcement.sql","utf8"));
 await db.exec(`create trigger trg_enforce_project_agent_capacity before insert or update of allocation_percent,agent_id,project_id on project_agent_capacity for each row execute function public.enforce_project_agent_capacity_v1();grant all on project_executions to service_role;set role service_role;
 insert into project_executions(id,organization_id,status) values('${id(10)}','${org}','running');
 update agents set execution_capabilities='{"max_concurrent_tasks":2}' where id='${alternative}';
 insert into project_task_runs(organization_id,project_id,execution_id,assigned_agent_id,status,task_key) select '${org}','${project}','${id(10)}','${agent}','queued','strategy-'||n from generate_series(1,3) n;
 insert into project_task_runs(organization_id,project_id,execution_id,assigned_agent_id,status,task_key) select '${org}','${project}','${id(10)}','${alternative}','queued','research-'||n from generate_series(1,3) n;`);
 await assert.rejects(()=>db.exec(`insert into project_agent_capacity values('${org}','${otherProject}','${agent}',90,3,now())`),/capacity exceeded/,"Legacy direct capacity writers cannot bypass aggregate limit");
 const leased=(await db.query<{assigned_agent_id:string}>("select assigned_agent_id from claim_project_task_runs_v1('worker-1',8,240)")).rows;
 assert.equal(leased.filter(row=>row.assigned_agent_id===agent).length,1,"One-slot agent receives one task per lease batch");
 assert.equal(leased.filter(row=>row.assigned_agent_id===alternative).length,2,"Two-slot agent receives exactly two tasks");
 assert.equal((await db.query("select * from claim_project_task_runs_v1('worker-2',8,240)")).rows.length,0,"A second worker cannot bypass occupied slots");
 await db.exec(`update project_task_runs set status='completed' where assigned_agent_id='${agent}' and status='running'`);
 assert.equal((await db.query("select * from claim_project_task_runs_v1('worker-3',8,240)")).rows.length,1,"Completing work releases an actual slot");
 await db.exec(`update project_task_runs set status='completed' where status='running';update agents set agent_status='paused' where id='${alternative}';update project_agent_capacity set allocation_percent=0 where agent_id='${agent}';
 insert into project_task_runs(organization_id,project_id,execution_id,status,task_key,dependencies) values('${org}','${project}','${id(10)}','queued','missing-dependency','["nonexistent"]');`);
 assert.equal((await db.query("select * from claim_project_task_runs_v1('worker-4',8,240)")).rows.length,0,"Paused agent, allocation zero and missing dependencies stay queued");
 await db.exec("reset role;set role authenticated");
 await assert.rejects(()=>db.query("select * from claim_project_task_runs_v1('unauthorized',8,240)"),/permission denied/);
 console.log("Project agent assignment passed: capability scoring, unknown history, actual queues, tenant isolation, service-only atomic reservation, capacity, stale evidence, retries, lead replacement and worker concurrency slots.");
}finally{await db.close();}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
