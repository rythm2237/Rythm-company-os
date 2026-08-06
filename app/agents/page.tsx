import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type Agent = { id:string; agent_code:string; display_name:string|null; name:string; role_title:string; department:string|null; avatar_url:string|null; presence_status:string; enabled:boolean; risk_ceiling:string; work_style:string|null };

async function context(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).maybeSingle();
  if(!membership) redirect("/login");
  return {supabase,organizationId:membership.organization_id as string};
}

export default async function AgentDirectory(){
  const {supabase,organizationId}=await context();
  const {data}=await supabase.from("agents").select("id, agent_code, display_name, name, role_title, department, avatar_url, presence_status, enabled, risk_ceiling, work_style").eq("organization_id",organizationId).order("agent_code");
  const agents=(data??[]) as Agent[];
  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM DIGITAL WORKFORCE</p><h1>Agent organization</h1><p className="subtitle">A human-readable view of the company’s digital workforce, roles, presence and governed authority.</p></div><Link className="secondary-button" href="/meetings/room">Open boardroom</Link></header>
    <section className="organization-banner"><div><span>Visual standard</span><strong>Professional realism</strong></div><div><span>Meeting format</span><strong>Round-table boardroom</strong></div><div><span>Commercial model</span><strong>White-label ready</strong></div></section>
    <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:18,marginTop:22}}>
      {agents.map(agent=><Link key={agent.id} href={`/agents/${agent.agent_code.toLowerCase()}`} style={{textDecoration:"none",color:"inherit",border:"1px solid #dfe4ec",borderRadius:20,overflow:"hidden",background:"#fff",boxShadow:"0 12px 30px rgba(25,35,58,.07)"}}>
        <div style={{height:230,background:"#e9edf4",position:"relative"}}>{agent.avatar_url?<img src={agent.avatar_url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<div style={{display:"grid",placeItems:"center",height:"100%",fontSize:56,fontWeight:800}}>{agent.agent_code}</div>}<span style={{position:"absolute",right:14,top:14,background:"rgba(255,255,255,.9)",borderRadius:999,padding:"7px 11px",fontSize:12,fontWeight:700}}>{agent.presence_status.replace("_"," ")}</span></div>
        <div style={{padding:18}}><p className="label">{agent.department??"Executive Office"}</p><h2 style={{margin:"5px 0 4px"}}>{agent.display_name??agent.name}</h2><p style={{margin:0,color:"#596579",fontWeight:650}}>{agent.role_title}</p><p style={{color:"#717b8e",lineHeight:1.55,minHeight:72}}>{agent.work_style}</p><div className="row-meta"><span>{agent.agent_code}</span><span>{agent.risk_ceiling} risk ceiling</span><b className={agent.enabled?"state-active":"state-paused"}>{agent.enabled?"Enabled":"Paused"}</b></div></div>
      </Link>)}
    </section>
  </main>;
}
