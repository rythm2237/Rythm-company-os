import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type ActionStatus = "open" | "in_progress" | "blocked" | "completed" | "cancelled";
type ActionRow = {
  id:string; project_id:string|null; meeting_id:string|null; decision_id:string|null; action_code:string|null; phase_name:string|null;
  owner_label:string|null; assigned_agent_id:string|null; risk_level:string|null; title:string; description:string|null; status:ActionStatus;
  priority:number; assigned_user_id:string|null; due_at:string|null; completed_at:string|null; created_at:string; dependencies:unknown;
  success_criteria:unknown; evidence_required:unknown;
};
type AuditRow = { id:number; event_type:string; actor_type:string; risk_level:string; created_at:string };
type Project = { id:string; project_code:string; name:string; status:string };
type Props = { searchParams:Promise<{ action?:string; status?:string; priority?:string; project?:string; message?:string; error?:string }> };

const statuses=new Set<ActionStatus>(["open","in_progress","blocked","completed","cancelled"]);
const formatDate=(value:string|null)=>value?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)):"Not set";
const asList=(value:unknown)=>Array.isArray(value)?value.map(String):[];
const extendedFields="id,project_id,meeting_id,decision_id,action_code,phase_name,owner_label,assigned_agent_id,risk_level,title,description,status,priority,assigned_user_id,due_at,completed_at,created_at,dependencies,success_criteria,evidence_required";
const legacyFields="id,meeting_id,decision_id,title,description,status,priority,assigned_user_id,due_at,completed_at,created_at";
const normalizeLegacy=(row:Record<string,unknown>):ActionRow=>({id:String(row.id),project_id:null,meeting_id:row.meeting_id?String(row.meeting_id):null,decision_id:row.decision_id?String(row.decision_id):null,action_code:null,phase_name:null,owner_label:null,assigned_agent_id:null,risk_level:null,title:String(row.title??"Untitled action"),description:row.description?String(row.description):null,status:String(row.status??"open") as ActionStatus,priority:Number(row.priority??3),assigned_user_id:row.assigned_user_id?String(row.assigned_user_id):null,due_at:row.due_at?String(row.due_at):null,completed_at:row.completed_at?String(row.completed_at):null,created_at:String(row.created_at??new Date(0).toISOString()),dependencies:[],success_criteria:[],evidence_required:[]});

async function ownerContext(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership) redirect("/login?error=Owner%20authorization%20required.");
  return {supabase,user,organizationId:membership.organization_id as string};
}

async function createAction(formData:FormData){
  "use server";
  const {supabase,user,organizationId}=await ownerContext();
  const title=String(formData.get("title")??"").trim(); const description=String(formData.get("description")??"").trim();
  const priority=Number(formData.get("priority")??3); const dueValue=String(formData.get("dueAt")??"").trim();
  const projectId=String(formData.get("projectId")??"").trim()||null;
  if(title.length<3||!Number.isInteger(priority)||priority<1||priority>5) redirect("/actions?error=Valid%20title%20and%20priority%201-5%20are%20required.");
  const dueAt=dueValue?new Date(dueValue):null; if(dueAt&&Number.isNaN(dueAt.getTime())) redirect("/actions?error=Invalid%20due%20date.");
  const {data,error}=await supabase.from("action_items").insert({organization_id:organizationId,project_id:projectId,title,description:description||null,status:"open",priority,assigned_user_id:user.id,due_at:dueAt?.toISOString()??null}).select("id").single();
  if(error||!data) redirect(`/actions?error=${encodeURIComponent(error?.message??"Action item could not be created.")}`);
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"action.created",object_type:"action_item",object_id:data.id,risk_level:priority<=2?"medium":"low",payload:{title,priority,project_id:projectId,due_at:dueAt?.toISOString()??null}});
  revalidatePath("/actions"); revalidatePath("/projects"); revalidatePath("/command-center");
  redirect(`/actions?action=${data.id}&status=open&project=${projectId??""}&message=Action%20item%20created.`);
}

async function updateAction(formData:FormData){
  "use server";
  const {supabase,user,organizationId}=await ownerContext();
  const actionId=String(formData.get("actionId")??""); const projectFilter=String(formData.get("projectFilter")??"");
  const nextStatus=String(formData.get("nextStatus")??"") as ActionStatus; const note=String(formData.get("note")??"").trim();
  const priority=Number(formData.get("priority")??3); const dueValue=String(formData.get("dueAt")??"").trim();
  if(!actionId||!statuses.has(nextStatus)||note.length<3||!Number.isInteger(priority)||priority<1||priority>5) redirect(`/actions?action=${actionId}&project=${projectFilter}&error=Status%2C%20priority%2C%20and%20a%20transition%20note%20are%20required.`);
  const {data:current}=await supabase.from("action_items").select("id,title,status").eq("organization_id",organizationId).eq("id",actionId).maybeSingle();
  if(!current) redirect("/actions?error=Action%20item%20not%20found."); if(["completed","cancelled"].includes(current.status)) redirect(`/actions?action=${actionId}&project=${projectFilter}&error=Final%20action%20items%20are%20immutable.`);
  const dueAt=dueValue?new Date(dueValue):null; if(dueAt&&Number.isNaN(dueAt.getTime())) redirect(`/actions?action=${actionId}&project=${projectFilter}&error=Invalid%20due%20date.`);
  const now=new Date().toISOString();
  const {data:updated,error}=await supabase.from("action_items").update({status:nextStatus,priority,due_at:dueAt?.toISOString()??null,completed_at:nextStatus==="completed"?now:null,assigned_user_id:user.id}).eq("organization_id",organizationId).eq("id",actionId).eq("status",current.status).select("id").maybeSingle();
  if(error||!updated) redirect(`/actions?action=${actionId}&project=${projectFilter}&error=${encodeURIComponent(error?.message??"Action item could not be updated.")}`);
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:`action.${nextStatus}`,object_type:"action_item",object_id:actionId,risk_level:nextStatus==="blocked"?"medium":"low",payload:{title:current.title,previous_status:current.status,status:nextStatus,priority,note,due_at:dueAt?.toISOString()??null}});
  revalidatePath("/actions"); revalidatePath("/projects"); revalidatePath("/command-center");
  redirect(`/actions?action=${actionId}&status=${nextStatus}&project=${projectFilter}&message=Action%20item%20updated.`);
}

export default async function ActionItemEngine({searchParams}:Props){
  const params=await searchParams; const {supabase,organizationId}=await ownerContext();
  const selectedStatus=statuses.has(params.status as ActionStatus)?params.status as ActionStatus:"open";
  const selectedPriority=["1","2","3","4","5"].includes(params.priority??"")?Number(params.priority):null;
  const {data:projectData}=await supabase.from("projects").select("id,project_code,name,status").eq("organization_id",organizationId).order("priority",{ascending:true});
  const projects=(projectData??[]) as Project[];
  const selectedProject=projects.some(p=>p.id===params.project)?params.project??null:null;

  let extendedQuery=supabase.from("action_items").select(extendedFields).eq("organization_id",organizationId).eq("status",selectedStatus).order("priority",{ascending:true}).order("due_at",{ascending:true,nullsFirst:false}).limit(100);
  if(selectedPriority) extendedQuery=extendedQuery.eq("priority",selectedPriority); if(selectedProject) extendedQuery=extendedQuery.eq("project_id",selectedProject);
  const extendedResult=await extendedQuery; const schemaReady=!extendedResult.error;
  let actions:ActionRow[]=[];
  if(schemaReady) actions=(extendedResult.data??[]) as unknown as ActionRow[];
  else { let legacyQuery=supabase.from("action_items").select(legacyFields).eq("organization_id",organizationId).eq("status",selectedStatus).order("priority",{ascending:true}).order("due_at",{ascending:true,nullsFirst:false}).limit(100); if(selectedPriority)legacyQuery=legacyQuery.eq("priority",selectedPriority); const legacyResult=await legacyQuery; actions=((legacyResult.data??[]) as unknown as Record<string,unknown>[]).map(normalizeLegacy); }

  const selectedId=params.action??actions[0]?.id??null; let selected:ActionRow|null=null;
  if(selectedId){ if(schemaReady) selected=((await supabase.from("action_items").select(extendedFields).eq("organization_id",organizationId).eq("id",selectedId).maybeSingle()).data as unknown as ActionRow|null); else { const legacySelected=(await supabase.from("action_items").select(legacyFields).eq("organization_id",organizationId).eq("id",selectedId).maybeSingle()).data as unknown as Record<string,unknown>|null; selected=legacySelected?normalizeLegacy(legacySelected):null; } }
  const agent=selected?.assigned_agent_id?((await supabase.from("agents").select("agent_code,display_name,name,role_title").eq("id",selected.assigned_agent_id).maybeSingle()).data):null;
  const audit=selected?(((await supabase.from("audit_events").select("id,event_type,actor_type,risk_level,created_at").eq("organization_id",organizationId).eq("object_type","action_item").eq("object_id",selected.id).order("created_at",{ascending:false}).limit(25)).data??[]) as AuditRow[]):[];
  const isFinal=selected?["completed","cancelled"].includes(selected.status):false;
  const projectName=(id:string|null)=>projects.find(p=>p.id===id)?.project_code??"Company-wide";

  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM ACTION ITEM ENGINE</p><h1>Accountable execution control</h1><p className="subtitle">Govern commitments across all projects, then filter into the project context you need.</p></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Link className="secondary-button" href="/projects">Project Portfolio</Link><Link className="secondary-button" href="/command-center">Command Center</Link></div></header>
    <section className="organization-banner"><div><span>Authority</span><strong>Human CEO / Owner</strong></div><div><span>Project scope</span><strong>{selectedProject?projectName(selectedProject):"All projects"}</strong></div><div><span>External actions</span><strong>Disabled</strong></div></section>
    {!schemaReady?<p className="security-note">Execution metadata migration is pending. Existing Action Items remain available in legacy-safe mode.</p>:null}
    {params.message?<p className="form-success">{params.message}</p>:null}{params.error?<p className="form-error">{params.error}</p>:null}
    <section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">Execution register</p><h2>Action Item Inbox</h2></div><span className="pill">{actions.length} matching items</span></div>
      <form method="get" className="action-filter-grid"><select name="project" defaultValue={selectedProject??""}><option value="">All projects</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}</select><select name="status" defaultValue={selectedStatus}><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select><select name="priority" defaultValue={selectedPriority?.toString()??""}><option value="">All priorities</option>{[1,2,3,4,5].map(p=><option key={p} value={p}>{p}{p===1?" — Highest":p===5?" — Lowest":""}</option>)}</select><button className="secondary-button">Apply filters</button></form>
      <div className="action-workspace-grid">
        <div className="data-list">{actions.length?actions.map(a=><Link key={a.id} href={`/actions?project=${selectedProject??""}&status=${selectedStatus}&priority=${selectedPriority??""}&action=${a.id}`} className="action-list-link"><strong>{a.action_code?`${a.action_code} · `:""}{a.title}</strong><span>{projectName(a.project_id)} · P{a.priority} · {a.risk_level??"legacy"} risk · Due {formatDate(a.due_at)}</span></Link>):<p className="empty-state">No action items match these filters.</p>}</div>
        {selected?<article className="action-detail-card"><div className="panel-heading"><div><p className="label">{selected.action_code??"Action details"}</p><h2>{selected.title}</h2></div><div className="row-meta"><span>{projectName(selected.project_id)}</span><span>P{selected.priority}</span>{selected.risk_level?<span>{selected.risk_level} risk</span>:null}<b className={selected.status==="completed"?"state-active":"state-paused"}>{selected.status}</b></div></div><p style={{color:"#596579",lineHeight:1.65}}>{selected.description??"No description recorded."}</p><div className="compact-list"><div><strong>Phase</strong><span>{selected.phase_name??"General company action"}</span></div><div><strong>Owner / assigned agent</strong><span>{selected.owner_label??"Human CEO"}{agent?` · ${agent.agent_code} · ${agent.display_name??agent.name}`:""}</span></div><div><strong>Due</strong><span>{formatDate(selected.due_at)}</span></div><div><strong>Dependencies</strong><span>{asList(selected.dependencies).join(" · ")||"None"}</span></div><div><strong>Success criteria</strong><span>{asList(selected.success_criteria).join(" · ")||"Not specified"}</span></div><div><strong>Evidence required</strong><span>{asList(selected.evidence_required).join(" · ")||"Not specified"}</span></div></div>{!isFinal?<form action={updateAction} className="auth-form" style={{marginTop:20}}><input type="hidden" name="actionId" value={selected.id}/><input type="hidden" name="projectFilter" value={selectedProject??""}/><label>Status<select name="nextStatus" defaultValue={selected.status}>{["open","in_progress","blocked","completed","cancelled"].map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}</select></label><label>Priority<select name="priority" defaultValue={selected.priority.toString()}>{[1,2,3,4,5].map(v=><option key={v} value={v}>{v}</option>)}</select></label><label>Due date<input name="dueAt" type="datetime-local"/></label><label>Transition note<textarea name="note" minLength={3} required rows={4}/></label><button>Update action item</button></form>:<p className="security-note">Final action items are immutable.</p>}<div style={{marginTop:22}}><p className="label">Audit trail</p><div className="compact-list">{audit.length?audit.map(e=><div key={e.id}><strong>{e.event_type}</strong><span>{e.actor_type} · {e.risk_level} risk · {formatDate(e.created_at)}</span></div>):<p className="empty-state">No audit events recorded.</p>}</div></div></article>:<p className="empty-state">Select an action item to inspect.</p>}
        <form action={createAction} className="auth-form action-create-card"><div><p className="label">Human CEO entry</p><h3>Create action item</h3></div><label>Project<select name="projectId" defaultValue={selectedProject??""}><option value="">Company-wide</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}</select></label><label>Title<input name="title" minLength={3} required/></label><label>Description<textarea name="description" rows={4}/></label><label>Priority<select name="priority" defaultValue="3">{[1,2,3,4,5].map(v=><option key={v} value={v}>{v}</option>)}</select></label><label>Due date<input name="dueAt" type="datetime-local"/></label><button>Create governed action</button></form>
      </div>
    </section>
  </main>;
}
