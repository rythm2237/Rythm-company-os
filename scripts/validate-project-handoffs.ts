import assert from "node:assert/strict";
import { handoffEventId, recordProjectTaskHandoffs } from "../lib/projects/project-handoffs";
import { parseEventCursor, encodeEventCursor, mergeProjectEvents, handoffEndpoints, type ProjectLiveEvent } from "../lib/projects/project-live-events";

async function main(){
 const event=(id:string,created_at="2026-10-24T10:00:00Z"):ProjectLiveEvent=>({id,event_type:"task.handoff",headline:"Recorded handoff",detail:null,importance:"normal",created_at,metadata:{source_agent_id:"source",target_agent_id:"target"}});
 const first=event("00000000-0000-0000-0000-000000000001"),second=event("00000000-0000-0000-0000-000000000002");
 assert.equal(mergeProjectEvents([second,first],[first]).length,2,"Retries cannot duplicate events");
 assert.deepEqual(mergeProjectEvents([second],[first]).map(row=>row.id),[first.id,second.id],"Equal timestamp ordering is stable");
 assert.deepEqual(parseEventCursor(encodeEventCursor(first)),{createdAt:first.created_at,id:first.id});
 assert.equal(parseEventCursor("x),id.gt.injected"),null);assert.equal(parseEventCursor("2026-10-24T10:00:00Z|bad"),null);
 assert.deepEqual(handoffEndpoints(first),{source:"source",target:"target"});assert.equal(handoffEndpoints({...first,event_type:"task.completed"}),null);
 assert.equal(handoffEventId("execution","source","target"),handoffEventId("execution","source","target"));
 assert.notEqual(handoffEventId("execution","source","target"),handoffEventId("execution-2","source","target"));
 const inserted:Record<string,unknown>[]=[];const filters:Array<[string,unknown]>=[];let existing=false;
 const db={from:(table:string)=>table==="project_task_runs"?{select:()=>{const builder={eq:(key:string,value:unknown)=>{filters.push([key,value]);return builder;},in:async()=>({data:[{id:"dependency",task_key:"research",title:"Research",assigned_agent_id:"source",status:"completed",completed_at:first.created_at},{id:"unfinished",assigned_agent_id:"source",status:"running"},{id:"same",assigned_agent_id:"target",status:"completed"}],error:null})};return builder;}}:{insert:async(row:Record<string,unknown>)=>{if(existing)return {error:{code:"23505"}};inserted.push(row);return {error:null};}}};
 const task={id:"target-task",organization_id:"org",project_id:"project",execution_id:"execution",task_key:"design",title:"Design",assigned_agent_id:"target",dependencies:["research"]};
 await recordProjectTaskHandoffs(db as never,task);existing=true;await recordProjectTaskHandoffs(db as never,task);
 assert.equal(inserted.length,1,"Exactly one recorded transition despite retry, unfinished and same-agent dependencies");
 assert.equal(inserted[0].event_type,"task.handoff");assert.deepEqual(filters.slice(0,3),[["organization_id","org"],["project_id","project"],["execution_id","execution"]],"Dependencies cannot cross tenant/project/execution");
 await recordProjectTaskHandoffs(db as never,{...task,dependencies:[]});assert.equal(inserted.length,1,"No invented dependency handoffs");
 console.log("Project handoffs passed: persisted task-driven identity, replay dedupe, stable ordering, cursor validation and scoped dependency selection.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
