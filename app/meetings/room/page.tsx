import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { AgentPortrait } from "@/app/components/agent-portrait";
import styles from "./boardroom.module.css";

export const dynamic="force-dynamic";
type Agent={id:string;agent_code:string;display_name:string|null;name:string;role_title:string;avatar_url:string|null;presence_status:string};

export default async function Boardroom(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).maybeSingle(); if(!membership) redirect("/login");
  const {data}=await supabase.from("agents").select("id,agent_code,display_name,name,role_title,avatar_url,presence_status").eq("organization_id",membership.organization_id).order("agent_code").limit(7);
  const agents=(data??[]) as Agent[];
  const seats=[{x:50,y:12},{x:78,y:22},{x:88,y:49},{x:76,y:73},{x:24,y:73},{x:12,y:49},{x:22,y:22}];
  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM EXECUTIVE BOARDROOM</p><h1>Round-table meeting experience</h1><p className="subtitle">A visual executive setting for Human CEO-led meetings with governed digital employees.</p></div><Link className="secondary-button" href="/meetings">Meeting Engine</Link></header>
    <section className="organization-banner"><div><span>Meeting chair</span><strong>Human CEO</strong></div><div><span>Language</span><strong>Selected before session</strong></div><div><span>External research</span><strong>Approval required</strong></div></section>
    <section className={styles.room}>
      <div className={styles.table}><div><p className={styles.tableLabel}>RYTHM</p><h2>Executive Round Table</h2><p>Agenda · Discussion · Decision · Action</p></div></div>
      {agents.map((agent,i)=>{const seat=seats[i%seats.length];return <Link key={agent.id} href={`/agents/${agent.agent_code.toLowerCase()}`} className={styles.seat} style={{left:`${seat.x}%`,top:`${seat.y}%`}}><AgentPortrait agentCode={agent.agent_code} avatarUrl={agent.avatar_url} alt={agent.display_name??agent.name} className={styles.avatar}/><div className={styles.nameplate}><strong>{agent.display_name??agent.name}</strong><span>{agent.role_title}</span></div></Link>})}
      <div className={styles.ceo}><div className={styles.ceoAvatar}>CEO</div><div className={styles.ceoPlate}><strong>Human CEO</strong><span>Meeting Chair</span></div></div>
    </section>
  </main>;
}
