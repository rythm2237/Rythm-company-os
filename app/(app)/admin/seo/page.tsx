import Link from "next/link";
import { redirect } from "next/navigation";
import { SeoVisualAnalytics } from "@/components/admin/SeoVisualAnalytics";
import { getPlatformAdminContext } from "@/lib/admin/authorization";
import type { SeoProviderEvidence } from "@/lib/integrations/adapters/seo-provider-analytics";
import type { SeoFinding } from "@/lib/seo/intelligence-agent";
import type { SeoCheck, SeoCheckStatus } from "@/lib/seo/monitoring-engine";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { runSeoMonitoringFromAdmin } from "./actions";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ message?: string; error?: string }> };
type SeoAuditPayload = {
  engine_version?: string; agent_version?: string; knowledge_version?: string; site?: string; checked_at?: string; duration_ms?: number; score?: number;
  counts?: Record<SeoCheckStatus, number>; checks?: SeoCheck[]; provider_evidence?: SeoProviderEvidence; intelligence_summary?: string; findings?: SeoFinding[]; guardrails?: string[];
  ai_reasoning?: string | null; ai_correlation_id?: string | null; ai_routing_mode?: string | null; ai_model?: string | null; ai_reasoning_error?: string | null;
};
const severityOrder = ["critical", "high", "medium", "low", "info"];
function statusClass(status: SeoCheckStatus) { return status === "pass" ? "admin-status-succeeded" : status === "fail" ? "admin-status-failed" : "admin-status-pending"; }

export default async function AdminSeoPage({ searchParams }: Props) {
  const query = await searchParams;
  const context = await getPlatformAdminContext(); if (!context) redirect("/command-center");
  const adminSupabase = createServerSupabaseClient();
  const historyQuery = adminSupabase ? adminSupabase.from("audit_events").select("id,payload,created_at").eq("event_type", "seo.monitoring_run").order("created_at", { ascending: false }).limit(12) : Promise.resolve({ data: null, error: { message: "Server admin client is not configured." } });
  const { data: auditRows, error: auditError } = await historyQuery;
  const runs = auditRows ?? []; const payload = (runs[0]?.payload ?? {}) as SeoAuditPayload; const checks = payload.checks ?? [];
  const findings = [...(payload.findings ?? [])].sort((a,b) => severityOrder.indexOf(a.severity)-severityOrder.indexOf(b.severity));
  const scores = runs.slice().reverse().map(run => ({ score: Number(((run.payload ?? {}) as SeoAuditPayload).score ?? 0), created_at: run.created_at }));

  return <main className="admin-studio">
    <section className="admin-hero admin-hero-compact"><div><p className="admin-kicker">ADMIN STUDIO / SEO</p><h1>SEO Intelligence</h1><p>Search performance, indexing evidence, technical health and AI analysis in one operational view.</p></div><div className="admin-actions-row"><Link className="admin-secondary-action" href="/admin/seo/indexnow">IndexNow</Link><Link className="admin-secondary-action" href="/admin">Admin Studio</Link></div></section>
    {query.message ? <p className="form-success" role="status">{query.message}</p> : null}{query.error ? <p className="form-error" role="alert">{query.error}</p> : null}{auditError ? <p className="form-error" role="alert">SEO history could not be loaded: {auditError.message}</p> : null}

    <section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">LIVE SNAPSHOT</p><h2>Refresh SEO intelligence</h2></div><span>GSC + Bing + technical checks</span></div><form action={runSeoMonitoringFromAdmin}><button className="admin-primary-action automation-run" type="submit">Run SEO monitoring</button></form></section>

    <section className="admin-metrics" aria-label="SEO health"><article><span>Technical health</span><strong>{payload.score ?? "—"}{payload.score != null ? "/100" : ""}</strong><small>{payload.checked_at ? new Date(payload.checked_at).toLocaleString("en-GB", { timeZone: "Europe/Budapest" }) : "No run yet"}</small></article><article><span>Checks passed</span><strong>{payload.counts?.pass ?? "—"}</strong><small>{checks.length ? `${checks.length} total checks` : "Awaiting run"}</small></article><article><span>Open findings</span><strong>{findings.length || 0}</strong><small>{findings.filter(f => ["critical","high"].includes(f.severity)).length} high/critical</small></article><article><span>AI analysis</span><strong>{payload.ai_reasoning ? "Ready" : payload.checked_at ? "Fallback" : "—"}</strong><small>{payload.ai_model ?? "Governed gateway"}</small></article></section>

    {payload.provider_evidence ? <SeoVisualAnalytics evidence={payload.provider_evidence} /> : <section className="admin-panel"><p className="admin-empty">Run the refreshed monitor once to populate Google Search Console and Bing visual analytics.</p></section>}

    <section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">HEALTH TREND</p><h2>Technical score history</h2></div><span>{scores.length} snapshots</span></div><div style={{ display:"flex", alignItems:"end", gap:8, height:150, paddingTop:12 }}>{scores.map((item,index) => <div key={`${item.created_at}-${index}`} title={`${item.score}/100 · ${new Date(item.created_at).toLocaleString("en-GB",{timeZone:"Europe/Budapest"})}`} style={{ flex:1, minWidth:12, height:`${Math.max(4,item.score)}%`, background:"currentColor", opacity:.18 + index / Math.max(1,scores.length)*.55, borderRadius:"6px 6px 2px 2px" }} />)}</div><div style={{display:"flex",justifyContent:"space-between",fontSize:11,opacity:.6}}><span>Older</span><span>Latest</span></div></section>

    <div className="admin-grid">
      <section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">AI INSIGHTS</p><h2>Prioritized findings</h2></div><span>{findings.length} open</span></div><div className="admin-run-list">{findings.length ? findings.map(f => <article key={f.id}><div><strong>{f.title}</strong><span>{f.explanation}</span><small>{f.recommendation}</small></div><div><span className={`admin-status ${f.severity === "critical" || f.severity === "high" ? "admin-status-failed" : "admin-status-pending"}`}>{f.severity}</span><small>{f.authority.replaceAll("_"," ")}</small></div></article>) : <p className="admin-empty">No deterministic findings in the latest snapshot.</p>}</div></section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">TECHNICAL EVIDENCE</p><h2>Latest checks</h2></div><span>{checks.length}</span></div><div className="admin-run-list">{checks.map(check => <article key={check.id}><div><strong>{check.title}</strong><span>{check.detail}</span></div><span className={`admin-status ${statusClass(check.status)}`}>{check.status}</span></article>)}</div></section>
    </div>

    <section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">INTELLIGENCE AGENT</p><h2>Detailed analysis</h2></div><span>{payload.ai_reasoning ? "available" : "fallback"}</span></div><details><summary style={{cursor:"pointer",fontWeight:700}}>Open evidence-bound AI analysis</summary>{payload.ai_reasoning ? <p style={{ whiteSpace:"pre-wrap", marginTop:16 }}>{payload.ai_reasoning}</p> : <p className="admin-empty">{payload.ai_reasoning_error ?? "AI reasoning has not run yet."}</p>}</details></section>

    <section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">GOVERNANCE</p><h2>Authority boundary</h2></div><span>Fail-safe</span></div><p><strong>READ + RECOMMEND:</strong> allowed. <strong>LOW-RISK EXECUTION:</strong> governed integration layer only. <strong>Canonical, robots, redirects, sitemap and structured-data mutations:</strong> human approval required.</p></section>
  </main>;
}
