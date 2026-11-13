import assert from "node:assert/strict";
import {randomUUID,randomBytes} from "node:crypto";
import {chromium} from "playwright";
import {createClient} from "@supabase/supabase-js";

const api=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service=process.env.W08_LOCAL_SERVICE_KEY;
const app="http://localhost:3000";
const mail="http://127.0.0.1:54324";
assert.equal(api,"http://127.0.0.1:54321","local-only guard");
assert.equal(process.env.AUTH_SITE_ORIGIN,app);
assert.equal(process.env.RYTHM_EXTERNAL_ACTIONS_ENABLED,"false");
assert.equal(process.env.RYTHM_AGENT_EXECUTION_ENABLED,"false");
assert.ok(key&&service,"local fixture credentials required");
const client=(k=key)=>createClient(api,k,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const admin=client(service);
const unwrap=(r,label)=>{if(r.error)throw Error(label+" ["+(r.error.code||r.error.status||"error")+"]");return r.data;};
const pw=()=>randomBytes(20).toString("base64url")+"Aa1!";
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const mark=(label)=>console.log("PASS W08 local real Auth: "+label);
const urlPath=path=>u=>u.origin===app&&u.pathname===path;
async function mailLink(email,type){
 for(let i=0;i<40;i++){
  const data=await (await fetch(mail+"/api/v1/messages")).json();
  for(const m of data.messages??[]){
   if(!(m.To??[]).some(a=>a.Address===email))continue;
   const item=await (await fetch(mail+"/api/v1/message/"+encodeURIComponent(m.ID))).json();
   for(const match of (item.HTML??"").matchAll(/href=["']([^"']+)["']/gi)){
    let u;try{u=new URL(match[1].replaceAll("&amp;","&"));}catch{continue;}
    if(u.pathname!=="/auth/v1/verify"||u.searchParams.get("type")!==type)continue;
    assert.ok(["localhost","127.0.0.1"].includes(u.hostname),"mail link must be local");
    assert.equal(u.port,"54321");
    const dest=new URL(u.searchParams.get("redirect_to"));
    assert.equal(dest.origin,app);
    return u.href;
   }
  }
  await delay(500);
 }
 throw Error("Missing local "+type+" message");
}
async function sessionOf(context){
 const cs=(await context.cookies(app)).filter(c=>/^sb-127-auth-token(?:\.\d+)?$/.test(c.name)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
 assert.ok(cs.length,"session cookie missing");
 const v=cs.map(c=>c.value).join("");
 const raw=v.startsWith("base64-")?Buffer.from(v.slice(7),"base64url").toString():decodeURIComponent(v);
 const s=JSON.parse(raw);
 assert.ok(s.access_token&&s.refresh_token,"missing session credentials");
 return {s,cs};
}
async function revoked(token,label){
 const response=await fetch(api+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:token})});
 assert.ok(response.status>=400&&response.status<500,label+" refresh token was not rejected");
}
async function login(page,email,password,next="/home"){
 await page.goto(app+"/login?force=1&next="+encodeURIComponent(next));
 await page.locator('input[name="email"]').fill(email);
 await page.locator('input[name="password"]').fill(password);
 await page.getByRole("button",{name:"Sign in",exact:true}).click();
}
async function logout(page,context,mobile){
 if(mobile)await page.getByRole("button",{name:"Menu",exact:true}).click();
 const start=performance.now();
 const button=page.getByRole("button",{name:"Sign out",exact:true});
 await button.scrollIntoViewIfNeeded({timeout:10000});
 const [response]=await Promise.all([
  page.waitForResponse(r=>new URL(r.url()).pathname==="/auth/logout"&&r.request().method()==="POST",{timeout:15000}),
  button.click({timeout:12000,noWaitAfter:true})
 ]);
 const setCookieNames=(await response.headersArray()).filter(h=>h.name.toLowerCase()==="set-cookie").map(h=>h.value.split("=")[0]);
 console.log("W08 logout response cookie names: "+JSON.stringify(setCookieNames));
 assert.equal(response.status(),303,"native signout POST redirect");
 await page.waitForURL(urlPath("/login"),{timeout:10000});
 assert.ok(performance.now()-start<6500,"browser signout exceeded bound");
 assert.ok(!new URL(page.url()).searchParams.has("message"),"remote revoke unconfirmed");
 const remaining=(await context.cookies(app)).filter(c=>/^sb-127-auth-token/.test(c.name)||c.name==="rythm_active_org");
 if(remaining.length)console.log("W08 logout remaining cookie names/paths: "+JSON.stringify(remaining.map(c=>({name:c.name,path:c.path,secure:c.secure}))));
 assert.equal(remaining.length,0,"signout must remove session and organization cookies");
 await page.reload(); await page.waitForURL(urlPath("/login"));
}
const failures=[];
async function assertCompany(page,name){
 await page.locator("main.simple-home").waitFor({state:"visible",timeout:15000});
 await page.locator(".command-header .eyebrow").filter({hasText:name}).waitFor({state:"attached",timeout:15000});
 await page.getByLabel("Current company: "+name,{exact:true}).waitFor({state:"visible",timeout:10000});
}
const browser=await chromium.launch({headless:true,channel:"chrome"});
try{
 for(const mobile of [false,true]){
  const label=mobile?"mobile":"desktop";
  const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:900}});
  await context.route("**/*",async route=>{const u=new URL(route.request().url());if(u.origin===app||u.origin===api||u.origin==="http://localhost:54321")await route.continue();else await route.abort();});
  const page=await context.newPage();page.setDefaultTimeout(12000);
  try{
   const id=randomUUID(),email="w08-"+id+"@example.com",password=pw(),newPassword=pw();
   await page.goto(app+"/home");await page.waitForURL(urlPath("/login"));
   await page.goto(app+"/demo");await page.getByText(/Nova Commerce is a safe, synthetic organization/).waitFor();
   assert.ok(!(await context.cookies(app)).some(c=>/^sb-127-auth-token/.test(c.name)),"demo created a session");
   await page.goto(app+"/signup?product=ready_company");
   await page.locator('input[name="fullName"]').fill("W08 "+label);
   await page.locator('input[name="email"]').fill(email);
   await page.locator('input[name="password"]').fill(password);
   await page.locator('input[name="confirmPassword"]').fill(password);
   await page.getByRole("button",{name:"Create account",exact:true}).click();
   await page.waitForURL(urlPath("/signup/check-email"),{timeout:30000});
   await page.goto(await mailLink(email,"signup"));
   await page.waitForURL(urlPath("/setup/company"),{timeout:30000});
   await page.getByRole("heading",{name:"Reserve your RYTHM company"}).waitFor();
   const signup=await sessionOf(context);
   const user=unwrap(await client().auth.getUser(signup.s.access_token),"confirmed signup").user;
   assert.ok(user.email_confirmed_at);
   mark(label+" signup/real local confirmation and no paid setup");
   const A=randomUUID(),B=randomUUID();
   unwrap(await admin.from("organizations").insert([{id:A,name:"W08 "+label+" A",slug:"w08-"+id+"-a",owner_user_id:user.id},{id:B,name:"W08 "+label+" B",slug:"w08-"+id+"-b",owner_user_id:user.id}]),"fixture orgs");
   unwrap(await admin.from("organization_members").insert([{organization_id:A,user_id:user.id,role:"owner"},{organization_id:B,user_id:user.id,role:"owner"}]),"fixture membership");
   await page.goto(app+"/home");await page.getByRole("heading",{name:"What would you like RYTHM to do?"}).waitFor({timeout:30000});
   if(mobile)await page.getByRole("button",{name:"Menu",exact:true}).click();
   await page.getByLabel("Active company").selectOption(B);
   const post=page.waitForResponse(r=>r.url()===app+"/organization-context/switch"&&r.request().method()==="POST",{timeout:15000});
   await page.getByRole("button",{name:"Switch",exact:true}).click();
   assert.equal((await post).status(),303,"native organization switch redirect");
   const expectedCompany="W08 "+label+" B";
   try{await assertCompany(page,expectedCompany);mark(label+" immediate organization switch");}
   catch{
    failures.push(label+" immediate organization switch");
    console.log("FAIL W08 local real Auth: "+label+" immediate organization switch; checking fresh request separately");
    const heading=page.locator(".command-header .eyebrow");
    const value=await heading.textContent({timeout:1500}).catch(()=>null);
    console.log("W08 organization diagnostic: heading="+(value?.includes("W08 "+label+" A")?"A":value?.includes(expectedCompany)?"B":"missing/other")+" visible="+await heading.isVisible().catch(()=>false)+" badgeB="+await page.getByLabel("Current company: "+expectedCompany,{exact:true}).isVisible().catch(()=>false));
   }
   await page.reload();await assertCompany(page,expectedCompany);
   mark(label+" selected organization persisted on fresh request (local fixture RPC)");
   await logout(page,context,mobile);
   await revoked(signup.s.refresh_token,"signup session");
   await page.goto(app+"/settings");await page.waitForURL(urlPath("/login"));
   await login(page,email,"invalid-"+pw());
   await page.getByRole("alert").filter({hasText:"Invalid email or password."}).waitFor();
   await login(page,email,password);
   await page.waitForURL(urlPath("/home"),{timeout:30000});
   await page.getByRole("heading",{name:"What would you like RYTHM to do?"}).waitFor();
   mark(label+" wrong password / correct password / protected routes");
   const first=await sessionOf(context);
   const second=client();
   const independent=unwrap(await second.auth.signInWithPassword({email,password}),"second login").session;
   assert.notEqual(first.s.refresh_token,independent.refresh_token);
   const expired={...first.s,expires_at:1};
   await context.clearCookies({name:/^sb-127-auth-token(?:\.\d+)?$/});
   await context.addCookies([{name:"sb-127-auth-token",value:"base64-"+Buffer.from(JSON.stringify(expired)).toString("base64url"),url:app,sameSite:"Lax"}]);
   await page.reload(); await page.getByRole("heading",{name:"What would you like RYTHM to do?"}).waitFor();
   const refreshed=await sessionOf(context);
   assert.notEqual(refreshed.s.refresh_token,first.s.refresh_token,"real refresh must rotate token");
   mark(label+" actual token refresh via expired session cookie");
   await logout(page,context,mobile);
   await revoked(refreshed.s.refresh_token,"browser logout");
   const alive=unwrap(await second.auth.refreshSession(),"independent session survives local logout").session;
   assert.ok(alive.refresh_token);
   mark(label+" bounded local logout, remote refresh revocation, independent session");
   await page.goto(app+"/forgot-password");await page.getByRole("textbox",{name:"Email"}).fill(email);await page.getByRole("button",{name:"Send reset link"}).click();
   await page.getByRole("status").filter({hasText:"If an account exists"}).waitFor();
   await page.goto(await mailLink(email,"recovery"));
   await page.waitForURL(urlPath("/reset-password"),{timeout:30000});
   await page.locator('input[name="password"]').fill(newPassword);
   await page.locator('input[name="confirmPassword"]').fill(newPassword);
   await page.getByRole("button",{name:"Update password"}).click();
   await page.waitForURL(urlPath("/login"),{timeout:30000});
   assert.match(new URL(page.url()).searchParams.get("message")??"",/Password updated successfully/);
   await revoked(alive.refresh_token,"global password-reset revocation");
   await login(page,email,password);
   await page.getByRole("alert").filter({hasText:"Invalid email or password."}).waitFor();
   await login(page,email,newPassword);await page.waitForURL(urlPath("/home"),{timeout:30000});
   await assertCompany(page,"W08 "+label+" B");
   await page.goto(app+"/signup?product=ready_company");
   await page.getByRole("button",{name:"Sign out and create another account"}).click();
   await page.waitForURL(urlPath("/signup"));
   await page.getByRole("button",{name:"Create account",exact:true}).waitFor();
   assert.ok(!(await context.cookies(app)).some(c=>/^sb-127-auth-token/.test(c.name)||c.name==="rythm_active_org"));
   mark(label+" real recovery/global revocation/new password/account switch");
  }catch(error){failures.push(label+" lifecycle: "+(error?.name??"Error"));console.log("FAIL W08 local real Auth: "+label+" lifecycle: "+(error?.message??"unknown").split("\n").slice(0,12).join("\n"));console.log("W08 failed at "+String(error?.stack??"").split("\n").find(l=>l.includes("validate-w08-local-real-auth.mjs:")));}finally{await context.close();}
 }
}finally{await browser.close();}
assert.equal(failures.length,0,"W08 failures: "+failures.join("; "));
