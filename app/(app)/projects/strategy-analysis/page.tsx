import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type Analysis = {
  id:string; analysis_code:string; title:string; status:string; strategic_question:string;
  current_state:Record<string,unknown>; options:unknown[]; recommendation:Record<string,unknown>;
  risk_register:unknown[]; plan_90_days:unknown[]; assumptions:unknown[];
  evidence_scope:string; web_research_status:string; completed_at:string|null; decision_id:string|null;
};

const list=(value:unknown)=>Array.isArray(value)?value:[];
const strings=(value:unknown)=>Array.isArray(value)?value.map(String):[];
const text=(value:unknown)=>typeof value==="string"?value:"";

export default async function StrategyAnalysisPage(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).maybeSingle();
  if(!membership) redirect("/login");
  const {data:project}=await supabase.from("projects").select("id,project_code,name,stage,progress_percent").eq("organization_id",membership.organization_id).eq("project_code","AI-PR-001").maybeSingle();
  if(!project) redirect("/projects");
  const {data}=await supabase.from("project_strategy_analyses").select("id,analysis_code,title,status,strategic_question,current_state,options,recommendation,risk_register,plan_90_days,assumptions,evidence_scope,web_research_status,completed_at,decision_id").eq("project_id",project.id).eq("analysis_code","SA-001").maybeSingle();
  if(!data) return <main className="command-shell"><h1>Strategy analysis pending</h1><p>Apply the first strategy-cycle migration.</p></main>;
  const a=data as Analysis;
  const strengths=strings(a.current_state?.strengths);
  const gaps=strings(a.current_state?.gaps);
  const options=list(a.options) as Record<string,unknown>[];
  const risks=list(a.risk_register) as Record<string,unknown>[];
  const phases=list(a.plan_90_days) as Record<string,unknown>[];
  const gates=strings(a.recommendation?.gates);
  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">{project.project_code} · {a.analysis_code} · {a.status}</p><h1>First governed strategy analysis</h1><p className="subtitle">A-101 internal-first analysis for a commercially credible public release.</p></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Link className="secondary-button" href="/projects/strategy-brief">Strategy Brief</Link><Link className="secondary-button" href="/decisions">Decision Engine</Link><Link className="secondary-button" href="/projects">Project Workspace</Link></div></header>
    <section className="organization-banner"><div><span>Stage</span><strong>{String(project.stage).replaceAll("_"," ")}</strong></div><div><span>Progress</span><strong>{project.progress_percent}%</strong></div><div><span>Evidence</span><strong>{a.evidence_scope.replaceAll("_"," ")}</strong></div></section>
    <section className="panel panel-wide" style={{marginTop:18}}><p className="label">Strategic question</p><h2>{a.strategic_question}</h2><p style={{color:"#596579",lineHeight:1.7}}>{text(a.current_state?.assessment)}</p></section>
    <section className="executive-grid" style={{marginTop:18}}><article className="panel"><p className="label">Current strengths</p><h2>Existing leverage</h2><ul style={{color:"#596579",lineHeight:1.7}}>{strengths.map(v=><li key={v}>{v}</li>)}</ul></article><article className="panel"><p className="label">Critical gaps</p><h2>Evidence still required</h2><ul style={{color:"#596579",lineHeight:1.7}}>{gaps.map(v=><li key={v}>{v}</li>)}</ul></article></section>
    <section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">Strategic alternatives</p><h2>Three controlled options</h2></div><span className="pill">Option C recommended</span></div><div className="data-list">{options.map(o=><div className="data-row" key={text(o.code)}><div><strong>{text(o.code)} · {text(o.name)}</strong><span>{text(o.benefit)}</span></div><div className="row-meta"><span>{text(o.tradeoff)}</span></div></div>)}</div></section>
    <section className="panel panel-wide" style={{marginTop:18}}><p className="label">A-101 recommendation</p><h2>{text(a.recommendation?.summary)}</h2><p style={{color:"#596579",lineHeight:1.7}}><strong>Release principle:</strong> {text(a.recommendation?.release_principle)}</p><div className="compact-list">{gates.map((g,i)=><div key={g}><strong>Gate {i+1}</strong><span>{g}</span></div>)}</div></section>
    <section className="executive-grid" style={{marginTop:18}}><article className="panel panel-wide"><div className="panel-heading"><div><p className="label">Execution design</p><h2>90-day controlled path</h2></div></div><div className="data-list">{phases.map(p=><div className="data-row" key={text(p.days)}><div><strong>Days {text(p.days)} · {text(p.theme)}</strong><span>{strings(p.outcomes).join(" · ")}</span></div></div>)}</div></article><article className="panel"><p className="label">Governance</p><h2>Research control</h2><div className="compact-list"><div><strong>Web research</strong><span>{a.web_research_status}</span></div><div><strong>External actions</strong><span>Disabled</span></div><div><strong>Decision authority</strong><span>Human CEO</span></div><div><strong>Decision draft</strong><span>{a.decision_id?"Created":"Missing"}</span></div></div></article></section>
    <section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">Risk register</p><h2>Release-critical risks</h2></div></div><div className="data-list">{risks.map((r,i)=><div className="data-row" key={`${text(r.risk)}-${i}`}><div><strong>{text(r.risk)}</strong><span>{text(r.mitigation)}</span></div><div className="row-meta"><b className="state-paused">{text(r.severity)}</b></div></div>)}</div></section>
    <section className="panel" style={{marginTop:18}}><p className="label">Analysis assumptions</p><ul style={{color:"#596579",lineHeight:1.7}}>{strings(a.assumptions).map(v=><li key={v}>{v}</li>)}</ul></section>
  </main>;
}
