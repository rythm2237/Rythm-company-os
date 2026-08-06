import Link from "next/link";
import { revalidatePath } from "next/cache";
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
type Assignment = { agent_id:string; assignment_role:string; status:string; authority_scope:Record<string,unknown>; agents:{agent_code:string;display_name:string|null;name:string;role_title:string;department:string|null} | null };
type PageProps={searchParams:Promise<{message?:string;error?:string}>};

const asList=(value:unknown)=>Array.isArray(value)?value.map(String):[];
const formatDate=(value:string|null)=>value?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium"}).format(new Date(value)):"Not set";

async function ownerContext(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id,role").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership) redirect("/login?error=Owner%20authorization%20required.");
  return {supabase,user,organizationId:membership.organization_id as string};
}

async function updateProject(formData:FormData){
  "use server";
  const {supabase,user,organizationId}=await ownerContext();
  const projectId=String(formData.get("projectId")??"");
  const status=String(formData.get("status")??"planning");
  const stage=String(formData.get("stage")??"discovery").trim();
  const priority=Number(formData.get("priority")??3);
  const progress=Number(formData.get("progress")??0);
  const budgetRaw=String(formData.get("budget")??"").trim();
  const targetDate=String(formData.get("targetDate")??"").trim()||null;
  const objective=String(formData.get("objective")??"").trim();
  if(!projectId||!stage||objective.length<10||priority<1||priority>5||progress<0||progress>100){redirect("/projects?error=Invalid%20project%20update.");}
  const {error}=await supabase.from("projects").update({status,stage,priority,progress_percent:progress,budget_cap_usd:budgetRaw?Number(budgetRaw):null,target_date:targetDate,objective,updated_at:new Date().toISOString()}).eq("id",projectId).eq("organization_id",organizationId);
  if(error) redirect(`/projects?error=${encodeURIComponent(error.message)}`);
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"project.updated",object_type:"project",object_id:projectId,risk_level:"medium",payload:{status,stage,priority,progress}});
  revalidatePath("/projects"); redirect("/projects?message=Project%20workspace%20updated.");
}

async function updateMilestone(formData:FormData){
  "use server";
  const {supabase,user,organizationId}=await ownerContext();
  const id=String(formData.get("id")??""); const projectId=String(formData.get("projectId")??""); const status=String(formData.get("status")??"planned");
  const {error}=await supabase.from("project_milestones").update({status,completed_at:status==="completed"?new Date().toISOString():null}).eq("id",id).eq("organization_id",organizationId);
  if(error) redirect(`/projects?error=${encodeURIComponent(error.message)}`);
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"project.milestone_updated",object_type:"project",object_id:projectId,risk_level:"low",payload:{milestone_id:id,status}});
  revalidatePath("/projects"); redirect("/projects?message=Milestone%20updated.");
}

async function updateResource(formData:FormData){
  "use server";
  const {supabase,user,organizationId}=await ownerContext();
  const id=String(formData.get("id")??""); const projectId=String(formData.get("projectId")??""); const status=String(formData.get("status")??"planned"); const url=String(formData.get("url")??"").trim()||null;
  const {error}=await supabase.from("project_resources").update({status,url}).eq("id",id).eq("organization_id",organizationId);
  if(error) redirect(`/projects?error=${encodeURIComponent(error.message)}`);
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"project.resource_updated",object_type:"project",object_id:projectId,risk_level:"low",payload:{resource_id:id,status}});
  revalidatePath("/projects"); redirect("/projects?message=Resource%20updated.");
}

async function updateKpi(formData:FormData){
  "use server";
  const {supabase,user,organizationId}=await ownerContext();
  const id=String(formData.get("id")??""); const projectId=String(formData.get("projectId")??""); const status=String(formData.get("status")??"not_started"); const currentRaw=String(formData.get("currentValue")??"").trim();
  const {error}=await supabase.from("project_kpis").update({status,current_value:currentRaw?Number(currentRaw):null}).eq("id",id).eq("organization_id",organizationId);
  if(error) redirect(`/projects?error=${encodeURIComponent(error.message)}`);
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"project.kpi_updated",object_type:"project",object_id:projectId,risk_level:"low",payload:{kpi_id:id,status}});
  revalidatePath("/projects"); redirect("/projects?message=KPI%20updated.");
}

async function updateAssignment(formData:FormData){
  "use server";
  const {supabase,user,organizationId}=await ownerContext();
  const agentId=String(formData.get("agentId")??""); const projectId=String(formData.get("projectId")??""); const status=String(formData.get("status")??"planned");
  const {error}=await supabase.from("project_agents").update({status,assigned_at:["assigned","active"].includes(status)?new Date().toISOString():null}).eq("project_id",projectId).eq("agent_id",agentId).eq("organization_id",organizationId);
  if(error) redirect(`/projects?error=${encodeURIComponent(error.message)}`);
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"project.agent_assignment_updated",object_type:"project",object_id:projectId,risk_level:"medium",payload:{agent_id:agentId,status}});
  revalidatePath("/projects"); redirect("/projects?message=Agent%20assignment%20updated.");
}

export default async function ProjectsPage({searchParams}:PageProps){
  const params=await searchParams;
  const {supabase,organizationId}=await ownerContext();
  const {data:projectData}=await supabase.from("projects").select("id,project_code,name,description,status,stage,priority,objective,scope,success_criteria,constraints,budget_cap_usd,target_date,progress_percent,updated_at").eq("organization_id",organizationId).eq("project_code","AI-PR-001").maybeSingle();
  if(!projectData){return <main className="command-shell"><header className="command-header"><div><p className="eyebrow">RYTHM PROJECT OFFICE</p><h1>Project Workspace</h1><p className="subtitle">The project migrations have not been applied yet.</p></div><Link className="secondary-button" href="/command-center">Command Center</Link></header><section className="panel" style={{marginTop:22}}><h2>AI Position Roadmap is waiting for onboarding</h2><p>Apply both Project Workspace migrations at the release checkpoint.</p></section></main>;}
  const project=projectData as Project;
  const [resourcesResult,kpisResult,milestonesResult,assignmentsResult,actionsResult,decisionsResult,meetingsResult,approvalsResult,runsResult]=await Promise.all([
    supabase.from("project_resources").select("id,resource_type,name,url,external_reference,status,metadata").eq("project_id",project.id).order("resource_type"),
    supabase.from("project_kpis").select("id,name,definition,unit,target_value,current_value,status,review_frequency").eq("project_id",project.id).order("name"),
    supabase.from("project_milestones").select("id,title,description,sequence_no,status,target_date").eq("project_id",project.id).order("sequence_no"),
    supabase.from("project_agents").select("agent_id,assignment_role,status,authority_scope,agents(agent_code,display_name,name,role_title,department)").eq("project_id",project.id),
    supabase.from("action_items").select("id",{count:"exact",head:true}).eq("project_id",project.id),
    supabase.from("decisions").select("id",{count:"exact",head:true}).eq("project_id",project.id),
    supabase.from("meetings").select("id",{count:"exact",head:true}).eq("project_id",project.id),
    supabase.from("approval_requests").select("id",{count:"exact",head:true}).eq("project_id",project.id),
    supabase.from("agent_runs").select("id",{count:"exact",head:true}).eq("project_id",project.id),
  ]);
  const resources=(resourcesResult.data??[]) as Resource[]; const kpis=(kpisResult.data??[]) as Kpi[]; const milestones=(milestonesResult.data??[]) as Milestone[]; const assignments=(assignmentsResult.data??[]) as unknown as Assignment[];
  const scopeIncluded=asList(project.scope?.included); const scopeExcluded=asList(project.scope?.excluded_initially);

  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM PROJECT OFFICE · {project.project_code}</p><h1>{project.name}</h1><p className="subtitle">{project.description}</p></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Link className="secondary-button" href="/agents/strategy">Strategy Analyst</Link><Link className="secondary-button" href="/orchestrator">Orchestrator</Link><Link className="secondary-button" href="/command-center">Command Center</Link></div></header>
    {params.message?<p className="form-success" role="status">{params.message}</p>:null}{params.error?<p className="form-error" role="alert">{params.error}</p>:null}
    <section className="organization-banner"><div><span>Status</span><strong>{project.status}</strong></div><div><span>Stage</span><strong>{project.stage.replaceAll("_"," ")}</strong></div><div><span>Priority</span><strong>P{project.priority}</strong></div></section>
    <section className="metrics-grid"><article className="metric-card"><span>Onboarding progress</span><strong>{project.progress_percent}%</strong></article><article className="metric-card"><span>Connected resources</span><strong>{resources.filter(r=>r.status==="connected").length}/{resources.length}</strong></article><article className="metric-card"><span>Assigned agents</span><strong>{assignments.filter(a=>a.status==="assigned"||a.status==="active").length}/{assignments.length}</strong></article><article className="metric-card"><span>Milestones completed</span><strong>{milestones.filter(m=>m.status==="completed").length}/{milestones.length}</strong></article><article className="metric-card"><span>Project decisions</span><strong>{decisionsResult.count??0}</strong></article><article className="metric-card"><span>Project actions</span><strong>{actionsResult.count??0}</strong></article></section>

    <section className="executive-grid" style={{marginTop:18}}><article className="panel panel-wide"><div className="panel-heading"><div><p className="label">Project charter</p><h2>Objective and controlled scope</h2></div><span className="pill">Human CEO governed</span></div><p style={{color:"#596579",lineHeight:1.7}}>{project.objective}</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:16,marginTop:18}}><div><p className="label">Included</p><ul style={{color:"#596579",lineHeight:1.75}}>{scopeIncluded.map(item=><li key={item}>{item}</li>)}</ul></div><div><p className="label">Initial exclusions</p><ul style={{color:"#596579",lineHeight:1.75}}>{scopeExcluded.map(item=><li key={item}>{item}</li>)}</ul></div><div><p className="label">Operating constraints</p><ul style={{color:"#596579",lineHeight:1.75}}>{asList(project.constraints).map(item=><li key={item}>{item}</li>)}</ul></div></div></article>
    <article className="panel"><p className="label">CEO controls</p><h2>Edit project state</h2><form action={updateProject} className="auth-form" style={{marginTop:12}}><input type="hidden" name="projectId" value={project.id}/><label>Status<select name="status" defaultValue={project.status}>{["idea","planning","active","blocked","on_hold","completed","cancelled"].map(v=><option key={v}>{v}</option>)}</select></label><label>Stage<input name="stage" defaultValue={project.stage} required/></label><label>Priority<input name="priority" type="number" min="1" max="5" defaultValue={project.priority} required/></label><label>Progress %<input name="progress" type="number" min="0" max="100" defaultValue={project.progress_percent} required/></label><label>Budget cap USD<input name="budget" type="number" min="0" step="0.01" defaultValue={project.budget_cap_usd??""}/></label><label>Target date<input name="targetDate" type="date" defaultValue={project.target_date??""}/></label><label>Objective<textarea name="objective" rows={5} defaultValue={project.objective} required style={{width:"100%",padding:10,border:"1px solid #cfd6e2",borderRadius:10}}/></label><button type="submit">Save governed update</button></form></article></section>

    <section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">Connected operating environment</p><h2>Project resources</h2></div><span className="pill">{resources.length} registered</span></div><div className="data-list">{resources.map(resource=><form action={updateResource} className="data-row" key={resource.id}><input type="hidden" name="id" value={resource.id}/><input type="hidden" name="projectId" value={project.id}/><div><strong>{resource.name}</strong><span>{resource.resource_type} · {resource.external_reference??"internal reference"}</span><input name="url" defaultValue={resource.url??""} placeholder="Resource URL" style={{marginTop:8,width:"100%"}}/></div><div className="row-meta"><select name="status" defaultValue={resource.status}>{["planned","connected","degraded","disconnected"].map(v=><option key={v}>{v}</option>)}</select><button className="secondary-button" type="submit">Save</button></div></form>)}</div></section>

    <section className="executive-grid" style={{marginTop:18}}><article className="panel panel-wide"><div className="panel-heading"><div><p className="label">Delivery sequence</p><h2>Milestones</h2></div></div><div className="data-list">{milestones.map(m=><form action={updateMilestone} className="data-row" key={m.id}><input type="hidden" name="id" value={m.id}/><input type="hidden" name="projectId" value={project.id}/><div><strong>{m.sequence_no}. {m.title}</strong><span>{m.description}</span></div><div className="row-meta"><span>{formatDate(m.target_date)}</span><select name="status" defaultValue={m.status}>{["planned","in_progress","blocked","completed","cancelled"].map(v=><option key={v}>{v.replaceAll("_"," ")}</option>)}</select><button className="secondary-button" type="submit">Save</button></div></form>)}</div></article>
    <article className="panel"><div className="panel-heading"><div><p className="label">Minimum delivery team</p><h2>Agent assignments</h2></div></div><div className="data-list">{assignments.map((a,index)=><form action={updateAssignment} className="data-row" key={`${a.agents?.agent_code??"agent"}-${index}`}><input type="hidden" name="agentId" value={a.agent_id}/><input type="hidden" name="projectId" value={project.id}/><div><strong>{a.agents?.display_name??a.agents?.name??"Agent"}</strong><span>{a.assignment_role}</span></div><div className="row-meta"><span>{a.agents?.agent_code}</span><select name="status" defaultValue={a.status}>{["planned","assigned","active","paused","released"].map(v=><option key={v}>{v}</option>)}</select><button className="secondary-button" type="submit">Save</button></div></form>)}</div></article></section>

    <section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">Performance contract</p><h2>Project KPIs</h2></div><span className="pill">{kpis.length} measures</span></div><div className="data-list">{kpis.map(kpi=><form action={updateKpi} className="data-row" key={kpi.id}><input type="hidden" name="id" value={kpi.id}/><input type="hidden" name="projectId" value={project.id}/><div><strong>{kpi.name}</strong><span>{kpi.definition} · reviewed {kpi.review_frequency}</span></div><div className="row-meta"><input name="currentValue" type="number" step="0.01" defaultValue={kpi.current_value??""} style={{width:90}}/><span>/ {kpi.target_value??"—"} {kpi.unit}</span><select name="status" defaultValue={kpi.status}>{["not_started","on_track","at_risk","off_track","achieved"].map(v=><option key={v}>{v.replaceAll("_"," ")}</option>)}</select><button className="secondary-button" type="submit">Save</button></div></form>)}</div></section>

    <section className="panel" style={{marginTop:18}}><p className="label">Project-linked governance</p><h2>Operational records</h2><div className="compact-list"><div><strong>Meetings</strong><span>{meetingsResult.count??0}</span></div><div><strong>Decisions</strong><span>{decisionsResult.count??0}</span></div><div><strong>Actions</strong><span>{actionsResult.count??0}</span></div><div><strong>Approvals</strong><span>{approvalsResult.count??0}</span></div><div><strong>Agent runs</strong><span>{runsResult.count??0}</span></div></div><p style={{color:"#596579",lineHeight:1.7,marginTop:16}}>Next sequence: validate resources → activate minimum agent team → run A-101 internal-first strategy analysis → create a project-linked CEO decision → convert the approved direction into accountable project actions.</p><div className="row-meta"><span>Updated {formatDate(project.updated_at)}</span><span>Production deployment remains checkpoint-based</span></div></section>
  </main>;
}
