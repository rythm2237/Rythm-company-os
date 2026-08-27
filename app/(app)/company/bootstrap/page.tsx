import Link from "next/link";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import {
  confirmCompanyBootstrap,
  startCompanyBootstrap,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function CompanyBootstrapPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requireOwnerOrganizationContext();
  const params = await searchParams;

  const [{ data: integrations }, { data: runs }] = await Promise.all([
    context.supabase
      .from("organization_integrations")
      .select("id,display_name,provider_key,status,granted_scopes,last_verified_at")
      .eq("organization_id", context.organizationId)
      .eq("provider_key", "google_workspace")
      .eq("enabled", true)
      .order("updated_at", { ascending: false }),
    context.supabase
      .from("company_bootstrap_runs")
      .select(
        "id,status,source_kinds,proposal,proposal_digest,proposal_version,confirmed_at,applied_at,failure_code,safe_failure_detail,created_at,updated_at",
      )
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const selectedRun = (runs ?? []).find((run) => run.id === params.run) ?? runs?.[0] ?? null;
  const proposal =
    selectedRun?.proposal && typeof selectedRun.proposal === "object"
      ? (selectedRun.proposal as Record<string, any>)
      : null;
  const structure = proposal?.proposed_structure ?? {};
  const departments = Array.isArray(structure.departments) ? structure.departments : [];
  const agents = Array.isArray(structure.agents) ? structure.agents : [];

  return (
    <main className="command-shell">
      <header className="command-header">
        <div>
          <p className="eyebrow">RYTHM COMPANY AUTO-BOOTSTRAP · PHASE 3</p>
          <h1>Discover first. Propose second. Apply only after Human CEO approval.</h1>
          <p className="subtitle">
            The pilot uses read-only Gmail metadata and Google Calendar events to infer an initial company structure. Raw email bodies and attachments are not part of the bootstrap evidence model.
          </p>
        </div>
        <Link className="secondary-button" href="/company">
          Company
        </Link>
      </header>

      {params.error ? <p className="form-error">{params.error}</p> : null}
      {params.message ? <p className="form-success">{params.message}</p> : null}

      <section className="executive-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="label">Pilot source</p>
              <h2>Gmail + Google Calendar</h2>
            </div>
            <span className="pill">read-only discovery</span>
          </div>
          <p className="subtitle">
            Discovery must use a connected Google Workspace integration and the Phase 2 Execution Gateway. No email is sent, no event is created, and no company structure is changed during discovery.
          </p>
          <form action={startCompanyBootstrap} className="stacked-form" style={{ marginTop: 18 }}>
            <label>
              Google Workspace connection
              <select name="integrationId" required defaultValue="">
                <option value="">Select connected account</option>
                {(integrations ?? [])
                  .filter((integration) => integration.status === "connected")
                  .map((integration) => (
                    <option value={integration.id} key={integration.id}>
                      {integration.display_name}
                    </option>
                  ))}
              </select>
            </label>
            <button className="primary-button">Start governed discovery</button>
          </form>
          {!(integrations ?? []).some((integration) => integration.status === "connected") ? (
            <p className="empty-state" style={{ marginTop: 14 }}>
              No connected Google Workspace integration is available yet. Connect it in Integrations before starting discovery.
            </p>
          ) : null}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="label">Governance contract</p>
              <h2>What Phase 3 may do</h2>
            </div>
          </div>
          <div className="compact-list">
            <div>
              <strong>Read</strong>
              <span>Bounded Gmail metadata and Calendar event metadata through governed tools.</span>
            </div>
            <div>
              <strong>Propose</strong>
              <span>Departments, Agent roles and operating hints with evidence and confidence.</span>
            </div>
            <div>
              <strong>Confirm</strong>
              <span>The Human CEO confirms an exact immutable proposal digest.</span>
            </div>
            <div>
              <strong>Apply</strong>
              <span>Blocked until a separate governed execution is approved. Initial Agents remain paused with external actions disabled.</span>
            </div>
          </div>
        </article>
      </section>

      <section className="panel panel-wide" style={{ marginTop: 18 }}>
        <div className="panel-heading">
          <div>
            <p className="label">Bootstrap ledger</p>
            <h2>Recent runs</h2>
          </div>
          <span className="pill">{runs?.length ?? 0} run(s)</span>
        </div>
        <div className="data-list">
          {(runs ?? []).length ? (
            (runs ?? []).map((run) => (
              <div className="data-row" key={run.id}>
                <div>
                  <strong>{run.status} · {run.proposal_version}</strong>
                  <span>{new Date(run.created_at).toLocaleString()} · {run.source_kinds?.join(" + ")}</span>
                  {run.proposal_digest ? <span>Proposal digest: {run.proposal_digest.slice(0, 16)}…</span> : null}
                  {run.failure_code ? <span>Failure: {run.failure_code}</span> : null}
                </div>
                <Link className="secondary-button" href={`/company/bootstrap?run=${run.id}`}>
                  Review
                </Link>
              </div>
            ))
          ) : (
            <p className="empty-state">No bootstrap run has been created.</p>
          )}
        </div>
      </section>

      {selectedRun ? (
        <section className="panel panel-wide" style={{ marginTop: 18 }}>
          <div className="panel-heading">
            <div>
              <p className="label">Exact proposal review</p>
              <h2>{selectedRun.status}</h2>
            </div>
            <span className="pill">{proposal?.confidence ?? "awaiting discovery"}</span>
          </div>

          {selectedRun.status === "collecting" ? (
            <p className="empty-state">
              The run exists, but source discovery has not completed. Provider reads must be executed through the Phase 2 gateway before a proposal can be recorded.
            </p>
          ) : null}

          {proposal ? (
            <>
              <div className="executive-grid" style={{ marginTop: 12 }}>
                <article className="panel">
                  <p className="label">Departments</p>
                  <div className="compact-list">
                    {departments.length ? departments.map((department: any, index: number) => (
                      <div key={`${department.key ?? department.name}-${index}`}>
                        <strong>{department.name ?? department.key ?? "Department"}</strong>
                        <span>{department.description ?? ""}</span>
                      </div>
                    )) : <p className="empty-state">No department suggested.</p>}
                  </div>
                </article>
                <article className="panel">
                  <p className="label">Initial Agents</p>
                  <div className="compact-list">
                    {agents.length ? agents.map((agent: any, index: number) => (
                      <div key={`${agent.role_code ?? agent.role}-${index}`}>
                        <strong>{agent.role ?? agent.name ?? "Agent"}</strong>
                        <span>{agent.department_key ?? "unassigned"} · paused · external actions disabled</span>
                      </div>
                    )) : <p className="empty-state">No Agent suggested.</p>}
                  </div>
                </article>
              </div>

              <div style={{ marginTop: 18 }}>
                <p className="security-note">
                  Confirmation locks only this proposal digest. It does not apply changes. Applying the company remains a separate Phase 2 governed execution.
                </p>
                {selectedRun.status === "proposed" && selectedRun.proposal_digest ? (
                  <form action={confirmCompanyBootstrap} className="stacked-form" style={{ maxWidth: 720 }}>
                    <input type="hidden" name="runId" value={selectedRun.id} />
                    <input type="hidden" name="proposalDigest" value={selectedRun.proposal_digest} />
                    <label>
                      Type CONFIRM BOOTSTRAP
                      <input name="confirmation" required autoComplete="off" />
                    </label>
                    <button className="primary-button">Confirm exact proposal</button>
                  </form>
                ) : null}
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
