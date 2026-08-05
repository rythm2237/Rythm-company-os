import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { ExecuteValidationButton } from "./ExecuteValidationButton";

export const dynamic = "force-dynamic";

type Policy = {
  dry_run_execution_enabled: boolean;
  monthly_budget_usd: number;
  per_run_budget_usd: number;
  max_queued_runs: number;
  max_requests_per_hour: number;
  max_attempts: number;
  timeout_seconds: number;
};

type QueuedRun = {
  id: string;
  input_summary: string;
  budget_cap_usd: number;
  created_at: string;
  agents: { agent_code: string; name: string; enabled: boolean } | null;
};

async function ownerContext() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (!membership) redirect("/login?error=Owner%20authorization%20required.");
  return { supabase, user, organizationId: membership.organization_id as string };
}

async function updateRuntimePolicy(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await ownerContext();
  const enabled = String(formData.get("enabled") ?? "false") === "true";
  const monthlyBudget = Number(formData.get("monthlyBudget") ?? 25);
  const perRunBudget = Number(formData.get("perRunBudget") ?? 0.25);
  const maxQueued = Number(formData.get("maxQueued") ?? 20);
  const maxHourly = Number(formData.get("maxHourly") ?? 30);
  const maxAttempts = Number(formData.get("maxAttempts") ?? 2);
  const timeoutSeconds = Number(formData.get("timeoutSeconds") ?? 45);

  if (![monthlyBudget, perRunBudget, maxQueued, maxHourly, maxAttempts, timeoutSeconds].every(Number.isFinite)) {
    redirect("/readiness?error=Runtime%20policy%20contains%20invalid%20numbers.");
  }
  if (monthlyBudget < 0 || perRunBudget < 0 || perRunBudget > monthlyBudget || maxQueued < 1 || maxHourly < 1 || maxAttempts < 1 || maxAttempts > 5 || timeoutSeconds < 5 || timeoutSeconds > 180) {
    redirect("/readiness?error=Runtime%20policy%20is%20outside%20the%20allowed%20guardrails.");
  }

  const { error } = await supabase.from("runtime_policies").upsert({
    organization_id: organizationId,
    dry_run_execution_enabled: enabled,
    monthly_budget_usd: monthlyBudget,
    per_run_budget_usd: perRunBudget,
    max_queued_runs: Math.floor(maxQueued),
    max_requests_per_hour: Math.floor(maxHourly),
    max_attempts: Math.floor(maxAttempts),
    timeout_seconds: Math.floor(timeoutSeconds),
    updated_by_user_id: user.id,
  }, { onConflict: "organization_id" });
  if (error) redirect(`/readiness?error=${encodeURIComponent(error.message)}`);

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: enabled ? "runtime_policy.dry_run_enabled" : "runtime_policy.dry_run_disabled",
    object_type: "runtime_policy",
    object_id: organizationId,
    risk_level: enabled ? "medium" : "low",
    payload: { monthly_budget_usd: monthlyBudget, per_run_budget_usd: perRunBudget, max_queued_runs: maxQueued, max_requests_per_hour: maxHourly, max_attempts, timeout_seconds },
  });
  revalidatePath("/readiness");
  revalidatePath("/runtime");
  redirect(`/readiness?message=${enabled ? "Controlled%20dry-run%20policy%20enabled." : "Dry-run%20policy%20disabled."}`);
}

export default async function ReadinessPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, organizationId } = await ownerContext();
  const config = getRuntimeConfig();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [policyResult, queuedResult, spendResult, failedResult, auditResult] = await Promise.all([
    supabase.from("runtime_policies").select("dry_run_execution_enabled, monthly_budget_usd, per_run_budget_usd, max_queued_runs, max_requests_per_hour, max_attempts, timeout_seconds").eq("organization_id", organizationId).maybeSingle(),
    supabase.from("agent_runs").select("id, input_summary, budget_cap_usd, created_at, agents!inner(agent_code, name, enabled)").eq("organization_id", organizationId).eq("status", "queued").eq("agents.agent_code", "T-001").order("created_at", { ascending: true }).limit(20),
    supabase.from("agent_runs").select("cost_usd").eq("organization_id", organizationId).gte("created_at", monthStart.toISOString()),
    supabase.from("agent_runs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "failed").gte("created_at", monthStart.toISOString()),
    supabase.from("audit_events").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
  ]);

  const policy = policyResult.data as Policy | null;
  const queuedRuns = (queuedResult.data ?? []) as unknown as QueuedRun[];
  const monthlySpend = (spendResult.data ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
  const checks = [
    ["Supabase", config.supabaseConfigured, "Required database connection"],
    ["OpenAI key", config.openAIConfigured, "Required for controlled validation execution"],
    ["Dry-run model", Boolean(config.dryRunModel), "Set RYTHM_DRY_RUN_MODEL"],
    ["Environment execution switch", config.agentExecutionEnabled, "Set RYTHM_AGENT_EXECUTION_ENABLED=true only after migration"],
    ["External actions locked", !config.externalActionsEnabled, "Must remain false"],
    ["Database dry-run policy", Boolean(policy?.dry_run_execution_enabled), "Owner-controlled second execution lock"],
    ["Audit append-only migration", Boolean(policy), "Available after production-hardening migration"],
  ] as const;
  const readyToExecute = checks.every(([, ok]) => ok);

  return (
    <main className="command-shell">
      <header className="command-header">
        <div>
          <p className="eyebrow">RYTHM PRODUCTION READINESS</p>
          <h1>Controlled execution and hardening</h1>
          <p className="subtitle">Dual-lock activation, budget enforcement, immutable audit history, bounded retries, timeouts, and owner-triggered validation execution.</p>
        </div>
        <Link className="secondary-button" href="/runtime">Agent Runtime</Link>
      </header>

      <section className="organization-banner">
        <div><span>Implementation</span><strong>100%</strong></div>
        <div><span>Execution readiness</span><strong>{readyToExecute ? "Ready" : "Locked"}</strong></div>
        <div><span>External actions</span><strong>{config.externalActionsEnabled ? "Unsafe configuration" : "Disabled"}</strong></div>
      </section>

      {params.message ? <p className="form-success">{params.message}</p> : null}
      {params.error ? <p className="form-error">{params.error}</p> : null}

      <section className="metrics-grid" style={{ marginTop: 18 }}>
        <article className="metric-card"><span>Monthly estimated spend</span><strong>${monthlySpend.toFixed(6)}</strong></article>
        <article className="metric-card"><span>Queued validation runs</span><strong>{queuedRuns.length}</strong></article>
        <article className="metric-card"><span>Failed runs this month</span><strong>{failedResult.count ?? 0}</strong></article>
        <article className="metric-card"><span>Audit events</span><strong>{auditResult.count ?? 0}</strong></article>
      </section>

      <section className="executive-grid" style={{ marginTop: 18 }}>
        <article className="panel panel-wide">
          <div className="panel-heading"><div><p className="label">Release gates</p><h2>Production checks</h2></div><span className="pill">{checks.filter(([, ok]) => ok).length}/{checks.length} passed</span></div>
          <div className="data-list">
            {checks.map(([name, ok, description]) => (
              <div className="data-row" key={name}><div><strong>{name}</strong><span>{description}</span></div><b className={ok ? "state-active" : "state-paused"}>{ok ? "PASS" : "LOCKED"}</b></div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><p className="label">Owner policy</p><h2>Runtime limits</h2></div></div>
          {policy ? (
            <form action={updateRuntimePolicy} className="auth-form">
              <label>Dry-run execution<select name="enabled" defaultValue={String(policy.dry_run_execution_enabled)}><option value="false">Disabled</option><option value="true">Enabled</option></select></label>
              <label>Monthly budget (USD)<input name="monthlyBudget" type="number" min="0" step="0.01" defaultValue={policy.monthly_budget_usd} required /></label>
              <label>Per-run budget (USD)<input name="perRunBudget" type="number" min="0" step="0.01" defaultValue={policy.per_run_budget_usd} required /></label>
              <label>Maximum queued runs<input name="maxQueued" type="number" min="1" max="500" defaultValue={policy.max_queued_runs} required /></label>
              <label>Maximum requests per hour<input name="maxHourly" type="number" min="1" max="1000" defaultValue={policy.max_requests_per_hour} required /></label>
              <label>Maximum attempts<input name="maxAttempts" type="number" min="1" max="5" defaultValue={policy.max_attempts} required /></label>
              <label>Timeout seconds<input name="timeoutSeconds" type="number" min="5" max="180" defaultValue={policy.timeout_seconds} required /></label>
              <button type="submit">Save governed runtime policy</button>
            </form>
          ) : <p className="empty-state">Apply the production-hardening migration to create runtime policy controls.</p>}
        </article>
      </section>

      <section className="panel panel-wide" style={{ marginTop: 18 }}>
        <div className="panel-heading"><div><p className="label">Controlled execution queue</p><h2>T-001 validation runs</h2></div><span className="pill">Human-triggered only</span></div>
        {queuedRuns.length ? queuedRuns.map((run) => (
          <div className="data-row" key={run.id} style={{ alignItems: "center" }}>
            <div><strong>{run.agents?.name ?? "Runtime Validation Agent"}</strong><span>{run.input_summary} · cap ${Number(run.budget_cap_usd).toFixed(2)}</span></div>
            <ExecuteValidationButton runId={run.id} disabled={!readyToExecute} />
          </div>
        )) : <p className="empty-state">No queued T-001 validation runs. Create one in Agent Runtime.</p>}
      </section>

      <section className="panel panel-wide" style={{ marginTop: 18 }}>
        <div className="panel-heading"><div><p className="label">Operational runbook</p><h2>Emergency controls</h2></div></div>
        <div className="compact-list">
          <div><strong>Immediate kill switch</strong><span>Set RYTHM_AGENT_EXECUTION_ENABLED=false in Vercel.</span></div>
          <div><strong>Database kill switch</strong><span>Set Dry-run execution to Disabled on this page.</span></div>
          <div><strong>External action lock</strong><span>Keep RYTHM_EXTERNAL_ACTIONS_ENABLED=false.</span></div>
          <div><strong>Incident response</strong><span>Disable both switches, preserve audit events, review failed run and approval records, then reopen only after root-cause review.</span></div>
        </div>
      </section>
    </main>
  );
}
