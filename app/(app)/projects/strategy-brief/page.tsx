import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic="force-dynamic";
const list=(value:unknown)=>Array.isArray(value)?value.map(String):[];

export default async function StrategyBriefPage(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id,role").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership) redirect("/login?error=Owner%20authorization%20required.");
  const {data:project}=await supabase.from("projects").select("id,project_code,name,stage,progress_percent").eq("organization_id",membership.organization_id).eq("project_code","AI-PR-001").maybeSingle();
  if(!project) return <main className="command-shell"><h1>Project context is not available.</h1></main>;
  const [contextResult,briefResult,agentsResult]=await Promise.all([
    supabase.from("project_context_documents").select("id,context_type,title,summary,source_name,source_url,status,confidence").eq("project_id",project.id).order("context_type"),
    supabase.from("project_strategy_briefs").select("brief_code,title,strategic_question,internal_evidence,assumptions,analysis_priorities,required_outputs,web_research_status,status").eq("project_id",project.id).eq("brief_code","SB-001").maybeSingle(),
    supabase.from("project_agents").select("status,assignment_role,agents(agent_code,display_name,name)").eq("project_id",project.id)
  ]);
  const docs=contextResult.data??[]; const brief=briefResult.data; const agents=agentsResult.data??[];
  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">{project.project_code} · STRATEGY PREPARATION</p><h1>Project context and Strategy Brief</h1><p className="subtitle">Validated internal evidence for the first governed strategy cycle.</p></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Link className="secondary-button" href="/projects">Project Workspace</Link><Link className="secondary-button" href="/agents/strategy">Open A-101</Link></div></header>
    <section className="organization-banner"><div><span>Stage</span><strong>{String(project.stage).replaceAll("_"," ")}</strong></div><div><span>Progress</span><strong>{project.progress_percent}%</strong></div><div><span>Context records</span><strong>{docs.length}</strong></div></section>
    <section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">Validated internal evidence</p><h2>Project Context Register</h2></div><span className="pill">Internal first</span></div><div className="data-list">{docs.map((doc:any)=><div className="data-row" key={doc.id}><div><strong>{doc.title}</strong><span>{doc.context_type} · {doc.source_name}</span><p style={{color:"#596579",margin:"8px 0 0",lineHeight:1.55}}>{doc.summary}</p></div><div className="row-meta">{doc.source_url?<a href={doc.source_url} target="_blank" rel="noreferrer">Source</a>:null}<span>{Math.round(Number(doc.confidence)*100)}%</span><b className="state-active">{doc.status}</b></div></div>)}</div></section>
    {brief?<section className="executive-grid" style={{marginTop:18}}><article className="panel panel-wide"><p className="label">{brief.brief_code} · {brief.status}</p><h2>{brief.title}</h2><h3 style={{marginTop:22}}>Strategic question</h3><p style={{color:"#596579",lineHeight:1.7}}>{brief.strategic_question}</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:18,marginTop:22}}><div><p className="label">Analysis priorities</p><ul>{list(brief.analysis_priorities).map(x=><li key={x}>{x}</li>)}</ul></div><div><p className="label">Required outputs</p><ul>{list(brief.required_outputs).map(x=><li key={x}>{x}</li>)}</ul></div><div><p className="label">Assumptions</p><ul>{list(brief.assumptions).map(x=><li key={x}>{x}</li>)}</ul></div></div></article><article className="panel"><p className="label">Governance</p><h2>Research control</h2><div className="compact-list"><div><strong>Web research</strong><span>{brief.web_research_status}</span></div><div><strong>External actions</strong><span>Disabled</span></div><div><strong>Decision authority</strong><span>Human CEO</span></div></div><p className="label" style={{marginTop:24}}>Assigned team</p><div className="data-list">{agents.map((a:any,index:number)=><div className="data-row" key={index}><div><strong>{a.agents?.display_name??a.agents?.name??"Agent"}</strong><span>{a.assignment_role}</span></div><b className={a.status==="active"?"state-active":"state-paused"}>{a.status}</b></div>)}</div></article></section>:<section className="panel" style={{marginTop:18}}><h2>Strategy brief migration pending</h2></section>}
  </main>;
}
