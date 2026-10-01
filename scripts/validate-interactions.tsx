import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { PGlite } from "@electric-sql/pglite";
import { ActionLock, ReadEpoch, resolutionReplay } from "../lib/ui/interaction-state";
import { Button } from "../components/ui/Button";
import { ProjectLiveOperations } from "../components/projects/project-live-operations";

async function main() {
  const lock=new ActionLock();assert.equal(lock.acquire(),true);assert.equal(lock.acquire(),false);lock.release();assert.equal(lock.acquire(),true);
  const epoch=new ReadEpoch();const stale=epoch.begin();epoch.invalidate();const current=epoch.begin();assert.equal(epoch.accepts(stale),false);assert.equal(epoch.accepts(current),true);
  assert.equal(resolutionReplay("rejected","rejected"),"replay");assert.equal(resolutionReplay("approved","rejected"),"conflict");

  const dom=new JSDOM('<!doctype html><html><body><main id="root"></main></body></html>',{url:"https://example.test",pretendToBeVisual:true});
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,CustomEvent:dom.window.CustomEvent,IS_REACT_ACT_ENVIRONMENT:true});
  const {createRoot}=await import("react-dom/client");
  const container=document.getElementById("root")!;
  let root=createRoot(container);let clicks=0;let finish!:()=>void;
  const slow=new Promise<void>(resolve=>{finish=resolve;});
  await act(async()=>root.render(<Button onClick={()=>{clicks++;return slow;}} loadingLabel="Saving…">Save</Button>));
  await act(async()=>{container.querySelector("button")!.click();container.querySelector("button")!.click();});
  assert.equal(clicks,1);assert.equal(container.querySelector("button")!.disabled,true);assert.equal(container.querySelector("button")!.getAttribute("aria-busy"),"true");assert.match(container.textContent!,/Saving/);
  await act(async()=>finish());assert.equal(container.querySelector("button")!.disabled,false);
  await act(async()=>root.render(<Button onClick={async()=>{throw new Error("Retry this action.");}}>Retry</Button>));
  await act(async()=>container.querySelector("button")!.click());assert.match(container.querySelector('[role="alert"]')!.textContent!,/Retry this action/);
  await act(async()=>root.unmount());

  const queue:Array<{method:string;finish:(value:Response)=>void}>=[];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=((_url:unknown,init?:RequestInit)=>new Promise<Response>(resolve=>queue.push({method:init?.method??"GET",finish:resolve}))) as typeof fetch;
  const payload={ok:true,project:{id:"p",name:"Regression",status:"active"},progressSnapshot:{progressPercent:0},execution:null,counts:{},tasks:[],agents:[],activity:[],serverTime:"now",approvals:[{id:"a",title:"Airolepath test decision",summary:"Scoped test",risk_level:"high",status:"pending",created_at:new Date().toISOString(),subject_type:"action_item",subject_id:"s",expires_at:null}]};
  root=createRoot(container);
  await act(async()=>root.render(<ProjectLiveOperations projectId="p" initialStatus="active" mode="approvals"/>));
  await act(async()=>queue[0].finish(Response.json(payload)));
  // A background read starts before rejection and returns after it.
  await act(async()=>window.dispatchEvent(new CustomEvent("rythm:project-updated")));
  const textarea=container.querySelector("textarea.note")!;
  const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,"value")!.set!;
  await act(async()=>{setter.call(textarea,"Needs a revised proposal");textarea.dispatchEvent(new dom.window.Event("input",{bubbles:true}));textarea.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
  const reject=Array.from(container.querySelectorAll("button")).find(b=>b.textContent?.includes("Reject"))!;
  await act(async()=>{reject.click();reject.click();});
  // React DOM's event plugin must initialize after the test DOM; if it did not,
  // fail rather than pretending the mutation ran.
  assert.equal(queue.filter(q=>q.method==="POST").length,1,"Reject must send exactly one mutation");
  assert.equal(reject.disabled,true);
  await act(async()=>queue.find(q=>q.method==="POST")!.finish(Response.json({ok:true,resolution:"rejected"})));
  await act(async()=>queue[1].finish(Response.json(payload)));
  assert.equal(Array.from(container.querySelectorAll("button")).some(b=>b.textContent==="Reject"),false,"Old read must not resurrect decision");
  await act(async()=>queue.at(-1)!.finish(Response.json({...payload,approvals:[],approvalHistory:[{...payload.approvals[0],status:"rejected",response_note:"Needs a revised proposal",resolved_at:new Date().toISOString()}]})));
  assert.match(container.textContent!,/Decision history/);
  await act(async()=>root.unmount());
  queue.length=0;root=createRoot(container);
  await act(async()=>root.render(<ProjectLiveOperations projectId="p" initialStatus="active" mode="approvals"/>));
  await act(async()=>queue[0].finish(Response.json(payload)));
  const approve=Array.from(container.querySelectorAll("button")).find(b=>b.textContent?.includes("Approve & continue"))!;
  await act(async()=>{approve.click();approve.click();});
  assert.equal(queue.filter(q=>q.method==="POST").length,1);
  await act(async()=>queue.at(-1)!.finish(Response.json({ok:false,error:"Could not approve. Try again."},{status:503})));
  assert.match(container.querySelector('[role="alert"]')!.textContent!,/Try again/);
  assert.equal(approve.disabled,false);assert.match(container.textContent!,/Airolepath test decision/);
  await act(async()=>approve.click());
  await act(async()=>queue.at(-1)!.finish(Response.json({ok:true,resolution:"approved"})));
  await act(async()=>queue.at(-1)!.finish(Response.json({...payload,approvals:[],approvalHistory:[{...payload.approvals[0],status:"approved",resolved_at:new Date().toISOString()}]})));
  assert.equal(Array.from(container.querySelectorAll("button")).some(b=>b.textContent?.includes("Approve & continue")),false);
  await act(async()=>root.unmount());globalThis.fetch=originalFetch;dom.window.close();

  // Execute the actual route against a deterministic compare-and-set adapter.
  const rows:Record<string,Array<Record<string,unknown>>>={projects:[{id:"p",organization_id:"o",status:"active"}],approval_requests:[],audit_events:[],project_activity_events:[]};
  let failUpdate=false;let authenticated=true;
  const client={from(table:string){
    const filters:Array<[string,unknown]>=[];let mutation:Record<string,unknown>|null=null;
    const matches=(row:Record<string,unknown>)=>filters.every(([key,value])=>row[key]===value);
    const builder={
      select(){return builder;},eq(key:string,value:unknown){filters.push([key,value]);return builder;},
      update(value:Record<string,unknown>){mutation=value;return builder;},
      insert(value:Record<string,unknown>){(rows[table]??=[]).push(value);return Promise.resolve({error:null});},
      async maybeSingle(){
        const row=(rows[table]??[]).find(matches);
        if(mutation){if(failUpdate)return {data:null,error:{message:"Test update failure"}};if(row)Object.assign(row,mutation);}
        return {data:row?{...row}:null,error:null};
      },
    };return builder;
  }};
  const loader=Module as unknown as {_load:(id:string,...args:unknown[])=>unknown};const originalLoader=loader._load;
  loader._load=function(id,...args){
    if(id==="server-only")return {};
    if(id.includes("auth/api-organization-context"))return {resolveOwnerApiOrganizationContext:async()=>authenticated?{ok:true,supabase:client,organizationId:"o",user:{id:"owner"}}:{ok:false,status:401,error:"Authentication required."}};
    if(id.includes("supabase/server"))return {createServerSupabaseClient:()=>null};
    if(id.includes("projects/project-progress"))return {getProjectProgressSnapshot:async()=>({})};
    return originalLoader.call(this,id,...args);
  };
  try {
    const api=await import("../app/api/projects/live/route");
    const send=(resolution:string)=>api.POST(new Request("https://example.test/api/projects/live",{method:"POST",body:JSON.stringify({projectId:"p",approvalId:"a",resolution,responseNote:"Regression note"})}));
    const reset=()=>{rows.approval_requests=[{id:"a",project_id:"p",organization_id:"o",status:"pending",subject_type:"action_item",title:"Scoped test",risk_level:"high",expires_at:null}];rows.audit_events=[];rows.project_activity_events=[];};
    for(const resolution of ["approved","rejected"]){
      reset();const responses=await Promise.all([send(resolution),send(resolution)]);
      assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.equal(rows.approval_requests[0].status,resolution);
      assert.equal(rows.audit_events.length,1,"Concurrent requests must create one audit record");assert.equal(rows.project_activity_events.length,1);
      const repeat=await send(resolution);assert.equal((await repeat.json()).replayed,true);assert.equal(rows.audit_events.length,1);
      assert.equal((await send(resolution==="approved"?"rejected":"approved")).status,409);
    }
    reset();failUpdate=true;assert.equal((await send("rejected")).status,409);assert.equal(rows.approval_requests[0].status,"pending");assert.equal(rows.audit_events.length,0);failUpdate=false;
    authenticated=false;assert.equal((await send("approved")).status,401);authenticated=true;
  } finally {loader._load=originalLoader;}

  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table public.approval_requests(id uuid primary key default gen_random_uuid(),organization_id uuid,project_id uuid,subject_type text,subject_id uuid,title text,summary text,risk_level text,status text default 'pending',conditions jsonb default '[]',execution_payload_digest text,execution_scope_digest text,execution_target text,execution_operation text,execution_tool text,execution_payload_summary jsonb,requested_by_agent_id uuid,created_at timestamptz default now(),resolved_at timestamptz,response_note text,consumed_at timestamptz,consumed_by_execution_id uuid);
      create table public.project_activity_events(organization_id uuid,project_id uuid,agent_id uuid,event_type text,headline text,detail text,importance text,metadata jsonb);
      create table public.project_proposals(id uuid primary key,organization_id uuid,project_id uuid,status text,updated_at timestamptz);
      create table public.project_task_runs(id uuid primary key,execution_id uuid,action_item_id uuid,waiting_on_approval_id uuid,status text,created_at timestamptz default now(),updated_at timestamptz,next_attempt_at timestamptz,error_class text,error_message text);
      create table public.action_items(id uuid primary key,organization_id uuid,status text);
    `);
    await db.exec(readFileSync("supabase/migrations/20260930203220_approval_interaction_guards.sql","utf8"));
    const precedence=readFileSync("supabase/migrations/20260930205029_approval_loop_policy_precedence.sql","utf8");
    await db.exec(precedence);
    const org="10000000-0000-0000-0000-000000000001",project="20000000-0000-0000-0000-000000000001";
    const insert=(summary:string)=>db.query<{id:string}>(`insert into approval_requests(organization_id,project_id,subject_type,subject_id,title,summary,risk_level) values($1,$2,'project_proposal',gen_random_uuid(),'Scoped proposal',$3,'high') returning id`,[org,project,summary]);
    const first=await insert("Original scope");assert.equal(first.rows.length,1);
    assert.equal((await insert("Original scope")).rows.length,0,"Duplicate pending gate suppressed");
    await db.query(`update approval_requests set status='rejected',resolved_at=now() where id=$1`,[first.rows[0].id]);
    assert.equal((await insert("Original scope")).rows.length,0,"Rejected identical gate suppressed");
    const delegated=await db.query(`insert into approval_requests(organization_id,project_id,subject_type,subject_id,title,summary,risk_level,status) values($1,$2,'project_proposal',gen_random_uuid(),'Scoped proposal','Original scope','high','approved') returning id`,[org,project]);
    assert.equal(delegated.rows.length,0,"Automatic delegation must not bypass prior rejection");
    assert.equal((await insert("Revised scope with changed constraints")).rows.length,1,"Revised request allowed");
    const events=await db.query<{metadata:{repeat_count:number;previous_status:string}}>(`select metadata from project_activity_events where event_type='approval.loop_blocked'`);
    assert.deepEqual(events.rows.map(r=>r.metadata.repeat_count),[1,2,3]);assert.equal(events.rows[1].metadata.previous_status,"rejected");
    await db.exec(`create trigger task_resolution after update of status on approval_requests for each row execute function resume_project_tasks_after_approval_v1();`);
    const gate=await db.query<{id:string}>(`insert into approval_requests(organization_id,project_id,subject_type,subject_id,title,summary,risk_level) values($1,$2,'project_recovery',gen_random_uuid(),'Recovery','Changed context','high') returning id`,[org,project]);
    await db.query(`insert into project_task_runs(id,execution_id,waiting_on_approval_id,status) values(gen_random_uuid(),gen_random_uuid(),$1,'waiting_for_approval')`,[gate.rows[0].id]);
    await db.query(`update approval_requests set status='rejected',response_note='Revise first' where id=$1`,[gate.rows[0].id]);
    const approvedGate=await db.query<{id:string}>(`insert into approval_requests(organization_id,project_id,subject_type,subject_id,title,summary,risk_level) values($1,$2,'project_task',gen_random_uuid(),'Approval task','Scoped task','high') returning id`,[org,project]);
    await db.query(`insert into project_task_runs(id,execution_id,waiting_on_approval_id,status) values(gen_random_uuid(),gen_random_uuid(),$1,'waiting_for_approval')`,[approvedGate.rows[0].id]);
    await db.query(`update approval_requests set status='approved',resolved_at=now() where id=$1`,[approvedGate.rows[0].id]);
    const resumed=await db.query<{status:string;waiting_on_approval_id:string|null}>(`select status,waiting_on_approval_id from project_task_runs where status='queued'`);assert.equal(resumed.rows.length,1);assert.equal(resumed.rows[0].waiting_on_approval_id,null);
    const tasks=await db.query<{status:string;error_class:string}>(`select status,error_class from project_task_runs`);assert.equal(tasks.rows[0].status,"blocked");assert.equal(tasks.rows[0].error_class,"approval_rejected");
  } finally {await db.close();}
  console.log("Interaction regression passed: pending/failure/double click, stale poll, decision history, identical approval loops and recovery transaction.");
}
main().catch(error=>{console.error(error);process.exit(1);});
