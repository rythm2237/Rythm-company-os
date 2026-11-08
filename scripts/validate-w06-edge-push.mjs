import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

// Compile and invoke the real Deno edge handler, replacing only Deno env, DB,
// and web-push transport. No production/customer data, secrets, or push sends.
const state = { reads: [], writes: [], notifications: 0, user: null, failSend: false, initialized: true, throws: false };
globalThis.w06Edge = state;
const savedDeno = globalThis.Deno;
globalThis.Deno = {
  env: { get: name => name === "SUPABASE_SERVICE_ROLE_KEY" ? "synthetic-secret" :
    name === "SUPABASE_URL" ? "http://127.0.0.1:54321" : undefined },
  serve: callback => { state.handler = callback; },
};
const db = {
  auth: { getUser: async token => ({
    data: { user: token === "valid-admin" ? { id: "admin" } :
      token === "valid-other" ? { id: "other" } : null },
    error: null,
  }) },
  from(table) {
    const filters = [];
    let selected = "";
    const q = {
      select(fields) { selected = fields; state.reads.push({ table, fields }); return q; },
      eq(k, v) { filters.push([k,v]); return q; },
      async maybeSingle() {
        if (state.throws) throw Error("TENANT_B_PRIVATE_CUSTOMER_CONTENT");
        if (table === "nail_2nya_admin_users") return {
          data: filters.some(([k,v]) => k === "user_id" && v === "admin") ? { user_id: "admin" } : null,
          error: null,
        };
        if (table === "nail_2nya_push_keys") return {
          data: state.initialized ? (selected === "public_key" ?
            { public_key: "W06_PUBLIC_VAPID" } : { public_key: "W06_PUBLIC_VAPID", private_key: "W06_FAKE_PRIVATE" }) : null,
          error: null,
        };
        throw Error("UNEXPECTED_QUERY_" + table);
      },
      async single() { return { data: null, error: {code:"UNEXPECTED_KEY_BOOTSTRAP"} }; },
      insert(row) {
        state.writes.push({table,row});
        return { select() { return this; }, single: async () => ({ data:null,error:{code:"NO_BOOTSTRAP"} }),
          then(resolve) { return Promise.resolve({error:null}).then(resolve); } };
      },
      upsert(row) { state.writes.push({table,row}); return Promise.resolve({ error:null }); },
      update(row) { state.writes.push({table,row}); return q; },
      then(resolve) {
        if (table === "nail_2nya_customer_push_subscriptions")
          return Promise.resolve({ data: [{id:"sub-synthetic",endpoint:"https://fixture.invalid",p256dh:"synthetic",auth:"synthetic"}], error:null }).then(resolve);
        return Promise.resolve({data:[],error:null}).then(resolve);
      },
    };
    return q;
  },
};
state.db = db;
const stub = {
  "@supabase": "export function createClient(){return globalThis.w06Edge.db;}",
  "webpush": "export default {setVapidDetails(){},generateVAPIDKeys(){throw Error('UNEXPECTED_KEY_BOOTSTRAP')},async sendNotification(){globalThis.w06Edge.notifications++;if(globalThis.w06Edge.failSend)throw Error('TENANT_B_PRIVATE_CUSTOMER_CONTENT');}};",
};
try {
  const result = await build({
    entryPoints: ["supabase/functions/two-nya-push/index.ts"],
    bundle: true, platform: "node", format: "cjs", write:false, logLevel:"silent",
    packages:"external",
    plugins:[{
      name:"mock-deno-edge-dependencies",
      setup(b) {
        b.onResolve({filter:/^jsr:/}, () => ({ path: "empty", namespace:"w06-edge" }));
        b.onResolve({filter:/^npm:@supabase\/supabase-js/}, () => ({ path: "supabase", namespace:"w06-edge" }));
        b.onResolve({filter:/^npm:web-push/}, () => ({ path: "webpush", namespace:"w06-edge" }));
        b.onLoad({filter:/.*/,namespace:"w06-edge"}, args => ({
          loader:"js",contents: args.path === "supabase" ? stub["@supabase"] :
            args.path === "webpush" ? stub.webpush : "export {};"
        }));
      },
    }],
  });
  const mod = { exports:{} };
  new Function("require","module","exports", result.outputFiles[0].text)(
    createRequire(process.cwd() + "/package.json"), mod, mod.exports);
  const req = (method, token) => new Request("http://127.0.0.1/functions/v1/two-nya-push", {
    method,
    headers: token ? { authorization:"Bearer "+token } : {},
    ...(method === "POST" ? { body: JSON.stringify({event_type:"booking_requested",customer_id:"customer-synthetic",message:"W06 test"}) } : {}),
  });
  const reset = () => {state.reads=[];state.writes=[];state.notifications=0;state.failSend=false;state.throws=false;state.initialized=true;};
  reset();
  let response = await state.handler(req("GET"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok:true,public_key:"W06_PUBLIC_VAPID"});
  assert.deepEqual(state.reads.map(x=>x.fields), ["public_key"], "anonymous GET must never select private VAPID key");
  assert.equal(state.writes.length,0,"anonymous GET must never create or mutate VAPID keys");

  reset(); state.initialized=false;
  response = await state.handler(req("GET"));
  assert.equal(response.status,503,"unprovisioned public key is a safe failure, not unauthenticated provisioning");
  assert.equal(state.writes.length,0);
  reset();
  response = await state.handler(req("POST"));
  assert.equal(response.status,401);
  assert.equal(state.reads.length,0,"missing JWT cannot query any tenant or private key");

  reset();
  response = await state.handler(req("POST","invalid-token"));
  assert.equal(response.status,401);
  assert.equal(state.reads.length,0,"invalid JWT cannot query private DB");
  reset();
  response = await state.handler(req("POST","valid-other"));
  assert.equal(response.status,403);
  assert.deepEqual(state.reads.map(x=>x.table),["nail_2nya_admin_users"],"nonadmin JWT cannot touch VAPID or subscriptions");
  assert.equal(state.writes.length,0);

  reset();
  response = await state.handler(req("POST","valid-admin"));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,sent:1,failed:0});
  assert.equal(state.notifications,1);
  assert(state.reads.some(x=>x.table==="nail_2nya_push_keys"&&x.fields.includes("private_key")),"only admin can retrieve private key");
  reset();state.failSend=true;
  response = await state.handler(req("POST","valid-admin"));
  assert.equal(response.status,200);
  assert.equal(state.writes.filter(x=>x.table==="nail_2nya_notification_deliveries")[0].row.error_message,"push_failed");
  assert.doesNotMatch(JSON.stringify(state.writes),/TENANT_B_PRIVATE_CUSTOMER_CONTENT/,"provider exception details must not persist");

  reset();state.throws=true;
  response = await state.handler(req("POST","valid-admin"));
  assert.equal(response.status,500);
  assert.doesNotMatch(await response.text(),/TENANT_B_PRIVATE_CUSTOMER_CONTENT/);
  console.log("PASS W06 actual Edge: anonymous public-only GET; unknown/missing user 401; nonadmin 403 before private DB; admin 200; provider/private error redaction; no external notifications.");
} finally {
  if (savedDeno === undefined) delete globalThis.Deno;
  else globalThis.Deno = savedDeno;
  delete globalThis.w06Edge;
}
