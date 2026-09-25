import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformAdminContext } from "@/lib/admin/authorization";
import { INDEXNOW_KEY_LOCATION, verifyIndexNowKey } from "@/lib/integrations/adapters/indexnow";
import { submitIndexNowFromAdmin } from "./actions";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ message?: string; error?: string }> };

type AuditPayload = {
  provider_key?: string;
  submitted?: number;
  provider_status?: number;
  accepted?: boolean;
  occurred_at?: string;
  source?: string;
};

export default async function AdminIndexNowPage({ searchParams }: Props) {
  const query = await searchParams;
  const context = await getPlatformAdminContext();
  if (!context) redirect("/command-center");

  const [{ data: auditRows, error: auditError }, keyStatus] = await Promise.all([
    context.supabase
      .from("audit_events")
      .select("id,actor_type,actor_user_id,payload,created_at")
      .eq("event_type", "seo.indexnow_submission")
      .order("created_at", { ascending: false })
      .limit(10),
    verifyIndexNowKey(),
  ]);

  const submissions = auditRows ?? [];
  const latest = submissions[0];
  const latestPayload = (latest?.payload ?? {}) as AuditPayload;

  return (
    <main className="admin-studio">
      <section className="admin-hero admin-hero-compact">
        <div>
          <p className="admin-kicker">ADMIN STUDIO / SEO</p>
          <h1>IndexNow</h1>
          <p>Verify RYTHM&apos;s IndexNow ownership key and submit new, changed or removed public URLs for faster discovery by participating search engines.</p>
        </div>
        <Link className="admin-secondary-action" href="/admin">Admin Studio</Link>
      </section>

      {query.message ? <p className="form-success" role="status">{query.message}</p> : null}
      {query.error ? <p className="form-error" role="alert">{query.error}</p> : null}
      {auditError ? <p className="form-error" role="alert">Submission history could not be loaded: {auditError.message}</p> : null}

      <section className="admin-metrics" aria-label="IndexNow status">
        <article>
          <span>Ownership key</span>
          <strong>{keyStatus.verified ? "Verified" : "Not verified"}</strong>
          <small>HTTP {keyStatus.status || "unreachable"}</small>
        </article>
        <article>
          <span>Last submission</span>
          <strong>{latestPayload.accepted === undefined ? "None" : latestPayload.accepted ? "Accepted" : "Rejected"}</strong>
          <small>{latest ? new Date(latest.created_at).toLocaleString("en-GB", { timeZone: "Europe/Budapest" }) : "No recorded submission"}</small>
        </article>
        <article>
          <span>Provider status</span>
          <strong>{latestPayload.provider_status ?? "—"}</strong>
          <small>{latestPayload.submitted ? `${latestPayload.submitted} URL${latestPayload.submitted === 1 ? "" : "s"}` : "Awaiting first submission"}</small>
        </article>
        <article>
          <span>Scope</span>
          <strong>rythm-os.com</strong>
          <small>Only canonical HTTPS URLs on this host are allowed</small>
        </article>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div><p className="admin-kicker">KEY VERIFICATION</p><h2>Ownership proof</h2></div>
          <span className={`admin-status ${keyStatus.verified ? "admin-status-succeeded" : "admin-status-failed"}`}>{keyStatus.verified ? "verified" : "attention"}</span>
        </div>
        <div className="indexnow-key-card">
          <div>
            <p>The IndexNow key file must remain publicly reachable at the canonical production host.</p>
            <code>{INDEXNOW_KEY_LOCATION}</code>
          </div>
          <a className="admin-primary-action automation-run" href={INDEXNOW_KEY_LOCATION} target="_blank" rel="noreferrer">Open key file</a>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="admin-kicker">SUBMIT URLS</p><h2>Notify IndexNow</h2></div><span>Admin-authorized</span></div>
        <div className="indexnow-submit-grid">
          <form action={submitIndexNowFromAdmin} className="indexnow-submit-card">
            <input type="hidden" name="homepageOnly" value="1" />
            <div><strong>Homepage smoke test</strong><p>Submit the production homepage and confirm provider acceptance.</p></div>
            <button className="admin-primary-action automation-run" type="submit">Submit homepage</button>
          </form>

          <form action={submitIndexNowFromAdmin} className="indexnow-submit-card indexnow-submit-custom">
            <div><strong>Custom URL batch</strong><p>Enter one URL per line or separate URLs with commas. Only <code>https://rythm-os.com</code> URLs are accepted.</p></div>
            <textarea name="urls" rows={7} placeholder={"https://rythm-os.com/\nhttps://rythm-os.com/ai-company-operating-system"} required />
            <button className="admin-primary-action automation-run" type="submit">Submit URLs</button>
          </form>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="admin-kicker">SUBMISSION HISTORY</p><h2>Latest IndexNow events</h2></div><span>{submissions.length} shown</span></div>
        <div className="admin-run-list">
          {submissions.length ? submissions.map((item) => {
            const payload = (item.payload ?? {}) as AuditPayload;
            const accepted = payload.accepted === true;
            return <article key={item.id}>
              <div>
                <strong>{payload.submitted ?? 0} URL{payload.submitted === 1 ? "" : "s"} submitted</strong>
                <span>{payload.source === "admin_indexnow_console" ? "Admin IndexNow console" : "IndexNow integration"}</span>
              </div>
              <div>
                <span className={`admin-status ${accepted ? "admin-status-succeeded" : "admin-status-failed"}`}>HTTP {payload.provider_status ?? "—"}</span>
                <time>{new Date(item.created_at).toLocaleString("en-GB", { timeZone: "Europe/Budapest" })}</time>
              </div>
            </article>;
          }) : <p className="admin-empty">No IndexNow submissions have been recorded yet.</p>}
        </div>
      </section>
    </main>
  );
}
