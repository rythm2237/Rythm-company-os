import { SubmitButton } from "@/components/ui/Button";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveOrganizationContext } from "@/lib/auth/organization-context";
import { getProjectProgressSnapshots } from "@/lib/projects/project-progress";
import { submitCompanyRequest } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function HomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const context = await resolveOrganizationContext();
  if (!context) redirect("/login?next=/home");
  const { supabase, organizationId, organization } = context;
  const [projectsResult, approvalsResult, questionsResult, activityResult] = await Promise.all([
    supabase.from("projects").select("id,name,status,updated_at").eq("organization_id", organizationId).neq("status", "completed").order("updated_at", { ascending: false }).limit(5),
    supabase.from("approval_requests").select("id,title,project_id").eq("organization_id", organizationId).eq("status", "pending").limit(5),
    supabase.from("project_clarification_requests").select("id,question,project_id").eq("organization_id", organizationId).eq("status", "open").limit(5),
    supabase.from("project_activity_events").select("id,project_id,headline,created_at").eq("organization_id", organizationId).in("importance", ["major", "attention", "normal"]).order("created_at", { ascending: false }).limit(5),
  ]);
  const projects = projectsResult.data ?? [];
  const progress = await getProjectProgressSnapshots(supabase, organizationId, projects);
  const approvals = approvalsResult.data ?? [];
  const questions = questionsResult.data ?? [];
  const activity = activityResult.data ?? [];
  const params = await searchParams;
  const canSubmit = context.role === "owner";
  return <main className="command-shell simple-home">
    <header className="command-header"><div><p className="eyebrow">{organization.name} · Home</p><h1>What would you like RYTHM to do?</h1><p className="subtitle">Describe the outcome. RYTHM will analyze it and prepare a roadmap for review.</p></div></header>
    <section className="panel simple-command" aria-label="Ask RYTHM">
      {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}
      {canSubmit ? <form action={submitCompanyRequest}><label className="sr-only" htmlFor="home-request">Your request</label><textarea id="home-request" name="request" required minLength={3} maxLength={5000} rows={4} placeholder="Build a website for my restaurant…"/><div className="simple-command-footer"><span>No department or agent selection needed</span><SubmitButton type="submit">Ask RYTHM →</SubmitButton></div></form> : <p className="empty-state">Your company owner can start new work. You can monitor the projects and decisions available to your role.</p>}
    </section>
    <div className="simple-home-grid"><section className="panel"><div className="panel-heading"><div><p className="label">In progress</p><h2>Active projects</h2></div><Link href="/projects">View all</Link></div>{projects.length ? <div className="data-list">{projects.map(project => { const snapshot = progress.get(project.id); return <Link className="data-row" href={`/projects/operating?project=${project.id}`} key={project.id}><div><strong>{project.name}</strong><span>{project.status.replaceAll("_", " ")}</span></div><span className="pill">{snapshot?.hasApprovedRoadmap ? `${snapshot.progressPercent}%` : "Planning"}</span></Link>; })}</div> : <p className="empty-state">No active projects. Ask RYTHM to start something.</p>}</section>
    <section className="panel"><div className="panel-heading"><div><p className="label">Your decisions</p><h2>Needs your attention</h2></div><Link href="/inbox">Open Inbox</Link></div>{approvals.length + questions.length ? <div className="data-list">{approvals.slice(0, 3).map(item => <Link className="data-row" key={item.id} href={`/inbox?category=approvals`}><strong>{item.title}</strong><span className="pill">Approval</span></Link>)}{questions.slice(0, 2).map(item => <Link className="data-row" key={item.id} href={`/projects/operating?project=${item.project_id}`}><strong>{item.question}</strong><span className="pill">Question</span></Link>)}</div> : <p className="empty-state">Nothing needs your attention.</p>}</section></div>
    <section className="panel simple-recent"><div className="panel-heading"><div><p className="label">What happened</p><h2>Recent activity</h2></div></div>{activity.length ? <div className="data-list">{activity.map(item => <Link href={`/projects/operating?project=${item.project_id}&view=activity`} className="data-row" key={item.id}><strong>{item.headline}</strong><time>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(item.created_at))}</time></Link>)}</div> : <p className="empty-state">Meaningful project updates will appear here.</p>}</section>
  </main>;
}
