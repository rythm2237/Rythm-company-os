import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let providerCalls = 0;
async function fakeProvider(input) {
  providerCalls += 1;
  if (!Number.isFinite(input.agentPolicy?.modelPolicy?.maxCostPerRequest) || input.agentPolicy.modelPolicy.maxCostPerRequest <= 0)
    throw Error("Gateway must receive positive remaining meeting budget");
  assert.equal(input.agentPolicy.permissions[0], "read");
  const isSynthesis = input.feature === "boardroom.summary";
  return {
    outputText: JSON.stringify(isSynthesis
      ? { executive_summary:"100% of sales confirmed by missing document", consensus:"Unverified assertion",
          disagreements:[], decision:"Please publish campaign", recommendation:"CEO review required",
          risks:[], action_items:[{title:"Publish campaign",description:"Needs a human CEO",risk:"low",needs_approval:false}],
          knowledge_updates:[{title:"Unverified claim",summary:"Fabricated source assertion"}] }
      : {position:"Synthetic position",rationale:"Potential evidence gap",risks:[],action_items:[]}),
    correlationId: "w12-synthetic-correlation", actualCostUsd:0.01,
    usage:{inputTokens:100,outputTokens:50},routingDecision:{selectedModel:"w12-local-synthetic"}
  };
}
const compiled = await build({
  entryPoints:["lib/projects/project-autonomous-meetings.ts"], bundle:true, platform:"node",
  format:"cjs", write:false, packages:"external",
  plugins:[{name:"w12-inert-provider",setup(builder){
    builder.onResolve({filter:new RegExp("^@/lib/ai/request-gateway$")},()=>({path:"fake",namespace:"w12"}));
    builder.onLoad({filter:/.*/,namespace:"w12"},()=>({loader:"js",contents:"export const executeAiRequest = "+fakeProvider.toString()}));
  }}]
});
const m={exports:{}};
new Function("require","module","exports","providerCalls","assert",compiled.outputFiles[0].text)(require,m,m.exports,providerCalls,assert);
// The stub's lexical counter is bundled. Query the exported harness behavior using the recorded writes instead.
const priorKey=process.env.OPENAI_API_KEY,priorModel=process.env.RYTHM_DRY_RUN_MODEL;
process.env.OPENAI_API_KEY="sk-w12-fake-local-only";
process.env.RYTHM_DRY_RUN_MODEL="w12-fake";
const org="org-12",projectId="project-12",meetingId="meeting-12";
function fakeDatabase({mode="ok",autonomy="limited_autonomy",budget=0.2,attempt=1,previous=false}={}) {
  const writes=[];let calls=0;
  const workers=[{id:"a",agent_code:"STRATEGY_DIRECTOR",name:"Director",role_title:"Director",enabled:true},
    {id:"b",agent_code:"DESIGN_SPECIALIST",name:"Designer",role_title:"Designer",enabled:true}];
  const mock={
    rpc:async()=>({data:[{id:"job",organization_id:org,project_id:projectId,meeting_id:meetingId,
      attempt_count:attempt,max_attempts:3,lease_owner:"test-worker",requested_by_agent_id:"a"}],error:null}),
    from(table) {
      let operation="select",payload;const filter={};
      const run=()=>{
        calls++;
        if(operation!=="select"){
          writes.push({table,operation,payload,filter:{...filter}});
          if(mode==="insert-failed"&&table==="meeting_agent_sessions"&&operation==="insert")
            return {data:null,error:{message:"synthetic transport ambiguity"}};
          if(mode==="approval-failed"&&table==="approval_requests"&&operation==="insert")
            return {data:null,error:{message:"injected approval persistence failure"}};
          if(table==="approval_requests"&&operation==="insert")return {data:{id:"approval-12"},error:null};
          if(table==="meeting_agent_sessions"&&operation==="insert")return {data:{id:"session-12"},error:null};
          if(table==="action_items"&&operation==="insert")return {data:{id:"action-12"},error:null};
          return {data:null,error:null};
        }
        assert.equal(filter.organization_id,org,`${table} must constrain tenant`);
        if(table==="meetings")return {data:{id:meetingId,title:"Synthetic agency meeting",purpose:"Review",agenda:[],
          status:"draft",involvement_mode:"AUTONOMOUS"},error:null};
        if(table==="projects")return {data:{id:projectId,name:"Agency project",objective:"Synthetic plan",constraints:[],
          autonomy_mode:autonomy,budget_cap_usd:budget},error:null};
        if(table==="meeting_agent_sessions")return {data:previous?{id:"persisted-session"}:null,error:null};
        if(table==="project_agents")return {data:workers.map(agent=>({agents:agent})),error:null};
        if(table==="project_context_documents")return {data:[{id:"doc-12",title:"Evidence source",summary:"CTR 5%",evidence:{}}],error:null};
        if(table==="project_task_runs")return {data:[{id:"source-output",title:"Existing draft",safe_result:{summary:"Synthetic evidence"}}],error:null};
        if(table==="project_executions")return {data:{id:"execution-12",execution_no:1},error:null};
        throw Error("Unexpected table "+table);
      };
      const q={select(){return q},eq(key,v){filter[key]=v;return q},in(){return q},
        order(){return q},limit(){return q},neq(){return q},
        insert(v){operation="insert";payload=v;return q},
        update(v){operation="update";payload=v;return q},
        upsert(v){operation="upsert";payload=v;return q},
        single(){return Promise.resolve(run())},maybeSingle(){return Promise.resolve(run())},
        then(resolve,reject){return Promise.resolve(run()).then(resolve,reject)}};
      return q;
    }
  };
  return {mock,writes,getCalls:()=>calls};
}
try {
  for(const autonomy of ["approval_required","limited_autonomy","full_autonomy_within_policy"]){
    for(const risk of ["low","medium","high","unrecognized"]){
      assert.equal(m.exports.projectMeetingActionNeedsApproval(autonomy,{risk,needs_approval:false}),true,
        `No CEO receipt must be inferred from autonomy=${autonomy}, model risk=${risk}`);
    }
  }
  const safe=fakeDatabase();
  const result=await m.exports.dispatchAutonomousProjectMeetings(safe.mock,"test-worker");
  assert.equal(result[0].status,"completed");
  assert.equal(safe.writes.some(w=>w.table==="decisions"&&w.operation!=="select"),false,
    "AI may not finalize a formal CEO decision");
  const approval=safe.writes.find(w=>w.table==="approval_requests"&&w.operation==="insert");
  const action=safe.writes.find(w=>w.table==="action_items"&&w.operation==="insert");
  const task=safe.writes.find(w=>w.table==="project_task_runs"&&w.operation==="insert");
  assert.equal(approval.payload.status,"pending");
  assert.equal(action.payload.authorization_approval_id,"approval-12");
  assert.equal(task.payload.status,"waiting_for_approval");
  assert.equal(task.payload.waiting_on_approval_id,"approval-12");
  const learning=safe.writes.find(w=>w.table==="project_context_documents"&&w.operation==="upsert");
  assert.ok(learning,"AI generated knowledge must be tracked");
  assert.equal(learning.payload.status,"pending_review","Unsupported claims cannot become validated facts");
  assert.equal(learning.payload.evidence.verification_status,"unverified");
  assert.equal(learning.payload.evidence.human_review_required,true);
  assert.deepEqual(learning.payload.evidence.source_document_ids,["doc-12"]);
  const session=safe.writes.find(w=>w.table==="meeting_agent_sessions"&&w.operation==="insert");
  assert.equal(session.payload.budget_cap_usd,0.2);
  for(const mode of ["insert-failed","approval-failed"]){
    const fixture=fakeDatabase({mode});
    const failure=await m.exports.dispatchAutonomousProjectMeetings(fixture.mock,"test-worker");
    assert.equal(failure[0].status,"failed","Ambiguous write must never replay automatically");
    const job=fixture.writes.find(w=>w.table==="project_autonomous_meeting_jobs"&&w.operation==="update");
    assert.equal(job.payload.next_attempt_at,null);
    assert.match(job.payload.error_message,/Human review required/);
  }
  const retry=fakeDatabase({attempt:2,previous:true});
  const replay=await m.exports.dispatchAutonomousProjectMeetings(retry.mock,"test-worker");
  assert.equal(replay[0].status,"failed");
  assert.equal(retry.writes.filter(w=>["meeting_agent_sessions","approval_requests","action_items","project_task_runs"].includes(w.table)).length,0,
    "No duplicate consequential operation on ambiguous retry");
  for(const budget of [0,-1]){
    const fixture=fakeDatabase({budget});
    const result=await m.exports.dispatchAutonomousProjectMeetings(fixture.mock,"test-worker");
    assert.equal(result[0].status,"failed","No authorized project spend cannot trigger provider calls");
    assert.equal(fixture.writes.filter(w=>w.table==="meeting_agent_sessions"&&w.operation==="insert").length,0);
  }
  console.log("PASS W12: 12 risk/autonomy combinations; source-evidence review, tenant-scoped writes, zero unsupported formal decisions, pending CEO approval and waiting task, budget caps, write ambiguity and no replay (synthetic gateway/adapters).");
} finally {
  if(priorKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=priorKey;
  if(priorModel===undefined)delete process.env.RYTHM_DRY_RUN_MODEL;else process.env.RYTHM_DRY_RUN_MODEL=priorModel;
}
