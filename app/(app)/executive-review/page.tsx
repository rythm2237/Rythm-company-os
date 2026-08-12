import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type Risk = "low" | "medium" | "high" | "critical";
type IntakeRow = { id:string; intake_key:string; item_type:string; title:string; status:string; priority:number; risk_level:Risk; revisit_trigger:string|null; project_id:string|null; routed_meeting_id:string|null; updated_at:string };
type DecisionRow = { id:string; decision_key:string; title:string; status:string; risk_level:Risk; created_at:string };
type ApprovalRow = { id:string; title:string; status:string; risk_level:Risk; created_at:string };
type ActionRow = { id:string; action_code:string|null; title:string; status:string; priority:number; risk_level:Risk|null; due_at:string|null; created_at:string };
type SessionRow = { id:string; meeting_id:string; decision_question:string; status:string; legal_triage_status:string|null; created_at:string };

const fmt=(value:string|null)=>value?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)):"Not set";
const riskWeight:Record<Risk,number>={low:0,medium:1,high:2,critical:3};

async function ownerContext(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership) redirect("/login?error=Owner%20authorization%20required.");
  return {supabase,organizationId:membership.organization_id as string};
}

function startOfWeek(){
  const now=new Date();
  const day=(now.getDay()+6)%7;
  const start=new Date(now);
  start.setDate(now.getDate()-day);
  start.setHours(0,0,0,0);
  return start;
}

export default async function WeeklyExecutiveReview(){
  const {supabase,organizationId}=await ownerContext();
  const now=new Date();
  const nowIso=now.toISOString();
  const weekStart=startOfWeek();
  const weekEnd=new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6); weekEnd.setHours(23,59,59,999);

  const [intakeResult,decisionResult,approvalResult,actionResult,legalResult]=await Promise.all([
    supabase.from("intake_items").select("id,intake_key,item_type,title,status,priority,risk_level,revisit_trigger,project_id,routed_meeting_id,updated_at").eq("organization_id",organizationId).in("status",["inbox","to_review","research_required","scheduled_for_review","under_evaluation","deferred","accepted_for_decision"]).order("updated_at",{ascending:false}).limit(100),
    supabase.from("decisions").select("id,decision_key,title,status,risk_level,created_at").eq("organization_id",organizationId).in("status",["draft","review"]).order("created_at",{ascending:false}).limit(50),
    supabase.from("approval_requests").select("id,title,status,risk_level,created_at").eq("organization_id",organizationId).eq("status","pending").order("created_at",{ascending:false}).limit(50),
    supabase.from("action_items").select("id,action_code,title,status,priority,risk_level,due_at,created_at").eq("organization_id",organizationId).in("status",["open","in_progress","blocked"]).order("priority").limit(100),
    supabase.from("meeting_agent_sessions").select("id,meeting_id,decision_question,status,legal_triage_status,created_at").eq("organization_id",organizationId).in("legal_triage_status",["pending","recommended"]).order("created_at",{ascending:false}).limit(50),
  ]);

  const intake=(intakeResult.data??[]) as IntakeRow[];
  const decisions=(decisionResult.data??[]) as DecisionRow[];
  const approvals=(approvalResult.data??[]) as ApprovalRow[];
  const actions=(actionResult.data??[]) as ActionRow[];
  const legal=(legalResult.data??[]) as SessionRow[];

  const resurfaced=intake
    .filter(item=>item.status==="deferred" || item.status==="to_review" || item.status==="scheduled_for_review" || Boolean(item.revisit_trigger))
    .sort((a,b)=>riskWeight[b.risk_level]-riskWeight[a.risk_level] || a.priority-b.priority || new Date(a.updated_at).getTime()-new Date(b.updated_at).getTime());
  const blocked=actions.filter(a=>a.status==="blocked");
  const overdue=actions.filter(a=>a.due_at && a.due_at<nowIso && a.status!=="completed");
  const activeActions=actions.filter(a=>a.status!=="blocked");
  const criticalHigh=[...approvals,...decisions].filter(item=>item.risk_level==="critical"||item.risk_level==="high").length + blocked.filter(a=>a.risk_level==="critical"||a.risk_level==="high").length;

  return <main className="command-shell">
    <header className="command-header">
      <div><p className="eyebrow">RYTHM WEEKLY EXECUTIVE REVIEW · WF-009</p><h1>Review the company before the next commitment.</h1><p className="subtitle">A repeatable Human CEO review of open decisions, approvals, legal gates, execution risks and resurfaced Ideas / Issues. This view is read-only and never authorizes execution.</p></div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Link className="secondary-button" href="/attention">Attention Center</Link><Link className="secondary-button" href="/ideas">Idea Inbox</Link><Link className="secondary-button" href="/workflow/traceability">Traceability</Link><Link className="secondary-button" href="/projects/operating">Operating View</Link></div>
    </header>

    <section className="organization-banner">
      <div><span>Review window</span><strong>{fmt(weekStart.toISOString()).split(",")[0]} → {fmt(weekEnd.toISOString()).split(",")[0]}</strong></div>
      <div><span>Critical / high attention</span><strong>{criticalHigh}</strong></div>
      <div><span>Authority</span><strong>Human CEO / Owner</strong></div>
    </section>

    <section className="metrics-grid" style={{marginTop:18}}>
      <article className="metric-card"><span>Open decisions</span><strong>{decisions.length}</strong></article>
      <article className="metric-card"><span>Pending approvals</span><strong>{approvals.length}</strong></article>
      <article className="metric-card"><span>Legal gates</span><strong>{legal.length}</strong></article>
      <article className="metric-card"><span>Blocked actions</span><strong>{blocked.length}</strong></article>
      <article className="metric-card"><span>Overdue actions</span><strong>{overdue.length}</strong></article>
      <article className="metric-card"><span>Ideas resurfaced</span><strong>{resurfaced.length}</strong></article>
    </section>

    <section className="executive-grid" style={{marginTop:18}}>
      <article className="panel panel-wide">
        <div className="panel-heading"><div><p className="label">1 · Governance</p><h2>Decisions, approvals and legal gates</h2></div><span className="pill">Review before commitment</span></div>
        <div className="data-list">
          {decisions.map(d=><Link href={`/decisions?decision=${d.id}&status=${d.status}`} className="data-row" style={{textDecoration:"none"}} key={`d-${d.id}`}><div><strong>{d.decision_key} · {d.title}</strong><span>{d.status} · {d.risk_level} risk · {fmt(d.created_at)}</span></div></Link>)}
          {approvals.map(a=><Link href={`/approvals?approval=${a.id}&status=pending`} className="data-row" style={{textDecoration:"none"}} key={`a-${a.id}`}><div><strong>Approval · {a.title}</strong><span>{a.risk_level} risk · {fmt(a.created_at)}</span></div></Link>)}
          {legal.map(s=><Link href={`/meetings/room?meeting=${s.meeting_id}&session=${s.id}`} className="data-row" style={{textDecoration:"none"}} key={`l-${s.id}`}><div><strong>Legal · {s.decision_question}</strong><span>{s.legal_triage_status} · {fmt(s.created_at)}</span></div></Link>)}
          {!decisions.length&&!approvals.length&&!legal.length?<p className="empty-state">No open governance gates for this review.</p>:null}
        </div>
      </article>

      <article className="panel panel-wide">
        <div className="panel-heading"><div><p className="label">2 · Idea resurfacing</p><h2>Ideas / Issues due for executive reconsideration</h2></div><span className="pill">Revisit triggers preserved</span></div>
        <div className="data-list">
          {resurfaced.length?resurfaced.map(item=><Link href={`/ideas?item=${item.id}`} className="data-row" style={{textDecoration:"none"}} key={item.id}><div><strong>{item.intake_key} · {item.title}</strong><span>{item.status} · P{item.priority} · {item.risk_level} risk</span>{item.revisit_trigger?<span>Revisit trigger: {item.revisit_trigger}</span>:<span>Review context: active intake item</span>}</div><div className="row-meta"><span>{item.routed_meeting_id?"Meeting linked":"Not routed"}</span></div></Link>):<p className="empty-state">No Ideas / Issues currently require resurfacing.</p>}
        </div>
        <p className="security-note">Resurfacing is context only. The CEO must use Idea Inbox or a governed meeting to change status, route work or make a decision.</p>
      </article>

      <article className="panel">
        <div className="panel-heading"><div><p className="label">3 · Execution risk</p><h2>Blocked and overdue</h2></div></div>
        <div className="compact-list">
          {blocked.map(a=><div key={`b-${a.id}`}><Link href={`/actions?action=${a.id}&status=blocked`}><strong>{a.action_code?`${a.action_code} · `:""}{a.title}</strong></Link><span>Blocked · P{a.priority} · {a.risk_level??"unclassified"} risk</span></div>)}
          {overdue.map(a=><div key={`o-${a.id}`}><Link href={`/actions?action=${a.id}&status=${a.status}`}><strong>{a.action_code?`${a.action_code} · `:""}{a.title}</strong></Link><span>Overdue · due {fmt(a.due_at)}</span></div>)}
          {!blocked.length&&!overdue.length?<p className="empty-state">No blocked or overdue execution items.</p>:null}
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading"><div><p className="label">4 · Active execution</p><h2>Next operating commitments</h2></div></div>
        <div className="compact-list">{activeActions.slice(0,12).map(a=><div key={a.id}><Link href={`/actions?action=${a.id}&status=${a.status}`}><strong>{a.action_code?`${a.action_code} · `:""}{a.title}</strong></Link><span>{a.status} · P{a.priority} · due {fmt(a.due_at)}</span></div>)}{!activeActions.length?<p className="empty-state">No active execution commitments.</p>:null}</div>
      </article>

      <article className="panel panel-wide">
        <div className="panel-heading"><div><p className="label">Weekly close</p><h2>Human CEO review sequence</h2></div><span className="pill">Repeat weekly</span></div>
        <div className="compact-list"><div><strong>1. Resolve governance gates</strong><span>Review open decisions, approvals and legal conditions.</span></div><div><strong>2. Reconsider resurfaced ideas</strong><span>Open each relevant Idea / Issue and defer, research, route to meeting or promote under CEO control.</span></div><div><strong>3. Unblock execution</strong><span>Inspect blocked and overdue actions before adding new commitments.</span></div><div><strong>4. Confirm next commitments</strong><span>Use Operating View and Traceability to confirm the next governed project step.</span></div></div>
        <p className="security-note">This review does not approve decisions, authorize agents, change action state, start meetings or enable external actions.</p>
      </article>
    </section>
  </main>;
}
