import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic="force-dynamic";
const avatarSrc=(url:string|null)=>url?`/api/agent-avatar?url=${encodeURIComponent(url)}`:null;

export default async function AgentProfile({params}:{params:Promise<{code:string}>}){
  const {code}=await params;
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).maybeSingle(); if(!membership) redirect("/login");
  const {data:agent}=await supabase.from("agents").select("id, agent_code, display_name, name, role_title, purpose, department, avatar_url, presence_status, enabled, risk_ceiling, authority_level, work_style, supported_languages, identity, permissions, specification_version").eq("organization_id",membership.organization_id).ilike("agent_code",code).maybeSingle();
  if(!agent) notFound();
  const src=avatarSrc(agent.avatar_url);
  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">DIGITAL EMPLOYEE PROFILE</p><h1>{agent.display_name??agent.name}</h1><p className="subtitle">{agent.role_title}</p></div><Link className="secondary-button" href="/agents">Agent organization</Link></header>
    <section style={{display:"grid",gridTemplateColumns:"minmax(280px,.75fr) minmax(0,1.35fr)",gap:22,marginTop:22}}>
      <article className="panel" style={{overflow:"hidden",padding:0}}><div style={{height:380,background:"#e8edf4",display:"grid",placeItems:"center",fontSize:64,fontWeight:800}}>{src?<img src={src} alt={`${agent.display_name??agent.name} portrait`} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:agent.agent_code}</div><div style={{padding:22}}><p className="label">{agent.department}</p><h2>{agent.display_name??agent.name}</h2><p style={{color:"#596579",fontWeight:700}}>{agent.role_title}</p><div className="compact-list"><div><strong>Status</strong><span>{agent.presence_status}</span></div><div><strong>Agent code</strong><span>{agent.agent_code}</span></div><div><strong>Specification</strong><span>v{agent.specification_version}</span></div><div><strong>Languages</strong><span>{(agent.supported_languages??[]).join(" · ")}</span></div></div></div></article>
      <div style={{display:"grid",gap:18}}><article className="panel"><p className="label">Role charter</p><h2>Mandate and operating style</h2><p style={{color:"#596579",lineHeight:1.75}}>{agent.purpose}</p><p style={{color:"#596579",lineHeight:1.75}}>{agent.work_style}</p></article><article className="panel"><p className="label">Governance</p><div className="compact-list"><div><strong>Authority level</strong><span>{agent.authority_level}</span></div><div><strong>Risk ceiling</strong><span>{agent.risk_ceiling}</span></div><div><strong>Runtime state</strong><span>{agent.enabled?"Enabled":"Paused"}</span></div><div><strong>External actions</strong><span>Disabled</span></div></div></article><article className="panel"><p className="label">Machine-readable profile</p><pre style={{whiteSpace:"pre-wrap",fontSize:12,color:"#596579"}}>{JSON.stringify({identity:agent.identity,permissions:agent.permissions},null,2)}</pre></article></div>
    </section>
  </main>;
}
