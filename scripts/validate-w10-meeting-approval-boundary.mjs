import assert from "node:assert/strict";
import {build} from "esbuild";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
async function syntheticGateway(input){
  return {
    outputText:JSON.stringify(input.feature==="boardroom.summary"
      ? {executive_summary:"Synthetic review",consensus:"Review",disagreements:[],decision:"Synthetic recommendation",recommendation:"Internal draft",action_items:[{title:"Finalize internal draft",description:"Only internal synthetic work",risk:"HIGH",needs_approval:false}],knowledge_updates:[]}
      : {position:"Synthetic position",risks:[],action_items:[]}),
    correlationId:"synthetic",actualCostUsd:0,usage:{inputTokens:1,outputTokens:1},routingDecision:{selectedModel:"synthetic"}
  };
}
const compiled=await build({
  entryPoints:["lib/projects/project-autonomous-meetings.ts"],bundle:true,platform:"node",format:"cjs",write:false,packages:"external",
  plugins:[{name:"synthetic-provider",setup(builder){
    builder.onResolve({filter:/^@\/lib\/ai\/request-gateway$/},()=>({path:"fixture",namespace:"w10"}));
    builder.onLoad({filter:/.*/,namespace:"w10"},()=>({loader:"js",contents:"export const executeAiRequest = "+syntheticGateway.toString()}));
  }}]
});
const fixtureModule={exports:{}};
new Function("require","module","exports",compiled.outputFiles[0].text)(require,fixtureModule,fixtureModule.exports);
const oldKey=process.env.OPENAI_API_KEY,oldModel=process.env.RYTHM_DRY_RUN_MODEL;
process.env.OPENAI_API_KEY="sk-synthetic-no-provider-access";
process.env.RYTHM_DRY_RUN_MODEL="synthetic";
try {
  for(const failure of ["none","approval","start","participants","session","completion","transcript","recommendation"]){
    const writes=[];
    const agents=[
      {id:"agent-1",agent_code:"ANALYTICS_SPECIALIST",name:"Analyst",role_title:"Analyst",enabled:true},
      {id:"agent-2",agent_code:"ACCOUNT_MANAGER",name:"Account manager",role_title:"Account manager",enabled:true}
    ];
    const supabase={
      rpc:async()=>({data:[{id:"job",meeting_id:"meeting",project_id:"project",organization_id:"org",attempt_count:1,max_attempts:3,lease_owner:"worker"}],error:null}),
      from(table){
        let operation="select",payload;
        const filters={};
        const answer=()=>{
          if(operation!=="select"){
            writes.push({table,operation,payload});
            if ((failure === "transcript" && table === "meeting_agent_messages") ||
                (failure === "recommendation" && table === "project_decision_memory") ||
                (failure === "start" && table === "meetings" && payload.status === "running") ||
                (failure === "participants" && table === "meeting_agent_participants") ||
                (failure === "session" && table === "meeting_agent_sessions" && operation === "update") ||
                (failure === "completion" && table === "meetings" && payload.status === "completed")) {
              return {data:null,error:{code:"synthetic_write_failure"}};
            }
            if(operation==="insert"&&table==="approval_requests"){
              return failure === "approval" ? {data:null,error:{code:"synthetic_write_failure"}} : {data:{id:"approval"},error:null};
            }
            return {data:operation==="insert"?{id:table==="meeting_agent_sessions"?"session":"action"}:null,error:null};
          }
          assert.equal(filters.organization_id,"org",table+" must bind the tenant");
          if(table==="meetings")return {data:{id:"meeting",title:"Synthetic review",purpose:"Review an internal draft",agenda:[],involvement_mode:"AUTONOMOUS",status:"draft"},error:null};
          if(table==="projects")return {data:{id:"project",name:"Synthetic project",objective:"Internal draft",constraints:[],autonomy_mode:"approval_required",budget_cap_usd:0.25},error:null};
          if(table==="project_agents")return {data:agents.map(agent=>({agents:agent})),error:null};
          if(table==="project_context_documents")return {data:[],error:null};
          if(table==="project_executions"){
            assert.equal(filters.project_id,"project");
            return {data:{id:"execution",execution_no:1},error:null};
          }
          throw Error("Unmapped fixture table "+table);
        };
        const query={
          select(){return query;},eq(key,value){filters[key]=value;return query;},in(){return query;},order(){return query;},limit(){return query;},
          insert(value){operation="insert";payload=value;return query;},update(value){operation="update";payload=value;return query;},upsert(value){operation="upsert";payload=value;return query;},
          single(){return Promise.resolve(answer());},maybeSingle(){return Promise.resolve(answer());},then(resolve,reject){return Promise.resolve(answer()).then(resolve,reject);}
        };
        return query;
      }
    };
    const result=await fixtureModule.exports.dispatchAutonomousProjectMeetings(supabase,"worker");
    assert.equal(writes.some(write=>write.table==="decisions"),false,"Internal synthesis cannot auto-approve formal Human CEO decisions");
    const memory=writes.find(write=>write.table==="project_decision_memory");
    if(memory)assert.equal(memory.payload.outcome.authority,"advisory_only");
    const actionWrites=writes.filter(write=>write.table==="action_items"&&write.operation==="insert");
    const taskWrites=writes.filter(write=>write.table==="project_task_runs"&&write.operation==="insert");
    if (["none","approval"].includes(failure)) assert.equal(writes.find(write=>write.table==="approval_requests").payload.risk_level,"high");
    if(failure !== "none"){
      assert.equal(actionWrites.length,0,"A failed required write must prevent action creation");
      assert.equal(taskWrites.length,0,"A failed required write must prevent queued work");
      assert.equal(result[0].status,"retrying");
    }else{
      assert.equal(actionWrites[0].payload.authorization_approval_id,"approval");
      assert.equal(taskWrites[0].payload.waiting_on_approval_id,"approval");
      assert.equal(taskWrites[0].payload.status,"waiting_for_approval");
      assert.equal(result[0].status,"completed");
    }
  }
} finally {
  if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;
  if(oldModel===undefined)delete process.env.RYTHM_DRY_RUN_MODEL;else process.env.RYTHM_DRY_RUN_MODEL=oldModel;
}
console.log("PASS W10 actual meeting worker: tenant-bound internal review, normalized risk, persisted Human CEO gate and fail-closed lifecycle, participants, transcript, recommendation, session, minutes and approval write failures; no formal decision auto-approval (synthetic provider/persistence adapters)");
