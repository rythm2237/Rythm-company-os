import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type Project = {
  id: string;
  project_code: string;
  name: string;
  description: string | null;
  status: string;
  stage: string;
  priority: number;
  progress_percent: number;
  target_date: string | null;
  updated_at: string;
};

type ProjectAgent = {
  project_id: string;
  status: string;
  agents: { agent_code: string; display_name: string | null; name: string } | null;
};

type ProjectEntity = { project_id: string | null; status?: string };

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value)) : "No target date";
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
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
  return { supabase, organizationId: membership.organization_id as string, user };
}

async function createProject(formData:FormData){
  "use server";
  const {supabase,organizationId,user}=await ownerContext();
  const projectCode=String(formData.get("projectCode")??"").trim().toUpperCase().replace(/[^A-Z0-9-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40);
  const name=String(formData.get("name")??"").trim().slice(0,120);
  const description=String(formData.get("description")??"").trim().slice(0,1200);
  const objective=String(formData.get("objective")??"").trim().slice(0,1200);
  const priority=Math.max(1,Math.min(5,Number(formData.get("priority")??3)));
  if(projectCode.length<3||name.length<3) redirect("/projects?error=Project%20code%20and%20name%20must%20contain%20at%20least%203%20characters.");
  const {data:project,error}=await supabase.from("projects").insert({organization_id:organizationId,project_code:projectCode,name,description,project_type:"internal_project",status:"planning",stage:"discovery",priority,owner_type:"human_ceo",objective,scope:{},success_criteria:[],constraints:["Human CEO retains consequential authority","External actions remain separately approval-gated"],progress_percent:0,created_by_user_id:user.id}).select("id").single();
  if(error||!project){
    console.error("project_create_failed",{projectCode,error});
    redirect("/projects?error=Project%20could%20not%20be%20created.%20Confirm%20the%20project%20code%20is%20unique%20and%20retry.");
  }
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"project.created",object_type:"project",object_id:project.id,risk_level:"low",payload:{project_code:projectCode,name,human_authority:"Human CEO / Owner",external_actions:false}});
  revalidatePath("/projects");
  redirect(`/projects/operating?project=${project.id}`);
}

export default async function ProjectsPortfolioPage({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const query=await searchParams;
  const { supabase, organizationId } = await ownerContext();

  const [projectsResult, agentsResult, actionsResult, decisionsResult, meetingsResult] = await Promise.all([
    supabase.from("projects")
      .select("id,project_code,name,description,status,stage,priority,progress_percent,target_date,updated_at")
      .eq("organization_id", organizationId)
      .order("priority", { ascending: true })
      .order("updated_at", { ascending: false }),
    supabase.from("project_agents")
      .select("project_id,status,agents(agent_code,display_name,name)")
      .eq("organization_id", organizationId),
    supabase.from("action_items")
      .select("project_id,status")
      .eq("organization_id", organizationId),
    supabase.from("decisions")
      .select("project_id")
      .eq("organization_id", organizationId),
    supabase.from("meetings")
      .select("project_id")
      .eq("organization_id", organizationId),
  ]);

  const projects = (projectsResult.data ?? []) as Project[];
  const projectAgents = (agentsResult.data ?? []) as unknown as ProjectAgent[];
  const actions = (actionsResult.data ?? []) as ProjectEntity[];
  const decisions = (decisionsResult.data ?? []) as ProjectEntity[];
  const meetings = (meetingsResult.data ?? []) as ProjectEntity[];

  const countFor = (rows: ProjectEntity[], projectId: string) => rows.filter((row) => row.project_id === projectId).length;
  const activeActionsFor = (projectId: string) => actions.filter((row) => row.project_id === projectId && !["completed", "cancelled"].includes(row.status ?? "")).length;
  const agentsFor = (projectId: string) => projectAgents.filter((row) => row.project_id === projectId && ["assigned", "active"].includes(row.status));

  const activeProjects = projects.filter((project) => ["active", "planning", "idea", "blocked", "on_hold"].includes(project.status)).length;
  const averageProgress = projects.length ? Math.round(projects.reduce((sum, project) => sum + Number(project.progress_percent ?? 0), 0) / projects.length) : 0;
  const totalOpenActions = actions.filter((action) => !["completed", "cancelled"].includes(action.status ?? "")).length;

  return <main className="command-shell">
    <header className="command-header">
      <div>
        <p className="eyebrow">RYTHM PROJECT PORTFOLIO</p>
        <h1>Projects across the company</h1>
        <p className="subtitle">A portfolio-level view of governed work. Open a project to enter its operating context, history, agents and execution flow.</p>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link className="secondary-button" href="/actions">All actions</Link>
        <Link className="secondary-button" href="/executive-review">Executive review</Link>
        <Link className="secondary-button" href="/command-center">Command Center</Link>
      </div>
    </header>

    {query.error?<p className="form-error">{query.error}</p>:null}

    <section className="organization-banner">
      <div><span>Total projects</span><strong>{projects.length}</strong></div>
      <div><span>Active / governed</span><strong>{activeProjects}</strong></div>
      <div><span>Portfolio progress</span><strong>{averageProgress}%</strong></div>
      <div><span>Open actions</span><strong>{totalOpenActions}</strong></div>
    </section>

    <section className="panel panel-wide" style={{marginTop:18}}>
      <details>
        <summary style={{cursor:"pointer",fontWeight:800}}>Create a governed project</summary>
        <form action={createProject} className="auth-form" style={{marginTop:16}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
            <label>Project code<input name="projectCode" required minLength={3} maxLength={40} placeholder="e.g. MVP-VAL-002"/></label>
            <label>Project name<input name="name" required minLength={3} maxLength={120} placeholder="Project name"/></label>
            <label>Priority<select name="priority" defaultValue="3"><option value="1">P1</option><option value="2">P2</option><option value="3">P3</option><option value="4">P4</option><option value="5">P5</option></select></label>
          </div>
          <label>Description<textarea name="description" rows={3} maxLength={1200} style={{width:"100%",maxWidth:"100%",boxSizing:"border-box",resize:"vertical",padding:12,border:"1px solid #cfd6e2",borderRadius:10}}/></label>
          <label>Objective<textarea name="objective" rows={3} maxLength={1200} style={{width:"100%",maxWidth:"100%",boxSizing:"border-box",resize:"vertical",padding:12,border:"1px solid #cfd6e2",borderRadius:10}}/></label>
          <button>Create project</button>
          <p className="security-note">Creates an internal governed project under Human CEO authority. It does not authorize agents or external actions.</p>
        </form>
      </details>
    </section>

    <section className="panel panel-wide" style={{ marginTop: 18 }}>
      <div className="panel-heading">
        <div><p className="label">Project office</p><h2>Project portfolio</h2></div>
        <span className="pill">{projects.length} projects</span>
      </div>

      {projects.length === 0 ? <p className="empty-state">No projects have been registered for this organization yet.</p> : (
        <div className="project-portfolio-grid">
          {projects.map((project) => {
            const assignedAgents = agentsFor(project.id);
            const openActions = activeActionsFor(project.id);
            const decisionCount = countFor(decisions, project.id);
            const meetingCount = countFor(meetings, project.id);
            return <article className="project-portfolio-card" key={project.id}>
              <div className="project-card-heading">
                <div>
                  <p className="label">{project.project_code}</p>
                  <h2>{project.name}</h2>
                </div>
                <span className="pill">P{project.priority}</span>
              </div>

              <p className="project-card-copy">{project.description ?? "No project description recorded."}</p>

              <div className="project-progress-row">
                <div><span>Progress</span><strong>{project.progress_percent}%</strong></div>
                <div className="project-progress-track" aria-label={`${project.name} progress ${project.progress_percent}%`}><span style={{ width: `${Math.max(0, Math.min(100, project.progress_percent))}%` }} /></div>
              </div>

              <div className="project-card-metrics">
                <div><span>Status</span><strong>{label(project.status)}</strong></div>
                <div><span>Stage</span><strong>{label(project.stage)}</strong></div>
                <div><span>Open actions</span><strong>{openActions}</strong></div>
                <div><span>Decisions</span><strong>{decisionCount}</strong></div>
                <div><span>Meetings</span><strong>{meetingCount}</strong></div>
                <div><span>Target</span><strong>{formatDate(project.target_date)}</strong></div>
              </div>

              <div className="project-agent-strip">
                <span>Assigned agents</span>
                <div>
                  {assignedAgents.length ? assignedAgents.slice(0, 5).map((assignment) => (
                    <span className="agent-chip" key={`${project.id}-${assignment.agents?.agent_code ?? "agent"}`} title={assignment.agents?.display_name ?? assignment.agents?.name ?? "Assigned agent"}>
                      {assignment.agents?.agent_code ?? "AI"}
                    </span>
                  )) : <span className="muted-copy">No active agent assignment</span>}
                  {assignedAgents.length > 5 ? <span className="agent-chip">+{assignedAgents.length - 5}</span> : null}
                </div>
              </div>

              <div className="project-card-actions">
                <Link className="primary-link" href={`/projects/operating?project=${project.id}`}>Open project</Link>
                {project.project_code === "AI-RP-GTM-001" ? <Link className="secondary-button" href={`/projects/autopilot?code=${project.project_code}`}>Project autopilot</Link> : null}
                <Link className="secondary-button" href={`/actions?project=${project.id}`}>Project actions</Link>
              </div>
            </article>;
          })}
        </div>
      )}
    </section>
  </main>;
}