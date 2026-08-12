import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type IntakeItem = {
  id: string;
  project_id: string | null;
  intake_key: string;
  item_type: "idea" | "issue";
  title: string;
  summary: string;
  category: string;
  why_it_matters: string | null;
  status: string;
  priority: number;
  risk_level: string;
  agent_relevance: unknown;
  revisit_trigger: string | null;
  routed_meeting_id: string | null;
  routed_at: string | null;
  created_at: string;
};

type Project = { id: string; project_code: string; name: string };
type Props = { searchParams: Promise<{ type?: string; status?: string; project?: string; message?: string; error?: string }> };

const statusOptions = [
  "inbox",
  "to_review",
  "research_required",
  "scheduled_for_review",
  "under_evaluation",
  "deferred",
  "accepted_for_decision",
  "rejected",
  "converted",
  "archived",
];

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function list(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Not set";
}

async function ownerContext() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (!membership) redirect("/login?error=Owner%20authorization%20required.");
  return { supabase, organizationId: membership.organization_id as string };
}

async function createIntake(formData: FormData) {
  "use server";
  const { supabase, organizationId } = await ownerContext();

  const itemType = String(formData.get("itemType") ?? "idea");
  const title = String(formData.get("title") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "general").trim() || "general";
  const whyItMatters = String(formData.get("whyItMatters") ?? "").trim() || null;
  const priority = Number(formData.get("priority") ?? 3);
  const riskLevel = String(formData.get("riskLevel") ?? "low");
  const agentText = String(formData.get("agentRelevance") ?? "").trim();
  const questionText = String(formData.get("questionsAssumptions") ?? "").trim();
  const revisitTrigger = String(formData.get("revisitTrigger") ?? "").trim() || null;

  if (!["idea", "issue"].includes(itemType) || title.length < 3 || summary.length < 10) {
    redirect("/ideas?error=Provide%20a%20valid%20type%2C%20title%20and%20summary.");
  }

  const agentRelevance = agentText ? agentText.split(",").map((value) => value.trim()).filter(Boolean) : [];
  const questionsAssumptions = questionText ? questionText.split("\n").map((value) => value.trim()).filter(Boolean) : [];

  const { error } = await supabase.rpc("create_intake_item", {
    target_organization_id: organizationId,
    target_item_type: itemType,
    target_title: title,
    target_summary: summary,
    target_project_id: projectId,
    target_category: category,
    target_why_it_matters: whyItMatters,
    target_questions_assumptions: questionsAssumptions,
    target_priority: priority,
    target_risk_level: riskLevel,
    target_agent_relevance: agentRelevance,
    target_revisit_trigger: revisitTrigger,
  });

  if (error) redirect(`/ideas?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/ideas");
  revalidatePath("/projects/operating");
  redirect("/ideas?message=Idea%20or%20Issue%20captured%20under%20Human%20CEO%20governance.");
}

async function updateStatus(formData: FormData) {
  "use server";
  const { supabase } = await ownerContext();
  const intakeId = String(formData.get("intakeId") ?? "");
  const status = String(formData.get("status") ?? "");
  const revisitTrigger = String(formData.get("revisitTrigger") ?? "").trim() || null;

  if (!intakeId || !statusOptions.includes(status)) redirect("/ideas?error=Invalid%20status%20update.");

  const { error } = await supabase.rpc("update_intake_item_status", {
    target_intake_item_id: intakeId,
    target_status: status,
    target_revisit_trigger: revisitTrigger,
  });

  if (error) redirect(`/ideas?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/ideas");
  redirect("/ideas?message=Intake%20status%20updated.");
}

async function routeToMeeting(formData: FormData) {
  "use server";
  const { supabase } = await ownerContext();
  const intakeId = String(formData.get("intakeId") ?? "");
  if (!intakeId) redirect("/ideas?error=Intake%20item%20not%20found.");

  const { data, error } = await supabase.rpc("route_intake_item_to_meeting", {
    target_intake_item_id: intakeId,
  });

  if (error) redirect(`/ideas?error=${encodeURIComponent(error.message)}`);
  const meetingId = typeof data === "string" ? data : "";
  revalidatePath("/ideas");
  revalidatePath("/meetings/room");
  revalidatePath("/projects/operating");
  redirect(meetingId
    ? `/meetings/room?meeting=${meetingId}&message=Draft%20meeting%20created%20from%20Idea%2FIssue.%20Select%20and%20authorize%20agents%20before%20starting.`
    : "/ideas?message=Draft%20meeting%20created.");
}

export default async function IdeaInboxPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, organizationId } = await ownerContext();

  const [projectsResult, intakeResult] = await Promise.all([
    supabase.from("projects")
      .select("id,project_code,name")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase.from("intake_items")
      .select("id,project_id,intake_key,item_type,title,summary,category,why_it_matters,status,priority,risk_level,agent_relevance,revisit_trigger,routed_meeting_id,routed_at,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const projects = (projectsResult.data ?? []) as Project[];
  const rawItems = (intakeResult.data ?? []) as IntakeItem[];
  const projectsById = new Map(projects.map((project) => [project.id, project]));

  const items = rawItems.filter((item) => {
    if (params.type && params.type !== item.item_type) return false;
    if (params.status && params.status !== item.status) return false;
    if (params.project && params.project !== item.project_id) return false;
    return true;
  });

  const openCount = rawItems.filter((item) => !["rejected", "converted", "archived"].includes(item.status)).length;
  const routedCount = rawItems.filter((item) => item.routed_meeting_id).length;
  const highRiskCount = rawItems.filter((item) => ["high", "critical"].includes(item.risk_level)).length;

  return (
    <main className="command-shell">
      <header className="command-header">
        <div>
          <p className="eyebrow">RYTHM IDEA / ISSUE INBOX · WF-007</p>
          <h1>Capture → Review → Governed Meeting</h1>
          <p className="subtitle">Turn raw ideas and operational issues into traceable project inputs without bypassing Human CEO authority.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="secondary-button" href="/projects/operating">Project Operating View</Link>
          <Link className="secondary-button" href="/meetings/room">Boardroom</Link>
          <Link className="secondary-button" href="/workflow/traceability">Workflow Traceability</Link>
          <Link className="secondary-button" href="/command-center">Command Center</Link>
        </div>
      </header>

      <section className="organization-banner">
        <div><span>Authority</span><strong>Human CEO / Owner</strong></div>
        <div><span>Open intake</span><strong>{openCount}</strong></div>
        <div><span>Routed to meetings</span><strong>{routedCount}</strong></div>
        <div><span>High / Critical risk</span><strong>{highRiskCount}</strong></div>
      </section>

      {params.message ? <p className="form-success" role="status" style={{ marginTop: 16 }}>{params.message}</p> : null}
      {params.error ? <p className="form-error" role="alert" style={{ marginTop: 16 }}>{params.error}</p> : null}

      <section className="executive-grid" style={{ marginTop: 18 }}>
        <article className="panel panel-wide">
          <div className="panel-heading"><div><p className="label">Inbox</p><h2>Ideas and Issues</h2></div><span className="pill">{items.length} shown · {rawItems.length} total</span></div>

          <form method="get" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(180px,1fr)) auto", gap: 10, marginBottom: 18 }}>
            <select name="type" defaultValue={params.type ?? ""} aria-label="Filter by type">
              <option value="">All types</option><option value="idea">Ideas</option><option value="issue">Issues</option>
            </select>
            <select name="status" defaultValue={params.status ?? ""} aria-label="Filter by status">
              <option value="">All statuses</option>{statusOptions.map((status) => <option value={status} key={status}>{titleCase(status)}</option>)}
            </select>
            <select name="project" defaultValue={params.project ?? ""} aria-label="Filter by project">
              <option value="">All projects</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.project_code} · {project.name}</option>)}
            </select>
            <button className="secondary-button" type="submit">Filter</button>
          </form>

          <div className="data-list">
            {items.length ? items.map((item) => {
              const project = item.project_id ? projectsById.get(item.project_id) : null;
              const terminal = ["rejected", "converted", "archived"].includes(item.status);
              return (
                <details key={item.id} style={{ padding: "16px 0", borderBottom: "1px solid #e7eaf0" }}>
                  <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", gap: 16 }}>
                    <div>
                      <strong>{item.intake_key} · {item.title}</strong>
                      <span>{titleCase(item.item_type)} · {item.category} · {project ? `${project.project_code} · ${project.name}` : "No project"} · {formatDate(item.created_at)}</span>
                    </div>
                    <div className="row-meta"><span>P{item.priority}</span><span>{item.risk_level} risk</span><b className={item.routed_meeting_id ? "state-active" : "state-paused"}>{titleCase(item.status)}</b></div>
                  </summary>

                  <div style={{ marginTop: 14, padding: 16, borderRadius: 14, background: "#f8f9fb" }}>
                    <p style={{ marginTop: 0, lineHeight: 1.65 }}>{item.summary}</p>
                    {item.why_it_matters ? <p><strong>Why it matters:</strong> {item.why_it_matters}</p> : null}
                    {list(item.agent_relevance).length ? <p><strong>Suggested agent relevance:</strong> {list(item.agent_relevance).join(", ")}</p> : null}
                    {item.revisit_trigger ? <p><strong>Revisit trigger:</strong> {item.revisit_trigger}</p> : null}

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginTop: 14 }}>
                      {item.routed_meeting_id ? (
                        <Link className="secondary-button" href={`/meetings/room?meeting=${item.routed_meeting_id}`}>Open governed meeting</Link>
                      ) : !terminal ? (
                        <form action={routeToMeeting}>
                          <input type="hidden" name="intakeId" value={item.id} />
                          <button type="submit">Route to governed meeting</button>
                        </form>
                      ) : null}

                      {!terminal ? (
                        <form action={updateStatus} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
                          <input type="hidden" name="intakeId" value={item.id} />
                          <label style={{ margin: 0 }}>Status<select name="status" defaultValue={item.status}>{statusOptions.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></label>
                          <label style={{ margin: 0 }}>Revisit trigger<input name="revisitTrigger" defaultValue={item.revisit_trigger ?? ""} placeholder="Required when deferred" /></label>
                          <button className="secondary-button" type="submit">Update</button>
                        </form>
                      ) : null}
                    </div>

                    <p style={{ marginBottom: 0, marginTop: 14, color: "#717b8e", fontSize: ".82rem" }}>
                      Routing creates a draft meeting only. It does not authorize agents, start deliberation, create a decision, change project scope, or enable external actions.
                    </p>
                  </div>
                </details>
              );
            }) : <p className="empty-state">No Idea/Issue records match these filters.</p>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><p className="label">Human CEO intake</p><h2>Capture a new item</h2></div></div>
          <form action={createIntake} className="auth-form" style={{ marginTop: 0 }}>
            <label>Type<select name="itemType" defaultValue="idea"><option value="idea">Idea</option><option value="issue">Issue</option></select></label>
            <label>Title<input name="title" minLength={3} required /></label>
            <label>Summary<textarea name="summary" minLength={10} rows={4} required style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10, font: "inherit" }} /></label>
            <label>Project<select name="projectId" defaultValue=""><option value="">No project yet</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.project_code} · {project.name}</option>)}</select></label>
            <label>Category<input name="category" defaultValue="general" required /></label>
            <label>Why it matters<textarea name="whyItMatters" rows={3} style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10, font: "inherit" }} /></label>
            <label>Questions / assumptions<textarea name="questionsAssumptions" rows={3} placeholder="One per line" style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10, font: "inherit" }} /></label>
            <label>Suggested agents<input name="agentRelevance" placeholder="A-101, A-105, B-001" /></label>
            <label>Priority<select name="priority" defaultValue="3"><option value="1">1 · Highest</option><option value="2">2</option><option value="3">3 · Normal</option><option value="4">4</option><option value="5">5 · Lowest</option></select></label>
            <label>Risk<select name="riskLevel" defaultValue="low"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
            <label>Revisit trigger<input name="revisitTrigger" placeholder="Optional unless later deferred" /></label>
            <button type="submit">Capture governed Idea / Issue</button>
          </form>
        </article>
      </section>
    </main>
  );
}
