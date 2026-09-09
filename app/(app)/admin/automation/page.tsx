import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformAdminContext } from "@/lib/admin/authorization";
import { runAutomationNow, updateAutomationTask } from "../actions";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ message?: string; error?: string }> };

export default async function AdminAutomationCenterPage({ searchParams }: Props) {
  const query = await searchParams;
  const context = await getPlatformAdminContext();
  if (!context) redirect("/command-center");
  const { supabase } = context;

  const [tasksResult, runsResult, integrationsResult] = await Promise.all([
    supabase.from("automation_tasks").select("*").order("category").order("name"),
    supabase.from("automation_task_runs").select("id,task_id,status,trigger_type,summary,error_message,started_at,finished_at,created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("platform_integrations").select("provider_key,status,account_ref,property_ref,granted_scopes,last_verified_at,last_error").eq("provider_key", "google_search_console").maybeSingle(),
  ]);
  const tasks = tasksResult.data ?? [];
  const runs = runsResult.data ?? [];
  const searchConsole = integrationsResult.data;
  const dataError = tasksResult.error?.message || runsResult.error?.message || integrationsResult.error?.message;

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
            {searchConsole?.last_error ? <small className="automation-provider-error">{searchConsole.last_error}</small> : null}
          </div>
          <form action="/api/admin/integrations/google-search-console/connect" method="POST">
            <button className="admin-primary-action automation-run" type="submit">{searchConsole?.status === "connected" ? "Reconnect read-only" : "Connect read-only"}</button>
          </form>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="admin-kicker">AUTOMATION TASKS</p><h2>Manual + scheduled operations</h2></div><span>{tasks.length} registered tasks</span></div>
        <div className="automation-table-wrap"><table className="automation-table"><thead><tr><th>Task</th><th>State</th><th>Schedule</th><th>Last / next run</th><th>Controls</th></tr></thead><tbody>
          {tasks.map((task) => {
            const latest = runs.find((run) => run.task_id === task.id);
            return <tr key={task.id}>
              <td><span className="automation-category">{task.category}</span><strong>{task.name}</strong><small>{task.description}</small><code>{task.handler_key}</code></td>
              <td><span className={`admin-status ${task.enabled ? "admin-status-succeeded" : "admin-status-skipped"}`}>{task.enabled ? "enabled" : "disabled"}</span><span className={`admin-status ${task.configuration_status === "ready" ? "admin-status-succeeded" : "admin-status-skipped"}`}>{task.configuration_status.replaceAll("_", " ")}</span><small>Risk: {task.risk_level}{task.requires_approval ? " · approval required" : ""}</small>{latest ? <small>Latest: {latest.status}</small> : null}{latest?.error_message ? <small className="automation-provider-error">{latest.error_message}</small> : null}</td>
              <td><form action={updateAutomationTask} className="automation-schedule-form"><input type="hidden" name="taskId" value={task.id}/><label><span>Cadence</span><select name="scheduleMode" defaultValue={task.schedule_mode}><option value="manual">Manual only</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label className="automation-toggle"><input type="checkbox" name="enabled" defaultChecked={task.enabled}/><span>Enabled</span></label><button type="submit">Save</button></form></td>
              <td><small>Last</small><strong>{task.last_run_at ? new Date(task.last_run_at).toLocaleString("en-GB", { timeZone: "Europe/Budapest" }) : "Never"}</strong><small>Next</small><strong>{task.next_run_at ? new Date(task.next_run_at).toLocaleString("en-GB", { timeZone: "Europe/Budapest" }) : "Manual"}</strong></td>
              <td><form action={runAutomationNow}><input type="hidden" name="taskId" value={task.id}/><button className="admin-primary-action automation-run" type="submit">Run now</button></form>{task.configuration_status !== "ready" ? <small className="automation-note">Can be invoked, but will be recorded as skipped until its provider is configured.</small> : null}</td>
            </tr>;
          })}
        </tbody></table></div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="admin-kicker">RUN HISTORY</p><h2>Latest executions</h2></div><span>Audit-oriented evidence</span></div>
        <div className="admin-run-list">{runs.length ? runs.map((run) => {
          const task = tasks.find((item) => item.id === run.task_id);
          return <article key={run.id}><div><strong>{task?.name ?? "Automation task"}</strong><span>{run.summary ?? run.error_message ?? "Execution created."}</span><small>{run.trigger_type} trigger</small></div><div><span className={`admin-status admin-status-${run.status}`}>{run.status}</span><time>{new Date(run.created_at).toLocaleString("en-GB", { timeZone: "Europe/Budapest" })}</time></div></article>;
        }) : <p className="admin-empty">No runs yet.</p>}</div>
      </section>
    </main>
  );
}
