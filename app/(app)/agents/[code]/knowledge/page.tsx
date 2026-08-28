import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganizationContext } from "@/lib/auth/organization-context";
import AgentKnowledgeUploader from "../AgentKnowledgeUploader";

export const dynamic="force-dynamic";

export default async function AgentKnowledgePage({params}:{params:Promise<{code:string}>}){
  const {code}=await params;
  const context=await requireOrganizationContext();
  const {data:agent}=await context.supabase.from("agents").select("id,agent_code,display_name,name,role_title,department").eq("organization_id",context.organizationId).ilike("agent_code",code).maybeSingle();
  if(!agent)notFound();
  const {data:knowledge}=await context.supabase.from("company_knowledge").select("id,title,category,source_filename,ingestion_status,chunk_count,updated_at").eq("organization_id",context.organizationId).contains("allowed_role_keywords",[agent.agent_code]).order("updated_at",{ascending:false}).limit(50);
  const name=agent.display_name??agent.name;
  return <main className="command-shell"><header className="command-header"><div><p className="eyebrow">AGENT KNOWLEDGE</p><h1>{name}</h1><p className="subtitle">Add role-specific knowledge without writing a prompt. Files stay tenant-private and are indexed through the governed Company Library pipeline.</p></div><Link className="secondary-button" href={`/agents/${String(agent.agent_code).toLowerCase()}`}>Back to Agent</Link></header>
    <section style={{display:"grid",gridTemplateColumns:"minmax(0,1.1fr) minmax(320px,.9fr)",gap:18,alignItems:"start"}}>
      <article className="panel"><p className="label">DIRECT KNOWLEDGE</p><h2>Files assigned to this Agent</h2><p style={{color:"#667085",lineHeight:1.65}}>Company knowledge is inherited separately. Items listed here are explicitly tagged to {agent.agent_code} and can be managed without changing the Agent&apos;s system prompt.</p><div className="compact-list">{knowledge?.length?knowledge.map((item)=><div key={item.id}><strong>{item.title}</strong><span>{item.category} · {item.ingestion_status} · {item.chunk_count??0} chunks</span></div>):<p className="empty-state">No direct Agent knowledge has been added yet.</p>}</div></article>
      <article className="panel"><p className="label">ADD KNOWLEDGE</p><h2>Upload to {name}</h2><AgentKnowledgeUploader organizationId={context.organizationId} agentCode={agent.agent_code} agentName={name} roleTitle={agent.role_title} department={agent.department}/></article>
    </section>
  </main>
}
