import assert from "node:assert/strict";
import {createServer} from "node:http";
import {build} from "esbuild";
import {chromium} from "playwright";
import {NextRequest} from "next/server";
import {POST} from "../app/auth/logout/route";

async function main(){
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://logout-fixture.supabase.co";process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="fixture-public-key";
 const bundle=await build({stdin:{contents:'import React from "react";import {createRoot} from "react-dom/client";import {SignOutForm} from "./components/auth/SignOutForm";createRoot(document.getElementById("root")).render(<SignOutForm/>);',resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,jsx:"automatic",format:"iife",define:{"process.env.NODE_ENV":'"production"'}});
 const originalFetch=globalThis.fetch;let mode="healthy";let authCalls=0;const errors:string[]=[];
 globalThis.fetch=async()=>{authCalls++;if(mode==="stalled")return await new Promise<Response>(()=>{});await new Promise(r=>setTimeout(r,150));return mode==="failure"?Response.json({message:"unavailable"},{status:503}):new Response(null,{status:204});};
 const server=createServer(async(req,res)=>{
  try{
   const origin=`http://localhost:${(server.address() as {port:number}).port}`;
   if(req.url==="/bundle.js"){res.setHeader("Content-Type","application/javascript");res.end(bundle.outputFiles[0].text);return;}
   if(req.url?.startsWith("/auth/logout")){
    const headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(","):v);
    const response=await POST(new NextRequest(origin+req.url,{method:"POST",headers}));res.statusCode=response.status;response.headers.forEach((v,k)=>{if(k!=="set-cookie")res.setHeader(k,v)});res.setHeader("set-cookie",response.headers.getSetCookie());res.end();return;
   }
   if(req.url?.startsWith("/login")){res.setHeader("Content-Type","text/html; charset=utf-8");res.end('<!doctype html><html><meta charset="utf-8"><h1>Sign in</h1></html>');return;}
   res.setHeader("Content-Type","text/html; charset=utf-8");res.end('<!doctype html><html><meta charset="utf-8"><title>Logout test</title><div id="root"></div><script src="/bundle.js"></script></html>');
  }catch(error){errors.push(String(error));res.statusCode=500;res.end("fixture failed");}
 });
 let browser;
 try{
  // NextRequest canonicalizes loopback IP URLs to localhost; use the same host as the browser Origin.
  await new Promise<void>(r=>server.listen(0,"localhost",r));const origin=`http://localhost:${(server.address() as {port:number}).port}`;
  browser=await chromium.launch({headless:true,channel:process.env.CRM_BROWSER_CHANNEL||undefined});
  for(mode of ["healthy","failure","stalled"]){
   const context=await browser.newContext();const name="sb-logout-fixture-auth-token";
   const session={access_token:"fixture-access-token",refresh_token:"fixture-refresh-token",expires_at:Math.floor(Date.now()/1000)+3600,token_type:"bearer",user:{id:"fixture",aud:"authenticated",app_metadata:{},user_metadata:{}}};
   await context.addCookies([{name,value:"base64-"+Buffer.from(JSON.stringify(session)).toString("base64url"),url:origin},{name:"rythm_active_org",value:"fixture",url:origin},{name:"unrelated-preference",value:"preserved",url:origin}]);
   const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));await page.goto(origin+"/workspace");
   const began=Date.now();await page.getByRole("button",{name:"Sign out"}).click({noWaitAfter:true});await page.waitForURL(/\/login/,{timeout:7000});
   assert.ok(Date.now()-began<6000,"navigation is bounded even with an unresponsive auth service");
   assert.equal(await page.getByRole("heading",{name:"Sign in"}).count(),1,await page.content());
   const cookies=await context.cookies();assert.ok(!cookies.some(c=>c.name===name||c.name==="rythm_active_org"));assert.ok(cookies.some(c=>c.name==="unrelated-preference"));
   assert.equal(new URL(page.url()).searchParams.has("message"),mode!=="healthy");await context.close();
  }
  assert.equal(authCalls,3);assert.deepEqual(errors,[]);
  console.log("Logout browser passed: actual SignOutForm → native POST → actual route/SDK → 303 login, healthy/outage/stalled service, current-session cookie deletion and unrelated-cookie preservation. Isolated fixture, no production user sign-out.");
 }finally{globalThis.fetch=originalFetch;if(browser)await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
