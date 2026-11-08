import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

// Actual high-impact Next.js project route handlers with synthetic caller RLS.
// No live JWT, production DB, external API or customer data.
const state={auth:null,queries:[],serviceCalls:0,privilegedOps:0};
globalThis.w06ProjectGates=state;
const caller={
  from(table){
    const filters=[];
    const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},
      async maybeSingle(){
        state.queries.push({table,filters});
        return{data:table==="projects"&&filters.some(([k,v])=>k==="id"&&v==="A-project") &&
          filters.some(([k,v])=>k==="organization_id"&&v==="A")?
            {id:"A-project",organization_id:"A",lifecycle_state:"RUNNING",status:"active"}:null,error:null};
      }};
    return q;
  },
};
const service={
  from(){state.privilegedOps++;return{select(){return this;},eq(){return this;},
    order(){return this;},limit(){return this;},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);},
    maybeSingle:async()=>({data:null,error:null})};},
  async rpc(){state.privilegedOps++;return{data:{ok:true},error:null};},
};
state.service=service;
const mocks={
  "@/lib/auth/api-organization-context":
    "export async function resolveOwnerApiOrganizationContext(){return globalThis.w06ProjectGates.auth;}",
  "@/lib/supabase/server":
    "export function createServerSupabaseClient(){globalThis.w06ProjectGates.serviceCalls++;return globalThis.w06ProjectGates.service;}",
  "@/lib/projects/project-operating-system":
    "export async function analyzeProjectOS(){throw Error('PROVIDER_CALL_BLOCKED');}",
  "@/lib/projects/project-knowledge":
    "export async function dispatchProjectKnowledge(){throw Error('PROVIDER_CALL_BLOCKED');}",
  "@/lib/projects/project-completion":
    "export async function getProjectCompletionExplanation(){return{status:'ok'};}",
  "@/lib/projects/project-roadmap":
    "export async function getLatestProjectRoadmap(){return null;} export async function approveProjectRoadmap(){throw Error('UNEXPECTED_APPROVAL');}",
  "@/lib/projects/project-progress":
    "export async function getProjectProgressSnapshot(){return{overallProjectProgress:0};}",
  "@/lib/projects/project-execution-start":
    "export async function startProjectExecutionWithoutGlobalGate(){throw Error('UNEXPECTED_START');}",
  "@/lib/crm/access":"export async function canCrm(){return true;}",
};
async function route(path){
  const result=await build({entryPoints:[path],bundle:true,write:false,format:"cjs",platform:"node",
    packages:"external",logLevel:"silent",plugins:[{name:"no-network-project-mocks",setup(b){
      b.onResolve({filter:/^@\//},args=>mocks[args.path]?{path:args.path,namespace:"w06-proj"}:null);
      b.onLoad({filter:/.*/,namespace:"w06-proj"},args=>({contents:mocks[args.path],loader:"js"}));
    }}]});
  const mod={exports:{}};
  new Function("require","module","exports",result.outputFiles[0].text)(
    createRequire(process.cwd()+"/package.json"),mod,mod.exports);
  return mod.exports;
}
const url="http://localhost";
const post=(path,data)=>new Request(url+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});
try{
  const completion=await route("app/api/projects/completion/route.ts");
  const analyze=await route("app/api/projects/analyze/route.ts");
  const roadmap=await route("app/api/projects/roadmap/route.ts");
  const files=await route("app/api/projects/files/route.ts");
  const form=new FormData();
  form.set("projectId","B-project");
  form.append("files",new File(["synthetic"],"fixture.txt",{type:"text/plain"}));
  const upload=()=>files.POST(new Request(url+"/api/projects/files",{method:"POST",body:form}));

  const noPrivileged=async(callerContext,label)=>{
    state.auth=callerContext;
    state.queries=[];state.serviceCalls=0;state.privilegedOps=0;
    for(const [name,invoke,expected] of [
      ["analyze",()=>analyze.POST(post("/api/projects/analyze",{projectId:"B-project"})),callerContext?.ok?404:401],
      ["completion",()=>completion.POST(post("/api/projects/completion",{projectId:"B-project",action:"evaluate"})),callerContext?.ok?404:401],
      ["roadmap",()=>roadmap.GET(new Request(url+"/api/projects/roadmap?projectId=B-project")),callerContext?.ok?404:401],
      ["files",upload,callerContext?.ok?404:401],
    ]){
      const response=await invoke();
      assert.equal(response.status,expected,label+" "+name+" status");
      assert.equal(state.serviceCalls,0,label+" "+name+" must not create service-role");
      assert.equal(state.privilegedOps,0,label+" "+name+" must not run privileged query");
    }
  };
  await noPrivileged({ok:false,status:401,error:"Authentication required."},"unauthenticated");
  await noPrivileged({ok:true,organizationId:"A",user:{id:"A-owner"},supabase:caller},"owner-A-foreign-B");

  state.queries=[];state.privilegedOps=0;state.serviceCalls=0;
  const own=await completion.POST(post("/api/projects/completion",{projectId:"A-project",action:"evaluate"}));
  assert.equal(own.status,200,"A own project should execute");
  assert.equal(state.serviceCalls,1);
  assert.equal(state.privilegedOps,2,"only own A evaluation invokes 2 privileged RPCs");
  assert(state.queries.some(q=>q.filters.some(([k,v])=>k==="organization_id"&&v==="A")));
  state.queries=[];state.privilegedOps=0;state.serviceCalls=0;
  const ownRead=await roadmap.GET(new Request(url+"/api/projects/roadmap?projectId=A-project"));
  assert.equal(ownRead.status,200);
  assert.equal(state.serviceCalls,1);
  assert(state.queries.every(q=>q.filters.some(([k,v])=>k==="organization_id"&&v==="A")));
  console.log("PASS W06 real project handlers: anonymous and foreign-org A/B denied before service construction, own A positive completion RPC and roadmap read, no outside I/O.");
}finally{delete globalThis.w06ProjectGates;}
