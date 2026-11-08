import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { build } from "esbuild";

// Execute the real production-reconciled Edge handler and server sender with
// fully synthetic DB, browser identities and push provider. No network egress.
const secret = "W06_SYNTHETIC_SHARED_SIGNING_KEY_abcdefghijklmnopqrstuvwxyz";
const state = {
  reads: [], writes: [], notifications: 0, dbClientCount: 0,
  initialized: true, failSend: false, forceDbError: false, handler: null,
  edgeSharedSecret: secret, edgeServiceCredential: "W06_FAKE_SERVICE_KEY",
};
globalThis.w06Edge = state;
const oldDeno = globalThis.Deno, oldFetch = globalThis.fetch;
const oldEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  TWO_NYA_PUSH_DISPATCH_SECRET: process.env.TWO_NYA_PUSH_DISPATCH_SECRET,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
globalThis.Deno = {
  env: { get: name => name === "SUPABASE_SERVICE_ROLE_KEY" ? state.edgeServiceCredential :
    name === "SUPABASE_URL" ? "https://w06fixture.supabase.co" :
    name === "TWO_NYA_PUSH_DISPATCH_SECRET" ? state.edgeSharedSecret : undefined },
  serve: handler => { state.handler = handler; },
};
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://w06fixture.supabase.co";
process.env.TWO_NYA_PUSH_DISPATCH_SECRET = secret;
process.env.SUPABASE_SERVICE_ROLE_KEY = "W06_FAKE_SERVICE_KEY";

const fixtureMessage = "11111111-1111-4111-8111-111111111111";
const fixtureAppointment = "22222222-2222-4222-8222-222222222222";
const sub = { id:"sub-fixture", endpoint:"https://synthetic.invalid", p256dh:"SYNTHETIC", auth:"SYNTHETIC" };
const db = {
  from(table) {
    const filters = [];
    let selected="", mutation=null;
    const q = {
      select(fields){ selected=fields;state.reads.push({table,fields});return q; },
      eq(k,v){filters.push([k,v]);return q;},
      is(){return q;},limit(){return q;},
      update(row){mutation={operation:"update",row};state.writes.push({table,...mutation});return q;},
      delete(){mutation={operation:"delete"};state.writes.push({table,...mutation});return q;},
      insert(row){mutation={operation:"insert",row};state.writes.push({table,...mutation});return q;},
      upsert(row){mutation={operation:"upsert",row};state.writes.push({table,...mutation});return q;},
      async single(){
        if(table === "nail_2nya_notification_deliveries" && mutation?.operation==="insert") return {data:{id:"claim-fixture"},error:null};
        if(table === "nail_2nya_push_keys" && state.initialized) return {data:{public_key:"W06_PUBLIC_VAPID",private_key:"W06_FAKE_PRIVATE"},error:null};
        return {data:null,error:{code:"FIXTURE_MISSING"}};
      },
      async maybeSingle(){
        if(state.forceDbError)throw Error("TENANT_B_PRIVATE_CUSTOMER_CONTENT");
        switch(table){
          case "nail_2nya_push_keys":
            return {data:state.initialized?(selected==="public_key"?{public_key:"W06_PUBLIC_VAPID"}:{public_key:"W06_PUBLIC_VAPID",private_key:"W06_FAKE_PRIVATE"}):null,error:null};
          case "nail_2nya_contact_messages":
            return {data:mutation?.operation==="update"?{id:fixtureMessage}:
              {id:fixtureMessage,name:"synthetic",subject:"synthetic",status:"new",push_notified_at:null},error:null};
          case "nail_2nya_appointments":
            return {data:{id:fixtureAppointment,booking_reference:"fixture",start_at:"2026-11-09T11:00:00Z",status:"pending",
              nail_2nya_services:{name:"Synthetic service"},nail_2nya_customers:{name:"Synthetic customer"}},error:null};
          case "nail_2nya_business_profile":return {data:{timezone:"UTC"},error:null};
          default:throw Error("UNEXPECTED_MAYBE_SINGLE_"+table);
        }
      },
      then(resolve,reject) {
        const data = ["nail_2nya_push_subscriptions","nail_2nya_customer_push_subscriptions"].includes(table)?[sub]:[];
        return Promise.resolve({data,error:null}).then(resolve,reject);
      },
    };
    return q;
  },
};
const fakeWebpush = "export default {setVapidDetails(){},generateVAPIDKeys(){throw Error('UNEXPECTED_ANONYMOUS_KEY_CREATE')},async sendNotification(){globalThis.w06Edge.notifications++;if(globalThis.w06Edge.failSend)throw Error('TENANT_B_PRIVATE_CUSTOMER_CONTENT')}};";
async function compile(file) {
  const built = await build({
    entryPoints:[file],bundle:true,write:false,platform:"node",format:"cjs",
    packages:"external",logLevel:"silent",
    plugins:[{name:"w06-no-network-external-shims",setup(b){
      b.onResolve({filter:/^jsr:/},()=>({path:"empty",namespace:"w06-stub"}));
      b.onResolve({filter:/^npm:@supabase\/supabase-js/},()=>({path:"db",namespace:"w06-stub"}));
      b.onResolve({filter:/^npm:web-push/},()=>({path:"push",namespace:"w06-stub"}));
      b.onResolve({filter:/^server-only$/},()=>({path:"empty",namespace:"w06-stub"}));
      b.onLoad({filter:/.*/,namespace:"w06-stub"},args=>({
        contents:args.path==="db"?"export function createClient(){globalThis.w06Edge.dbClientCount++;return globalThis.w06Edge.db;}":
          args.path==="push"?fakeWebpush:"export {};",loader:"js",
      }));
    }}],
  });
  const mod={exports:{}};
  new Function("require","module","exports",built.outputFiles[0].text)(
    createRequire(process.cwd()+"/package.json"),mod,mod.exports);
  return mod.exports;
}
state.db = db;
const reset=()=>{state.reads=[];state.writes=[];state.notifications=0;state.dbClientCount=0;state.initialized=true;state.failSend=false;state.forceDbError=false;};
const body = JSON.stringify({event_type:"contact_message",target:"admin",message_id:fixtureMessage});
const signed = (raw, timestamp=String(Math.floor(Date.now()/1000)), signingSecret=secret) => new Request("https://w06fixture.supabase.co/functions/v1/two-nya-push",{
  method:"POST",body:raw,headers:{
    "x-rythm-push-timestamp":timestamp,
    "x-rythm-push-signature":createHmac("sha256",signingSecret).update(timestamp+"."+raw).digest("hex"),
  },
});
const notSigned = new Request("https://w06fixture.supabase.co/functions/v1/two-nya-push",{method:"POST",body});
try {
  await compile("supabase/functions/two-nya-push/index.ts");
  assert.equal(typeof state.handler,"function");
  reset();
  let r=await state.handler(new Request("https://w06fixture.supabase.co/functions/v1/two-nya-push"));
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{ok:true,public_key:"W06_PUBLIC_VAPID"});
  assert.deepEqual(state.reads.map(x=>x.fields),["public_key"]);
  assert.equal(state.writes.length,0,"public GET cannot create private credentials");
  reset();state.initialized=false;
  r=await state.handler(new Request("https://w06fixture.supabase.co/functions/v1/two-nya-push"));
  assert.equal(r.status,503,"uninitialized public key fails closed");
  assert.equal(state.writes.length,0);

  for(const [label,request] of [
    ["missing-signature",notSigned],
    ["bad-hmac",signed(body,undefined,"WRONG_SYNTHETIC_SIGNER_abcdefghijklmnopqrstuvwxyz")],
    ["modified-body",new Request(signed(body).url,{method:"POST",headers:signed(body).headers,body:body+" "})],
    ["expired-hmac",signed(body,"1")],
  ]){
    reset();
    r=await state.handler(request);
    assert.equal(r.status,401,label);
    assert.equal(state.dbClientCount,0,label+" must fail before service-role client");
    assert.equal(state.reads.length,0,label+" must fail before all privileged queries");
  }
  reset();
  r=await state.handler(signed(body));
  assert.equal(r.status,200,"valid HMAC must preserve contact message notification");
  assert.deepEqual(await r.json(),{ok:true,delivered:1});
  assert.equal(state.notifications,1,"only fake webpush adapter called");
  assert(state.reads.some(x=>x.table==="nail_2nya_push_keys"&&x.fields.includes("private_key")));
  assert(state.writes.some(x=>x.table==="nail_2nya_contact_messages"&&x.operation==="update"));

  reset();state.failSend=true;
  r=await state.handler(signed(body));
  assert.equal(r.status,200);
  assert.doesNotMatch(await r.text(),/TENANT_B_PRIVATE_CUSTOMER_CONTENT/);
  assert.doesNotMatch(JSON.stringify(state.writes),/TENANT_B_PRIVATE_CUSTOMER_CONTENT/);

  reset();state.forceDbError=true;
  const savedConsole=console.error, logs=[];
  console.error=(...args)=>logs.push(args.map(String).join(" "));
  try {
    r=await state.handler(signed(body));
    assert.equal(r.status,500);
    assert.doesNotMatch(await r.text(),/TENANT_B_PRIVATE_CUSTOMER_CONTENT/);
    assert.doesNotMatch(logs.join("\n"),/TENANT_B_PRIVATE_CUSTOMER_CONTENT/);
  } finally { console.error=savedConsole; }

  // Test the REAL Next.js backend HMAC sender against the REAL Edge handler;
  // route network calls are intercepted in memory, no outbound request occurs.
  reset();
  const sender=await compile("lib/2nya-nailart/push-dispatch.ts");
  const calls=[];
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    assert.equal(new URL(url).hostname,"w06fixture.supabase.co");
    calls.push({url,init});
    return state.handler(new Request(url,init));
  };
  assert.equal(await sender.dispatchNailPush({event_type:"contact_message",target:"admin",message_id:fixtureMessage}),true);
  assert.equal(calls.length,1);
  assert.equal(state.notifications,1);
  assert.equal(calls[0].init.headers["x-rythm-push-signature"].length,64);

  // Production requires no new project-specific secret: the server credential
  // already present on Vercel and in Supabase Edge derives a domain-bound key.
  reset();
  state.edgeSharedSecret=undefined;
  state.edgeServiceCredential=secret;
  delete process.env.TWO_NYA_PUSH_DISPATCH_SECRET;
  process.env.SUPABASE_SERVICE_ROLE_KEY=secret;
  const before=calls.length;
  assert.equal(await sender.dispatchNailPush({event_type:"contact_message",target:"admin",message_id:fixtureMessage}),true,
    "derived service credential must interoperate without dedicated secret");
  assert.equal(calls.length,before+1);
  assert.equal(state.notifications,1);
  assert.notEqual(calls.at(-1).init.headers["x-rythm-push-signature"],
    createHmac("sha256",secret).update(calls.at(-1).init.headers["x-rythm-push-timestamp"]+"."+calls.at(-1).init.body).digest("hex"),
    "domain-separated HMAC must not use the service role credential directly");

  // A partially configured dedicated secret must fail closed, never fall back.
  reset();
  state.edgeSharedSecret="short-mismatched";
  r=await state.handler(signed(body));
  assert.equal(r.status,503);
  assert.equal(state.dbClientCount,0);
  reset();
  state.edgeSharedSecret=undefined;state.edgeServiceCredential="";
  r=await state.handler(signed(body));
  assert.equal(r.status,503);
  assert.equal(state.dbClientCount,0);
  console.log("PASS W06 Edge/Backend HMAC: anonymous public-key GET; valid/tampered/stale POST; protected service; domain-separated no-new-secret deployment; strict fail-closed override; no external I/O.");
} finally {
  globalThis.fetch=oldFetch;
  if(oldDeno===undefined) delete globalThis.Deno; else globalThis.Deno=oldDeno;
  for(const [key,value] of Object.entries(oldEnv)){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  delete globalThis.w06Edge;
}
