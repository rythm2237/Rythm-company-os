import "server-only";
import { AutomationRetryExhausted, classifyAutomationFailure, executeWithSafeRetry } from "@/lib/admin/automation/retry-policy";
import { createAnalyticsAdminClient } from "@/lib/supabase/analytics-admin";
import { runCoreWebVitalsMonitoring, runSearchConsoleMonitoring } from "@/lib/admin/automation/google-monitoring";
import { runCrawlyAuthorityMonitoring } from "@/lib/admin/automation/crawly-monitoring";
import { runAgencySeoSiteMonitoring } from "@/lib/seo/agency-client-monitoring";
import { fetchPublicResource } from "@/lib/security/public-url";

export type AutomationTrigger = "manual" | "scheduled" | "system";

type AutomationTask = {
  id: string;
  slug: string;
  name: string;
  handler_key: string;
  schedule_mode: "manual" | "daily" | "weekly" | "monthly" | "cron";
  enabled: boolean;
  configuration_status: "ready" | "needs_configuration" | "blocked";
  config: Record<string, unknown> | null;
  max_retries: number;
  risk_level: "low" | "medium" | "high" | "critical";
  requires_approval: boolean;
};

type HandlerResult = { status?: "succeeded" | "skipped" | "failed"; summary: string; output?: Record<string, unknown> };

const SITE_ORIGIN = "https://rythm-os.com";
const DISPATCH_HOUR_UTC = 5;
const DISPATCH_LEAD_MINUTES = 5;

function alignBeforeDispatcher(value: Date) {
  value.setUTCHours(DISPATCH_HOUR_UTC, -DISPATCH_LEAD_MINUTES, 0, 0);
  return value;
}

function nextRun(mode: AutomationTask["schedule_mode"], from = new Date()) {
  const next = new Date(from);
  if (mode === "manual") return null;
  if (mode === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
    alignBeforeDispatcher(next);
  } else if (mode === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
    alignBeforeDispatcher(next);
  } else if (mode === "monthly") {
    next.setUTCMonth(next.getUTCMonth() + 1);
    alignBeforeDispatcher(next);
  } else {
    next.setUTCHours(next.getUTCHours() + 1);
  }
  return next.toISOString();
}

async function fetchCheck(path: string) {
  const started = Date.now();
  try {
    const { response, finalUrl } = await fetchPublicResource(new URL(path, SITE_ORIGIN), {
      allowedHosts: ["rythm-os.com"],
      maxBytes: 1_000_000,
      maxRedirects: 4,
      timeoutMs: 15_000,
    });
    return { path, ok: response.ok, status: response.status, finalUrl: finalUrl.toString(), durationMs: Date.now() - started };
  } catch (error) {
    return { path, ok: false, status: 0, durationMs: Date.now() - started, error: "Automation HTTP request failed." };
  }
}

async function systemHealth(): Promise<HandlerResult> {
  const admin = createAnalyticsAdminClient();
  if (!admin) throw new Error("Supabase service-role environment is unavailable.");
  const [database, production] = await Promise.all([
    admin.from("organizations").select("id", { count: "exact", head: true }),
    fetchCheck("/"),
  ]);
  const ok = !database.error && production.ok;
  return {
    status: ok ? "succeeded" : "failed",
    summary: ok ? "Database and canonical production are reachable." : "One or more platform health checks failed.",
    output: { database: { ok: !database.error, organizationCount: database.count ?? null, error: database.error?.message ?? null }, production },
  };
}

async function seoSiteHealth(task: AutomationTask): Promise<HandlerResult> {
  const configured = Array.isArray(task.config?.key_paths) ? task.config?.key_paths : ["/", "/product", "/faq", "/docs"];
  const paths = configured.filter((value): value is string => typeof value === "string");
  const checks = await Promise.all(["/robots.txt", "/sitemap.xml", ...paths].map(fetchCheck));
  const failures = checks.filter((check) => !check.ok);
  return {
    status: failures.length === 0 ? "succeeded" : "failed",
    summary: failures.length === 0 ? `SEO/GEO/AEO surface check passed for ${checks.length} endpoints.` : `${failures.length} of ${checks.length} SEO/GEO/AEO surface checks failed.`,
    output: { origin: SITE_ORIGIN, checks, failures: failures.map((item) => item.path) },
  };
}

async function aiUsageCost(task: AutomationTask): Promise<HandlerResult> {
  const admin = createAnalyticsAdminClient();
  if (!admin) throw new Error("Supabase service-role environment is unavailable.");
  const windowDays = typeof task.config?.window_days === "number" ? task.config.window_days : 7;
  const since = new Date(Date.now() - windowDays * 86400000).toISOString();
  const { data, error } = await admin.from("ai_routing_decisions")
    .select("actual_cost_usd,total_latency_ms,normalized_error_class,created_at")
    .gte("created_at", since);
  if (error) throw new Error("Automation database operation failed.");
  const rows = data ?? [];
  const cost = rows.reduce((sum, row) => sum + Number(row.actual_cost_usd ?? 0), 0);
  const latencies = rows.map((row) => Number(row.total_latency_ms)).filter((value) => Number.isFinite(value));
  const errors = rows.filter((row) => Boolean(row.normalized_error_class)).length;
  return {
    summary: `${rows.length} AI routing records reviewed for the last ${windowDays} days.`,
    output: { windowDays, requests: rows.length, recordedCostUsd: Number(cost.toFixed(6)), averageLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null, errors },
  };
}

async function securityHealth(): Promise<HandlerResult> {
  const admin = createAnalyticsAdminClient();
  if (!admin) throw new Error("Supabase service-role environment is unavailable.");
  const [admins, risky] = await Promise.all([
    admin.from("platform_admins").select("user_id", { count: "exact", head: true }).eq("enabled", true),
    admin.from("automation_tasks").select("id,name,risk_level,requires_approval").eq("enabled", true).in("risk_level", ["high", "critical"]).eq("requires_approval", false),
  ]);
  if (admins.error) throw new Error("Automation access lookup failed.");
  if (risky.error) throw new Error("Automation risk lookup failed.");
  const unsafe = risky.data ?? [];
  return {
    status: unsafe.length === 0 ? "succeeded" : "failed",
    summary: unsafe.length === 0 ? "Admin automation guardrail check passed." : `${unsafe.length} high-risk automation tasks are enabled without approval gating.`,
    output: { enabledPlatformAdmins: admins.count ?? null, unsafeAutomationTasks: unsafe },
  };
}

function numericConfig(task: AutomationTask, key: string, fallback: number) {
  const value = Number(task.config?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

async function agencySeoDailyMonitoring(task: AutomationTask): Promise<HandlerResult> {
  const admin = createAnalyticsAdminClient();
  if (!admin) throw new Error("Supabase service-role environment is unavailable.");
  const maxSites = Math.max(1, Math.min(20, Math.round(numericConfig(task, "max_sites_per_run", 10))));
  const thresholds = {
    scoreDrop: numericConfig(task, "score_drop_threshold", 10),
    searchDropRatio: numericConfig(task, "search_drop_ratio", 0.3),
    minBaselineImpressions: numericConfig(task, "min_baseline_impressions", 20),
    minBaselineClicks: numericConfig(task, "min_baseline_clicks", 5),
  };

  const { data: sites, error } = await admin.from("agency_seo_sites")
    .select("id,organization_id,name,site_url")
    .eq("active", true)
    .order("updated_at", { ascending: true })
    .limit(maxSites);
  if (error) throw new Error("Automation database operation failed.");
  if (!sites?.length) return { status: "skipped", summary: "No active Agency SEO client websites are configured.", output: { processed: 0, skipReason: "no_active_sites" } };

  const results: Array<Record<string, unknown>> = [];
  for (const site of sites) {
    try {
      const result = await runAgencySeoSiteMonitoring({
        organizationId: site.organization_id,
        siteId: site.id,
        trigger: "scheduled",
        thresholds,
      });
      results.push({
        siteId: result.siteId,
        siteName: result.siteName,
        score: result.score,
        googleStatus: result.googleStatus,
        bingStatus: result.bingStatus,
        aiReady: result.aiReady,
        anomalyCount: result.anomalyCount,
        notificationCreated: result.notificationCreated,
        status: "succeeded",
      });
    } catch (siteError) {
      results.push({
        siteId: site.id,
        siteName: site.name,
        status: "failed",
        error: "Agency SEO client monitoring failed.",
      });
    }
  }

  const failed = results.filter((item) => item.status === "failed").length;
  const alerts = results.filter((item) => item.notificationCreated === true).length;
  return {
    status: failed > 0 ? "failed" : "succeeded",
    summary: `Agency SEO scheduled monitoring processed ${results.length} client site${results.length === 1 ? "" : "s"}; ${failed} failed; ${alerts} alert${alerts === 1 ? "" : "s"} created.`,
    output: { processed: results.length, failed, alerts, maxSites, results },
  };
}

async function configurationRequired(task: AutomationTask): Promise<HandlerResult> {
  const requiredProvider = typeof task.config?.required_integration === "string" ? task.config.required_integration : null;
  const requiredEnvironment = typeof task.config?.required_env === "string" ? task.config.required_env : null;
  return {
    status: "skipped",
    summary: `${task.name} needs an authorized external provider before it can run.`,
    output: { skipReason: task.configuration_status === "blocked" ? "configuration_blocked" : "configuration_required", configurationStatus: task.configuration_status, providerState: "CONFIGURATION_REQUIRED", requiredProvider, requiredEnvironment },
  };
}

const handlers: Record<string, (task: AutomationTask) => Promise<HandlerResult>> = {
  system_health: systemHealth,
  seo_site_health: seoSiteHealth,
  ai_usage_cost: aiUsageCost,
  security_health: securityHealth,
  core_web_vitals: (task) => runCoreWebVitalsMonitoring(task.config),
  search_index_monitoring: (task) => runSearchConsoleMonitoring(task.config),
  authority_monitoring: (task) => runCrawlyAuthorityMonitoring(task.config),
  agency_seo_daily_monitoring: agencySeoDailyMonitoring,
};

/**
 * Every attempted trigger creates an auditable terminal record. Manual invocations must
 * first pass the platform-admin server action and include its authenticated actor id.
 * Provider calls never run when a task is disabled, approval-gated or disconnected.
 */
export async function executeAutomationTask(taskId: string, triggerType: AutomationTrigger, initiatedBy?: string | null) {
  if (triggerType === "manual" && !initiatedBy) throw new Error("MANUAL_TRIGGER_REQUIRES_PLATFORM_ADMIN");
  const admin = createAnalyticsAdminClient();
  if (!admin) throw new Error("Automation database connection is unavailable.");
  const { data: task, error: taskError } = await admin.from("automation_tasks").select("*").eq("id", taskId).single();
  if (taskError || !task) throw new Error("Automation task could not be loaded.");
  const typedTask = task as AutomationTask;

  const { data: run, error: runError } = await admin.from("automation_task_runs")
    .insert({ task_id: taskId, trigger_type: triggerType, initiated_by: initiatedBy ?? null, status: "queued" }).select("id").single();
  if (runError?.code === "23505") {
    // The partial unique index protects the active execution. A terminal skipped row
    // is allowed alongside it and makes concurrent triggers observable.
    const now = new Date().toISOString();
    const summary = "Duplicate trigger skipped: this task already has an active run.";
    const { data: duplicate, error: duplicateError } = await admin.from("automation_task_runs")
      .insert({ task_id: taskId, trigger_type: triggerType, initiated_by: initiatedBy ?? null,
        status: "skipped", started_at: now, finished_at: now, duration_ms: 0,
        summary, output: { skipReason: "already_running" } }).select("id").single();
    if (duplicateError || !duplicate) throw new Error("Automation duplicate-trigger audit failed.");
    return { runId: duplicate.id, status: "skipped" as const, summary };
  }
  if (runError || !run) throw new Error("Automation run could not be queued.");

  const startedAt = new Date();
  let attempts = 1;
  try {
    const { error: startError } = await admin.from("automation_task_runs")
      .update({ status: "running", started_at: startedAt.toISOString() }).eq("id", run.id);
    if (startError) throw new Error("Automation database run-state update failed.");

    let result: HandlerResult;
    if (!typedTask.enabled) {
      result = { status: "skipped", summary: "Task disabled; execution was not started.",
        output: { skipReason: "task_disabled" } };
    } else if (typedTask.requires_approval || typedTask.risk_level === "high" || typedTask.risk_level === "critical") {
      result = { status: "skipped", summary: "Human approval is required before this task can run.",
        output: { skipReason: "approval_required" } };
    } else if (typedTask.configuration_status !== "ready") {
      result = await configurationRequired(typedTask);
    } else {
      let providerReady = true;
      if (typedTask.handler_key === "search_index_monitoring") {
        const { data: connection, error: connectionError } = await admin.from("platform_integrations")
          .select("status,enabled").eq("provider_key", "google_search_console").maybeSingle();
        if (connectionError) throw new Error("Automation database provider-readiness lookup failed.");
        providerReady = connection?.status === "connected" && connection.enabled === true;
      }
      if (!providerReady) {
        result = { status: "skipped", summary: "Search Console is disconnected; reconnect its read-only authorization.",
          output: { skipReason: "provider_disconnected", provider: "google_search_console" } };
      } else {
        const handler = handlers[typedTask.handler_key];
        if (!handler) throw new Error("Automation handler is not allowlisted.");
        const execution = await executeWithSafeRetry(() => handler(typedTask), {
          handlerKey: typedTask.handler_key,
          maxRetries: typedTask.max_retries,
          onAttempt: async (attempt) => {
            const { error: attemptError } = await admin.from("automation_task_runs")
              .update({ attempt }).eq("id", run.id);
            if (attemptError) throw new Error("Automation database attempt update failed.");
          },
        });
        result = execution.value;
        attempts = execution.attempts;
      }
    }

    const finishedAt = new Date();
    const status = result.status ?? "succeeded";
    const { error: terminalError } = await admin.from("automation_task_runs").update({
      status, attempt: attempts, finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      summary: result.summary, output: result.output ?? {},
      error_message: status === "failed" ? "AUTOMATION_CHECK_FAILED" : null,
    }).eq("id", run.id);
    if (terminalError) throw new Error("Automation database terminal-state update failed.");

    const { error: scheduleError } = await admin.from("automation_tasks").update({
      last_run_at: finishedAt.toISOString(),
      next_run_at: typedTask.enabled ? nextRun(typedTask.schedule_mode, finishedAt) : null,
      updated_at: finishedAt.toISOString(),
    }).eq("id", taskId);
    if (scheduleError) {
      // The run is already terminal; never execute the handler again because a
      // bookkeeping write failed. Record degraded dispatch in server logs.
      console.error("automation_schedule_metadata_failed", { runId: run.id });
      throw new Error("Automation database schedule update failed.");
    }
    return { runId: run.id, status, summary: result.summary };
  } catch (error) {
    const failureCode = error instanceof AutomationRetryExhausted
      ? error.failureCode : classifyAutomationFailure(error);
    attempts = error instanceof AutomationRetryExhausted ? error.attempts : attempts;
    const finishedAt = new Date();
    const { error: ledgerError } = await admin.from("automation_task_runs").update({
      status: "failed", attempt: attempts, finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      summary: `Automation failed (${failureCode}); operator review required.`,
      error_message: failureCode,
      output: { failureCode, attempts, retryable: false },
    }).eq("id", run.id);
    if (ledgerError) console.error("automation_failure_ledger_unavailable", { runId: run.id });
    const { error: scheduleError } = await admin.from("automation_tasks").update({
      last_run_at: finishedAt.toISOString(),
      next_run_at: typedTask.enabled ? nextRun(typedTask.schedule_mode, finishedAt) : null,
      updated_at: finishedAt.toISOString(),
    }).eq("id", taskId);
    if (scheduleError) console.error("automation_failure_schedule_unavailable", { runId: run.id });
    throw new Error(`AUTOMATION_${failureCode}`);
  }
}

export async function dispatchDueAutomationTasks() {
  const admin = createAnalyticsAdminClient();
  if (!admin) throw new Error("Automation database connection is unavailable.");
  const { data, error } = await admin.from("automation_tasks").select("id")
    .eq("enabled", true).eq("configuration_status", "ready")
    .lte("next_run_at", new Date().toISOString()).order("next_run_at").limit(10);
  if (error) throw new Error("Automation database due-task lookup failed.");
  const results: Array<{ taskId: string; status: string; summary: string }> = [];
  for (const task of data ?? []) {
    try {
      const result = await executeAutomationTask(task.id, "scheduled", null);
      results.push({ taskId: task.id, status: result.status, summary: result.summary });
    } catch {
      results.push({ taskId: task.id, status: "failed", summary: "Scheduled automation failed; inspect the run ledger." });
    }
  }
  return results;
}
