import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
async function main(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table public.projects(id uuid primary key,organization_id uuid,status text,lifecycle_state text,blocker_type text,priority int);
 create table public.project_completion_criteria(project_id uuid,organization_id uuid,required boolean,state text,metadata jsonb);
 create table public.project_executions(id uuid,organization_id uuid,project_id uuid,status text,last_heartbeat_at timestamptz,created_at timestamptz);
 create table public.project_task_runs(id uuid,organization_id uuid,project_id uuid,execution_id uuid,status text,next_attempt_at timestamptz,lease_expires_at timestamptz,dependencies jsonb,task_key text,assigned_agent_id uuid,priority int,created_at timestamptz,lease_owner text,attempt_count int,started_at timestamptz,updated_at timestamptz);
 create table public.project_agent_capacity(project_id uuid,agent_id uuid,allocation_percent int);
 create table public.meetings(id uuid,organization_id uuid,project_id uuid,involvement_mode text);
 create table public.project_autonomous_meeting_jobs(id uuid,organization_id uuid,project_id uuid,meeting_id uuid,status text,next_attempt_at timestamptz,lease_expires_at timestamptz,created_at timestamptz,lease_owner text,attempt_count int,updated_at timestamptz);
 insert into public.projects values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','blocked','BLOCKED',null,3);
 insert into public.project_completion_criteria select id,organization_id,true,'blocked','{"blocker_type":"agent_reported"}' from public.projects;
 insert into public.project_executions select '00000000-0000-4000-8000-000000000003',organization_id,id,'running',now(),now() from public.projects;
 insert into public.project_task_runs(id,organization_id,project_id,execution_id,status,dependencies,task_key,priority,created_at,attempt_count) select '00000000-0000-4000-8000-000000000004',organization_id,project_id,id,'queued','[]','outline',3,now(),0 from public.project_executions;
 insert into public.meetings select '00000000-0000-4000-8000-000000000005',organization_id,id,'AUTONOMOUS' from public.projects;
 insert into public.project_autonomous_meeting_jobs(id,organization_id,project_id,meeting_id,status,created_at,attempt_count) select '00000000-0000-4000-8000-000000000006',organization_id,project_id,id,'queued',now(),0 from public.meetings;`);
 await db.exec(await readFile('supabase/migrations/20261118144000_internal_review_dispatch_continuation.sql','utf8'));
 const allowed=async()=>Boolean((await db.query<{yes:boolean}>("select public.project_internal_work_authorized_v1(id,organization_id) yes from public.projects")).rows[0].yes);
 assert.equal(await allowed(),true,'Reported completion blocker must permit already governed internal remediation');
 for(const status of ['paused','on_hold','cancelled','completed']){
  await db.query('update public.projects set status=$1',[status]);assert.equal(await allowed(),false,status);
 }
 await db.exec("update public.projects set status='blocked';update public.project_completion_criteria set metadata='{\"blocker_type\":\"governance_hold\"}'");assert.equal(await allowed(),false);
 await db.exec("update public.project_completion_criteria set metadata='{\"blocker_type\":\"manual\"}'");assert.equal(await allowed(),false);
 await db.exec("update public.project_completion_criteria set metadata='{\"blocker_type\":\"agent_reported\"}';update public.projects set blocker_type='manual'");assert.equal(await allowed(),false);
 await db.exec("update public.projects set blocker_type=null");
 const claim=async(name:string)=> (await db.query(`select id from public.${name}('test-worker',2,240)`)).rows;
 await db.exec("update public.project_task_runs set status='waiting_for_approval'");assert.equal((await claim('claim_project_task_runs_v1')).length,0);
 await db.exec("update public.project_task_runs set status='queued',dependencies='[\"missing\"]' ");assert.equal((await claim('claim_project_task_runs_v1')).length,0);
 await db.exec("update public.project_task_runs set dependencies='[]';update public.project_executions set organization_id='00000000-0000-4000-8000-000000000007'");assert.equal((await claim('claim_project_task_runs_v1')).length,0);
 await db.exec("update public.project_executions set organization_id='00000000-0000-4000-8000-000000000002'");assert.equal((await claim('claim_project_task_runs_v1')).length,1);
 await db.exec("update public.project_autonomous_meeting_jobs set organization_id='00000000-0000-4000-8000-000000000007'");assert.equal((await claim('claim_project_autonomous_meeting_jobs_v1')).length,0);
 await db.exec("update public.project_autonomous_meeting_jobs set organization_id='00000000-0000-4000-8000-000000000002';update public.meetings set involvement_mode='CEO_REQUIRED'");assert.equal((await claim('claim_project_autonomous_meeting_jobs_v1')).length,0);
 await db.exec("update public.meetings set involvement_mode='AUTONOMOUS'");assert.equal((await claim('claim_project_autonomous_meeting_jobs_v1')).length,1);
 const acl=(await db.query<{member:boolean;worker:boolean}>("select has_function_privilege('authenticated','public.project_internal_work_authorized_v1(uuid,uuid)','execute') member,has_function_privilege('service_role','public.project_internal_work_authorized_v1(uuid,uuid)','execute') worker")).rows[0];assert.deepEqual(acl,{member:false,worker:true});
 await db.close();console.log('PASS W10 actual PostgreSQL internal dispatch: agent-only completion blocker continues authorized work; explicit pause/HOLD/manual blocker, missing dependency, pending approval, foreign execution/meeting and CEO-required session stay stopped; service-only helper');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
