import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { ProjectReportActions } from "@/components/projects/project-report-actions";

export const dynamic="force-dynamic";

type Props={searchParams:Promise<{project?:string}>};
const label=(value:string)=>value.replaceAll(/([a-z])([A-Z])/g,"$1 $2").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
const date=(value:string|null|undefined)=>value?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium"}).format(new Date(value)):"—";

function renderValue(value:unknown):ReactNode{
  if(value===null||value===undefined||value==="")return <span>—</span>;
  if(typeof value==="string"||typeof value==="number")return <span>{String(value)}</span>;
  if(typeof value==="boolean")return <span>{value?"Yes":"No"}</span>;
  if(Array.isArray(value)){
    if(!value.length)return <span>None recorded.</span>;
    return <div className="data-list">{value.map((item,index)=><div className="data-row" key={index} style={{display:"block"}}>{renderValue(item)}</div>)}</div>;
  }
  if(typeof value==="object"){
    return <div className="data-list">{Object.entries(value as Record<string,unknown>).map(([key,item])=><div className="data-row" key={key}><div><strong>{label(key)}</strong><span>{renderValue(item)}</span></div></div>)}</div>;
  }
  return <span>{String(value)}</span>;
}

export default async function ProjectCloseoutReportPage({searchParams}:Props){
  const params=await searchParams;const projectId=String(params.project??"").trim();if(!projectId)redirect("/projects");
  const supabase=await createAuthServerClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
  const membership=await supabase.from("organization_members").select("organization_id,role").eq("user_id",user.id).in("role",["owner","admin"]).maybeSingle();
  if(!membership.data)redirect("/login?error=Owner%20authorization%20required.");
  const project=await supabase.from("projects").select("id,project_code,name,objective,lifecycle_state,overall_project_progress,completion_eligible").eq("id",projectId).eq("organization_id",membership.data.organization_id).maybeSingle();
  if(!project.data)redirect("/projects");
  const report=await supabase.from("project_closeout_reports").select("id,status,report_data,generated_at,reviewed_at,accepted_at,closure_date").eq("project_id",projectId).eq("organization_id",membership.data.organization_id).order("generated_at",{ascending:false}).limit(1).maybeSingle();
  if(!report.data)return <main className="command-shell"><section className="panel"><h1>Final report not generated yet</h1><p className="subtitle">The project must reach Closeout before RYTHM generates the evidence-backed final report.</p><Link className="secondary-button" href={`/projects/operating?project=${projectId}`}>Back to Project</Link></section></main>;
  const data=(report.data.report_data??{}) as Record<string,unknown>;
  const sections:Array<[string,string]>=[
    ["Executive Summary","executiveSummary"],["Original Objective","originalObjective"],["Scope","scope"],["Starting Baseline","startingBaseline"],
    ["Work Performed","workPerformed"],["Deliverables Produced","deliverablesProduced"],["Implementations Executed","implementationsExecuted"],["Verification Results","verificationResults"],
    ["Before → After Metrics","beforeAfterMetrics"],["Outcome Assessment","outcomeAssessment"],["Outstanding Issues","outstandingIssues"],["Accepted Residual Risks","acceptedResidualRisks"],
    ["Limitations","limitations"],["Recommendations / Next Cycle","recommendationsNextCycle"],["Final Acceptance","finalAcceptance"],["Closure Date","closureDate"],
  ];
  return <main className="command-shell project-closeout-report">
    <header className="command-header"><div><p className="eyebrow">PROJECT CLOSEOUT · {project.data.project_code}</p><h1>{project.data.name}</h1><p className="subtitle">Evidence-backed final project record. Planned work, executed changes, verification and observed outcomes are reported separately.</p></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Link className="secondary-button" href={`/projects/operating?project=${projectId}`}>Back to Project</Link><ProjectReportActions/></div></header>
    <section className="organization-banner"><div><span>Report status</span><strong>{label(report.data.status)}</strong></div><div><span>Project state</span><strong>{label(project.data.lifecycle_state)}</strong></div><div><span>Overall progress</span><strong>{project.data.overall_project_progress}%</strong></div><div><span>Generated</span><strong>{date(report.data.generated_at)}</strong></div><div><span>Reviewed</span><strong>{date(report.data.reviewed_at)}</strong></div></section>
    {sections.map(([title,key],index)=><section className="panel panel-wide" style={{marginTop:18}} key={key}><div className="panel-heading"><div><p className="label">{index+1} · Final Report</p><h2>{title}</h2></div></div>{renderValue(data[key])}</section>)}
    <section className="panel panel-wide" style={{marginTop:18}}><p className="security-note">This report is generated from structured project records and evidence. Metric movement is reported as observed change; causal impact is not asserted unless separately supported by evidence.</p></section>
  </main>;
}
