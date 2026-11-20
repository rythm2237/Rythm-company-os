import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  AutomationRetryExhausted,
  classifyAutomationFailure,
  executeWithSafeRetry,
  mayRetryAutomationFailure,
} from "../lib/admin/automation/retry-policy";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

async function main() {
  // All tests use fake handlers and an in-memory PostgreSQL database.
  // No Supabase/Vercel/project credentials, customers or provider APIs are accessed.
  assert.equal(classifyAutomationFailure(new Error("Google Search Console must be reconnected.")), "PROVIDER_AUTH_REQUIRED");
  assert.equal(classifyAutomationFailure(new Error("Crawly API 429")), "RATE_LIMITED");
  assert.equal(classifyAutomationFailure(new Error("provider timeout")), "TRANSIENT_TIMEOUT");
  assert.equal(classifyAutomationFailure(new Error("upstream HTTP 503")), "UPSTREAM_UNAVAILABLE");
  assert.equal(classifyAutomationFailure(new Error("fetch failed")), "NETWORK_UNAVAILABLE");
  assert.equal(classifyAutomationFailure(new Error("api key not configured")), "PROVIDER_CONFIGURATION_REQUIRED");
  assert.equal(classifyAutomationFailure(new Error("unknown failure")), "UNEXPECTED_FAILURE");
  assert.equal(mayRetryAutomationFailure("agency_seo_daily_monitoring", "TRANSIENT_TIMEOUT"), false, "notification-producing jobs must never auto-retry");
  assert.equal(mayRetryAutomationFailure("search_index_monitoring", "TRANSIENT_TIMEOUT"), false, "external quota-bearing tasks must never auto-retry");
  assert.equal(mayRetryAutomationFailure("core_web_vitals", "TRANSIENT_TIMEOUT"), false, "PageSpeed requests must not be repeated automatically");

  const attempted: number[] = [];
  const backoffs: number[] = [];
  const success = await executeWithSafeRetry(async (attempt) => {
    attempted.push(attempt);
    if (attempt === 1) throw new Error("Transient timeout");
    return { status: "succeeded" };
  }, { handlerKey: "system_health", maxRetries: 1, wait: async (ms) => { backoffs.push(ms); } });
  assert.deepEqual(attempted, [1, 2]);
  assert.deepEqual(backoffs, [200]);
  assert.deepEqual(success, { value: { status: "succeeded" }, attempts: 2 });

  let stoppedAt = 0;
  await assert.rejects(
    executeWithSafeRetry(async () => { stoppedAt++; throw new Error("Google Search Console must be reconnected."); },
      { handlerKey: "system_health", maxRetries: 5, wait: async () => { throw new Error("must not wait"); } }),
    (error: unknown) => error instanceof AutomationRetryExhausted && error.failureCode === "PROVIDER_AUTH_REQUIRED" && error.attempts === 1,
  );
  assert.equal(stoppedAt, 1, "permanent authorization failure must not be retried");
  let unsafeCalls = 0;
  await assert.rejects(
    executeWithSafeRetry(async () => { unsafeCalls++; throw new Error("upstream HTTP 503"); },
      { handlerKey: "agency_seo_daily_monitoring", maxRetries: 5, wait: async () => { throw new Error("unsafe backoff"); } }),
    (error: unknown) => error instanceof AutomationRetryExhausted && error.attempts === 1,
  );
  assert.equal(unsafeCalls, 1);
  const maxCalls: number[] = [];
  await assert.rejects(
    executeWithSafeRetry(async (n) => { maxCalls.push(n); throw new Error("upstream HTTP 503"); },
      { handlerKey: "seo_site_health", maxRetries: 5, wait: async () => {} }),
    (error: unknown) => error instanceof AutomationRetryExhausted && error.failureCode === "UPSTREAM_UNAVAILABLE" && error.attempts === 3,
  );
  assert.deepEqual(maxCalls, [1, 2, 3], "global retry ceiling must stay at 2");

  const db = new PGlite();
  try {
    await db.exec(`
      create table synthetic_runs (
        id integer generated always as identity primary key,
        task_id text not null,
        status text not null check (status in ('queued','running','succeeded','failed','skipped')),
        attempt integer not null default 1,
        summary text,
        skip_reason text
      );
      create unique index synthetic_active_task_unique on synthetic_runs(task_id)
        where status in ('queued','running');
    `);
    await db.query("insert into synthetic_runs(task_id,status) values ($1,'queued')", ["test-task"]);
    await assert.rejects(
      db.query("insert into synthetic_runs(task_id,status) values ($1,'queued')", ["test-task"]),
      "parallel scheduled trigger must collide with active unique index",
    );
    await db.query("insert into synthetic_runs(task_id,status,summary,skip_reason) values ($1,'skipped',$2,$3)",
      ["test-task", "Already running", "already_running"]);
    await db.query("update synthetic_runs set status='running',attempt=2 where task_id=$1 and status='queued'", ["test-task"]);
    await db.query("update synthetic_runs set status='failed',summary=$1 where task_id=$2 and status='running'",
      ["TRANSIENT_TIMEOUT", "test-task"]);
    const rows = await db.query<{status:string;attempt:number;skip_reason:string|null}>(
      "select status,attempt,skip_reason from synthetic_runs order by id",
    );
    assert.deepEqual(rows.rows, [
      { status: "failed", attempt: 2, skip_reason: null },
      { status: "skipped", attempt: 1, skip_reason: "already_running" },
    ], "failure and duplicate-trigger skip remain separate durable terminal outcomes");
  } finally {
    await db.close();
  }

  const executor = read("lib/admin/automation/executor.ts");
  const scheduler = read("app/api/admin/automation/dispatch/route.ts");
  const manual = read("app/(app)/admin/actions.ts");
  const page = read("app/(app)/admin/automation/page.tsx");
  assert.match(executor, /triggerType === "manual" && !initiatedBy/, "manual trigger requires authenticated actor");
  assert.match(manual, /await requirePlatformAdmin\(\)/, "manual actions require platform-admin permission");
  assert.match(scheduler, /timingSafeEqual/, "cron secret comparison must be timing safe");
  assert.match(scheduler, /status: 401/, "scheduler must reject unauthorized access");
  assert.match(scheduler, /failed \? 503 : 200/, "failed dispatch must be visible to health monitoring");
  assert.match(executor, /skipReason: "already_running"/);
  assert.match(executor, /skipReason: "provider_disconnected"/);
  assert.match(executor, /skipReason: "approval_required"/);
  assert.match(executor, /status: failed > 0 \? "failed" : "succeeded"/, "partial client monitoring failures must never look successful");
  assert.match(executor, /status: ok \? "succeeded" : "failed"/, "failing health check must not report succeeded");
  assert.match(executor, /error_message: failureCode/, "persist only sanitized failure codes");
  assert.match(page, /failedCountResult\.count/);
  assert.match(page, /skippedCountResult\.count/);
  assert.match(page, /admin-run-list/);
  assert.match(page, /history pagination/);
  assert.doesNotMatch(executor, /eval\(|new Function|child_process/);
  console.log("W14 PASS: synthetic injected failure/recovery, hard stop, bounded retries, partial unique ledger and manual/scheduler permission contracts");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
