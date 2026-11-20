/**
 * W14 hosted staging-only acceptance.
 * Real run ledger, RLS and retry exercised on an isolated disposable task.
 * All providers, URLs, AI and customer operations are synthetic or blocked.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { createClient } from "@supabase/supabase-js";

const ref = "viqjdgohtxqkrdgwtull";
const url = process.env.W14_STAGING_SUPABASE_URL;
const secret = process.env.W14_STAGING_SERVICE_ROLE_KEY;
const anon = process.env.W14_STAGING_ANON_KEY;
assert.equal(process.env.W14_STAGING_REF, ref, "isolated staging project ID only");
assert.equal(url, "https://" + ref + ".supabase.co", "must never use production");
assert.ok(secret && secret.length > 20, "staging credential required");
assert.ok(anon && anon.length > 20, "staging anon credential required");
assert.equal(process.env.RYTHM_EXTERNAL_ACTIONS_ENABLED, "false");
assert.equal(process.env.RYTHM_AGENT_EXECUTION_ENABLED, "false");
const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const taskIds = [];
const prefix = "w14-synthetic-" + randomUUID().slice(0, 12);
const state = {
  errorsRemaining: 0,
  reads: 0,
  pauseReads: false,
  entered: () => {},
  barrier: Promise.resolve(),
  authorization: false,
  actionCalls: 0,
  dispatchCalls: 0,
};

function adminAdapter() {
  return {
    from(table) {
      if (table === "ai_routing_decisions") {
        return {
          select() {
            return {
              async gte() {
                state.reads++;
                if (state.pauseReads) {
                  state.entered();
                  await state.barrier;
                }
                if (state.errorsRemaining > 0) {
                  state.errorsRemaining--;
                  return { data: null, error: { message: "synthetic database connection unavailable" } };
                }
                return { data: [], error: null };
              },
            };
          },
        };
      }
      return client.from(table);
    },
  };
}
globalThis.w14Hosted = { adminAdapter, state };
const shims = {
  "server-only": "",
  "@/lib/supabase/analytics-admin": "export function createAnalyticsAdminClient(){return globalThis.w14Hosted.adminAdapter();}",
  "@/lib/admin/automation/google-monitoring":
    "export async function runCoreWebVitalsMonitoring(){throw Error('NO_REAL_PROVIDER_CALLS');} export async function runSearchConsoleMonitoring(){throw Error('NO_REAL_PROVIDER_CALLS');}",
  "@/lib/admin/automation/crawly-monitoring":
    "export async function runCrawlyAuthorityMonitoring(){throw Error('NO_REAL_PROVIDER_CALLS');}",
  "@/lib/seo/agency-client-monitoring":
    "export async function runAgencySeoSiteMonitoring(){throw Error('NO_REAL_CUSTOMER_ACTIONS');}",
  "@/lib/security/public-url":
    "export async function fetchPublicResource(){throw Error('NO_NETWORK_REQUESTS');}",
};
const importer = createRequire(process.cwd() + "/package.json");
async function bundled(path, modules) {
  const output = await build({
    entryPoints: [path], bundle: true, write: false, platform: "node", format: "cjs",
    packages: "external", logLevel: "silent",
    plugins: [{
      name: "w14-hosted-synthetic-dependencies",
      setup(b) {
        b.onResolve({ filter: /^(?:@\/|server-only$|next\/)/ }, (args) => {
          if (args.path === "@/lib/admin/automation/retry-policy") {
            return { path: process.cwd() + "/lib/admin/automation/retry-policy.ts" };
          }
          return Object.hasOwn(modules, args.path) ? { path: args.path, namespace: "w14" } : null;
        });
        b.onLoad({ filter: /.*/, namespace: "w14" }, (args) => ({
          contents: modules[args.path], loader: "js",
        }));
      },
    }],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", output.outputFiles[0].text)(importer, module, module.exports);
  return module.exports;
}
function newTask(extra = {}) {
  const id = randomUUID();
  taskIds.push(id);
  return {
    id, slug: prefix + "-" + taskIds.length, name: "W14 SYNTHETIC TEST",
    description: "Disposable staging-only task; never uses real providers",
    category: "testing", handler_key: "ai_usage_cost", enabled: true,
    schedule_mode: "manual", risk_level: "low", requires_approval: false,
    configuration_status: "ready", max_retries: 1, timeout_seconds: 20,
    config: { window_days: 1 }, ...extra,
  };
}
async function createTask(extra) {
  const row = newTask(extra);
  const { error } = await client.from("automation_tasks").insert(row);
  assert.equal(error, null, "synthetic task insertion into staging ledger must succeed");
  return row;
}
async function runsFor(ids) {
  const { data, error } = await client.from("automation_task_runs")
    .select("id,task_id,status,attempt,started_at,finished_at,summary,error_message,output")
    .in("task_id", ids).order("created_at");
  assert.equal(error, null);
  return data;
}
const priorCron = process.env.CRON_SECRET;
process.env.CRON_SECRET = "W14_SYNTHETIC_CRON_" + randomUUID() + randomUUID();
try {
  for (const table of ["automation_tasks", "automation_task_runs", "platform_integrations"]) {
    const { error } = await client.from(table).select("id").limit(0);
    assert.equal(error, null, "staging missing required automation schema: " + table);
  }
  const executor = await bundled("lib/admin/automation/executor.ts", shims);
  // Successful bounded retry, with one injected transient database error.
  const recovered = await createTask();
  state.errorsRemaining = 1;
  state.reads = 0;
  const success = await executor.executeAutomationTask(recovered.id, "scheduled", null);
  assert.equal(success.status, "succeeded");
  assert.equal(state.reads, 2, "a transient failure must retry exactly once");
  const successLedger = await runsFor([recovered.id]);
  assert.equal(successLedger.length, 1);
  assert.equal(successLedger[0].attempt, 2);
  assert.equal(successLedger[0].status, "succeeded");

  // Consecutive failures must be bounded and preserved in sanitized ledger.
  const failedTask = await createTask();
  state.errorsRemaining = 3;
  state.reads = 0;
  await assert.rejects(executor.executeAutomationTask(failedTask.id, "scheduled", null),
    /AUTOMATION_DATABASE_UNAVAILABLE/);
  assert.equal(state.reads, 2, "max_retries=1 must stop after two total attempts");
  const failed = await runsFor([failedTask.id]);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].status, "failed");
  assert.equal(failed[0].attempt, 2);
  assert.equal(failed[0].error_message, "DATABASE_UNAVAILABLE");
  assert.equal(failed[0].output.failureCode, "DATABASE_UNAVAILABLE");

  // A second overlapping trigger is auditable as skipped, never invisible.
  const duplicateTask = await createTask();
  state.errorsRemaining = 0;
  state.pauseReads = true;
  let release;
  state.barrier = new Promise((resolve) => { release = resolve; });
  let arrived;
  const entered = new Promise((resolve) => { arrived = resolve; });
  state.entered = arrived;
  const first = executor.executeAutomationTask(duplicateTask.id, "scheduled", null);
  await entered;
  const overlap = await executor.executeAutomationTask(duplicateTask.id, "scheduled", null);
  assert.equal(overlap.status, "skipped");
  release();
  assert.equal((await first).status, "succeeded");
  state.pauseReads = false;
  const duplicates = await runsFor([duplicateTask.id]);
  assert.equal(duplicates.length, 2);
  assert.equal(duplicates.filter((x) => x.status === "succeeded").length, 1);
  assert.equal(duplicates.filter((x) => x.status === "skipped").length, 1);
  assert.equal(duplicates.find((x) => x.status === "skipped").output.skipReason, "already_running");

  const disabled = await createTask({ enabled: false });
  const disabledResult = await executor.executeAutomationTask(disabled.id, "scheduled", null);
  assert.equal(disabledResult.status, "skipped");
  assert.equal((await runsFor([disabled.id]))[0].output.skipReason, "task_disabled");

  const gate = await createTask({ risk_level: "high", requires_approval: true });
  const approval = await executor.executeAutomationTask(gate.id, "scheduled", null);
  assert.equal(approval.status, "skipped");
  assert.equal((await runsFor([gate.id]))[0].output.skipReason, "approval_required");

  // Anonymous clients must never see this server-only synthetic run history.
  const { data: visible, error: publicError } = await publicClient.from("automation_task_runs")
    .select("id").in("task_id", taskIds);
  assert.ok(publicError || !visible?.length, "anonymous user must not see task history");

  const scheduler = await bundled("app/api/admin/automation/dispatch/route.ts", {
    "@/lib/admin/automation/executor":
      "export async function dispatchDueAutomationTasks(){globalThis.w14Hosted.state.dispatchCalls++;return [{status:'failed'},{status:'skipped'}];}",
  });
  const makeRequest = (key) => new Request("https://staging.invalid/api/admin/automation/dispatch", {
    headers: key ? { authorization: "Bearer " + key } : {},
  });
  assert.equal((await scheduler.GET(makeRequest(null))).status, 401);
  assert.equal((await scheduler.GET(makeRequest("wrong"))).status, 401);
  assert.equal(state.dispatchCalls, 0, "invalid cron secret must never dispatch");
  const dispatch = await scheduler.GET(makeRequest(process.env.CRON_SECRET));
  assert.equal(dispatch.status, 503, "failed dispatch must be visible");
  assert.deepEqual(await dispatch.json(), { ok: false, dispatched: 2, failed: 1, skipped: 1 });
  assert.equal(state.dispatchCalls, 1);

  const actions = await bundled("app/(app)/admin/actions.ts", {
    "@/lib/admin/authorization":
      "export async function requirePlatformAdmin(){if(!globalThis.w14Hosted.state.authorization)throw Error('PLATFORM_ADMIN_REQUIRED');return {user:{id:'test-admin'},supabase:{}};}",
    "@/lib/admin/automation/executor":
      "export async function executeAutomationTask(){globalThis.w14Hosted.state.actionCalls++;return {status:'succeeded',summary:'synthetic-only'};}",
    "@/lib/security/redaction": "export function redactSecretText(text){return String(text);}",
    "next/cache": "export function revalidatePath(){}",
    "next/navigation": "export function redirect(path){throw Error('W14_REDIRECT:'+path);}",
  });
  const form = new FormData();
  form.set("taskId", recovered.id);
  await assert.rejects(actions.runAutomationNow(form), /PLATFORM_ADMIN_REQUIRED/);
  assert.equal(state.actionCalls, 0, "unauthorized manual invoke blocked before execution");
  state.authorization = true;
  await assert.rejects(actions.runAutomationNow(form), /W14_REDIRECT:/);
  assert.equal(state.actionCalls, 1, "authorized synthetic manual invoke reached guarded action only");

  const terminal = await runsFor(taskIds);
  assert.equal(terminal.length, 6, "all synthetic triggers must have persisted run rows");
  assert.ok(terminal.every((r) => ["succeeded", "failed", "skipped"].includes(r.status)));
  assert.ok(terminal.every((r) => r.started_at && r.finished_at && Date.parse(r.finished_at) >= Date.parse(r.started_at)));
  console.log("W14 HOSTED STAGING PASS: real disposable run ledger, bounded retry, synthetic scheduler fault/503, duplicate+disabled+approval skips, anon RLS denial, manual authorization, terminal consistency");
} finally {
  state.pauseReads = false;
  if (priorCron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = priorCron;
  delete globalThis.w14Hosted;
  if (taskIds.length) {
    const { error } = await client.from("automation_tasks").delete().in("id", taskIds);
    if (error) throw Error("W14 staging fixture cleanup failed");
    const { data, error: checkError } = await client.from("automation_tasks").select("id").in("id", taskIds);
    assert.equal(checkError, null);
    assert.equal(data.length, 0, "no test tasks may remain in staging");
    const { data: remaining, error: runsError } = await client.from("automation_task_runs").select("id").in("task_id", taskIds);
    assert.equal(runsError, null);
    assert.equal(remaining.length, 0, "no synthetic run records may remain after cleanup");
  }
}