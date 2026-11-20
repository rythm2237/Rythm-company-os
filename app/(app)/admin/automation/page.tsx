import { SubmitButton } from "@/components/ui/Button";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformAdminContext } from "@/lib/admin/authorization";
import { redactSecretText } from "@/lib/security/redaction";
import { runAutomationNow, updateAutomationTask } from "../actions";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ message?: string; error?: string; page?: string }> };

export default async function AdminAutomationCenterPage({ searchParams }: Props) {
  const query = await searchParams;
  const context = await getPlatformAdminContext();
  if (!context) redirect("/command-center");
  const { supabase } = context;
  const requestedPage = Number(query.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;
  const pageSize = 30;

  const [tasksResult, runsResult, integrationsResult, incidentsResult, failedCountResult, skippedCountResult] = await Promise.all([
    supabase.from("automation_tasks").select("*").order("category").order("name"),
    supabase.from("automation_task_runs").select("id,task_id,status,trigger_type,summary,error_message,started_at,finished_at,created_at", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1),
    supabase.from("platform_integrations").select("provider_key,status,account_ref,property_ref,granted_scopes,last_verified_at,last_error").eq("provider_key", "google_search_console").maybeSingle(),
    supabase.from("automation_task_runs").select("id,task_id,status,trigger_type,summary,error_message,created_at,output").in("status", ["failed", "skipped"]).order("created_at", { ascending: false }).limit(20),
    supabase.from("automation_task_runs").select("id", { head: true, count: "exact" }).eq("status", "failed"),
    supabase.from("automation_task_runs").select("id", { head: true, count: "exact" }).eq("status", "skipped"),
  ]);
  const tasks = tasksResult.data ?? [];
  const runs = runsResult.data ?? [];
  const searchConsole = integrationsResult.data;
  const incidents = incidentsResult.data ?? [];
  const totalRuns = runsResult.count ?? 0;
  const failedCount = failedCountResult.count ?? 0;
  const skippedCount = skippedCountResult.count ?? 0;
  const dataError = tasksResult.error?.message || runsResult.error?.message ||
    integrationsResult.error?.message || incidentsResult.error?.message ||
    failedCountResult.error?.message || skippedCountResult.error?.message;

  return (
    <main className="admin-studio">
      <section className="admin-hero admin-hero-compact">
        <div><p className="admin-kicker">ADMIN STUDIO / SELF-OPERATIONS</p><h1>Admin Automation Center</h1><p>Run platform checks on demand or schedule recurring self-monitoring. External providers stay explicitly configuration-gated until real credentials and evidence sources exist.</p></div>
        <Link className="admin-secondary-action" href="/admin">Admin Studio</Link>
      </section>

      {query.message ? <p className="form-success" role="status">{query.message}</p> : null}
      {query.error ? <p className="form-error" role="alert">{query.error}</p> : null}
      {dataError ? <p className="form-error" role="alert">Automation Center data could not be loaded: {dataError}</p> : null}

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="admin-kicker">PROVIDER CONNECTION</p><h2>Google Search Console</h2></div><span className={`admin-status ${searchConsole?.status === "connected" ? "admin-status-succeeded" : "admin-status-skipped"}`}>{searchConsole?.status ?? "configuration required"}</span></div>
        <div className="automation-provider">
          <div>
            <p>Read-only monitoring for <strong>{searchConsole?.property_ref ?? "sc-domain:rythm-os.com"}</strong>. OAuth credentials are stored in Supabase Vault and are never returned to the browser.</p>
            {searchConsole?.account_ref ? <small>Authorized account: {searchConsole.account_ref}</small> : null}
            {searchConsole?.last_verified_at ? <small>Last verified: {new Date(searchConsole.last_verified_at).toLocaleString("en-GB", { timeZone: "Europe/Budapest" })}</small> : null}
            {searchConsole?.last_error ? <small className="automation-provider-error">{redactSecretText(searchConsole.last_error)}</small> : null}
          </div>
          <form action="/api/admin/integrations/google-search-console/connect" method="POST">
            <SubmitButton className="admin-primary-action automation-run" type="submit">{searchConsole?.status === "connected" ? "Reconnect read-only" : "Connect read-only"}</SubmitButton>
          </form>
        </div>
      </section>

      <section className="admin-panel" aria-label="Automation run status">
        <div className="admin-panel-heading"><div><p className="admin-kicker">RUN INTEGRITY</p><h2>All-time execution status</h2></div><span>{totalRuns} recorded runs</span></div>
        <p role={failedCount ? "alert" : "status"}><strong>{failedCount} failed</strong> · <strong>{skippedCount} skipped</strong> · {Math.max(0, totalRuns - failedCount - skippedCount)} other runs. All outcomes remain in the audit history.</p>
        <h3>Recent failed and skipped runs</h3>
        <div className="admin-run-list">
          {incidents.length ? incidents.map((run) => {
            const task = tasks.find((item) => item.id === run.task_id);
            const details = run.output && typeof run.output === "object" && !Array.isArray(run.output)
              ? run.output as Record<string, unknown> : {};
            const reason = typeof details.skipReason === "string" ? details.skipReason : typeof details.failureCode === "string" ? details.failureCode : null;
            return <article key={run.id}>
              <div><strong>{task?.name ?? "Automation task"}</strong>
                <span>{redactSecretText(run.summary ?? run.error_message ?? "Outcome recorded.", 300)}</span>
                {reason ? <small>Reason: {reason.replaceAll("_", " ")}</small> : null}
                <small>{run.trigger_type} trigger</small>
              </div>
              <div><span className={`admin-status admin-status-${run.status}`}>{run.status}</span><time>{new Date(run.created_at).toLocaleString("en-GB", { timeZone: "Europe/Budapest" })}</time></div>
            </article>;
          }) : <p className="admin-empty">No failed or skipped runs recorded.</p>}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="admin-kicker">AUTOMATION TASKS</p><h2>Manual + scheduled operations</h2></div><span>{tasks.length} registered tasks</span></div>
        <div className="automation-table-wrap"><table className="automation-table"><thead><tr><th>Task</th><th>State</th><th>Schedule</th><th>Last / next run</th><th>Controls</th></tr></thead><tbody>
          {tasks.map((task) => {
            const latest = runs.find((run) => run.task_id === task.id);
            return <tr key={task.id}>
              <td><span className="automation-category">{task.category}</span><strong>{task.name}</strong><small>{task.description}</small><code>{task.handler_key}</code></td>
              <td><span className={`admin-status ${task.enabled ? "admin-status-succeeded" : "admin-status-skipped"}`}>{task.enabled ? "enabled" : "disabled"}</span><span className={`admin-status ${task.configuration_status === "ready" ? "admin-status-succeeded" : "admin-status-skipped"}`}>{task.configuration_status.replaceAll("_", " ")}</span><small>Risk: {task.risk_level}{task.requires_approval ? " · approval required" : ""}</small>{latest ? <small>Latest: {latest.status}</small> : null}{latest?.error_message ? <small className="automation-provider-error">{redactSecretText(latest.error_message)}</small> : null}</td>
              <td><form action={updateAutomationTask} className="automation-schedule-form"><input type="hidden" name="taskId" value={task.id}/><label><span>Cadence</span><select name="scheduleMode" defaultValue={task.schedule_mode}><option value="manual">Manual only</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label className="automation-toggle"><input type="checkbox" name="enabled" defaultChecked={task.enabled}/><span>Enabled</span></label><SubmitButton type="submit">Save</SubmitButton></form></td>
              <td><small>Last</small><strong>{task.last_run_at ? new Date(task.last_run_at).toLocaleString("en-GB", { timeZone: "Europe/Budapest" }) : "Never"}</strong><small>Next</small><strong>{task.next_run_at ? new Date(task.next_run_at).toLocaleString("en-GB", { timeZone: "Europe/Budapest" }) : "Manual"}</strong></td>
              <td><form action={runAutomationNow}><input type="hidden" name="taskId" value={task.id}/><SubmitButton className="admin-primary-action automation-run" type="submit">Run now</SubmitButton></form>{task.configuration_status !== "ready" ? <small className="automation-note">Can be invoked, but will be recorded as skipped until its provider is configured.</small> : null}</td>
            </tr>;
          })}
        </tbody></table></div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="admin-kicker">RUN HISTORY</p><h2>Latest executions</h2></div><span>Audit-oriented evidence</span></div>
        <div className="admin-run-list">{runs.length ? runs.map((run) => {
          const task = tasks.find((item) => item.id === run.task_id);
          return <article key={run.id}><div><strong>{task?.name ?? "Automation task"}</strong><span>{redactSecretText(run.summary ?? run.error_message ?? "Execution created.", 300)}</span><small>{run.trigger_type} trigger</small></div><div><span className={`admin-status admin-status-${run.status}`}>{run.status}</span><time>{new Date(run.created_at).toLocaleString("en-GB", { timeZone: "Europe/Budapest" })}</time></div></article>;
        }) : <p className="admin-empty">No runs yet.</p>}</div>
        <nav aria-label="Automation history pagination" className="admin-panel-heading">
          <span>Page {page} · {totalRuns} total runs</span>
          <span>
            {page > 1 ? <Link href={`/admin/automation?page=${page - 1}`}>Previous runs</Link> : null}
            {page * pageSize < totalRuns ? <Link href={`/admin/automation?page=${page + 1}`}>Next runs</Link> : null}
          </span>
        </nav>
      </section>
    </main>
  );
}
