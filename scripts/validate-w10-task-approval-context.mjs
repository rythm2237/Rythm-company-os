import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const state={calls:0,completed:0,prompt:''};globalThis.w10TaskReceipt=state;
const mocks={
 '@/lib/ai/request-gateway':`export async function executeAiRequest(input){globalThis.w10TaskReceipt.calls++;globalThis.w10TaskReceipt.prompt=input.prompt;return {outputText:JSON.stringify({summary:'Final synthetic document',deliverables:[{title:'Final KPI',content:'1000 impressions; CTR=5%; conversion=20%'}],work_completed:true,deliverable_completed:true,verification_result:'not_verified',implementation_executed:false,outcome_observed:false,blockers:[],evidence:[],meeting_request:null}),correlationId:'synthetic'}}`,
 '@/lib/projects/project-completion':`export async function evaluateProjectCompletion(){return {}}`,
 '@/lib/crm/agent-context':`export async function loadCrmAgentOperationalContext(){return null}`,
};
const compiled=await build({entryPoints:['lib/projects/project-work-v2.ts'],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',plugins:[{name:'synthetic-adapters',setup(builder){builder.onResolve({filter:/^@\//},input=>mocks[input.path]?{path:input.path,namespace:'fixture'}:undefined);builder.onLoad({filter:/.*/,namespace:'fixture'},input=>({loader:'js',contents:mocks[input.path]}));}}]});
const fixtureModule={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),fixtureModule,fixtureModule.exports);
const oldKey=process.env.OPENAI_API_KEY,oldModel=process.env.RYTHM_DRY_RUN_MODEL;process.env.OPENAI_API_KEY='sk-synthetic-no-network';process.env.RYTHM_DRY_RUN_MODEL='synthetic';
try{
 for(const kind of ['approved','pending','foreign','lookup_error']){
  state.calls=0;state.completed=0;state.prompt='';
  const task={id:'task',organization_id:'org-A',project_id:'project-A',execution_id:'execution-A',action_item_id:'action',assigned_agent_id:null,lease_owner:'worker',title:'Finish scoped document',input:{source_meeting_id:'meeting'},attempt_count:1,max_attempts:5};
  const db={
   async rpc(name){if(name==='claim_project_task_runs_v1')return {data:[task],error:null};if(name==='complete_project_task_work_v1')state.completed++;return {data:null,error:null};},
   from(table){let operation='select';const filters={};const answer=()=>{
    if(operation!=='select')return {data:null,error:null};
    assert.equal(filters.organization_id,'org-A',table+' tenant filter');
    if(table==='projects')return {data:{id:'project-A',name:'Synthetic project',objective:'Internal KPI document'},error:null};
    if(table==='project_executions')return {data:{id:'execution-A'},error:null};
    if(table==='action_items')return {data:{id:'action',project_id:'project-A',authorization_approval_id:'approval'},error:null};
    if(table==='approval_requests'){
     assert.equal(filters.project_id,'project-A');assert.equal(filters.id,'approval');
     if(kind==='lookup_error')return {data:null,error:{code:'synthetic'}};
     const row={id:'approval',organization_id:kind==='foreign'?'org-B':'org-A',project_id:kind==='foreign'?'project-B':'project-A',status:kind==='pending'?'pending':'approved',title:'Finish internal document',approver_user_id:'human-owner',resolved_at:'2026-11-18T22:00:00Z',response_note:kind==='foreign'?'FOREIGN_PRIVATE_NOTE':'W10_HUMAN_CEO_APPROVED_FINISH_NOW'};
     return {data:Object.entries(filters).every(([key,value])=>row[key]===value)?row:null,error:null};
    }
    return {data:[],error:null};
   };const q={select(){return q},eq(k,v){filters[k]=v;return q},order(){return q},limit(){return q},in(){return q},insert(){operation='insert';return q},update(){operation='update';return q},upsert(){operation='upsert';return q},single:async()=>answer(),maybeSingle:async()=>answer(),then(resolve,reject){return Promise.resolve(answer()).then(resolve,reject)}};return q;}
  };
  const results=await fixtureModule.exports.dispatchProjectWorkV2(db,'worker');
  if(kind==='approved'){assert.equal(state.calls,1);assert.equal(state.completed,1);assert.match(state.prompt,/W10_HUMAN_CEO_APPROVED_FINISH_NOW/);assert.equal(results[0].status,'completed');}
  else {assert.equal(state.calls,0,kind+' authorization must stop before provider');assert.equal(state.completed,0);assert.equal(results[0].status,'retrying');}
  assert.equal(state.prompt.includes('FOREIGN_PRIVATE_NOTE'),false);
 }
 console.log('PASS W10 actual task worker: persisted approved Human CEO direction reaches provider; pending, foreign and lookup-error receipts stop before provider/completion; no foreign note leakage');
}finally{delete globalThis.w10TaskReceipt;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;if(oldModel===undefined)delete process.env.RYTHM_DRY_RUN_MODEL;else process.env.RYTHM_DRY_RUN_MODEL=oldModel;}
