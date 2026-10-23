import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {build} from "esbuild";
type Handler=(request:Request,params?:{params:Promise<{id:string}>})=>Promise<Response>;
type Routes={GET:Handler;POST:Handler};
async function loadRoute(path:string):Promise<Routes>{
 const built=await build({entryPoints:[path],bundle:true,write:false,platform:"node",format:"cjs",packages:"external",plugins:[{name:"isolated-auth-context",setup(b){b.onResolve({filter:/^@\/lib\/auth\/organization-context$/},()=>({path:"auth",namespace:"fixture"}));b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:"export async function resolveOrganizationContext(){return globalThis.crmRouteContext}",loader:"js"}));}}]});
 const fixtureModule={exports:{}};new Function("require","module","exports",built.outputFiles[0].text)(createRequire(process.cwd()+"/package.json"),fixtureModule,fixtureModule.exports);return fixtureModule.exports as Routes;
}
async function main(){
 const contexts=globalThis as typeof globalThis&{crmRouteContext:unknown};
 const leads=await loadRoute("app/api/crm/leads/route.ts"),stage=await loadRoute("app/api/crm/opportunities/[id]/stage/route.ts"),exportRoute=await loadRoute("app/api/crm/customers/export/route.ts");
 const org="00000000-0000-4000-8000-000000000001",id="00000000-0000-4000-8000-000000000002";
 const url="https://fixture.test/api/crm/leads";
 const req=(body:unknown,origin="https://fixture.test")=>new Request(url,{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body)});
 contexts.crmRouteContext=null;assert.equal((await leads.GET(new Request(url))).status,401);assert.equal((await stage.POST(req({}),{params:Promise.resolve({id})})).status,401);
 const calls:unknown[][]=[];let allowed=true,found=true,rpcError=false;
 const result={data:{id},error:null,count:1};
 const query={select:(...a:unknown[])=>{calls.push(["select",...a]);return query;},eq:(...a:unknown[])=>{calls.push(["eq",...a]);return query;},order:()=>query,insert:(value:unknown)=>{calls.push(["insert",value]);return query;},range:async()=>({...result,data:[{id,name:'=HYPERLINK("example")',email:"contact@example.test"}]}),single:async()=>result,maybeSingle:async()=>({...result,data:found?{id}:null})};
 const context={organizationId:org,role:"member",supabase:{from:(table:string)=>{calls.push(["from",table]);return query;},rpc:async(name:string,args:unknown)=>{calls.push(["rpc",name,args]);return name==="crm_can"?{data:allowed,error:null}:{data:null,error:rpcError?{message:"denied"}:null};}}};
 contexts.crmRouteContext=context;
 assert.equal((await leads.POST(req({name:"A"},"https://evil.test"))).status,400);
 assert.equal((await leads.POST(req({name:"A",status:"converted"}))).status,400);
 allowed=false;assert.equal((await leads.POST(req({name:"A"}))).status,403);allowed=true;
 assert.equal((await leads.POST(req({name:"A",organization_id:"attacker",converted_customer_id:id}))).status,201);
 const insert=calls.find(c=>c[0]==="insert")?.[1] as Record<string,unknown>;assert.equal(insert.organization_id,org);assert.equal(insert.converted_customer_id,undefined);
 found=false;assert.equal((await stage.POST(req({stage:"proposal",version:1}),{params:Promise.resolve({id})})).status,404);found=true;
 assert.equal((await stage.POST(req({stage:"proposal",version:-1}),{params:Promise.resolve({id})})).status,400);
 rpcError=true;assert.equal((await stage.POST(req({stage:"proposal",version:1}),{params:Promise.resolve({id})})).status,409);rpcError=false;
 assert.equal((await stage.POST(req({stage:"proposal",version:1}),{params:Promise.resolve({id})})).status,200);
 assert.ok(calls.some(c=>c[0]==="eq"&&c[1]==="organization_id"&&c[2]===org));
 assert.equal((await exportRoute.GET(new Request(url))).status,403);context.role="owner";
 const exported=await exportRoute.GET(new Request(url));assert.equal(exported.status,200);assert.match(exported.headers.get("Cache-Control")||"",/no-store/);assert.match(await exported.text(),/'=HYPERLINK/);
 const selected=calls.filter(c=>c[0]==="select").at(-1)?.[1];assert.doesNotMatch(String(selected),/value|notes|billing|custom_fields|total/);
 delete (contexts as {crmRouteContext?:unknown}).crmRouteContext;
 console.log("CRM HTTP handlers: unauthenticated/unauthorized calls, cross-origin requests, mass-assignment, tenant binding, conflict responses and operational export boundaries passed (isolated auth/client adapters).");
}
main().catch(e=>{console.error(e);process.exitCode=1});
