import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import ProjectAutopilotConsole from "./ProjectAutopilotConsole";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ project?: string }> };

export default async function ProjectAutopilotPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("organization_members").select("organization_id,role").eq("user_id", user.id).eq("role", "owner").maybeSingle();
  if (!membership) redirect("/login?error=Owner%20authorization%20required.");
  if (!params.project) redirect("/projects");

  const { data: project } = await supabase.from("projects")
    .select("id,project_code,name,description,status,stage,workflow_state")
    .eq("organization_id", membership.organization_id)
    .eq("id", params.project)
    .maybeSingle();
  if (!project) redirect("/projects");

  const [{ data: brief }, { data: resources }, { data: actions }] = await Promise.all([
    supabase.from("project_strategy_briefs").select("brief_code,title,status,web_research_status").eq("project_id", project.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("project_resources").select("resource_type,name,url,status").eq("project_id", project.id).eq("status", "connected"),
    supabase.from("action_items").select("action_code,title,status,execution_order").eq("project_id", project.id).order("execution_order", { ascending: true }),
  ]);

  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM PROJECT AUTOPILOT · {project.project_code}</p><h1>{project.name}</h1><p className="subtitle">Autonomous internal execution with dependency-aware handoffs and Human CEO gates only for consequential external actions.</p></div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Link className="secondary-button" href={`/projects/operating?project=${project.id}`}>Operating view</Link><Link className="secondary-button" href={`/actions?project=${project.id}`}>Actions</Link><Link className="secondary-button" href="/approvals">Approvals</Link></div></header>
    <section className="organization-banner"><div><span>Brief</span><strong>{brief?.status ?? "missing"}</strong></div><div><span>Connected resources</span><strong>{resources?.length ?? 0}</strong></div><div><span>Actions</span><strong>{actions?.length ?? 0}</strong></div></section>
    {brief ? <section className="panel" style={{ marginTop: 18 }}><div className="panel-heading"><div><p className="label">CLIENT CONTEXT</p><h2>{brief.title}</h2></div><span className="pill">{brief.brief_code}</span></div><p className="subtitle">Web research policy: {brief.web_research_status}. The project resources below are supplied to assigned Agents as governed client context.</p><div className="compact-list">{(resources ?? []).map((resource) => <div key={`${resource.resource_type}-${resource.name}`}><strong>{resource.name}</strong><span>{resource.url ?? resource.resource_type}</span></div>)}</div></section> : <p className="form-error">This project does not have a ready client brief.</p>}
    <ProjectAutopilotConsole projectId={project.id} projectCode={project.project_code} />
    <section className="panel" style={{ marginTop: 18 }}><div className="panel-heading"><div><p className="label">ACTION PIPELINE</p><h2>Dependency-aware execution</h2></div></div><div className="data-list">{(actions ?? []).map((action) => <div className="data-row" key={action.action_code ?? action.title}><div><strong>{action.execution_order}. {action.action_code} · {action.title}</strong><span>{action.status}</span></div></div>)}</div></section>
  </main>;
}
