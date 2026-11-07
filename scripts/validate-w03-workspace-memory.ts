// Isolated actual-handler regression. Live token HTTP evidence is recorded separately.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {build} from "esbuild";
import {NextRequest} from "next/server";

async function main(){
 const workspace="00000000-0000-4000-8000-000000000001";
 const ownProject="00000000-0000-4000-8000-000000000002";
 const foreignProject="00000000-0000-4000-8000-000000000003";
 const state={signedIn:true,queryError:false,archived:false,inserts:[] as Record<string,unknown>[],filters:[] as unknown[][]};
 const client={from(table:string){
  const filters:unknown[][]=[];let inserted:Record<string,unknown>|undefined;
  const q={select:()=>q,eq:(...args:unknown[])=>{filters.push(args);state.filters.push(args);return q;},
   insert:(payload:Record<string,unknown>)=>{inserted=payload;state.inserts.push(payload);return q;},
   maybeSingle:async()=>({data:!state.queryError&&!state.archived&&table==='aiw_projects'&&filters.some(f=>f[0]==='id'&&f[1]===ownProject)&&filters.some(f=>f[0]==='workspace_id'&&f[1]===workspace)?{id:ownProject}:null,error:state.queryError?{code:'fixture_failure'}:null}),
   single:async()=>({data:{id:'synthetic-memory',...inserted},error:null})};return q;
 }};
 const fixture={state,client,workspace};
 const g=globalThis as typeof globalThis & {w03MemoryFixture?:typeof fixture};g.w03MemoryFixture=fixture;
 try{
  const built=await build({entryPoints:['app/api/ai-workspace/resources/[kind]/route.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'w03-workspace-adapters',setup(b){
   b.onResolve({filter:/^@\/lib\/(supabase\/auth-server|ai-workspace\/service)$/},a=>({path:a.path,namespace:'w03-memory'}));
   b.onLoad({filter:/.*/,namespace:'w03-memory'},a=>({loader:'js',contents:a.path.endsWith('auth-server')
    ?"export async function createAuthServerClient(){return {auth:{getUser:async()=>({data:{user:globalThis.w03MemoryFixture.state.signedIn?{id:'synthetic-user'}:null}})}}}"
    :"export class AIWorkspaceError extends Error {constructor(code,status){super(code);this.status=status}} export function serviceClient(){return globalThis.w03MemoryFixture.client} export async function ensurePersonalWorkspace(){return {workspace:{id:globalThis.w03MemoryFixture.workspace}}}"}));
  }}]});
  const mod={exports:{} as {POST:(request:Request,params:{params:Promise<{kind:string}>})=>Promise<Response>}};
  new Function('require','module','exports',built.outputFiles[0].text)(createRequire(process.cwd()+'/package.json'),mod,mod.exports);
  const invoke=(projectId?:string,origin='https://fixture.test')=>mod.exports.POST(new NextRequest('https://fixture.test/api/ai-workspace/resources/memories',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({title:'synthetic',content:'synthetic',projectId})}),{params:Promise.resolve({kind:'memories'})});
  assert.equal((await invoke(ownProject,'https://foreign.test')).status,403);assert.equal(state.inserts.length,0);
  state.signedIn=false;assert.equal((await invoke(foreignProject)).status,401);state.signedIn=true;
  assert.equal((await invoke(foreignProject)).status,404,'Foreign project reference must be denied before a service-role memory insert');
  assert.equal(state.inserts.length,0);
  state.queryError=true;assert.equal((await invoke(ownProject)).status,404);state.queryError=false;
  state.archived=true;assert.equal((await invoke(ownProject)).status,404);state.archived=false;
  assert.equal(state.inserts.length,0);
  assert.equal((await invoke(ownProject)).status,201);
  assert.ok(state.filters.some(f=>f[0]==='workspace_id'&&f[1]===workspace));
  assert.ok(state.filters.some(f=>f[0]==='archived'&&f[1]===false));
  assert.equal(state.inserts[0].workspace_id,workspace);assert.equal(state.inserts[0].project_id,ownProject);
  assert.equal((await invoke()).status,201);assert.equal(state.inserts[1].project_id,null);
  console.log('PASS W03 workspace memory: foreign/missing/archived/error project denied before privileged INSERT; own project and personal scope controls pass.');
 }finally{delete g.w03MemoryFixture;}
}
main().catch(e=>{console.error(String(e.message));process.exitCode=1;});
