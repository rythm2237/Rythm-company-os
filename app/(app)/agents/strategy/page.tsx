import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type RequestRow = {
  id: string;
  project_context: string;
  question: string;
  request_language: string;
  meeting_mode: boolean;
  meeting_language: string | null;
  web_research_requested: boolean;
  web_approval_request_id: string | null;
  status: string;
  created_at: string;
};

async function ownerContext() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("organization_members")
    .select("organization_id").eq("user_id", user.id).eq("role", "owner").maybeSingle();
  if (!membership) redirect("/login?error=Owner%20authorization%20required.");
  return { supabase, user, organizationId: membership.organization_id as string };
}

async function createStrategyRequest(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await ownerContext();
  const projectContext = String(formData.get("projectContext") ?? "").trim();
  const question = String(formData.get("question") ?? "").trim();
  const requestLanguage = String(formData.get("requestLanguage") ?? "auto");
  const meetingMode = formData.get("meetingMode") === "on";
  const meetingLanguage = String(formData.get("meetingLanguage") ?? "").trim() || null;
  const internalContext = String(formData.get("internalContext") ?? "").trim();
  const webResearchRequested = formData.get("webResearchRequested") === "on";
  if (projectContext.length < 2 || question.length < 10) redirect("/agents/strategy?error=Project%20and%20strategic%20question%20are%20required.");
  if (meetingMode && !meetingLanguage) redirect("/agents/strategy?error=Choose%20the%20meeting%20language%20before%20starting.");

  const { data: agent } = await supabase.from("agents").select("id").eq("organization_id", organizationId).eq("agent_code", "A-101").maybeSingle();
  if (!agent) redirect("/agents/strategy?error=Strategy%20Analyst%20is%20not%20installed.");
  const status = webResearchRequested ? "awaiting_web_approval" : "queued";
  const { data: request, error } = await supabase.from("strategy_work_requests").insert({
    organization_id: organizationId,
    agent_id: agent.id,
    project_context: projectContext,
    question,
    request_language: requestLanguage,
    meeting_mode: meetingMode,
    meeting_language: meetingLanguage,
    internal_context: internalContext || null,
    web_research_requested: webResearchRequested,
    status,
    created_by_user_id: user.id,
  }).select("id").single();
  if (error || !request) redirect(`/agents/strategy?error=${encodeURIComponent(error?.message ?? "Request could not be created.")}`);

  let approvalId: string | null = null;
  if (webResearchRequested) {
    const { data: approval, error: approvalError } = await supabase.from("approval_requests").insert({
      organization_id: organizationId,
      subject_type: "strategy_web_research",
      subject_id: request.id,
      title: `Authorize web research: ${projectContext}`,
      summary: question,
      risk_level: "medium",
      requested_by_agent_id: agent.id,
      status: "pending",
      conditions: ["Research only", "No external actions", "Internal sources remain primary", "Cite web evidence separately"],
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    }).select("id").single();
    if (approvalError || !approval) redirect(`/agents/strategy?error=${encodeURIComponent(approvalError?.message ?? "Approval request could not be created.")}`);
    approvalId = approval.id;
    await supabase.from("strategy_work_requests").update({ web_approval_request_id: approval.id }).eq("id", request.id);
  }

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "strategy_request.created",
    object_type: "strategy_work_request",
    object_id: request.id,
    risk_level: webResearchRequested ? "medium" : "low",
    payload: { project_context: projectContext, language: requestLanguage, meeting_mode: meetingMode, web_research_requested: webResearchRequested, approval_request_id: approvalId },
  });
  revalidatePath("/agents/strategy");
  revalidatePath("/approvals");
  redirect(`/agents/strategy?request=${request.id}&message=${webResearchRequested ? "Web%20research%20approval%20requested." : "Internal-first%20strategy%20request%20queued."}`);
}

export default async function StrategyPage({ searchParams }: { searchParams: Promise<{ request?: string; message?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, organizationId } = await ownerContext();
  const { data: agent } = await supabase.from("agents").select("id, name, role_title, enabled, risk_ceiling, specification_version").eq("organization_id", organizationId).eq("agent_code", "A-101").maybeSingle();
  const { data: rows } = await supabase.from("strategy_work_requests").select("id, project_context, question, request_language, meeting_mode, meeting_language, web_research_requested, web_approval_request_id, status, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(50);
  const requests = (rows ?? []) as RequestRow[];
  const selected = requests.find(r => r.id === params.request) ?? requests[0] ?? null;

  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">A-101 · STRATEGY ANALYST</p><h1>Internal-first strategic analysis</h1><p className="subtitle">Cross-project advisory analysis with language matching, project isolation, and Human CEO approval before web research.</p></div><Link className="secondary-button" href="/runtime">Agent Runtime</Link></header>
    <section className="organization-banner"><div><span>State</span><strong>{agent?.enabled ? "Enabled" : "Paused"}</strong></div><div><span>Risk ceiling</span><strong>{agent?.risk_ceiling ?? "medium"}</strong></div><div><span>Specification</span><strong>v{agent?.specification_version ?? "2.0"}</strong></div></section>
    {params.message ? <p className="form-success">{params.message}</p> : null}{params.error ? <p className="form-error">{params.error}</p> : null}
    <section className="panel panel-wide" style={{ marginTop: 18 }}><div className="panel-heading"><div><p className="label">Governed workbench</p><h2>Strategy requests</h2></div><span className="pill">{requests.length} requests</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px,.7fr) minmax(0,1.2fr) minmax(320px,.9fr)", gap: 18 }}>
        <div>{requests.length ? requests.map(r => <Link key={r.id} href={`/agents/strategy?request=${r.id}`} style={{ display: "block", padding: "14px 0", borderBottom: "1px solid #e7eaf0", textDecoration: "none" }}><strong>{r.project_context}</strong><span style={{ display: "block", color: "#717b8e", marginTop: 5 }}>{r.status} · {r.request_language}</span></Link>) : <p className="empty-state">No strategy requests yet.</p>}</div>
        <article style={{ border: "1px solid #dfe4ec", borderRadius: 16, padding: 20, background: "#f8f9fb" }}>{selected ? <><p className="label">Selected request</p><h2>{selected.project_context}</h2><p style={{ lineHeight: 1.65 }}>{selected.question}</p><div className="compact-list"><div><strong>Status</strong><span>{selected.status}</span></div><div><strong>Language</strong><span>{selected.meeting_mode ? `Meeting: ${selected.meeting_language}` : selected.request_language}</span></div><div><strong>Evidence policy</strong><span>{selected.web_research_requested ? "Internal first · web approval required" : "Internal only"}</span></div></div>{selected.web_approval_request_id ? <Link className="secondary-button" href={`/approvals?approval=${selected.web_approval_request_id}`} style={{ display: "inline-block", marginTop: 16 }}>Open web approval</Link> : null}</> : <p className="empty-state">Select a request to inspect.</p>}</article>
        <form action={createStrategyRequest} className="auth-form"><p className="label">Human CEO entry</p><h2>Create strategy request</h2><label>Project context<input name="projectContext" required placeholder="Rythm Company OS, Career OS, Life Balance..." /></label><label>Strategic question<textarea name="question" required rows={4} /></label><label>Internal context<textarea name="internalContext" rows={4} placeholder="Relevant internal facts, decisions, constraints, or links" /></label><label>Output language<select name="requestLanguage" defaultValue="auto"><option value="auto">Match request language</option><option value="fa">Persian</option><option value="en">English</option></select></label><label><input type="checkbox" name="meetingMode" /> This is a meeting</label><label>Meeting language<select name="meetingLanguage" defaultValue=""><option value="">Ask/select before meeting</option><option value="fa">Persian</option><option value="en">English</option></select></label><label><input type="checkbox" name="webResearchRequested" /> Request CEO approval for web research</label><button className="primary-button">Create governed request</button></form>
      </div>
    </section>
  </main>;
}
