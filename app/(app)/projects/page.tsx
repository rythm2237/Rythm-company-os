import { SubmitButton } from "@/components/ui/Button";
import { ProjectsPortfolio } from "@/components/projects/projects-portfolio";
import { createHash, randomUUID } from "node:crypto";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizationContext } from "@/lib/auth/organization-context";
import { canCrm, requireCrm } from "@/lib/crm/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { calculateProjectProgressSnapshot, getProjectProgressSnapshots } from "@/lib/projects/project-progress";

export const dynamic="force-dynamic";

type Project={id:string;customer_id:string|null;primary_manager_user_id:string|null;engagement_type:string;project_code:string;name:string;description:string|null;status:string;stage:string;priority:number;progress_percent:number;readiness_score:number;target_date:string|null;updated_at:string;responsible_department:string|null;lifecycle_state:string;overall_project_progress:number;next_required_action:string|null;work_progress:number;deliverable_progress:number;implementation_progress:number;verification_progress:number;outcome_progress:number;acceptance_progress:number;closeout_progress:number;completion_eligible:boolean;};
type ProjectEntity={project_id:string|null;status?:string};
const text=(form:FormData,key:string,max=5000)=>String(form.get(key)??"").trim().slice(0,max);
const jsonLines=(value:string)=>value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
const safeName=(value:string)=>value.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").slice(-160)||"file";
function formatDate(value:string|null){return value?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium"}).format(new Date(value)):"No target date";}
function label(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,char=>char.toUpperCase());}


async function createProject(formData:FormData){
  "use server";
  const {supabase,organizationId,user}=await requireOrganizationContext();
  await requireCrm(supabase,organizationId,"project.create");
  const objective=text(formData,"objective",5000);
  const quickStart=text(formData,"quickStart",10)==="1";
  const projectCode=(quickStart?`PROJECT-${randomUUID().slice(0,8).toUpperCase()}`:text(formData,"projectCode",40).toUpperCase().replace(/[^A-Z0-9-]+/g,"-").replace(/^-+|-+$/g,""));
  const name=quickStart?objective.slice(0,120):text(formData,"name",120);const description=text(formData,"description",5000);
  if(projectCode.length<3||name.length<3)redirect("/projects?error=Project%20code%20and%20name%20must%20contain%20at%20least%203%20characters.");
  const priority=Math.max(1,Math.min(5,Number(formData.get("priority")??3)));
  const startDate=text(formData,"startDate",20)||null;const targetDate=text(formData,"targetDate",20)||null;
  const tags=text(formData,"tags",1000).split(",").map(v=>v.trim()).filter(Boolean).slice(0,30);
  const autonomyMode=text(formData,"autonomyMode",80)||"approval_required";
  const managerId=text(formData,"primaryManager",36),customerId=text(formData,"customerId",36)||null;
  const engagementType=text(formData,"engagementType",20)||"internal";
  if(!managerId||(engagementType==="external"&&!customerId)||(engagementType==="internal"&&customerId))redirect("/projects?error=Select+one+manager+and+a+customer+for+external+projects.");
  const {data:eligible}=await supabase.from("organization_members").select("user_id").eq("organization_id",organizationId).eq("user_id",managerId).eq("membership_status","active").maybeSingle();
  if(!eligible)redirect("/projects?error=Select+an+active+company+member+as+manager.");
  if(customerId){const {data:customer}=await supabase.from("crm_accounts").select("id").eq("organization_id",organizationId).eq("id",customerId).maybeSingle();if(!customer)redirect("/projects?error=Customer+unavailable.");}
  const selectedContract=text(formData,"existingContract",36);
  if(selectedContract)await requireCrm(supabase,organizationId,"contract.update","contract",selectedContract);
  const hasCommercialInput=Boolean(text(formData,"contractNumber")||text(formData,"contractValue")||text(formData,"deliverables")||text(formData,"paymentTerms")||text(formData,"specialClauses"));
  if(hasCommercialInput)await requireCrm(supabase,organizationId,"contract.create","customer",customerId||organizationId);
  if(hasCommercialInput&&!customerId)redirect("/projects?error=Commercial+contracts+require+a+selected+customer.");
  if(text(formData,"contractValue")&&(!Number.isFinite(Number(text(formData,"contractValue")))||Number(text(formData,"contractValue"))<0))redirect("/projects?error=Enter+a+valid+contract+value.");
  const category=text(formData,"fileCategory",80)||"other";
  const protectedDomain=["contract","amendment","nda","statement_of_work"].includes(category)?"contract":category==="financial"?"finance":null;
  if(protectedDomain&&formData.getAll("files").some(v=>v instanceof File&&v.size>0))await requireCrm(supabase,organizationId,protectedDomain+".update");
  const {data:project,error}=await supabase.from("projects").insert({organization_id:organizationId,project_code:projectCode,name,description,primary_manager_user_id:managerId,customer_id:customerId,engagement_type:engagementType,project_type:text(formData,"projectType",80)||"business_project",status:"planning",stage:"intake",priority,owner_type:"human_ceo",objective,scope:{},success_criteria:jsonLines(text(formData,"successCriteria",5000)),constraints:["Human CEO retains consequential authority","External actions remain governed by Integration & Execution Gateway",...jsonLines(text(formData,"constraints",5000))],progress_percent:0,created_by_user_id:user.id,start_date:startDate,target_date:targetDate,internal_owner_label:text(formData,"internalOwner",160)||null,responsible_department:text(formData,"responsibleDepartment",160)||null,tags,notes:text(formData,"notes",8000),autonomy_mode:autonomyMode,readiness_score:0}).select("id").single();
  if(error||!project){console.error("project_create_failed",{projectCode,error});redirect("/projects?error=Project%20could%20not%20be%20created.%20Confirm%20the%20project%20code%20is%20unique%20and%20retry.");}

  if(selectedContract){const {error:linkError}=await supabase.from("project_contract_links").insert({organization_id:organizationId,project_id:project.id,contract_id:selectedContract});if(linkError)redirect(`/projects/operating?project=${project.id}&programError=Project+saved.+Contract+link+failed.`);}
  const contractNumber=text(formData,"contractNumber",160);const contractValue=text(formData,"contractValue",80);
  const hasContract=Boolean(contractNumber||contractValue||text(formData,"deliverables")||text(formData,"paymentTerms")||text(formData,"specialClauses"));
  if(hasContract){const {error:contractError}=await supabase.from("project_contracts").insert({organization_id:organizationId,project_id:project.id,customer_id:customerId,contract_number:contractNumber||null,contract_start_date:text(formData,"contractStartDate",20)||null,contract_end_date:text(formData,"contractEndDate",20)||null,contract_value:contractValue?Number(contractValue):null,currency:text(formData,"currency",12)||null,payment_terms:text(formData,"paymentTerms",3000)||null,deliverables:jsonLines(text(formData,"deliverables",8000)),sla:{text:text(formData,"sla",4000)},milestones:jsonLines(text(formData,"contractMilestones",8000)),provider_obligations:jsonLines(text(formData,"providerObligations",8000)),client_obligations:jsonLines(text(formData,"clientObligations",8000)),exclusions:jsonLines(text(formData,"exclusions",8000)),dependencies:jsonLines(text(formData,"dependencies",8000)),approval_requirements:jsonLines(text(formData,"approvalRequirements",8000)),termination_conditions:text(formData,"terminationConditions",4000)||null,confidentiality_requirements:text(formData,"confidentiality",4000)||null,ip_ownership:text(formData,"ipOwnership",4000)||null,data_protection_requirements:text(formData,"dataProtection",4000)||null,special_clauses:jsonLines(text(formData,"specialClauses",8000)),notes:text(formData,"contractNotes",8000)});if(contractError)redirect(`/projects/operating?project=${project.id}&programError=Project+saved.+Contract+could+not+be+saved.+Review+access+and+retry.`);}

  const resources=[
    {type:"website",name:"Website",url:text(formData,"website",1200)},
    {type:"github",name:"GitHub repository",url:text(formData,"github",1200)},
    {type:"google_drive",name:"Google Drive",url:text(formData,"drive",1200)},
    {type:"figma",name:"Figma",url:text(formData,"figma",1200)},
  ].filter(r=>r.url);
  if(resources.length)await supabase.from("project_resources").insert(resources.map(r=>({organization_id:organizationId,project_id:project.id,resource_type:r.type,name:r.name,url:r.url,status:"connected",source:"project_intake",access_status:"unknown"})));

  const files=formData.getAll("files").filter((item):item is File=>item instanceof File&&item.size>0).slice(0,20);
  if(files.length){
    const service=createServerSupabaseClient();
    if(service){for(const file of files){if(file.size>50*1024*1024)continue;const bytes=Buffer.from(await file.arrayBuffer());const storagePath=`${organizationId}/${project.id}/${randomUUID()}-${safeName(file.name)}`;const uploaded=await service.storage.from("project-files").upload(storagePath,bytes,{contentType:file.type||"application/octet-stream",upsert:false});if(!uploaded.error){const category=text(formData,"fileCategory",80)||"other";await service.from("project_documents").insert({organization_id:organizationId,project_id:project.id,category,file_name:file.name,storage_path:storagePath,mime_type:file.type,byte_size:file.size,checksum:createHash("sha256").update(bytes).digest("hex"),legal_document:["contract","amendment","nda","statement_of_work"].includes(category),uploaded_by_user_id:user.id});}}}
  }
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"project.created",object_type:"project",object_id:project.id,risk_level:"low",payload:{project_code:projectCode,name,human_authority:"Human CEO / Owner",autonomy_mode:autonomyMode,files:files.length}});
  revalidatePath("/projects");redirect(`/projects/operating?project=${project.id}`);
}

export default async function ProjectsPortfolioPage({searchParams}:{searchParams:Promise<{error?:string;customer?:string}>}){
  const query=await searchParams;const {supabase,organizationId}=await requireOrganizationContext();
  const canCreate=await canCrm(supabase,organizationId,"project.create");
  const [projectsResult,attentionResult,customersResult,membersResult,contractsResult,canContract]=await Promise.all([
    supabase.from("projects").select("id,customer_id,primary_manager_user_id,engagement_type,project_code,name,description,status,stage,priority,progress_percent,readiness_score,target_date,updated_at,responsible_department,lifecycle_state,overall_project_progress,next_required_action,work_progress,deliverable_progress,implementation_progress,verification_progress,outcome_progress,acceptance_progress,closeout_progress,completion_eligible").eq("organization_id",organizationId).order("priority").order("updated_at",{ascending:false}),
    supabase.from("project_proposals").select("project_id,status").eq("organization_id",organizationId).in("status",["ready_for_executive","needs_revision"])
    ,supabase.from("crm_accounts").select("id,name").eq("organization_id",organizationId).neq("customer_status","archived").order("name"),
    supabase.from("organization_members").select("user_id,display_name").eq("organization_id",organizationId).eq("membership_status","active"),
    supabase.from("project_contracts").select("id,contract_number,customer_id").eq("organization_id",organizationId).order("contract_number"),
    canCrm(supabase,organizationId,"contract.create")
  ]);
  const accountability=<div className="crm-fields"><label>Project classification<select name="engagementType" defaultValue={query.customer?"external":"internal"}><option value="internal">Internal</option><option value="external">External customer project</option></select></label><label>Customer<select name="customerId" defaultValue={query.customer||""}><option value="">No customer (internal only)</option>{customersResult.data?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Primary accountable manager<select name="primaryManager" required defaultValue=""><option value="" disabled>Select one manager</option>{membersResult.data?.map(m=><option key={m.user_id} value={m.user_id}>{m.display_name||m.user_id}</option>)}</select></label><label>Existing contract (authorized only)<select name="existingContract"><option value="">No contract</option>{contractsResult.data?.map(c=><option key={c.id} value={c.id}>{c.contract_number||"Contract"}</option>)}</select></label></div>;
  const projects=(projectsResult.data??[]) as Project[];const progressSnapshots=await getProjectProgressSnapshots(supabase,organizationId,projects);const attention=(attentionResult.data??[]) as ProjectEntity[];
  const running=projects.filter(p=>!["COMPLETED","CANCELLED","FAILED","BLOCKED","ON_HOLD"].includes(p.lifecycle_state)).length;const blocked=projects.filter(p=>["BLOCKED","ON_HOLD"].includes(p.lifecycle_state)).length;const completed=projects.filter(p=>p.lifecycle_state==="COMPLETED").length;
  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>Projects</h1><p className="subtitle">See what RYTHM is working on and what comes next.</p></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Link className="secondary-button" href="/inbox">Inbox</Link><Link className="secondary-button" href="/home">Ask RYTHM</Link></div></header>
    {query.error?<p className="form-error">{query.error}</p>:null}
    <section className="organization-banner"><div><span>Total projects</span><strong>{projects.length}</strong></div><div><span>Running</span><strong>{running}</strong></div><div><span>Needs attention</span><strong>{attention.length}</strong></div><div><span>Blocked</span><strong>{blocked}</strong></div><div><span>Completed</span><strong>{completed}</strong></div></section>

    {canCreate?<details id="create-project" open={Boolean(query.customer)} className="panel panel-wide" style={{marginTop:18}}><summary style={{cursor:"pointer",fontWeight:800}}>Start a project here</summary><div aria-labelledby="project-objective-heading"><div className="panel-heading"><div><p className="label">Delegate an outcome</p><h2 id="project-objective-heading">What should your company accomplish?</h2></div><span className="pill">Start with an objective</span></div><form action={createProject} className="auth-form"><input type="hidden" name="quickStart" value="1"/>{accountability}<label>Objective<textarea name="objective" required minLength={3} maxLength={5000} rows={3} placeholder="Build a landing page for my SaaS product, then show me a preview for review."/></label><SubmitButton type="submit">Create project</SubmitButton><p className="security-note">Next, run Project Analysis in the project workspace to get a roadmap, team and required connections. Execution starts only after readiness and approval gates are satisfied.</p></form></div></details>:null}

    {canCreate?<section className="panel panel-wide" style={{marginTop:18}}><details><summary style={{cursor:"pointer",fontWeight:800,fontSize:18}}>Advanced project setup</summary><form action={createProject} className="auth-form" style={{marginTop:18}}>
      <div className="panel-heading"><div><p className="label">1 · Project Identity</p><h2>Outcome and ownership</h2></div><span className="pill">One accountable manager required</span></div>{accountability}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}><label>Project code<input name="projectCode" required minLength={3} maxLength={40} placeholder="AI-CAREER-SEO"/></label><label>Project name<input name="name" required minLength={3} maxLength={120}/></label><label>Project type<input name="projectType" placeholder="SEO, campaign, product, client delivery…"/></label><label>Priority<select name="priority" defaultValue="3"><option value="1">P1 · Critical</option><option value="2">P2 · High</option><option value="3">P3 · Normal</option><option value="4">P4 · Low</option><option value="5">P5 · Backlog</option></select></label><label>Start date<input type="date" name="startDate"/></label><label>Target completion<input type="date" name="targetDate"/></label><label>Internal owner<input name="internalOwner"/></label><label>Responsible department<input name="responsibleDepartment"/></label><label>Tags<input name="tags" placeholder="SEO, Growth, AI Career"/></label><label>Autonomy<select name="autonomyMode" defaultValue="approval_required"><option value="observe_only">Observe Only</option><option value="approval_required">Approval Required</option><option value="limited_autonomy">Limited Autonomy</option><option value="full_autonomy_within_policy">Full Autonomy Within Policy</option></select></label></div>
      <label>Description<textarea name="description" rows={3}/></label><label>Objective / desired outcome<textarea name="objective" rows={3}/></label><label>Success criteria · one per line<textarea name="successCriteria" rows={3}/></label><label>Constraints · one per line<textarea name="constraints" rows={3}/></label><label>Notes<textarea name="notes" rows={3}/></label>

      {canContract?<>      <div className="panel-heading" style={{marginTop:24}}><div><p className="label">3 · Contract & Commercial</p><h2>Commercial boundaries</h2></div><span className="pill">Optional · documents can supply this</span></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}><label>Contract number<input name="contractNumber"/></label><label>Start<input type="date" name="contractStartDate"/></label><label>End<input type="date" name="contractEndDate"/></label><label>Contract value<input type="number" min="0" step="0.01" name="contractValue"/></label><label>Currency<input name="currency" placeholder="EUR"/></label><label>Payment terms<input name="paymentTerms"/></label></div>
      <label>Deliverables · one per line<textarea name="deliverables" rows={3}/></label><label>SLA<textarea name="sla" rows={2}/></label><label>Milestones · one per line<textarea name="contractMilestones" rows={3}/></label><label>Our obligations · one per line<textarea name="providerObligations" rows={3}/></label><label>Client obligations · one per line<textarea name="clientObligations" rows={3}/></label><label>Exclusions / dependencies<textarea name="exclusions" rows={2}/><textarea name="dependencies" rows={2}/></label><label>Approval requirements<textarea name="approvalRequirements" rows={2}/></label><label>Termination / confidentiality / IP / data protection<textarea name="terminationConditions" rows={2} placeholder="Termination conditions"/><textarea name="confidentiality" rows={2} placeholder="Confidentiality requirements"/><textarea name="ipOwnership" rows={2} placeholder="IP ownership"/><textarea name="dataProtection" rows={2} placeholder="Data protection requirements"/></label><label>Special clauses · one per line<textarea name="specialClauses" rows={3}/></label><label>Contract notes<textarea name="contractNotes" rows={2}/></label>

</>:null}
      <div className="panel-heading" style={{marginTop:24}}><div><p className="label">4 · Resources & Files</p><h2>Project Knowledge inputs</h2></div><span className="pill">Optional</span></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}><label>Website<input type="url" name="website"/></label><label>GitHub repository<input type="url" name="github"/></label><label>Google Drive<input type="url" name="drive"/></label><label>Figma<input type="url" name="figma"/></label><label>File category<select name="fileCategory" defaultValue="other"><option value="contract">Contract</option><option value="amendment">Amendment</option><option value="nda">NDA</option><option value="statement_of_work">Statement of Work</option><option value="client_brief">Client Brief</option><option value="brand_guidelines">Brand Guidelines</option><option value="research">Research</option><option value="analytics">Analytics</option><option value="financial">Financial</option><option value="creative_asset">Creative Asset</option><option value="technical_documentation">Technical Documentation</option><option value="report">Report</option><option value="other">Other</option></select></label><label>Project files<input type="file" name="files" multiple accept=".pdf,.docx,.xlsx,.xls,.csv,.pptx,.txt,.png,.jpg,.jpeg,.webp"/></label></div>
      <SubmitButton>Create Project</SubmitButton><p className="security-note">Creation does not start autonomous execution. RYTHM first analyzes readiness, scope, team and required connections. Human CEO authority remains intact.</p>
    </form></details></section>:null}

    <ProjectsPortfolio projects={projects.map(project=>{
      const progress=progressSnapshots.get(project.id)??calculateProjectProgressSnapshot([],0,project.status,project.updated_at);
      const next=project.next_required_action||progress.nextMilestone||"Project analysis and roadmap";
      const manager=membersResult.data?.find(m=>m.user_id===project.primary_manager_user_id)?.display_name||(project.primary_manager_user_id?"Assigned manager":"Manager reconciliation required");
      const continuousScope=/(^|[^a-z])(seo|geo|aeo)([^a-z]|$)/i.test([project.name,project.description||"",project.project_code].join(" "));
      return {
        id:project.id,name:project.name,projectCode:project.project_code,
        department:project.responsible_department||"Team assignment pending",
        customer:customersResult.data?.find(c=>c.id===project.customer_id)?.name||"Internal",engagementType:project.engagement_type,manager,updated:project.updated_at,lifecycleState:project.lifecycle_state||project.status.toUpperCase(),
        progress:project.overall_project_progress,nextAction:next,approvalCount:progress.awaitingApproval||0,
        continuousScope,
      };
    })}/>
  </main>;
}
