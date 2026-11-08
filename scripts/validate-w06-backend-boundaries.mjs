import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { build } from "esbuild";

// Execute real compiled handlers with isolated synthetic identity/database adapters.
// No actual customer rows, providers, production endpoints or billable calls.
const state = {
  cronCalls: 0, projectOperations: 0, webhookWrites: 0,
  automationResults: [], failAutomation: false, failProject: false,
};
globalThis.w06Boundary = state;
const requireForBundle = createRequire(process.cwd() + "/package.json");
const testSecret = "W06_SYNTHETIC_SCHEDULER_SECRET_abcdefghijklmnopqrstuvwxyz";
const priorEnv = {
  CRON_SECRET: process.env.CRON_SECRET,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
  CLOUDFLARE_EMAIL_WORKER_SECRET: process.env.CLOUDFLARE_EMAIL_WORKER_SECRET,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
process.env.CRON_SECRET = testSecret;
process.env.STRIPE_WEBHOOK_SECRET = "whsec_w06_synthetic";
process.env.RESEND_WEBHOOK_SECRET = "whsec_" + Buffer.from("w06-svix-key-only-for-unit-tests").toString("base64");
process.env.CLOUDFLARE_EMAIL_WORKER_SECRET = testSecret;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-key-never-used-for-network";
const database = {
  from(table) {
    if (table === "project_scheduler_config") {
      return { select() { return this; }, eq() { return this; },
        maybeSingle: async () => ({ data: null, error: null }) };
    }
    if (table === "communication_mailboxes") {
      return { select() { return this; }, eq() { return this; },
        maybeSingle: async () => ({ data: null, error: null }) };
    }
    if (table === "billing_webhook_events") {
      const q = {
        insert: async () => { state.webhookWrites++; return { error: null }; },
        update() { return q; },
        eq() { return q; },
        then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); },
      };
      return q;
    }
    throw Error("UNEXPECTED_DB_TABLE_" + table);
  },
  async rpc() {
    state.projectOperations++;
    if (state.failProject) throw Error("TENANT_B_PRIVATE_CUSTOMER_CONTENT");
    return { data: 0, error: null };
  },
};
state.service = database;
const workerFunctions = {
  "project-work-v2": ["dispatchProjectWorkV2"],
  "project-knowledge": ["dispatchProjectKnowledge"],
  "project-autonomous-meetings": ["dispatchAutonomousProjectMeetings"],
  "project-proposal-execution": ["dispatchApprovedProjectProposalActions"],
  "project-tool-execution": ["dispatchApprovedProjectToolExecutions", "reconcileDispatchedProjectProposals"],
  "project-supervisor": ["superviseProjectExecutions"],
  "project-completion": ["reconcileProjectCompletionRuntime"],
  "project-completion-continuation": ["ensureProjectLifecycleContinuation"],
  "continuous-program-review-worker": ["processContinuousProgramReviews"],
};
const shims = {
  "@/lib/admin/automation/executor":
    "export async function dispatchDueAutomationTasks(){globalThis.w06Boundary.cronCalls++;if(globalThis.w06Boundary.failAutomation)throw Error('TENANT_B_PRIVATE_CUSTOMER_CONTENT');return globalThis.w06Boundary.automationResults;}",
  "@/lib/supabase/server":
    "export function createServerSupabaseClient(){return globalThis.w06Boundary.service;}",
  "@/lib/supabase/billing-admin":
    "export function createBillingAdminClient(){return globalThis.w06Boundary.service;}",
  "@/lib/commercial/activation-policy": "export const ONLINE_CHECKOUT_ENABLED = true;",
  "@/lib/auth/api-organization-context":
    "export async function resolveOwnerApiOrganizationContext(){return globalThis.w06Boundary.ownerContext;}",
  "@/lib/projects/project-roadmap":
    "export async function getApprovedProjectRoadmap(){return {id:'roadmap-A',version:1,status:'approved'};} export async function getLatestProjectRoadmap(){throw Error('UNEXPECTED_ROADMAP_FALLBACK');} export async function createProjectRoadmapDraft(){throw Error('UNEXPECTED_ROADMAP_CREATE');}",
  "@/lib/projects/project-execution-start":
    "export async function startProjectExecutionWithoutGlobalGate(){throw Error('UNEXPECTED_PROJECT_START');}",
  "@supabase/supabase-js":
    "export function createClient(){return globalThis.w06Boundary.service;}",
  "@/lib/integrations/connection-setup-agent":
    "export async function dispatchConnectionSetupSessions(){return [{value:'TENANT_B_PRIVATE_CUSTOMER_CONTENT'}];}",
  "@/lib/integrations/connections/google-connection-reconciliation":
    "export async function reconcileGoogleConnections(){return [{value:'TENANT_B_PRIVATE_CUSTOMER_CONTENT'}];}",
};
for (const [moduleName, functions] of Object.entries(workerFunctions)) {
  shims["@/lib/projects/" + moduleName] = functions
    .map(name => "export async function " + name +
      "(){return [{value:'TENANT_B_PRIVATE_CUSTOMER_CONTENT'}];}").join("\n");
}
async function route(file) {
  const built = await build({
    entryPoints: [file], bundle: true, write: false, platform: "node",
    format: "cjs", packages: "external", logLevel: "silent",
    plugins: [{
      name: "synthetic-external-boundary",
      setup(b) {
        b.onResolve({ filter: /^(?:@\/|@supabase\/supabase-js$)/ },
          args => shims[args.path] ? { path: args.path, namespace: "w06" } : null);
        b.onLoad({ filter: /.*/, namespace: "w06" },
          args => ({ contents: shims[args.path], loader: "js" }));
      },
    }],
  });
  const mod = { exports: {} };
  new Function("require", "module", "exports", built.outputFiles[0].text)(
    requireForBundle, mod, mod.exports);
  return mod.exports;
}
const get = (token = "") => new Request("http://localhost/api/dispatch", {
  headers: token ? { authorization: "Bearer " + token } : {},
});
const sensitive = "TENANT_B_PRIVATE_CUSTOMER_CONTENT";
const logs = [];
const originalConsoleError = console.error;
console.error = (...args) => logs.push(args.map(String).join(" "));
try {
  const automation = await route("app/api/admin/automation/dispatch/route.ts");
  assert.equal((await automation.GET(get())).status, 401);
  assert.equal((await automation.GET(get("wrong"))).status, 401);
  assert.equal(state.cronCalls, 0, "invalid cron cannot invoke privileged worker");
  state.automationResults = [
    { runId: "private-tenant-B", status: "succeeded", summary: sensitive },
    { taskId: "private-tenant-B", status: "failed", error: sensitive },
  ];
  const success = await automation.GET(get(testSecret));
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { ok: true, dispatched: 2, failed: 1 });
  assert.match(success.headers.get("cache-control"), /no-store/);
  state.failAutomation = true;
  const failed = await automation.GET(get(testSecret));
  assert.equal(failed.status, 500);
  assert.doesNotMatch(await failed.text(), /TENANT_B|PRIVATE_CUSTOMER/);
  state.failAutomation = false;

  const project = await route("app/api/projects/dispatch/route.ts");
  state.projectOperations = 0;
  assert.equal((await project.GET(get())).status, 401);
  assert.equal((await project.GET(get("not-a-valid-token"))).status, 401);
  assert.equal(state.projectOperations, 0, "untrusted cron cannot execute privileged RPC");
  const summary = await project.GET(get(testSecret));
  assert.equal(summary.status, 200);
  const summaryBody = await summary.text();
  assert.doesNotMatch(summaryBody, /TENANT_B|PRIVATE_CUSTOMER|raw|customer/i);
  assert.equal(JSON.parse(summaryBody).ok, true);
  state.failProject = true;
  const degraded = await project.GET(get(testSecret));
  assert.doesNotMatch(await degraded.text(), /TENANT_B|PRIVATE_CUSTOMER/);
  state.failProject = false;

  // Real user-route boundary with caller-scoped RLS and foreign-project ID.
  const callerDb = {
    from(table) {
      assert.equal(table,"projects");
      const filters = [];
      const q = {
        select(){return q;},
        eq(k,v){filters.push([k,v]);return q;},
        async maybeSingle(){
          return {data:filters.some(([k,v])=>k==="organization_id"&&v==="org-A") &&
            filters.some(([k,v])=>k==="id"&&v==="project-A") ? {id:"project-A"} : null,error:null};
        },
      };
      return q;
    },
  };
  state.ownerContext = {ok:false,status:401,error:"Authentication required."};
  const projectRun = await route("app/api/projects/run/route.ts");
  const invokeProject = id => projectRun.POST(new Request("http://localhost/api/projects/run",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId:id}),
  }));
  state.projectOperations=0;
  assert.equal((await invokeProject("project-A")).status,401,"anonymous project execution denied");
  state.ownerContext = {ok:true,organizationId:"org-A",user:{id:"owner-A"},supabase:callerDb};
  assert.equal((await invokeProject("project-B")).status,404,"owner-A cannot start foreign project");
  assert.equal(state.projectOperations,0,"foreign project blocked before privileged query");
  // Existing synthetic own execution serves as a positive control.
  state.service = {
    ...database,
    from(table){
      if(table==="project_executions"){
        const filters=[];
        const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},
          in(){return q;},order(){return q;},limit(){return q;},
          async maybeSingle(){assert(filters.some(([k,v])=>k==="organization_id"&&v==="org-A"));assert(filters.some(([k,v])=>k==="project_id"&&v==="project-A"));return {data:{id:"execution-A",execution_no:1,status:"running",roadmap_id:"roadmap-A"},error:null};}};
        return q;
      }
      return database.from(table);
    },
  };
  assert.equal((await invokeProject("project-A")).status,200,"owner-A own project succeeds");
  state.service=database;

  const billing = await route("app/api/billing/webhook/route.ts");
  const event = JSON.stringify({ id: "evt_w06_synthetic", type: "w06.ping", created: 1, data: { object: {} } });
  const stripe = (body, signature) => new Request("http://localhost/api/billing/webhook", {
    method: "POST", headers: { "stripe-signature": signature }, body,
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signStripe = (body, time) => "t=" + time + ",v1=" +
    createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET)
      .update(time + "." + body).digest("hex");
  assert.equal((await billing.POST(stripe(event, "invalid"))).status, 400);
  assert.equal((await billing.POST(stripe(event + "x", signStripe(event, timestamp)))).status, 400);
  assert.equal((await billing.POST(stripe(event, signStripe(event, "1")))).status, 400);
  assert.equal(state.webhookWrites, 0);
  assert.equal((await billing.POST(stripe(event, signStripe(event, timestamp)))).status, 200);
  assert.equal(state.webhookWrites, 1, "provider-signed event is the only DB write");

  const resend = await route("app/api/communication/inbound/resend/route.ts");
  const resendBody = JSON.stringify({ type: "w06.ignored", data: {} });
  const msgId = "msg_w06_synthetic", svixTimestamp = timestamp;
  const svixKey = Buffer.from(process.env.RESEND_WEBHOOK_SECRET.slice(6), "base64");
  const svixSignature = "v1," + createHmac("sha256", svixKey)
    .update(msgId + "." + svixTimestamp + "." + resendBody).digest("base64");
  const resendReq = (sig, time = svixTimestamp) => new Request("http://localhost/api/communication/inbound/resend", {
    method: "POST", body: resendBody,
    headers: { "svix-id": msgId, "svix-timestamp": time, "svix-signature": sig },
  });
  assert.equal((await resend.POST(resendReq("v1,invalid"))).status, 401);
  assert.equal((await resend.POST(resendReq(svixSignature, "1"))).status, 401);
  assert.equal((await resend.POST(resendReq(svixSignature))).status, 200);

  const cloudflare = await route("app/api/communication/inbound/cloudflare/route.ts");
  const email = JSON.stringify({ from: "synthetic@fixture.invalid", to: "mailbox@fixture.invalid", rawBase64: Buffer.from("test").toString("base64") });
  const cf = secret => new Request("http://localhost/api/communication/inbound/cloudflare", {
    method: "POST", body: email, headers: { "content-type": "application/json", "x-rythm-email-secret": secret },
  });
  assert.equal((await cloudflare.POST(cf("incorrect"))).status, 401);
  assert.equal((await cloudflare.POST(cf(testSecret))).status, 404, "trusted worker reaches bounded mailbox lookup");
  assert.equal(state.webhookWrites, 1, "inbound webhook tests cannot write to real customer tables");
  assert.doesNotMatch(logs.join("\n"), /TENANT_B_PRIVATE_CUSTOMER_CONTENT/);
  originalConsoleError("PASS W06 isolated actual handlers: cron 401/200/500, private result suppression, Stripe and Svix valid/tampered/expired signature, Cloudflare trusted/denied, no external I/O.");
} finally {
  console.error = originalConsoleError;
  for (const [key, value] of Object.entries(priorEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete globalThis.w06Boundary;
}
