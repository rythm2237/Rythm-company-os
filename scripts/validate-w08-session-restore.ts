import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {middleware} from "../middleware";

const url="https://w08-session-fixture.supabase.co",name="sb-w08-session-fixture-auth-token";
const user={id:"00000000-0000-4000-8000-000000000008",aud:"authenticated",role:"authenticated",app_metadata:{},user_metadata:{},created_at:"2026-01-01T00:00:00Z"};
const now=()=>Math.floor(Date.now()/1000);
const session=(expired:boolean)=>({access_token:expired?"old-fixture-token":"new-fixture-token",refresh_token:expired?"old-fixture-refresh":"new-fixture-refresh",expires_in:3600,expires_at:now()+(expired?-1000:3600),token_type:"bearer",user});
const encoded=(expired:boolean)=>"base64-"+Buffer.from(JSON.stringify(session(expired))).toString("base64url");

async function main(){
 const original=globalThis.fetch;const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 try{
  process.env.NEXT_PUBLIC_SUPABASE_URL=url;process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="fixture-public-key";
  let mode="healthy",refreshes=0;
  globalThis.fetch=async(input)=>{
   const target=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
   assert.equal(target.origin,url,"fixture must not access a real provider");
   if(target.pathname==="/auth/v1/token"){
    refreshes++;
    return mode==="healthy"?Response.json(session(false)):Response.json({code:"refresh_token_not_found",msg:"Invalid Refresh Token"},{status:400});
   }
   if(target.pathname==="/auth/v1/user")return Response.json(user);
   if(target.pathname==="/rest/v1/rpc/list_my_organizations")return Response.json([{organization_id:"fixture-org"}]);
   throw new Error("Unexpected fixture endpoint: "+target.pathname);
  };
  const req=(path:string,expired:boolean)=>new NextRequest("https://app.example"+path,{headers:{cookie:name+"="+encoded(expired)}});
  const restored=await middleware(req("/login",true));
  assert.equal(restored.status,307);
  assert.equal(new URL(restored.headers.get("location")!).pathname,"/home");
  assert.match(restored.headers.get("cache-control")!,/no-store/);
  const renewed=restored.cookies.getAll().filter(c=>c.name===name||c.name.startsWith(name+"."));
  assert.ok(renewed.length>0,"refreshed cookie must survive login redirect");
  assert.notEqual(renewed[0].value,encoded(true));
  assert.equal(refreshes,1);
  mode="invalid";
  const denied=await middleware(req("/projects",true));
  assert.equal(denied.status,307);
  assert.equal(new URL(denied.headers.get("location")!).pathname,"/login");
  assert.ok(denied.cookies.getAll().some(c=>c.name===name&&c.maxAge===0),"invalid session deletion must survive protected redirect");
  assert.equal(refreshes,2);
  const anonymous=await middleware(new NextRequest("https://app.example/projects"));
  assert.equal(new URL(anonymous.headers.get("location")!).pathname,"/login");
  console.log("W08 session restoration passed: actual middleware/SDK expired-token refresh, redirect cookie preservation, invalid refresh clearing, anonymous protected-route denial; isolated network fixture.");
 }finally{globalThis.fetch=original;if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=oldKey;}
}
main().catch(e=>{console.error(e);process.exitCode=1});
