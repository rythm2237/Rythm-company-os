import { ProjectApprovalProvider, ProjectApprovalCount, ProjectAttentionHeading, ProjectApprovalList } from "@/components/projects/ProjectApprovalState";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/ui/Button";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { getProjectOperatingTimeline, getProjectRelationships, refreshProjectWorkflowState, type EntityRelationship, type WorkflowTimelineItem } from "@/lib/workflow/server";
import { getProjectProgressSnapshot } from "@/lib/projects/project-progress";
import { getLatestProjectRoadmap } from "@/lib/projects/project-roadmap";
import { ProjectOsControls } from "@/components/projects/project-os-controls";
import { ProjectGovernanceControls } from "@/components/projects/project-governance-controls";
import ProjectAnalysisBrief from "@/components/projects/ProjectAnalysisBrief";
import { ContinuousProgramPanel, type ProgramReadModel, type ReviewReadModel, type ProgramProposalReadModel } from "@/components/projects/continuous-program-panel";

export const dynamic="force-dynamic";
type View="overview"|"roadmap"|"work"|"activity"|"decisions"|"files"|"results"|"advanced";
type Props={searchParams:Promise<{project?:string;view?:string;taskStatus?:string;taskAgent?:string;planning?:string;activityFilter?:string;programSaved?:string;programError?:string}>};
const views:Array<{key:View;label:string}>=[{key:"overview",label:"Overview"},{key:"roadmap",label:"Roadmap"},{key:"work",label:"Work"},{key:"activity",label:"Activity"},{key:"decisions",label:"Decisions"},{key:"files",label:"Files"},{key:"results",label:"Results"},{key:"advanced",label:"Advanced"}];
const legacyViews:Record<string,View>={live:"advanced",agents:"advanced",tasks:"work",approvals:"decisions",actions:"work"};
const label=(value:string)=>value.replaceAll("_"," ").replaceAll("."," · ");
const formatDate=(value:string|null|undefined)=>value?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)):"No activity yet";
function payloadSummary(item:WorkflowTimelineItem){const p=item.payload??{};const explicit=[p.event_label,p.label,p.reason,p.next_step,p.after_state].find(v=>typeof v==="string"&&v.trim());return typeof explicit==="string"?explicit:label(item.event_type);}
function destinationForRelationship(edge:EntityRelationship,projectId:string){const c=[edge.source_type,edge.target_type];if(c.includes("meeting")||c.includes("meeting_session")||c.includes("decision")||c.includes("legal_review"))return "/meetings/room";if(c.includes("action_item"))return `/actions?project=${projectId}`;if(c.includes("memory_record"))return "/memory";return `/projects/operating?project=${projectId}&view=overview`;}
async function ownerContext(){const {supabase,user,organizationId}=await requireOwnerOrganizationContext();return {supabase,user,organizationId};}

async function submitContinuousProposalForApproval(formData:FormData) {
  "use server";
  const {organizationId,user}=await ownerContext();
  const projectId=String(formData.get("projectId")??"");
  const proposalId=String(formData.get("proposalId")??"");
  if(!/^[a-f0-9-]{36}$/i.test(projectId)||!/^[a-f0-9-]{36}$/i.test(proposalId))redirect("/projects");
  const target=`/projects/operating?project=${encodeURIComponent(projectId)}&view=overview`;
  const service=createServerSupabaseClient();
  if(!service)redirect(target);
  const {error}=await service.rpc("submit_continuous_proposal_for_approval_v1",{
    p_proposal_id:proposalId,p_organization_id:organizationId,p_project_id:projectId,
    p_requested_by_user_id:user.id
  });
  if(error){
    console.error("continuous_program_approval_submission_failed",{projectId,proposalId,error:error.message});
    redirect(target+"&programError=Approval+submission+failed.+Review+governance+and+try+again");
  }
  revalidatePath("/projects/operating");
  redirect(target+"&programSaved=approval");
}

async function saveContinuousProgram(formData:FormData) {
  "use server";
  const {organizationId}=await ownerContext();
  const projectId=String(formData.get("projectId")??"");
  if(!/^[a-f0-9-]{36}$/i.test(projectId))redirect("/projects");
  const cadence=String(formData.get("cadence")??"weekly");
  const seoSiteId=String(formData.get("seoSiteId")??"");
  const enabled=formData.get("enabled")==="on";
  const service=createServerSupabaseClient();
  const destination=`/projects/operating?project=${encodeURIComponent(projectId)}&view=advanced`;
  if(!service)redirect(destination+"&programError=Service+configuration+unavailable");
  const {error}=await service.rpc("configure_continuous_program_v1",{
    p_project_id:projectId,p_organization_id:organizationId,
    p_seo_site_id:seoSiteId||null,p_cadence:cadence,p_enabled:enabled
  });
  if(error){
    console.error("continuous_program_configuration_failed",{projectId,message:error.message});
    redirect(destination+"&programError=Configuration+could+not+be+saved.+Check+the+project+governance+and+data+source");
  }
  revalidatePath("/projects/operating");
  redirect(destination+"&programSaved=1");
}

export default async function ProjectOperatingPage({searchParams}:Props){
  const params=await searchParams;const activeView=views.some(v=>v.key===params.view)?params.view as View:legacyViews[params.view??""]??"overview";const {supabase,organizationId}=await ownerContext();
  let query=supabase.from("projects").select("*").eq("organization_id",organizationId);query=params.project?query.eq("id",params.project):query.order("priority").limit(1);const {data:project}=await query.maybeSingle();
  if(!project)return <main className="command-shell"><section className="panel"><h1>Project operating view unavailable</h1><Link className="secondary-button" href="/projects">Back to Projects</Link></section></main>;
  let program:ProgramReadModel|null=null;
  let programReviews:ReviewReadModel[]=[];
  let programProposals:ProgramProposalReadModel[]=[];
  let seoSiteOptions:Array<{id:string;name:string;site_url:string}>=[];
  if("lifecycle_kind" in project && activeView==="advanced"){
    const seoSites=await supabase.from("agency_seo_sites").select("id,name,site_url").eq("organization_id",organizationId).eq("active",true);
    seoSiteOptions=seoSites.data??[];
  }
  if(project.lifecycle_kind==="continuous"){
    const programResult=await supabase.from("continuous_programs")
      .select("id,state,cadence,enabled,last_review_at,next_review_at,seo_site_id")
      .eq("organization_id",organizationId).eq("project_id",project.id).maybeSingle();
    program=programResult.data as ProgramReadModel|null;
    if(program){
      const reviewsResult=await supabase.from("continuous_program_review_cycles")
        .select("id,scheduled_for,state,summary,evidence,proposal_id")
        .eq("organization_id",organizationId).eq("program_id",program.id)
        .order("scheduled_for",{ascending:false}).limit(8);
      programReviews=(reviewsResult.data??[]) as ReviewReadModel[];
      const proposalIds=programReviews.map(row=>row.proposal_id).filter((id):id is string=>Boolean(id));
      if(proposalIds.length){
        const proposalsResult=await supabase.from("project_proposals")
          .select("id,title,executive_summary,status")
          .eq("organization_id",organizationId).eq("project_id",project.id)
          .in("id",proposalIds);
        programProposals=(proposalsResult.data??[]) as ProgramProposalReadModel[];
      }
    }
  }
  let workflowState=project.workflow_state??"INTAKE";try{workflowState=await refreshProjectWorkflowState(supabase,project.id,{entityType:"ui",reason:"Project Operating System convergence"});}catch{}
  const [client,contract,documents,resources,bindings,readiness,clarifications,scope,execution,tasks,team,proposals,activity,health,integrations,capabilities,timeline,relationships,meetings,decisions,approvals,projectActions]=await Promise.all([
    supabase.from("project_clients").select("*").eq("project_id",project.id).maybeSingle(),
    supabase.from("project_contracts").select("*").eq("project_id",project.id).maybeSingle(),
    supabase.from("project_documents").select("id,category,file_name,mime_type,byte_size,extraction_status,legal_document,created_at").eq("project_id",project.id).order("created_at",{ascending:false}),
    supabase.from("project_resources").select("*").eq("project_id",project.id).order("created_at"),
    supabase.from("project_connection_bindings").select("*").eq("project_id",project.id).order("created_at"),
    supabase.from("project_readiness_assessments").select("*").eq("project_id",project.id).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("project_clarification_requests").select("id,question,reason,input_type,options,materiality,status").eq("project_id",project.id).eq("status","open").order("created_at"),
    supabase.from("project_scope_versions").select("*").eq("project_id",project.id).order("version",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("project_executions").select("*").eq("project_id",project.id).order("execution_no",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("project_task_runs").select("id,execution_id,task_key,title,status,priority,assigned_agent_id,attempt_count,max_attempts,error_class,error_message,started_at,completed_at,updated_at,agents(agent_code,display_name,name)").eq("project_id",project.id).order("priority").order("created_at"),
    supabase.from("project_agents").select("assignment_role,status,authority_scope,agents(id,agent_code,display_name,name,role_title)").eq("project_id",project.id),
    supabase.from("project_proposals").select("*").eq("project_id",project.id).order("created_at",{ascending:false}),
    supabase.from("project_activity_events").select("*").eq("project_id",project.id).order("created_at",{ascending:false}).limit(60),
    supabase.from("project_health_events").select("*").eq("project_id",project.id).eq("status","open").order("detected_at",{ascending:false}),
    supabase.from("organization_integrations").select("id,provider_key,display_name,status").eq("organization_id",organizationId).order("provider_key"),
    supabase.from("integration_capabilities").select("provider_key,capability_key,description,risk_level,default_approval_mode").eq("enabled",true),
    getProjectOperatingTimeline(supabase,project.id,40),getProjectRelationships(supabase,project.id),
    supabase.from("meetings").select("id",{count:"exact",head:true}).eq("project_id",project.id),supabase.from("decisions").select("id",{count:"exact",head:true}).eq("project_id",project.id),supabase.from("approval_requests").select("id,status,title,summary,risk_level,created_at",{count:"exact"}).eq("project_id",project.id),
    supabase.from("action_items").select("id,title,status,priority,updated_at,assigned_agent_id").eq("project_id",project.id).order("updated_at",{ascending:false}),
  ]);
  const openClarifications=clarifications.data??[];const latestReadiness=readiness.data;const latestScope=scope.data;const latestExecution=execution.data;const allTaskRows=tasks.data??[];
  const taskRows=latestExecution?allTaskRows.filter((task:any)=>task.execution_id===latestExecution.id):allTaskRows;
  const proposalRows=proposals.data??[];const attention=proposalRows.filter((p:any)=>["ready_for_executive","needs_revision","internal_review"].includes(p.status));const pendingApprovalRows=(approvals.data??[]).filter((a:any)=>a.status==="pending");
  const roadmap=await getLatestProjectRoadmap(supabase,organizationId,project.id);
  const progress=await getProjectProgressSnapshot(supabase,organizationId,{id:project.id,status:project.status,updated_at:activity.data?.[0]?.created_at??project.updated_at});
  const agents=team.data??[];const activeAgents=agents.filter((a:any)=>["active","assigned"].includes(a.status));
  const canRun=Number(project.readiness_score??0)>=50&&openClarifications.filter((c:any)=>c.materiality==="required").length===0&&!latestExecution?.status?.match(/^(queued|running|paused)$/);
  const selectedStatus=params.taskStatus??"all",selectedAgent=params.taskAgent??"all";
  const filteredTasks=taskRows.filter((task:any)=>(selectedStatus==="all"||task.status===selectedStatus)&&(selectedAgent==="all"||task.assigned_agent_id===selectedAgent));
  const activityFilter=["important","all","agent","system"].includes(params.activityFilter??"")?params.activityFilter:"important";
  const visibleActivity=(activity.data??[]).filter((event:any)=>activityFilter==="all"?true:activityFilter==="important"?["attention","major"].includes(event.importance):activityFilter==="agent"?String(event.event_type).startsWith("agent.")||Boolean(event.agent_id):!event.agent_id);
  const isContinuous=project.lifecycle_kind==="continuous";
  const onHold=["ON_HOLD","BLOCKED","PAUSED"].includes(String(project.lifecycle_state??"")) ||
    ["blocked","on_hold","paused"].includes(String(project.status??"").toLowerCase());
  const workComplete=progress.hasApprovedRoadmap && progress.progressPercent>=100;
  const canDeclareCompleted=Boolean(project.completion_eligible)&&
    !onHold && !isContinuous && String(project.lifecycle_state)==="COMPLETED";
  const projectHealthLabel=onHold?"On hold":isContinuous?"Ongoing program":canDeclareCompleted?"Completed":
    workComplete?"Delivery complete · verification pending":label(String(project.lifecycle_state??project.status));
  const nextStepText=typeof project.next_required_action==="string"&&project.next_required_action.trim()
    ?project.next_required_action.trim()
    :onHold?"Review the open governance holds before resuming execution."
    :isContinuous?"Monitor verified outcomes and complete scheduled reviews."
    :"Review the latest roadmap milestone and outstanding work.";
  const navCount=(view:View)=>view==="work"?taskRows.length+(projectActions.data?.length??0):view==="decisions"?pendingApprovalRows.length:view==="files"?(documents.data?.length??0):view==="activity"?(activity.data?.length??0):null;
  return <ProjectApprovalProvider key={`${project.id}:${activeView}`} initialApprovals={pendingApprovalRows}><main className="command-shell">
    <header className="command-header project-detail-hero">
      <div className="project-detail-identity">
        <Link href="/projects" className="project-detail-back">← All projects</Link>
        <p className="eyebrow">PROJECT · {project.project_code}{isContinuous?" · CONTINUOUS PROGRAM":""}</p>
        <h1>{project.name}</h1>
        <p className="subtitle project-detail-objective">{project.objective||project.description||"Governed autonomous project."}</p>
      </div>
      <div className="project-detail-header-side">
        <span className={onHold?"project-state-label is-blocked":"project-state-label"}>{projectHealthLabel}</span>
        <Link className="secondary-button" href={`/projects/operating?project=${project.id}&view=decisions`}>Decisions <ProjectApprovalCount/></Link>
      </div>
    </header>
    <nav className="project-subnav project-detail-tabs" aria-label="Project workspace">{views.map(view=><Link key={view.key} aria-current={activeView===view.key?"page":undefined} className={activeView===view.key?"active":""} href={`/projects/operating?project=${project.id}&view=${view.key}`}>{view.label}{navCount(view.key)!=null?<span>{view.key==="decisions"?<ProjectApprovalCount/>:navCount(view.key)}</span>:null}</Link>)}</nav>
    <section className="project-detail-summary" aria-label="Project status summary">
      <div className="project-detail-summary-item"><span>Overall project progress</span><strong>{typeof project.overall_project_progress==="number"?`${project.overall_project_progress}%`:"Pending assessment"}</strong></div>
      <div className="project-detail-summary-item"><span>Roadmap delivery</span><strong>{progress.hasApprovedRoadmap?`${progress.progressPercent}%`:"No approved baseline"}</strong></div>
      <div className="project-detail-summary-item"><span>Outcome evidence</span><strong>{progress.outcomeProgressPercent==null?"Not yet validated":`${progress.outcomeProgressPercent}%`}</strong></div>
      <div className="project-detail-summary-item"><span>Active work</span><strong>{taskRows.filter((task:any)=>["running","queued","in_progress"].includes(String(task.status).toLowerCase())).length} running</strong></div>
    </section>
    {(onHold||workComplete&&!canDeclareCompleted)?<section className="project-detail-next-action" role="status" aria-label="Required next action">
      <div><strong>{onHold?"Project paused by governance":isContinuous?"Delivery milestones finished · monitoring remains open":"Delivery milestones finished · final verification required"}</strong>
      <p>{nextStepText}</p></div><Link className="secondary-button" href={`/projects/operating?project=${project.id}&view=${onHold?"decisions":"results"}`}>{onHold?"Review governance":"View outcome evidence"} →</Link>
    </section>:null}
    {activeView==="roadmap"?<section className="panel project-view-panel project-roadmap-panel">
      <div className="panel-heading"><div><p className="label">Delivery plan</p><h2>{roadmap?.title??"Roadmap not created"}</h2></div>
        <span className="pill">{roadmap?.isBaseline?"Approved baseline":roadmap?.status??"Planning"}</span>
      </div>
      <p className="subtitle">{roadmap?.summary??"Analyze the project to prepare a reviewable roadmap."}</p>
      {roadmap?.phases?.length?<ol className="project-phase-grid">
        {roadmap.phases.map(phase=>{
          const state=String(phase.status??"not_started").toLowerCase();
          const completed=["completed","done","validated"].includes(state);
          const current=["active","running","in_progress"].includes(state);
          return <li className={`project-phase-card ${completed?"is-complete":current?"is-current":""}`} key={phase.key}>
            <div className="project-phase-top"><span className="project-phase-number">{completed?"✓":phase.order}</span><span className="project-phase-state">{label(state)}</span></div>
            <h3>{phase.title}</h3>
            <p>{phase.milestone||phase.description||"Milestone to be confirmed."}</p>
            <div className="project-phase-foot"><span>{phase.weight}% of delivery scope</span>
              <details><summary>Deliverables</summary><p>{phase.deliverables.join(", ")||"To be defined"}</p></details>
            </div>
          </li>;
        })}
      </ol>:<p className="security-note">No approved roadmap yet. Start with Project Analysis below.</p>}
      <p className="security-note">Roadmap delivery completion is not overall project completion. Business outcomes, approvals and continuous monitoring are tracked separately.</p>
    </section>:null}
        {params.planning==="retry"?<p className="form-error" role="alert">The request was saved, but automatic planning did not finish. Open Roadmap and retry the analysis.</p>:null}
    {(activeView==="roadmap"||activeView==="advanced"||activeView==="decisions"||activeView==="files")?<ProjectOsControls projectId={project.id} canRun={canRun} status={latestExecution?.status??project.stage} analysisComplete={Boolean(latestReadiness)} showLiveOperations={activeView==="advanced"||activeView==="decisions"} liveMode={activeView==="decisions"?"approvals":"full"} showFileUpload={activeView==="files"} compactRoadmap={activeView==="roadmap"}/>:null}

    {(activeView==="overview"||activeView==="decisions")?<section className="panel executive-inbox-compact"><div className="panel-heading"><div><p className="label">Executive Inbox</p><h2><ProjectAttentionHeading proposalCount={attention.length}/></h2></div><Link className="secondary-button" href="/inbox?category=approvals">Review approvals</Link></div>{attention.slice(0,3).map((p:any)=><div className="data-row" key={p.id}><div><strong>{p.title}</strong><span>{p.executive_summary}</span></div><span className="pill">{p.risk_level}</span></div>)}</section>:null}

    {activeView==="overview"?<>
      {params.programError?<p role="alert" className="form-error">{params.programError}</p>:null}
      {project.lifecycle_kind==="continuous"?<ContinuousProgramPanel projectId={project.id} program={program} reviews={programReviews} proposals={programProposals} submitProposalAction={submitContinuousProposalForApproval} notice={params.programSaved}/>:null}
      {latestReadiness?<ProjectAnalysisBrief projectId={project.id} objective={project.objective} readiness={latestReadiness} team={agents as any} clarifications={openClarifications as any} assumptions={latestScope?.assumptions}/>:null}
      <ProjectGovernanceControls projectId={project.id} projectStatus={project.status} clarifications={openClarifications as any} connections={(integrations.data??[]) as any} capabilities={(capabilities.data??[]) as any} latestScope={latestScope?{id:latestScope.id,status:latestScope.status}:null}/>
      <section className="executive-grid project-view-panel"><article className="panel"><div className="panel-heading"><div><p className="label">Execution Readiness</p><h2>{latestReadiness?.execution_readiness??project.readiness_score??0}% ready</h2></div><span className="pill">Inputs and dependencies</span></div><p className="subtitle">Readiness measures context, scope, integrations, team, clarifications and evidence. It does not represent completed work.</p>{latestReadiness?<div className="data-list"><div className="data-row"><div><strong>Project understanding</strong><span>{latestReadiness.project_understanding}%</span></div></div><div className="data-row"><div><strong>Contract understanding</strong><span>{latestReadiness.contract_understanding}%</span></div></div><div className="data-row"><div><strong>Connections</strong><span>{latestReadiness.connections_available}/{latestReadiness.connections_total}</span></div></div><div className="data-row"><div><strong>Team readiness</strong><span>{latestReadiness.team_readiness}%</span></div></div></div>:<p className="subtitle">Run Project Analysis to create readiness, scope, team and connection recommendations.</p>}</article><article className="panel"><div className="panel-heading"><div><p className="label">Roadmap Progress</p><h2>{progress.hasApprovedRoadmap?`${progress.progressPercent}% complete`:"Not baselined"}</h2></div><span className="pill">{progress.hasApprovedRoadmap?`roadmap v${progress.roadmapVersion}`:"manager approval required"}</span></div><div className="project-progress-track"><span style={{width:`${progress.hasApprovedRoadmap?progress.progressPercent:0}%`}}/></div><div className="project-card-metrics"><div><span>Task count</span><strong>{progress.completedTasks}/{progress.totalTasks}</strong></div><div><span>Task completion</span><strong>{progress.taskCompletionPercent}%</strong></div><div><span>Current phase</span><strong>{progress.currentPhase??"—"}</strong></div><div><span>Outcome progress</span><strong>{progress.outcomeProgressPercent==null?"Pending evidence":`${progress.outcomeProgressPercent}%`}</strong></div><div><span>Awaiting approval</span><strong><ProjectApprovalCount/></strong></div><div><span>Blocked / failed</span><strong>{progress.blockedTasks+progress.failedTasks}</strong></div></div><p className="security-note">Roadmap progress is weighted against the manager-approved baseline. Raw task count is informational only. Execution is persisted server-side.</p></article></section>
      <section className="executive-grid project-view-panel"><article className="panel"><div className="panel-heading"><div><p className="label">Client</p><h2>{client.data?.client_name??"Internal / not specified"}</h2></div></div><p className="subtitle">{client.data?.legal_company_name||client.data?.country||"No external counterparty was provided."}</p></article><article className="panel"><div className="panel-heading"><div><p className="label">Contract</p><h2>{contract.data?.contract_number||"No structured contract"}</h2></div><span className="pill">{contract.data?.legal_review_status??"not requested"}</span></div><p className="subtitle">{contract.data?.contract_value!=null?`${contract.data.contract_value} ${contract.data.currency||""}`:"Commercial terms can be supplied through Project Knowledge."}</p></article></section>
      <section className="panel project-view-panel"><div className="panel-heading"><div><p className="label">Scope</p><h2>{latestScope?`Version ${latestScope.version}`:"Awaiting analysis"}</h2></div>{latestScope?<span className="pill">{latestScope.status}</span>:null}</div>{latestScope?<div className="executive-grid"><div><strong>Included</strong><ul>{(latestScope.included??[]).map((v:any,i:number)=><li key={i}>{String(v)}</li>)}</ul></div><div><strong>Excluded</strong><ul>{(latestScope.excluded??[]).map((v:any,i:number)=><li key={i}>{String(v)}</li>)}</ul></div><div><strong>Deliverables</strong><ul>{(latestScope.deliverables??[]).map((v:any,i:number)=><li key={i}>{String(v)}</li>)}</ul></div><div><strong>Success criteria</strong><ul>{(latestScope.success_criteria??[]).map((v:any,i:number)=><li key={i}>{String(v)}</li>)}</ul></div></div>:<p className="subtitle">Scope is generated from objective, files, resources and clarifications.</p>}</section>
      <section className="panel project-view-panel"><div className="project-card-metrics"><div><span>Meetings</span><strong>{meetings.count??0}</strong></div><div><span>Decisions</span><strong>{decisions.count??0}</strong></div><div><span>Approvals</span><strong>{approvals.count??0}</strong></div><div><span>Workflow state</span><strong>{label(workflowState)}</strong></div><div><span>Open health events</span><strong>{health.data?.length??0}</strong></div><div><span>Last activity</span><strong>{formatDate(progress.lastActivityAt)}</strong></div></div></section>
    </>:null}

    {activeView==="advanced"?<section className="panel project-view-panel"><div className="panel-heading"><div><p className="label">Project-only team</p><h2>Assigned AI specialists</h2></div><span className="pill">{agents.length} agents</span></div><div className="data-list">{agents.map((row:any)=>{const agent=Array.isArray(row.agents)?row.agents[0]:row.agents;return <div className="data-row" key={agent?.id??row.assignment_role}><div><strong>{agent?.display_name||agent?.name||"Agent"}</strong><span>{agent?.role_title||row.assignment_role} · {agent?.agent_code||"AI"}</span></div><span className="pill">{row.status}</span></div>})}{!agents.length?<p className="subtitle">The project team forms after analysis.</p>:null}</div></section>:null}

    {activeView==="work"?<section className="panel project-view-panel"><div className="panel-heading"><div><p className="label">Execution graph</p><h2>Project tasks</h2></div><span className="pill">{filteredTasks.length}/{taskRows.length}</span></div><form method="get" className="project-task-filters"><input type="hidden" name="project" value={project.id}/><input type="hidden" name="view" value="work"/><label>Status<select name="taskStatus" defaultValue={selectedStatus}><option value="all">All statuses</option>{[...new Set(taskRows.map((task:any)=>task.status))].map(status=><option key={status} value={status}>{label(status)}</option>)}</select></label><label>Agent<select name="taskAgent" defaultValue={selectedAgent}><option value="all">All agents</option>{agents.map((row:any)=>{const agent=Array.isArray(row.agents)?row.agents[0]:row.agents;return <option key={agent?.id??row.assignment_role} value={agent?.id}>{agent?.display_name||agent?.name||row.assignment_role}</option>})}</select></label><button>Apply filters</button></form><div className="data-list">{filteredTasks.map((task:any)=><div className="data-row" key={task.id}><div><strong>{task.title}</strong><span>{task.agents?.agent_code??"Unassigned"} · attempt {task.attempt_count}/{task.max_attempts}{task.error_message?` · ${task.error_message}`:""}</span></div><span className="pill">{label(task.status)}</span></div>)}</div></section>:null}

    {activeView==="decisions"?<section className="panel project-view-panel"><div className="panel-heading"><div><p className="label">Approval policy</p><h2>Human CEO authority</h2></div><span className="pill"><ProjectApprovalCount suffix=" pending"/></span></div><p className="subtitle">Approval notes are optional unless policy requires them. Rejections require a reason. Only the affected workstream is blocked; independent tasks continue.</p></section>:null}

    {activeView==="work"?<section className="panel project-view-panel"><div className="panel-heading"><div><p className="label">Project actions</p><h2>Execution handoffs</h2></div><Link className="secondary-button" href={`/actions?project=${project.id}`}>Open action workspace</Link></div><div className="data-list">{(projectActions.data??[]).map((action:any)=><Link className="data-row" href={`/actions?project=${project.id}&action=${action.id}`} key={action.id}><div><strong>{action.title}</strong><span>Priority {action.priority} · updated {formatDate(action.updated_at)}</span></div><span className="pill">{label(action.status)}</span></Link>)}</div></section>:null}

    {activeView==="decisions"?<section className="panel project-view-panel"><div className="panel-heading"><div><p className="label">Governance</p><h2>Project decisions</h2></div><Link href="/inbox?category=decisions">Open Inbox</Link></div><ProjectApprovalList/></section>:null}
    {activeView==="results"?<section className="panel project-view-panel"><div className="panel-heading"><div><p className="label">Outcomes</p><h2>Results and deliverables</h2></div></div>{roadmap?.phases.filter(phase=>phase.status==="completed").length?<div className="data-list">{roadmap.phases.filter(phase=>phase.status==="completed").map(phase=><div className="data-row" key={phase.key}><div><strong>{phase.title}</strong><span>{phase.deliverables.join(", ")}</span></div><span className="pill">Completed</span></div>)}</div>:<p className="empty-state">Results will appear as roadmap milestones are completed.</p>}</section>:null}
    {activeView==="files"?<section className="panel project-view-panel"><div className="panel-heading"><div><p className="label">Project Knowledge</p><h2>Files, resources and scoped connections</h2></div><span className="pill">{(documents.data??[]).length+(resources.data??[]).length+(bindings.data??[]).length} items</span></div><div className="project-card-metrics"><div><span>Files</span><strong>{documents.data?.length??0}</strong></div><div><span>Resources</span><strong>{resources.data?.length??0}</strong></div><div><span>Connections</span><strong>{bindings.data?.length??0}</strong></div></div><div className="data-list">{(documents.data??[]).map((document:any)=><div className="data-row" key={document.id}><div><strong>{document.file_name}</strong><span>{label(document.category)} · {document.extraction_status} · {formatDate(document.created_at)}</span></div>{document.legal_document?<span className="pill">Legal</span>:null}</div>)}{(resources.data??[]).map((resource:any)=><div className="data-row" key={resource.id}><div><strong>{resource.name}</strong><span>{resource.resource_type} · {resource.access_status}</span></div></div>)}{(bindings.data??[]).map((binding:any)=><div className="data-row" key={binding.id}><div><strong>{binding.display_name}</strong><span>{binding.resource_type} · {binding.resource_ref}</span></div><span className="pill">{binding.access_status}</span></div>)}</div></section>:null}

    {activeView==="activity"?<section className="panel project-view-panel"><div className="panel-heading"><div><p className="label">Project history</p><h2>Activity</h2></div><span className="pill">{visibleActivity.length} updates</span></div><nav className="simple-inbox-filters" aria-label="Activity filters">{["important","all","agent","system"].map(filter=><Link key={filter} aria-current={activityFilter===filter?"page":undefined} href={`/projects/operating?project=${project.id}&view=activity&activityFilter=${filter}`}>{filter==="all"?"All activity":filter==="important"?"Important":filter==="agent"?"Agent activity":"System activity"}</Link>)}</nav><div className="data-list">{visibleActivity.map((event:any)=><div className="data-row" key={event.id}><div><strong>{event.headline}</strong><span>{event.detail||label(event.event_type)} · {formatDate(event.created_at)}</span></div></div>)}{!visibleActivity.length?<p className="empty-state">No activity in this view yet.</p>:null}</div></section>:null}
    {activeView==="advanced"&&("lifecycle_kind" in project)?<section className="panel project-view-panel">
      <div className="panel-heading"><div><p className="label">Governed configuration</p><h2>Continuous monitoring</h2></div><span className="pill">{project.lifecycle_kind==="continuous"?"Continuous program":"Optional"}</span></div>
      <p className="security-note">Explicitly convert this project into an ongoing program. Existing status and Human CEO approvals remain in force; a blocked project cannot automatically resume monitoring.</p>
      {params.programSaved?<p role="status" className="form-success">Continuous program configuration saved.</p>:null}
      {params.programError?<p role="alert" className="form-error">{params.programError}</p>:null}
      <details><summary style={{cursor:"pointer",fontWeight:700}}>Configure monitoring and review schedule</summary>
        <form action={saveContinuousProgram} className="auth-form" style={{marginTop:16}}>
          <input type="hidden" name="projectId" value={project.id}/>
          <label>Verified SEO site
            <select name="seoSiteId" defaultValue={program?.seo_site_id??""}>
              <option value="">Not connected</option>
              {seoSiteOptions.map(site=><option key={site.id} value={site.id}>{site.name} · {site.site_url}</option>)}
            </select>
          </label>
          <label>Review frequency<select name="cadence" defaultValue={program?.cadence??"weekly"}>
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
          </select></label>
          <label style={{display:"flex",gap:10,alignItems:"center"}}>
            <input type="checkbox" name="enabled" defaultChecked={program?.enabled??false}/>
            Enable scheduled, read-only evidence reviews (requires active project and SEO site)
          </label>
          <p className="security-note">Enabling monitoring does not authorize external actions, publish content, or approve proposals. The backend feature flag and migration must also be enabled.</p>
          <SubmitButton>Save continuous program</SubmitButton>
        </form>
      </details>
    </section>:null}
    {activeView==="advanced"&&!("lifecycle_kind" in project)?<p className="security-note">Continuous program configuration is unavailable until its database migration is installed.</p>:null}
    {activeView==="advanced"?<section className="panel project-view-panel"><div className="panel-heading"><div><p className="label">Traceability</p><h2>Connected records</h2></div><span className="pill">{relationships.length}</span></div><div className="data-list">{timeline.slice(0,12).map(item=><div className="data-row" key={`${item.timeline_source}-${item.id}`}><div><strong>{payloadSummary(item)}</strong><span>{formatDate(item.occurred_at)}</span></div></div>)}{relationships.slice(0,8).map(edge=><Link className="data-row" href={destinationForRelationship(edge,project.id)} key={edge.id}><div><strong>{label(edge.relationship_type)}</strong><span>{label(edge.source_type)} → {label(edge.target_type)}</span></div></Link>)}</div></section>:null}
  </main></ProjectApprovalProvider>;
}
