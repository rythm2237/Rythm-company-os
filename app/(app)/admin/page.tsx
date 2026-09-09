import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformAdminContext } from "@/lib/admin/authorization";

export const dynamic = "force-dynamic";

export default async function AdminStudioPage() {
  const context = await getPlatformAdminContext();
  if (!context) redirect("/command-center");
  const { supabase } = context;

  const [tasksResult, runsResult] = await Promise.all([
    supabase.from("automation_tasks").select("id,enabled,configuration_status,risk_level,next_run_at"),
    supabase.from("automation_task_runs").select("id,status,summary,created_at,automation_tasks(name)").order("created_at", { ascending: false }).limit(8),
  ]);

  const tasks = tasksResult.data ?? [];
  const runs = runsResult.data ?? [];
  const ready = tasks.filter((task) => task.configuration_status === "ready").length;
  const needsConfiguration = tasks.filter((task) => task.configuration_status === "needs_configuration").length;
  const enabled = tasks.filter((task) => task.enabled).length;
  const failures = runs.filter((run) => run.status === "failed").length;

  return (
    <main className="admin-studio">
      <section className="admin-hero">
        <div><p className="admin-kicker">PLATFORM ADMINISTRATION</p><h1>Admin Studio</h1><p>Operate, monitor and audit RYTHM Company OS itself. Platform administration is isolated from customer Company OS workspaces and tenant-owner permissions.</p></div>
        <Link className="admin-primary-action" href="/admin/automation">Open Automation Center</Link>
      </section>

      <section className="admin-metrics" aria-label="Admin Studio summary">
        <article><span>Automation tasks</span><strong>{tasks.length}</strong><small>{enabled} enabled</small></article>
        <article><span>Ready to run</span><strong>{ready}</strong><small>{needsConfiguration} need configuration</small></article>
        <article><span>Recent failures</span><strong>{failures}</strong><small>Across the latest {runs.length} runs</small></article>
        <article><span>Control model</span><strong>Admin only</strong><small>RLS + server-side allowlist</small></article>
      </section>

      <section className="admin-grid">
        <Link href="/admin/automation" className="admin-module"><span>AUTOMATION</span><h2>Automation Center</h2><p>Run tasks now, schedule recurring self-monitoring, inspect history and keep external dependencies explicit.</p><strong>Manage automation →</strong></Link>
        <article className="admin-module"><span>PLATFORM</span><h2>System Health</h2><p>Database, production endpoint and internal operational health checks are available as automation tasks.</p><strong>Controlled through Automation Center</strong></article>
        <article className="admin-module"><span>SEARCH</span><h2>SEO / GEO / AEO</h2><p>Canonical, robots, sitemap and key-page monitoring run natively. Search Console, CrUX and backlink providers remain configuration-gated.</p><strong>No fabricated external evidence</strong></article>
        <article className="admin-module"><span>AI OPERATIONS</span><h2>Usage & Cost</h2><p>Review recorded model usage, latency, errors and actual cost telemetry already captured by the AI gateway.</p><strong>Telemetry-backed</strong></article>
        <article className="admin-module"><span>SECURITY</span><h2>Governance</h2><p>High-risk automation remains fail-closed, handlers are allowlisted in code and platform admin access is distinct from tenant ownership.</p><strong>Human authority preserved</strong></article>
        <article className="admin-module"><span>INFRASTRUCTURE</span><h2>Deploys & Integrations</h2><p>Vercel deploy health, backup verification and external monitoring providers can be connected without changing the core task model.</p><strong>Provider adapters ready to extend</strong></article>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="admin-kicker">EXECUTION HISTORY</p><h2>Recent automation activity</h2></div><Link href="/admin/automation">View all tasks</Link></div>
        <div className="admin-run-list">
          {runs.length ? runs.map((run) => <article key={run.id}><div><strong>{(run.automation_tasks as { name?: string } | null)?.name ?? "Automation task"}</strong><span>{run.summary ?? "No summary recorded yet."}</span></div><div><span className={`admin-status admin-status-${run.status}`}>{run.status}</span><time>{new Date(run.created_at).toLocaleString("en-GB", { timeZone: "Europe/Budapest" })}</time></div></article>) : <p className="admin-empty">No automation executions have been recorded yet. Use <strong>Run now</strong> in Automation Center to create the first run.</p>}
        </div>
      </section>
    </main>
  );
}
