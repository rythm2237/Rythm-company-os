import "server-only";
import { createAnalyticsAdminClient } from "@/lib/supabase/analytics-admin";
import { runCoreWebVitalsMonitoring, runSearchConsoleMonitoring } from "@/lib/admin/automation/google-monitoring";
import { fetchPublicResource } from "@/lib/security/public-url";
import { redactSecretText } from "@/lib/security/redaction";

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
};

type HandlerResult = { status?: "succeeded" | "skipped"; summary: string; output?: Record<string, unknown> };

const SITE_ORIGIN = "https://rythm-os.com";

function nextRun(mode: AutomationTask["schedule_mode"], from = new Date()) {
  const next = new Date(from);
  if (mode === "manual") return null;
  if (mode === "daily") next.setUTCDate(next.getUTCDate() + 1);
  else if (mode === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else if (mode === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCHours(next.getUTCHours() + 1);
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
    return { path, ok: false, status: 0, durationMs: Date.now() - started, error: redactSecretText(error instanceof Error ? error.message : "fetch failed") };
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
  if (error) throw new Error(error.message);
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
  if (admins.error) throw new Error(admins.error.message);
  if (risky.error) throw new Error(risky.error.message);
  const unsafe = risky.data ?? [];
  return {
    summary: unsafe.length === 0 ? "Admin automation guardrail check passed." : `${unsafe.length} high-risk automation tasks are enabled without approval gating.`,
    output: { enabledPlatformAdmins: admins.count ?? null, unsafeAutomationTasks: unsafe },
  };
}

async function configurationRequired(task: AutomationTask): Promise<HandlerResult> {
  const requiredProvider = typeof task.config?.required_integration === "string" ? task.config.required_integration : null;
  const requiredEnvironment = task.config?.required_env === "GOOGLE_PAGESPEED_API_KEY" ? "GOOGLE_PAGESPEED_API_KEY" : null;
  return {
    status: "skipped",
    summary: `${task.name} needs an authorized external provider before it can run.`,
    output: { configurationStatus: task.configuration_status, providerState: "CONFIGURATION_REQUIRED", requiredProvider, requiredEnvironment },
  };
}

const handlers: Record<string, (task: AutomationTask) => Promise<HandlerResult>> = {
  system_health: systemHealth,
  seo_site_health: seoSiteHealth,
  ai_usage_cost: aiUsageCost,
  security_health: securityHealth,
  core_web_vitals: (task) => runCoreWebVitalsMonitoring(task.config),
  search_index_monitoring: (task) => runSearchConsoleMonitoring(task.config),
  authority_monitoring: configurationRequired,
};

export async function executeAutomationTask(taskId: string, triggerType: AutomationTrigger, initiatedBy?: string | null) {
  const admin = createAnalyticsAdminClient();
  if (!admin) throw new Error("Supabase service-role environment is unavailable.");
  const { data: task, error: taskError } = await admin.from("automation_tasks").select("*").eq("id", taskId).single();
  if (taskError || !task) throw new Error(taskError?.message ?? "Automation task not found.");
  const typedTask = task as AutomationTask;
  if (!typedTask.enabled && triggerType !== "manual") return { skipped: true, reason: "disabled" };

  const { data: run, error: runError } = await admin.from("automation_task_runs").insert({ task_id: taskId, trigger_type: triggerType, initiated_by: initiatedBy ?? null, status: "queued" }).select("id").single();
  if (runError) {
    if (runError.code === "23505") return { skipped: true, reason: "already_running" };
    throw new Error(runError.message);
  }

  const startedAt = new Date();
  await admin.from("automation_task_runs").update({ status: "running", started_at: startedAt.toISOString() }).eq("id", run.id);
  try {
    const handler = handlers[typedTask.handler_key];
    if (!handler) throw new Error(`No allowlisted automation handler exists for ${typedTask.handler_key}.`);
    const result = typedTask.configuration_status === "ready" ? await handler(typedTask) : await configurationRequired(typedTask);
    const finishedAt = new Date();
    const status = result.status ?? "succeeded";
    await Promise.all([
      admin.from("automation_task_runs").update({ status, finished_at: finishedAt.toISOString(), duration_ms: finishedAt.getTime() - startedAt.getTime(), summary: result.summary, output: result.output ?? {} }).eq("id", run.id),
      admin.from("automation_tasks").update({ last_run_at: finishedAt.toISOString(), next_run_at: typedTask.enabled ? nextRun(typedTask.schedule_mode, finishedAt) : null, updated_at: finishedAt.toISOString() }).eq("id", taskId),
    ]);
    return { runId: run.id, status, summary: result.summary };
  } catch (error) {
    const finishedAt = new Date();
    const message = redactSecretText(error instanceof Error ? error.message : "Automation execution failed.");
    await Promise.all([
      admin.from("automation_task_runs").update({ status: "failed", finished_at: finishedAt.toISOString(), duration_ms: finishedAt.getTime() - startedAt.getTime(), error_message: message }).eq("id", run.id),
      admin.from("automation_tasks").update({ last_run_at: finishedAt.toISOString(), next_run_at: typedTask.enabled ? nextRun(typedTask.schedule_mode, finishedAt) : null, updated_at: finishedAt.toISOString() }).eq("id", taskId),
    ]);
    throw error;
  }
}

export async function dispatchDueAutomationTasks() {
  const admin = createAnalyticsAdminClient();
  if (!admin) throw new Error("Supabase service-role environment is unavailable.");
  const { data, error } = await admin.from("automation_tasks").select("id").eq("enabled", true).eq("configuration_status", "ready").lte("next_run_at", new Date().toISOString()).order("next_run_at").limit(10);
  if (error) throw new Error(error.message);
  const results = [];
  for (const task of data ?? []) {
    try {
      results.push(await executeAutomationTask(task.id, "scheduled", null));
    } catch (taskError) {
      results.push({
        taskId: task.id,
        status: "failed",
        error: redactSecretText(taskError instanceof Error ? taskError.message : "Scheduled automation failed."),
      });
    }
  }
  return results;
}
