import assert from "node:assert/strict";
import {randomUUID,randomBytes} from "node:crypto";
import {chromium} from "playwright";
import {createClient} from "@supabase/supabase-js";
import {createServerClient} from "@supabase/ssr";

const url="https://viqjdgohtxqkrdgwtull.supabase.co",app="http://localhost:3000";
assert.equal(process.env.W08_STAGING_REF,"viqjdgohtxqkrdgwtull");
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,url);
assert.equal(process.env.AUTH_SITE_ORIGIN,app);
assert.equal(process.env.RYTHM_AGENT_EXECUTION_ENABLED,"false");
assert.equal(process.env.RYTHM_EXTERNAL_ACTIONS_ENABLED,"false");
assert.notEqual(process.env.VERCEL_ENV,"production");
const anon=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,service=process.env.W08_STAGING_SERVICE_ROLE_KEY;
assert.ok(anon&&service,"staging-only credentials required");
const make=(key=anon)=>createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
const admin=make(service);
const fixtures=[];
const run=String(process.env.GITHUB_RUN_ID??"local");
const prefix="w08-"+run+"-";
const cookieName="sb-viqjdgohtxqkrdgwtull-auth-token";
const pw=()=>randomBytes(24).toString("base64url")+"Aa1!";
const unwrap=(r,label)=>{if(r.error)throw Error(label+" ["+(r.error.code||r.error.status||"error")+"]");return r.data;};
const mark=label=>console.log("PASS W08 hosted staging: "+label);
const pathIs=p=>u=>u.origin===app&&u.pathname===p;
const sessionCookie=c=>c.name===cookieName||c.name.startsWith(cookieName+".");
const cookieMatch=c=>sessionCookie(c)||c.name.startsWith(cookieName+"-");
async function fixture(label){
 const id=randomUUID(),email=prefix+label+"-"+id+"@example.test",password=pw(),newPassword=pw();
 // Auth's real signup token is generated without SMTP delivery.
 const generated=unwrap(await admin.auth.admin.generateLink({type:"signup",email,password,options:{data:{w08_fixture:run}}}),"generate signup link");
 assert.ok(generated.user?.id&&generated.properties?.hashed_token);
 const f={id:generated.user.id,email,password,newPassword,label,orgs:[]};fixtures.push(f);
 const checked=unwrap(await make().auth.verifyOtp({type:"signup",token_hash:generated.properties.hashed_token}),"verify signup token");
 assert.equal(checked.user?.id,f.id);
 assert.ok(checked.user.email_confirmed_at&&checked.session);
 const normal=make();unwrap(await normal.auth.setSession({access_token:checked.session.access_token,refresh_token:checked.session.refresh_token}),"signup session");
 unwrap(await normal.auth.signOut({scope:"global"}),"signup session cleanup");
 for(const letter of ["A","B"]){
  const org={id:randomUUID(),name:"W08 "+label+" "+letter+" "+run,slug:prefix+label+"-"+letter.toLowerCase()+"-"+id,owner_user_id:f.id,status:"draft"};
  unwrap(await admin.from("organizations").insert(org),"fixture organization");
  f.orgs.push(org);
  unwrap(await admin.from("organization_members").insert({organization_id:org.id,user_id:f.id,role:"owner",membership_status:"active"}),"fixture membership");
  unwrap(await admin.from("organization_entitlements").insert({organization_id:org.id,product_code:"ready_company",status:"pending",plan_code:"w08_synthetic",base_price:0,ai_budget_limit:0,company_template_access:false,company_builder_enabled:false,agent_builder_enabled:false}),"locked zero-cost entitlement");
 }
 mark(label+" actual signup token confirmation (no SMTP)");
 return f;
}
async function browserSession(context){
 const cs=(await context.cookies(app)).filter(sessionCookie).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
 assert.ok(cs.length,"missing browser Auth cookie");
 const raw=cs.map(c=>c.value).join("");
 const session=JSON.parse(raw.startsWith("base64-")?Buffer.from(raw.slice(7),"base64url").toString():decodeURIComponent(raw));
 assert.ok(session.refresh_token&&session.access_token,"incomplete browser session");
 return session;
}
async function deniedRefresh(token,label){
 const response=await fetch(url+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{apikey:anon,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:token})});
 assert.ok(response.status>=400&&response.status<500,label+" refresh must be denied");
}
async function login(page,email,password){
 await page.goto(app+"/login?force=1");
 await page.locator('input[name="email"]').fill(email);
 await page.locator('input[name="password"]').fill(password);
 await page.getByRole("button",{name:"Sign in",exact:true}).click();
}
async function home(page,org){
 await page.waitForURL(pathIs("/home"),{timeout:30000});
 await page.getByRole("heading",{name:"What would you like RYTHM to do?"}).waitFor({timeout:30000});
 if(org){
  await page.locator(".command-header .eyebrow").filter({hasText:org.name}).waitFor({state:"attached",timeout:15000});
  await page.getByLabel("Current company: "+org.name,{exact:true}).waitFor({state:"visible",timeout:15000});
 }
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
 await page.waitForURL(pathIs("/login"),{timeout:10000});
 assert.ok(performance.now()-start<6500,"signout navigation bound exceeded");
 assert.ok(!new URL(page.url()).searchParams.has("message"),"remote revocation unconfirmed");
 const remaining=(await context.cookies(app)).filter(c=>cookieMatch(c)||c.name==="rythm_active_org");
 if(remaining.length)console.log("W08 logout remaining cookie names/paths: "+JSON.stringify(remaining.map(c=>({name:c.name,path:c.path,secure:c.secure}))));
 assert.equal(remaining.length,0,"signout must remove session and organization cookies");
 await page.reload();await page.waitForURL(pathIs("/login"));
}
async function recoveryCookies(context,f){
 const link=unwrap(await admin.auth.admin.generateLink({type:"recovery",email:f.email}),"generate recovery token");
 assert.ok(link.properties?.hashed_token);
 const recovered=unwrap(await make().auth.verifyOtp({type:"recovery",token_hash:link.properties.hashed_token}),"verify recovery token");
 assert.equal(recovered.user?.id,f.id);
 const jar=new Map();
 const ssr=createServerClient(url,anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:changes=>{for(const c of changes)jar.set(c.name,c.value);}}});
 unwrap(await ssr.auth.setSession({access_token:recovered.session.access_token,refresh_token:recovered.session.refresh_token}),"establish verified recovery browser session");
 assert.ok([...jar.keys()].some(n=>n===cookieName||n.startsWith(cookieName+".")));
 await context.addCookies([...jar].filter(([,v])=>v).map(([name,value])=>({name,value,url:app,sameSite:"Lax"})));
}
let browser;
async function probeGoogle(){
 const oauth=createClient(url,anon,{auth:{flowType:"pkce",persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const callback=app+"/auth/callback?next=%2Fhome&flow=oauth&provider=google";
 const started=await oauth.auth.signInWithOAuth({provider:"google",options:{redirectTo:callback,skipBrowserRedirect:true}});
 if(started.error||!started.data.url){console.log("BLOCKED W08 Google OAuth: SDK initiation unavailable");return;}
 const destination=new URL(started.data.url);
 assert.equal(destination.origin,url);assert.equal(destination.pathname,"/auth/v1/authorize");
 assert.equal(destination.searchParams.get("provider"),"google");
 assert.equal(destination.searchParams.get("redirect_to"),callback);
 assert.ok(destination.searchParams.get("code_challenge"),"PKCE challenge required");
 const response=await fetch(destination,{redirect:"manual",headers:{apikey:anon},signal:AbortSignal.timeout(10000)});
 const location=response.headers.get("location");
 if(response.status>=300&&response.status<400&&location&&new URL(location,url).hostname==="accounts.google.com"){
  mark("Google OAuth real staging provider redirect and PKCE (credential entry/callback NOT tested)");
 }else {const payload=await response.json().catch(()=>({})); const code=String(payload.error_code??payload.code??"unknown"); console.log("BLOCKED W08 Google OAuth: HTTP "+response.status+" code="+(/^[a-zA-Z0-9_-]+$/.test(code)?code:"unknown")+" (no provider credential used)");}
}
try{
 await probeGoogle();
 const desktop=await fixture("desktop"),mobileFixture=await fixture("mobile");
 browser=await chromium.launch({headless:true,channel:"chrome"});
 for(const [f,other,mobile] of [[desktop,mobileFixture,false],[mobileFixture,desktop,true]]){
  const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:900}});
  await context.route("**/*",async route=>{const u=new URL(route.request().url());if(u.origin===app||u.origin===url)await route.continue();else await route.abort();});
  const page=await context.newPage();
  try{
   await page.goto(app+"/home");await page.waitForURL(pathIs("/login"));
   await page.goto(app+"/demo");await page.getByText(/Nova Commerce is a safe, synthetic organization/).waitFor();
   assert.ok(!(await context.cookies(app)).some(cookieMatch));
   await login(page,f.email,"wrong-"+pw());
   await page.getByRole("alert").filter({hasText:"Invalid email or password."}).waitFor();
   await login(page,f.email,f.password);await home(page);
   const identity=await browserSession(context);
   const who=unwrap(await make().auth.getUser(identity.access_token),"browser identity").user;
   assert.equal(who.id,f.id);
   const a=make();unwrap(await a.auth.setSession({access_token:identity.access_token,refresh_token:identity.refresh_token}),"authenticated tenant check");
   const memberships=unwrap(await a.rpc("list_my_organizations"),"actual membership RPC");
   assert.deepEqual(new Set(memberships.map(x=>x.organization_id)),new Set(f.orgs.map(x=>x.id)));
   const foreign=await a.rpc("set_active_organization",{target_org_id:other.orgs[0].id});
   assert.ok(foreign.error||foreign.data!==other.orgs[0].id,"foreign organization switch succeeded");
   const foreignPost=await context.request.post(app+"/organization-context/switch",{form:{organizationId:other.orgs[0].id},headers:{origin:app},maxRedirects:0});
   assert.equal(foreignPost.status(),303);assert.ok(new URL(foreignPost.headers().location,app).searchParams.has("error"),"foreign native switch must be rejected");
   const cross=await context.request.post(app+"/organization-context/switch",{form:{organizationId:f.orgs[1].id},headers:{origin:"https://attacker.invalid","sec-fetch-site":"cross-site"},maxRedirects:0});
   assert.equal(cross.status(),403,"cross-origin switch must be rejected");
   mark(f.label+" native switch rejects foreign membership and cross-origin request");
   if(mobile)await page.getByRole("button",{name:"Menu",exact:true}).click();
   await page.getByLabel("Active company").selectOption(f.orgs[1].id);
   const post=page.waitForResponse(r=>r.url()===app+"/organization-context/switch"&&r.request().method()==="POST",{timeout:15000});
   await page.getByRole("button",{name:"Switch",exact:true}).click();
   assert.equal((await post).status(),303,"native organization switch redirect");
   await home(page,f.orgs[1]);await page.reload();await home(page,f.orgs[1]);
   mark(f.label+" login, wrong password, protected/demo separation, real organization selection and foreign denial");
   const before=await browserSession(context);
   const independent=make();const otherSession=unwrap(await independent.auth.signInWithPassword({email:f.email,password:f.password}),"independent session").session;
   assert.ok(otherSession.refresh_token!==before.refresh_token,"independent refresh tokens must differ");
   const expired={...before,expires_at:1};
   await context.clearCookies({name:new RegExp("^"+cookieName.replaceAll("-","\\-")+"(?:\\.\\d+)?$")});
   await context.addCookies([{name:cookieName,value:"base64-"+Buffer.from(JSON.stringify(expired)).toString("base64url"),url:app,sameSite:"Lax"}]);
   await page.reload();await home(page,f.orgs[1]);
   const renewed=await browserSession(context);
   assert.ok(renewed.refresh_token!==before.refresh_token,"actual refresh must rotate");
   await logout(page,context,mobile);
   await deniedRefresh(renewed.refresh_token,"local logout");
   const alive=unwrap(await independent.auth.refreshSession(),"other session survives local logout").session;
   assert.ok(alive.refresh_token);
   mark(f.label+" actual session restoration, bounded logout, refresh revocation, independent session");
   await recoveryCookies(context,f);
   await page.goto(app+"/reset-password");
   await page.getByRole("heading",{name:"Choose a new password"}).waitFor();
   await page.locator('input[name="password"]').fill(f.newPassword);
   await page.locator('input[name="confirmPassword"]').fill(f.newPassword);
   await page.getByRole("button",{name:"Update password"}).click();
   await page.waitForURL(pathIs("/login"),{timeout:30000});
   assert.match(new URL(page.url()).searchParams.get("message")??"",/Password updated successfully/);
   await deniedRefresh(alive.refresh_token,"password reset global logout");
   await login(page,f.email,f.password);
   await page.getByRole("alert").filter({hasText:"Invalid email or password."}).waitFor();
   await login(page,f.email,f.newPassword);await home(page,f.orgs[1]);
   await page.goto(app+"/signup?product=ready_company");
   await page.getByRole("button",{name:"Sign out and create another account"}).click();
   await page.waitForURL(pathIs("/signup"));
   await page.getByRole("button",{name:"Create account",exact:true}).waitFor();
   assert.ok(!(await context.cookies(app)).some(c=>cookieMatch(c)||c.name==="rythm_active_org"));
   await login(page,other.email,mobile?other.newPassword:other.password);await home(page);
   const switched=unwrap(await make().auth.getUser((await browserSession(context)).access_token),"switched identity").user;
   assert.equal(switched.id,other.id);
   await logout(page,context,mobile);
   mark(f.label+" real recovery token, password update/global revocation and account switching");
  }finally{await context.close();}
 }
}finally{
 if(browser)await browser.close();
 let failed=false;
 for(const f of fixtures){
  try{
   let signed=false;
   for(const password of [f.newPassword,f.password]){
    const c=make();const res=await c.auth.signInWithPassword({email:f.email,password});
    if(!res.error){unwrap(await c.auth.signOut({scope:"global"}),"fixture global logout");signed=true;break;}
   }
   if(!signed)throw Error("cannot prove fixture global logout");
   for(const org of f.orgs){
    unwrap(await admin.from("organization_members").update({membership_status:"inactive"}).eq("organization_id",org.id).eq("user_id",f.id),"quarantine membership");
    const rows=unwrap(await admin.from("organization_members").select("membership_status").eq("organization_id",org.id).eq("user_id",f.id),"verify membership");
    assert.ok(rows.length===1&&rows[0].membership_status==="inactive");
   }
   unwrap(await admin.auth.admin.updateUserById(f.id,{ban_duration:"876000h"}),"ban synthetic identity");
   const banned=unwrap(await admin.auth.admin.getUserById(f.id),"verify ban").user;
   assert.ok(banned.banned_until&&Date.parse(banned.banned_until)>Date.now());
   mark(f.label+" audit-preserving quarantine: global logout, inactive memberships and banned user");
  }catch{failed=true;console.error("W08 cleanup failed for synthetic "+f.label+"; inspect exact run prefix "+prefix);}
 }
 if(failed)throw Error("W08 fixture quarantine incomplete");
}
