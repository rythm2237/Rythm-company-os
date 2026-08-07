import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type ActionStatus = "open" | "in_progress" | "blocked" | "completed" | "cancelled";
type Action = {
  id:string; action_code:string|null; phase_code:string|null; phase_name:string|null; execution_order:number|null;
  title:string; description:string|null; owner_label:string|null; assigned_agent_id:string|null; status:ActionStatus;
  priority:number; due_at:string|null; dependencies:unknown; success_criteria:unknown; evidence_required:unknown; risk_level:string;
  decision_id:string|null; strategy_analysis_id:string|null;
};
type Agent = { id:string; agent_code:string; display_name:string|null; name:string; role_title:string };
type Approval = { id:string; status:string; risk_level:string; response_note:string|null; created_at:string; resolved_at:string|null };

const asList=(value:unknown)=>Array.isArray(value)?value.map(String):[];
const formatDate=(value:string|null)=>value?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium"}).format(new Date(value)):"Not set";
const phaseMeta:Record<string,{days:string;purpose:string}>={
  P1:{days:"Days 1–30",purpose:"Focus and Truth"},
  P2:{days:"Days 31–60",purpose:"Controlled Validation"},
  P3:{days:"Days 61–90",purpose:"Limited Beta and Decision"},
};

export default async function ExecutionPlanPage(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).maybeSingle();
  if(!membership) redirect("/login");

  const {data:project}=await supabase.from("projects")
    .select("id,project_code,name,status,stage,progress_percent")
    .eq("organization_id",membership.organization_id).eq("project_code","AI-PR-001").maybeSingle();
  if(!project) redirect("/projects");

  const [actionsResult,agentsResult,decisionResult,analysisResult,approvalResult,milestoneResult]=await Promise.all([
    supabase.from("action_items")
      .select("id,action_code,phase_code,phase_name,execution_order,title,description,owner_label,assigned_agent_id,status,priority,due_at,dependencies,success_criteria,evidence_required,risk_level,decision_id,strategy_analysis_id")
      .eq("project_id",project.id).not("action_code","is",null).order("execution_order"),
    supabase.from("agents").select("id,agent_code,display_name,name,role_title").eq("organization_id",membership.organization_id),
    supabase.from("decisions").select("id,decision_key,title,status").eq("project_id",project.id).eq("decision_key","AI-PR-001-DEC-001").maybeSingle(),
    supabase.from("project_strategy_analyses").select("id,analysis_code,title,status").eq("project_id",project.id).eq("analysis_code","SA-001").maybeSingle(),
    supabase.from("approval_requests").select("id,status,risk_level,response_note,created_at,resolved_at").eq("project_id",project.id).eq("subject_type","project_execution_plan").order("created_at",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("project_milestones").select("status").eq("project_id",project.id).eq("sequence_no",5).maybeSingle(),
  ]);

  const actions=(actionsResult.data??[]) as Action[];
  const agents=(agentsResult.data??[]) as Agent[];
  const agentMap=new Map(agents.map(a=>[a.id,a]));
  const approval=approvalResult.data as Approval|null;
  const completed=actions.filter(a=>a.status==="completed").length;
  const blocked=actions.filter(a=>a.status==="blocked").length;
  const inProgress=actions.filter(a=>a.status==="in_progress").length;
  const actionProgress=actions.length?Math.round((completed/actions.length)*100):0;
  const phases=["P1","P2","P3"].map(code=>({code,actions:actions.filter(a=>a.phase_code===code)}));

  if(actionsResult.error){
    return <main className="command-shell"><h1>Execution plan migration required</h1><p>{actionsResult.error.message}</p><Link href="/projects">Return to Project Workspace</Link></main>;
  }

  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">{project.project_code} · GOVERNED EXECUTION</p><h1>90-day execution plan</h1><p className="subtitle">The approved strategy translated into accountable actions inside the existing Action Item Engine.</p></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Link className="secondary-button" href="/actions">Action Item Engine</Link><Link className="secondary-button" href="/projects/strategy-analysis">Strategy Analysis</Link><Link className="secondary-button" href="/projects">Project Workspace</Link></div></header>

    <section className="organization-banner"><div><span>Project stage</span><strong>{String(project.stage).replaceAll("_"," ")}</strong></div><div><span>Project progress</span><strong>{project.progress_percent}%</strong></div><div><span>Plan approval</span><strong>{approval?.status??"not created"}</strong></div></section>

    <section className="metrics-grid">
      <article className="metric-card"><span>Governed actions</span><strong>{actions.length}/15</strong></article>
      <article className="metric-card"><span>Action completion</span><strong>{actionProgress}%</strong></article>
      <article className="metric-card"><span>In progress</span><strong>{inProgress}</strong></article>
      <article className="metric-card"><span>Blockers</span><strong>{blocked}</strong></article>
      <article className="metric-card"><span>Execution milestone</span><strong>{milestoneResult.data?.status??"unknown"}</strong></article>
    </section>

    <section className="executive-grid" style={{marginTop:18}}>
      <article className="panel panel-wide"><p className="label">Governance lineage</p><h2>Strategy → CEO decision → execution</h2><div className="compact-list"><div><strong>Strategy analysis</strong><span>{analysisResult.data?`${analysisResult.data.analysis_code} · ${analysisResult.data.status}`:"Missing"}</span></div><div><strong>CEO decision</strong><span>{decisionResult.data?`${decisionResult.data.decision_key} · ${decisionResult.data.status}`:"Missing"}</span></div><div><strong>External actions</strong><span>Disabled</span></div><div><strong>Governed web research</strong><span>CEO approval required</span></div></div></article>
      <article className="panel"><p className="label">CEO gate</p><h2>Execution-plan approval</h2><p style={{color:"#596579",lineHeight:1.65}}>The 15-action plan is created as a controlled execution proposal. Project progress stays at the completed-strategy level until the Human CEO approves this plan.</p><div className="compact-list"><div><strong>Status</strong><span>{approval?.status??"Missing"}</span></div><div><strong>Risk</strong><span>{approval?.risk_level??"—"}</span></div><div><strong>Progress after approval</strong><span>75% via milestone-weighted model</span></div></div>{approval?<Link className="secondary-button" style={{marginTop:14,display:"inline-flex"}} href={`/approvals?approval=${approval.id}&status=${approval.status}`}>Open approval request</Link>:null}</article>
    </section>

    <section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">90-day control path</p><h2>Three execution phases</h2></div><span className="pill">15 accountable actions</span></div><div className="compact-list"><div><strong>Days 1–30</strong><span>Primary persona, JTBD, scope freeze, content truth, analytics definition, pricing hypotheses</span></div><div><strong>Days 31–60</strong><span>Journey repair, measurement implementation, usability validation, beta preparation, trust controls</span></div><div><strong>Days 61–90</strong><span>Invite beta, evidence measurement, defect closure, Go / Revise / Stop recommendation</span></div></div></section>

    {phases.map(phase=><section className="panel panel-wide" style={{marginTop:18}} key={phase.code}>
      <div className="panel-heading"><div><p className="label">{phaseMeta[phase.code]?.days} · {phase.code}</p><h2>{phaseMeta[phase.code]?.purpose}</h2></div><span className="pill">{phase.actions.filter(a=>a.status==="completed").length}/{phase.actions.length} completed</span></div>
      <div className="data-list">{phase.actions.map(action=>{
        const agent=action.assigned_agent_id?agentMap.get(action.assigned_agent_id):null;
        const deps=asList(action.dependencies);
        const success=asList(action.success_criteria);
        const evidence=asList(action.evidence_required);
        return <article className="data-row" style={{alignItems:"flex-start"}} key={action.id}>
          <div style={{minWidth:0,flex:1}}><strong>{action.action_code} · {action.title}</strong><span style={{display:"block",marginTop:6}}>{action.description}</span><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginTop:14}}><div><p className="label">Owner / agent</p><span>{action.owner_label??"Not set"}{agent?` · ${agent.agent_code}`:""}</span></div><div><p className="label">Dependencies</p><span>{deps.length?deps.join(" · "):"None"}</span></div><div><p className="label">Success criteria</p><span>{success.join(" · ")}</span></div><div><p className="label">Evidence required</p><span>{evidence.join(" · ")}</span></div></div></div>
          <div className="row-meta" style={{minWidth:160}}><b className={action.status==="completed"?"state-active":"state-paused"}>{action.status}</b><span>P{action.priority} · {action.risk_level} risk</span><span>Due {formatDate(action.due_at)}</span><Link className="secondary-button" href={`/actions?status=${action.status}&action=${action.id}`}>Open action</Link></div>
        </article>;
      })}</div>
    </section>)}

    <section className="panel" style={{marginTop:18}}><p className="label">Progress model</p><h2>Why approval moves the project to 75%</h2><p style={{color:"#596579",lineHeight:1.7}}>Project onboarding uses weighted milestones: Workspace 15% + Internal Sources 15% + Minimum Agent Team 15% + First Strategy Cycle 20% = 65%. CEO approval of the governed Execution Plan contributes the final 10%, producing 75%. The remaining product-release execution is measured by the 15 Action Items rather than being pre-credited.</p></section>
  </main>;
}
