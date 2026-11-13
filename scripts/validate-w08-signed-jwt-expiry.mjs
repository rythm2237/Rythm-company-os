import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

// Disposable local GoTrue only. No hosted credentials, fake tokens or clock changes.
const api=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service=process.env.W08_LOCAL_SERVICE_KEY;
const app="http://localhost:3000";
assert.equal(api,"http://127.0.0.1:54321");
assert.equal(process.env.AUTH_SITE_ORIGIN,app);
assert.equal(process.env.RYTHM_EXTERNAL_ACTIONS_ENABLED,"false");
assert.equal(process.env.RYTHM_AGENT_EXECUTION_ENABLED,"false");
assert.ok(key&&service);
const client=(k=key)=>createClient(api,k,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const admin=client(service);
const unwrap=(result,label)=>{if(result.error)throw new Error(label+" ["+(result.error.code||result.error.status||"error")+"]");return result.data;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const claims=jwt=>JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString());
const cookie="sb-127-auth-token";
const matching=c=>c.name===cookie||c.name.startsWith(cookie+".");
const headers=token=>({apikey:key,Authorization:"Bearer "+token});
async function authStatus(token){return (await fetch(api+"/auth/v1/user",{headers:headers(token),signal:AbortSignal.timeout(10000)})).status;}
async function restStatus(token){return (await fetch(api+"/rest/v1/organizations?select=id&limit=1",{headers:headers(token),signal:AbortSignal.timeout(10000)})).status;}
async function fixture(label){
 const id=randomUUID(),email="w08-jwt-"+id+"@example.com",password=randomBytes(24).toString("base64url")+"Aa1!";
 const created=unwrap(await admin.auth.admin.createUser({email,password,email_confirm:true}),"create disposable identity").user;
 const org={id:randomUUID(),name:"W08 signed JWT "+label,slug:"w08-jwt-"+id,owner_user_id:created.id};
 unwrap(await admin.from("organizations").insert(org),"seed organization");
 unwrap(await admin.from("organization_members").insert({organization_id:org.id,user_id:created.id,role:"owner"}),"seed membership");
 const session=unwrap(await client().auth.signInWithPassword({email,password}),"real password login").session;
 assert.ok(session?.access_token&&session.refresh_token,"real signed session required");
 const c=claims(session.access_token);
 assert.equal(c.sub,created.id);
 assert.equal(c.exp-c.iat,120,"local JWT lifetime must be exactly 120 seconds");
 assert.equal(await authStatus(session.access_token),200,"fresh signed JWT must be accepted by Auth");
 assert.equal(await restStatus(session.access_token),200,"fresh signed JWT must be accepted by PostgREST");
 return {label,session,claims:c,org,userId:created.id};
}
async function seedCookie(context,session){
 const value="base64-"+Buffer.from(JSON.stringify(session)).toString("base64url");
 const pieces=value.match(/.{1,3000}/g);
 await context.addCookies(pieces.map((v,i)=>({name:pieces.length===1?cookie:cookie+"."+i,value:v,url:app,sameSite:"Lax"})));
}
async function readSession(context){
 const cs=(await context.cookies(app)).filter(matching).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
 assert.ok(cs.length,"browser session missing");
 const raw=cs.map(c=>c.value).join("");
 const s=JSON.parse(raw.startsWith("base64-")?Buffer.from(raw.slice(7),"base64url").toString():decodeURIComponent(raw));
 assert.ok(s.access_token&&s.refresh_token,"browser credentials missing");
 return s;
}
async function expired(f){
 // The original server-issued JWT is neither modified nor re-signed.
 const waitMs=Math.max(0,f.claims.exp*1000-Date.now()+1500);
 assert.ok(waitMs<=123000,"unexpected JWT deadline");
 await wait(waitMs);
 const deadline=Date.now()+75000;
 let auth=0,rest=0;
 do {
  [auth,rest]=await Promise.all([authStatus(f.session.access_token),restStatus(f.session.access_token)]);
  if([401,403].includes(auth)&&[401,403].includes(rest))break;
  await wait(2000);
 }while(Date.now()<deadline);
 assert.ok([401,403].includes(auth),"expired signed JWT must be rejected by Auth, status "+auth);
 assert.ok([401,403].includes(rest),"expired signed JWT must be rejected by PostgREST, status "+rest);
 console.log("PASS W08 "+f.label+" actual signed JWT expires after 120s; Auth HTTP "+auth+", PostgREST HTTP "+rest+", elapsed since exp "+Math.round((Date.now()-f.claims.exp*1000)/1000)+"s");
}
const browser=await chromium.launch({headless:true,channel:"chrome"});
try{
 const fixtures=await Promise.all([fixture("desktop"),fixture("mobile")]);
 await Promise.all(fixtures.map(async f=>{
  await expired(f);
  const mobile=f.label==="mobile";
  const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:900}});
  try{
   await context.route("**/*",async route=>{const u=new URL(route.request().url());if(u.origin===app||u.origin===api)await route.continue();else await route.abort();});
   // Use the unchanged expired access/refresh pair from the real token response.
   await seedCookie(context,f.session);
   const page=await context.newPage();
   await page.goto(app+"/home");
   await page.getByRole("heading",{name:"What would you like RYTHM to do?"}).waitFor({timeout:30000});
   await page.getByLabel("Current company: "+f.org.name,{exact:true}).waitFor({state:"visible",timeout:15000});
   const refreshed=await readSession(context);
   assert.ok(refreshed.access_token!==f.session.access_token,"access JWT must change");
   assert.ok(refreshed.refresh_token!==f.session.refresh_token,"refresh token must rotate");
   const next=claims(refreshed.access_token);
   assert.equal(next.sub,f.userId);
   assert.equal(next.session_id,f.claims.session_id);
   assert.ok(next.exp>Math.floor(Date.now()/1000),"new signed token must be valid");
   assert.equal(await authStatus(refreshed.access_token),200);
   assert.equal(await restStatus(refreshed.access_token),200);
   await page.reload();
   await page.getByLabel("Current company: "+f.org.name,{exact:true}).waitFor({state:"visible",timeout:15000});
   console.log("PASS W08 "+f.label+" real expired JWT refresh via protected browser route; same identity/session and tenant; new JWT valid and refresh token rotated");
   if(mobile)await page.getByRole("button",{name:"Menu",exact:true}).click();
   await Promise.all([page.waitForURL(u=>u.origin===app&&u.pathname==="/login",{timeout:10000}),page.getByRole("button",{name:"Sign out",exact:true}).click()]);
   assert.ok(!(await context.cookies(app)).some(c=>c.name.startsWith(cookie)||c.name==="rythm_active_org"));
   const revoked=await fetch(api+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:refreshed.refresh_token})});
   assert.ok(revoked.status>=400&&revoked.status<500,"logout must revoke refreshed session");
   await page.goto(app+"/home");
   await page.waitForURL(u=>u.origin===app&&u.pathname==="/login");
   console.log("PASS W08 "+f.label+" refreshed session revoked and protected route denied after signout");
  }finally{await context.close();}
 }));
}finally{await browser.close();}
console.log("PASS W08 signed JWT expiry matrix: desktop/mobile, actual time-based expiration, real server validation and browser session restoration.");
