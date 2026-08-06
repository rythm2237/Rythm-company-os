import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type Project = {
  id:string; project_code:string; name:string; description:string; status:string; stage:string; priority:number;
  objective:string; scope:Record<string,unknown>; success_criteria:unknown[]; constraints:unknown[];
  budget_cap_usd:number|null; target_date:string|null; progress_percent:number; updated_at:string;
};
type Resource = { id:string; resource_type:string; name:string; url:string|null; external_reference:string|null; status:string; metadata:Record<string,unknown> };
type Kpi = { id:string; name:string; definition:string; unit:string; target_value:number|null; current_value:number|null; status:string; review_frequency:string };
type Milestone = { id:string; title:string; description:string; sequence_no:number; status:string; target_date:string|null };
type Assignment = { assignment_role:string; status:string; authority_scope:Record<string,unknown>; agents:{agent_code:string;display_name:string|null;name:string;role_title:string;department:string|null} | null };

const asList=(value:unknown)=>Array.isArray(value)?value.map(String):[];
const formatDate=(value:string|null)=>value?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium"}).format(new Date(value)):"Not set";

export default async function ProjectsPage(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id,role").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership) redirect("/login?error=Owner%20authorization%20required.");
  const organizationId=membership.organization_id as string;

  const {data:projectData}=await supabase.from("projects")
    .select("id,project_code,name,description,status,stage,priority,objective,scope,success_criteria,constraints,budget_cap_usd,target_date,progress_percent,updated_at")
    .eq("organization_id",organizationId).eq("project_code","AI-PR-001").maybeSingle();
  if(!projectData){
    return <main className="command-shell"><header className="command-header"><div><p className="eyebrow">RYTHM PROJECT OFFICE</p><h1>Project Workspace</h1><p className="subtitle">The project migration has not been applied yet.</p></div><Link className="secondary-button" href="/command-center">Command Center</Link></header><section className="panel" style={{marginTop:22}}><h2>AI Position Roadmap is waiting for onboarding</h2><p>Apply the Project Workspace migration at the release checkpoint.</p></section></main>;
  }
  const project=projectData as Project;
  const [resourcesResult,kpisResult,milestonesResult,assignmentsResult,actionsResult,decisionsResult,meetingsResult]=await Promise.all([
    supabase.from("project_resources").select("id,resource_type,name,url,external_reference,status,metadata").eq("project_id",project.id).order("resource_type"),
    supabase.from("project_kpis").select("id,name,definition,unit,target_value,current_value,status,review_frequency").eq("project_id",project.id).order("name"),
    supabase.from("project_milestones").select("id,title,description,sequence_no,status,target_date").eq("project_id",project.id).order("sequence_no"),
    supabase.from("project_agents").select("assignment_role,status,authority_scope,agents(agent_code,display_name,name,role_title,department)").eq("project_id",project.id),
    supabase.from("action_items").select("id",{count:"exact",head:true}).eq("organization_id",organizationId),
    supabase.from("decisions").select("id",{count:"exact",head:true}).eq("organization_id",organizationId),
    supabase.from("meetings").select("id",{count:"exact",head:true}).eq("organization_id",organizationId),
  ]);
  const resources=(resourcesResult.data??[]) as Resource[];
  const kpis=(kpisResult.data??[]) as Kpi[];
  const milestones=(milestonesResult.data??[]) as Milestone[];
  const assignments=(assignmentsResult.data??[]) as unknown as Assignment[];
  const scopeIncluded=asList(project.scope?.included);
  const scopeExcluded=asList(project.scope?.excluded_initially);

  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM PROJECT OFFICE · {project.project_code}</p><h1>{project.name}</h1><p className="subtitle">{project.description}</p></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Link className="secondary-button" href="/agents/strategy">Strategy Analyst</Link><Link className="secondary-button" href="/command-center">Command Center</Link></div></header>

    <section className="organization-banner"><div><span>Status</span><strong>{project.status}</strong></div><div><span>Stage</span><strong>{project.stage.replaceAll("_"," ")}</strong></div><div><span>Priority</span><strong>P{project.priority}</strong></div></section>

    <section className="metrics-grid" aria-label="Project metrics">
      <article className="metric-card"><span>Onboarding progress</span><strong>{project.progress_percent}%</strong></article>
      <article className="metric-card"><span>Connected resources</span><strong>{resources.filter(r=>r.status==="connected").length}/{resources.length}</strong></article>
      <article className="metric-card"><span>Assigned agents</span><strong>{assignments.filter(a=>a.status==="assigned"||a.status==="active").length}/{assignments.length}</strong></article>
      <article className="metric-card"><span>Milestones completed</span><strong>{milestones.filter(m=>m.status==="completed").length}/{milestones.length}</strong></article>
      <article className="metric-card"><span>Company decisions</span><strong>{decisionsResult.count??0}</strong></article>
      <article className="metric-card"><span>Company actions</span><strong>{actionsResult.count??0}</strong></article>
    </section>

    <section className="executive-grid" style={{marginTop:18}}>
      <article className="panel panel-wide"><div className="panel-heading"><div><p className="label">Project charter</p><h2>Objective and controlled scope</h2></div><span className="pill">Human CEO governed</span></div><p style={{color:"#596579",lineHeight:1.7}}>{project.objective}</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:16,marginTop:18}}><div><p className="label">Included</p><ul style={{color:"#596579",lineHeight:1.75}}>{scopeIncluded.map(item=><li key={item}>{item}</li>)}</ul></div><div><p className="label">Initial exclusions</p><ul style={{color:"#596579",lineHeight:1.75}}>{scopeExcluded.map(item=><li key={item}>{item}</li>)}</ul></div><div><p className="label">Operating constraints</p><ul style={{color:"#596579",lineHeight:1.75}}>{asList(project.constraints).map(item=><li key={item}>{item}</li>)}</ul></div></div></article>

      <article className="panel"><div className="panel-heading"><div><p className="label">Release controls</p><h2>Project governance</h2></div></div><div className="compact-list"><div><strong>Owner</strong><span>Human CEO</span></div><div><strong>Budget cap</strong><span>{project.budget_cap_usd==null?"Not set":`$${project.budget_cap_usd}`}</span></div><div><strong>Target date</strong><span>{formatDate(project.target_date)}</span></div><div><strong>Deployments</strong><span>Batch-based checkpoints</span></div><div><strong>External actions</strong><span>Approval required</span></div></div></article>
    </section>

    <section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">Connected operating environment</p><h2>Project resources</h2></div><span className="pill">{resources.length} registered</span></div><div className="data-list">{resources.map(resource=><div className="data-row" key={resource.id}><div><strong>{resource.name}</strong><span>{resource.resource_type} · {resource.external_reference??"internal reference"}</span></div><div className="row-meta">{resource.url?<a href={resource.url} target="_blank" rel="noreferrer">Open</a>:null}<b className={resource.status==="connected"?"state-active":"state-paused"}>{resource.status}</b></div></div>)}</div></section>

    <section className="executive-grid" style={{marginTop:18}}>
      <article className="panel panel-wide"><div className="panel-heading"><div><p className="label">Delivery sequence</p><h2>Milestones</h2></div></div><div className="data-list">{milestones.map(m=><div className="data-row" key={m.id}><div><strong>{m.sequence_no}. {m.title}</strong><span>{m.description}</span></div><div className="row-meta"><span>{formatDate(m.target_date)}</span><b className={m.status==="completed"?"state-active":"state-paused"}>{m.status.replaceAll("_"," ")}</b></div></div>)}</div></article>
      <article className="panel"><div className="panel-heading"><div><p className="label">Minimum delivery team</p><h2>Agent assignments</h2></div></div><div className="data-list">{assignments.map((assignment,index)=><div className="data-row" key={`${assignment.agents?.agent_code??"agent"}-${index}`}><div><strong>{assignment.agents?.display_name??assignment.agents?.name??"Agent"}</strong><span>{assignment.assignment_role}</span></div><div className="row-meta"><span>{assignment.agents?.agent_code}</span><b className={assignment.status==="active"||assignment.status==="assigned"?"state-active":"state-paused"}>{assignment.status}</b></div></div>)}</div></article>
    </section>

    <section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">Performance contract</p><h2>Project KPIs</h2></div><span className="pill">{kpis.length} measures</span></div><div className="data-list">{kpis.map(kpi=><div className="data-row" key={kpi.id}><div><strong>{kpi.name}</strong><span>{kpi.definition} · reviewed {kpi.review_frequency}</span></div><div className="row-meta"><span>{kpi.current_value??"—"} / {kpi.target_value??"—"} {kpi.unit}</span><b className={kpi.status==="achieved"||kpi.status==="on_track"?"state-active":"state-paused"}>{kpi.status.replaceAll("_"," ")}</b></div></div>)}</div></section>

    <section className="panel" style={{marginTop:18}}><p className="label">First governed company cycle</p><h2>Next operational sequence</h2><p style={{color:"#596579",lineHeight:1.7}}>Confirm internal resources → activate the minimum agent team → run A-101 internal-first strategy analysis → request CEO approval only if web research is required → create an executive decision → convert the approved direction into accountable action items.</p><div className="row-meta"><span>{meetingsResult.count??0} company meetings registered</span><span>Updated {formatDate(project.updated_at)}</span></div></section>
  </main>;
}
