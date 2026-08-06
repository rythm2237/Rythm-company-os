import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic="force-dynamic";
type Agent={id:string;agent_code:string;display_name:string|null;name:string;role_title:string;avatar_url:string|null;presence_status:string};

export default async function Boardroom(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).maybeSingle(); if(!membership) redirect("/login");
  const {data}=await supabase.from("agents").select("id,agent_code,display_name,name,role_title,avatar_url,presence_status").eq("organization_id",membership.organization_id).order("agent_code").limit(8);
  const agents=(data??[]) as Agent[];
  const seats=[{x:50,y:5},{x:78,y:16},{x:91,y:43},{x:78,y:70},{x:50,y:82},{x:22,y:70},{x:9,y:43},{x:22,y:16}];
  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM EXECUTIVE BOARDROOM</p><h1>Round-table meeting experience</h1><p className="subtitle">A visual executive setting for Human CEO-led meetings with governed digital employees.</p></div><Link className="secondary-button" href="/meetings">Meeting Engine</Link></header>
    <section className="organization-banner"><div><span>Meeting chair</span><strong>Human CEO</strong></div><div><span>Language</span><strong>Selected before session</strong></div><div><span>External research</span><strong>Approval required</strong></div></section>
    <section style={{marginTop:22,border:"1px solid #dfe4ec",borderRadius:28,background:"linear-gradient(145deg,#eef2f7,#dfe6ef)",minHeight:720,position:"relative",overflow:"hidden",boxShadow:"inset 0 1px 0 #fff,0 20px 50px rgba(25,35,58,.08)"}}>
      <div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",width:"48%",height:"34%",borderRadius:"50%",background:"linear-gradient(180deg,#6f4d35,#3d281b)",boxShadow:"0 28px 55px rgba(40,26,18,.35),inset 0 3px 0 rgba(255,255,255,.15)",display:"grid",placeItems:"center",color:"#fff"}}><div style={{textAlign:"center"}}><p style={{letterSpacing:3,fontSize:12,margin:0,opacity:.75}}>RYTHM</p><h2 style={{margin:"6px 0"}}>Executive Round Table</h2><p style={{margin:0,opacity:.75}}>Agenda · Discussion · Decision · Action</p></div></div>
      {agents.map((agent,i)=>{const seat=seats[i%seats.length];return <Link key={agent.id} href={`/agents/${agent.agent_code.toLowerCase()}`} style={{position:"absolute",left:`${seat.x}%`,top:`${seat.y}%`,transform:"translate(-50%,0)",width:150,textAlign:"center",textDecoration:"none",color:"inherit"}}><div style={{width:104,height:104,borderRadius:"50%",overflow:"hidden",margin:"0 auto",border:"5px solid #fff",boxShadow:"0 10px 26px rgba(26,36,56,.2)",background:"#d8dee8"}}>{agent.avatar_url?<img src={agent.avatar_url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:null}</div><div style={{marginTop:8,background:"rgba(255,255,255,.92)",padding:"9px 10px",borderRadius:12,boxShadow:"0 6px 18px rgba(25,35,58,.1)"}}><strong style={{display:"block",fontSize:13}}>{agent.display_name??agent.name}</strong><span style={{display:"block",fontSize:11,color:"#687386",marginTop:3}}>{agent.role_title}</span></div></Link>})}
      <div style={{position:"absolute",left:"50%",bottom:18,transform:"translateX(-50%)",width:165,textAlign:"center"}}><div style={{width:104,height:104,borderRadius:"50%",margin:"0 auto",display:"grid",placeItems:"center",background:"#1f2c42",color:"#fff",border:"5px solid #fff",fontSize:28,fontWeight:800}}>CEO</div><div style={{marginTop:8,background:"rgba(255,255,255,.94)",padding:10,borderRadius:12}}><strong>Human CEO</strong><span style={{display:"block",fontSize:11,color:"#687386",marginTop:3}}>Meeting Chair</span></div></div>
    </section>
  </main>;
}
