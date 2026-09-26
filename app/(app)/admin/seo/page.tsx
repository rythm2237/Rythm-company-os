import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformAdminContext } from "@/lib/admin/authorization";
import type { SeoFinding } from "@/lib/seo/intelligence-agent";
import type { SeoCheck, SeoCheckStatus } from "@/lib/seo/monitoring-engine";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { runSeoMonitoringFromAdmin } from "./actions";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ message?: string; error?: string }> };

type SeoAuditPayload = {
  engine_version?: string;
  agent_version?: string;
  knowledge_version?: string;
  site?: string;
  checked_at?: string;
  duration_ms?: number;
  score?: number;
  counts?: Record<SeoCheckStatus, number>;
  checks?: SeoCheck[];
  intelligence_summary?: string;
  findings?: SeoFinding[];
  guardrails?: string[];
  ai_reasoning?: string | null;
  ai_correlation_id?: string | null;
  ai_routing_mode?: string | null;
  ai_model?: string | null;
  ai_reasoning_error?: string | null;
};

const severityOrder = ["critical", "high", "medium", "low", "info"];

function statusClass(status: SeoCheckStatus) {
  if (status === "pass") return "admin-status-succeeded";
  if (status === "fail") return "admin-status-failed";
  return "admin-status-pending";
}

export default async function AdminSeoPage({ searchParams }: Props) {
  const query = await searchParams;
  const context = await getPlatformAdminContext();
  if (!context) redirect("/command-center");

  const adminSupabase = createServerSupabaseClient();
  const historyQuery = adminSupabase
    ? adminSupabase.from("audit_events").select("id,payload,created_at,actor_type,actor_user_id").eq("event_type", "seo.monitoring_run").order("created_at", { ascending: false }).limit(10)
    : Promise.resolve({ data: null, error: { message: "Server admin client is not configured." } });

  const { data: auditRows, error: auditError } = await historyQuery;
  const runs = auditRows ?? [];
  const latest = runs[0];
  const payload = (latest?.payload ?? {}) as SeoAuditPayload;
  const checks = payload.checks ?? [];
  const findings = [...(payload.findings ?? [])].sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity));

  return (
    <main className="admin-studio">
      <section className="admin-hero admin-hero-compact">
        <div>
          <p className="admin-kicker">ADMIN STUDIO / SEO</p>
          <h1>SEO Intelligence</h1>
          <p>Deterministic monitoring plus governed AI reasoning for the canonical RYTHM production site. Provider-backed indexing and performance signals remain evidence-gated.</p>
        </div>
        <div className="admin-actions-row">
          <Link className="admin-secondary-action" href="/admin/seo/indexnow">IndexNow</Link>
          <Link className="admin-secondary-action" href="/admin">Admin Studio</Link>
        </div>
      </section>

      {query.message ? <p className="form-success" role="status">{query.message}</p> : null}
      {query.error ? <p className="form-error" role="alert">{query.error}</p> : null}
      {auditError ? <p className="form-error" role="alert">SEO history could not be loaded: {auditError.message}</p> : null}

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="admin-kicker">MONITORING ENGINE</p><h2>Run production checks</h2></div><span>Admin-authorized</span></div>
        <p>The engine checks availability, canonical metadata, crawl directives, sitemap shape, structured-data presence and IndexNow ownership, then sends the evidence snapshot through the governed AI gateway for reasoning.</p>
        <form action={runSeoMonitoringFromAdmin}><button className="admin-primary-action automation-run" type="submit">Run SEO monitoring</button></form>
      </section>

      <section className="admin-metrics" aria-label="SEO monitoring status">
        <article><span>Health score</span><strong>{payload.score ?? "—"}{payload.score != null ? "/100" : ""}</strong><small>{payload.checked_at ? `Last run ${new Date(payload.checked_at).toLocaleString("en-GB", { timeZone: "Europe/Budapest" })}` : "No monitoring run recorded"}</small></article>
        <article><span>Passed</span><strong>{payload.counts?.pass ?? "—"}</strong><small>Deterministic checks</small></article>
        <article><span>Attention</span><strong>{(payload.counts?.warning ?? 0) + (payload.counts?.fail ?? 0) + (payload.counts?.unavailable ?? 0)}</strong><small>{findings.length} intelligence findings</small></article>
        <article><span>AI reasoning</span><strong>{payload.ai_reasoning ? "Available" : payload.checked_at ? "Fallback" : "—"}</strong><small>{payload.ai_model ?? payload.ai_routing_mode ?? "Governed gateway"}</small></article>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="admin-kicker">SEO INTELLIGENCE AGENT</p><h2>Prioritized findings</h2></div><span>{findings.length} open</span></div>
        {payload.intelligence_summary ? <p>{payload.intelligence_summary}</p> : <p className="admin-empty">Run the monitoring engine to create the first evidence-backed intelligence report.</p>}
        <div className="admin-run-list">
          {findings.map((finding) => <article key={finding.id}><div><strong>{finding.title}</strong><span>{finding.explanation}</span><small>{finding.recommendation}</small></div><div><span className={`admin-status ${finding.severity === "critical" || finding.severity === "high" ? "admin-status-failed" : "admin-status-pending"}`}>{finding.severity}</span><small>{finding.authority.replaceAll("_", " ")}</small></div></article>)}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="admin-kicker">AI REASONING</p><h2>Evidence-bound analysis</h2></div><span>{payload.ai_reasoning ? "ready" : "fallback"}</span></div>
        {payload.ai_reasoning ? <p style={{ whiteSpace: "pre-wrap" }}>{payload.ai_reasoning}</p> : <p className="admin-empty">{payload.ai_reasoning_error ?? "AI reasoning has not run yet. Deterministic findings remain available independently."}</p>}
        {payload.ai_correlation_id ? <small>Correlation: {payload.ai_correlation_id} · Knowledge: {payload.knowledge_version ?? "—"}</small> : null}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="admin-kicker">EVIDENCE</p><h2>Latest deterministic checks</h2></div><span>{checks.length} checks</span></div>
        <div className="admin-run-list">
          {checks.map((check) => <article key={check.id}><div><strong>{check.title}</strong><span>{check.detail}</span>{check.url ? <small>{check.url}</small> : null}</div><span className={`admin-status ${statusClass(check.status)}`}>{check.status}</span></article>)}
          {!checks.length ? <p className="admin-empty">No evidence snapshot has been recorded yet.</p> : null}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="admin-kicker">GOVERNANCE</p><h2>Agent authority</h2></div><span>Fail-safe</span></div>
        <p><strong>READ + RECOMMEND:</strong> allowed. <strong>LOW-RISK EXECUTION:</strong> must use the governed integration layer. <strong>HIGH-RISK SEO CHANGES:</strong> human approval required.</p>
        <p>The agent must not claim Google/Bing indexing, ranking impact or causality unless the corresponding provider evidence is available.</p>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="admin-kicker">RUN HISTORY</p><h2>Latest monitoring snapshots</h2></div><span>{runs.length} shown</span></div>
        <div className="admin-run-list">
          {runs.map((run) => { const item = (run.payload ?? {}) as SeoAuditPayload; return <article key={run.id}><div><strong>{item.score ?? "—"}/100</strong><span>{item.intelligence_summary ?? "SEO monitoring run"}</span></div><time>{new Date(run.created_at).toLocaleString("en-GB", { timeZone: "Europe/Budapest" })}</time></article>; })}
          {!runs.length ? <p className="admin-empty">No SEO monitoring runs have been recorded yet.</p> : null}
        </div>
      </section>
    </main>
  );
}
