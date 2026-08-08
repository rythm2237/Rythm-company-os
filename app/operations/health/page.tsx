import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type PostureRow = { control:string; status:string; detail:string };
type IncidentRow = {
  id:string; incident_key:string; severity:string; source:string; error_code:string|null;
  safe_message:string; status:string; occurrence_count:number; correlation_id:string;
  first_seen_at:string; last_seen_at:string;
};

const fmt=(value:string)=>new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));

export default async function OperationsHealth(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members")
    .select("organization_id").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership) redirect("/login?error=Owner%20authorization%20required.");
  const organizationId=membership.organization_id as string;

  const [postureResult,incidentResult]=await Promise.all([
    supabase.rpc("get_security_posture",{target_organization_id:organizationId}),
    supabase.from("operational_incidents")
      .select("id,incident_key,severity,source,error_code,safe_message,status,occurrence_count,correlation_id,first_seen_at,last_seen_at")
      .eq("organization_id",organizationId).order("last_seen_at",{ascending:false}).limit(50),
  ]);

  const posture=(postureResult.data??[]) as PostureRow[];
  const incidents=(incidentResult.data??[]) as IncidentRow[];
  const postureUnavailable=postureResult.error?.message ?? null;
  const incidentUnavailable=incidentResult.error?.message ?? null;
  const failed=posture.filter(p=>p.status!=="PASS").length;
  const openIncidents=incidents.filter(i=>i.status!=="resolved").length;
  const criticalHigh=incidents.filter(i=>i.status!=="resolved" && (i.severity==="critical"||i.severity==="high")).length;

  return <main className="command-shell">
    <header className="command-header">
      <div>
        <p className="eyebrow">RYTHM OPERATIONS HEALTH · SEC-001</p>
        <h1>Security posture and operational recovery.</h1>
        <p className="subtitle">Owner-only diagnostics for RLS, governed history and runtime incidents. This surface is read-only and grants no execution authority.</p>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <Link className="secondary-button" href="/attention">Attention Center</Link>
        <Link className="secondary-button" href="/executive-review">Executive Review</Link>
        <Link className="secondary-button" href="/workflow/traceability">Traceability</Link>
        <Link className="secondary-button" href="/command-center">Command Center</Link>
      </div>
    </header>

    <section className="organization-banner">
      <div><span>Security checks failing</span><strong>{postureUnavailable?"—":failed}</strong></div>
      <div><span>Open incidents</span><strong>{incidentUnavailable?"—":openIncidents}</strong></div>
      <div><span>High / critical incidents</span><strong>{incidentUnavailable?"—":criticalHigh}</strong></div>
    </section>

    <section className="executive-grid" style={{marginTop:18}}>
      <article className="panel">
        <div className="panel-heading"><div><p className="label">Security controls</p><h2>Production posture</h2></div><span className="pill">Owner diagnostic</span></div>
        {postureUnavailable?<p className="form-error">Security posture is unavailable until the Batch 3 migration is applied: {postureUnavailable}</p>:null}
        <div className="data-list">
          {posture.length?posture.map(row=><div className="data-row" key={row.control}><div><strong>{row.control.replaceAll("_"," ")}</strong><span>{row.detail}</span></div><div className="row-meta"><b className={row.status==="PASS"?"state-active":"state-paused"}>{row.status}</b></div></div>):!postureUnavailable?<p className="empty-state">No posture checks returned.</p>:null}
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading"><div><p className="label">Recovery contract</p><h2>Safe retry rules</h2></div></div>
        <div className="compact-list">
          <div><strong>Retry only transient failures</strong><span>Valid meeting turns, decisions, approvals and actions are never recreated merely because a request is retried.</span></div>
          <div><strong>Correlation first</strong><span>Operational failures use a correlation ID and stable incident key so repeated failures converge instead of creating noise.</span></div>
          <div><strong>History is append-only</strong><span>Audit and canonical workflow history cannot be edited or deleted by application roles.</span></div>
          <div><strong>No authority from recovery</strong><span>Recovery never approves a decision, closes a legal gate, changes scope or enables an external action.</span></div>
        </div>
      </article>
    </section>

    <section className="panel panel-wide" style={{marginTop:18}}>
      <div className="panel-heading"><div><p className="label">Operational incidents</p><h2>Deduplicated incident register</h2></div><span className="pill">latest 50</span></div>
      {incidentUnavailable?<p className="form-error">Incident register is unavailable until the Batch 3 migration is applied: {incidentUnavailable}</p>:null}
      <div className="data-list">
        {incidents.length?incidents.map(i=><div className="data-row" key={i.id}><div><strong>{i.severity.toUpperCase()} · {i.incident_key}</strong><span>{i.source} · {i.safe_message}{i.error_code?` · ${i.error_code}`:""}</span><span>First {fmt(i.first_seen_at)} · Last {fmt(i.last_seen_at)} · correlation {i.correlation_id}</span></div><div className="row-meta"><span>{i.occurrence_count}×</span><b className={i.status==="resolved"?"state-active":"state-paused"}>{i.status}</b></div></div>):!incidentUnavailable?<p className="empty-state">No operational incidents recorded.</p>:null}
      </div>
    </section>
  </main>;
}
