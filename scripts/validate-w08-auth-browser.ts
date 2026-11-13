import assert from "node:assert/strict";
import {createServer} from "node:http";
import {build} from "esbuild";
import {chromium} from "playwright";
import {authCallbackOrigin} from "../lib/auth/redirect";

async function main(){
 const server=createServer((req,res)=>{
  if(req.url==="/bundle.js"){res.setHeader("Content-Type","application/javascript");res.end(bundle);return;}
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.end('<!doctype html><html><meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script></html>');
 });
 let bundle="",browser;
 try{
  await new Promise<void>(r=>server.listen(0,"localhost",r));
  const origin="http://localhost:"+(server.address() as {port:number}).port;
  const callback=authCallbackOrigin({AUTH_SITE_ORIGIN:origin})+"/auth/callback?next=/reset-password";
  const compiled=await build({stdin:{contents:'import React from "react";import {createRoot} from "react-dom/client";import {ForgotPasswordForm} from "./app/(auth)/forgot-password/ForgotPasswordForm";createRoot(document.getElementById("root")).render(<ForgotPasswordForm redirectTo='+JSON.stringify(callback)+'/>);',resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,jsx:"automatic",format:"iife",define:{"process.env.NODE_ENV":'"production"',"process.env.NEXT_PUBLIC_SUPABASE_URL":'"https://w08-auth-fixture.supabase.co"',"process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY":'"fixture-public-key"'}});
  bundle=compiled.outputFiles[0].text;
  browser=await chromium.launch({headless:true,channel:process.env.CRM_BROWSER_CHANNEL||undefined});
  for(const mobile of [false,true]){
   const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:800}});
   let calls=0;
   await context.route("https://w08-auth-fixture.supabase.co/**",async route=>{
    const req=route.request(),url=new URL(req.url());
    const headers={"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"POST,OPTIONS"};
    if(req.method()==="OPTIONS"){await route.fulfill({status:204,headers});return;}
    assert.equal(url.pathname,"/auth/v1/recover");
    assert.equal(url.searchParams.get("redirect_to"),callback);
    assert.equal(req.method(),"POST");
    assert.equal(req.postDataJSON().email,"fixture@example.invalid");
    assert.ok(req.postDataJSON().code_challenge,"PKCE challenge must be sent");
    calls++;
    await route.fulfill({status:200,headers,contentType:"application/json",body:"{}"});
   });
   // Deny every other non-local request: no email/provider traffic can escape.
   await context.route("**/*",async route=>{const u=new URL(route.request().url());if(u.origin===origin||u.hostname==="w08-auth-fixture.supabase.co")await route.fallback();else await route.abort();});
   const page=await context.newPage();await page.goto(origin);
   await page.getByRole("textbox",{name:"Email"}).fill("fixture@example.invalid");
   await page.getByRole("button",{name:"Send reset link"}).click();
   await page.getByRole("status").waitFor({timeout:10000});
   assert.match(await page.getByRole("status").innerText(),/If an account exists/);
   assert.equal(calls,1);
   await context.close();
  }
  console.log("W08 recovery browser passed desktop/mobile: actual form and SDK, environment-local callback, PKCE challenge, generic success; all provider traffic intercepted.");
 }finally{if(browser)await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
