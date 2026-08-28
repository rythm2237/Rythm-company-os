import Link from "next/link";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";

export const dynamic = "force-dynamic";

type Check = { title:string; detail:string; done:boolean; href:string; action:string };

export default async function CompanyLaunchPage() {
  const { supabase, organizationId } = await requireActiveOwnerOrganizationContext();
  const [organizationResult, knowledgeResult, legalResult, integrationsResult, agentsResult, projectsResult, meetingsResult, installationResult] = await Promise.all([
    supabase.from("organizations").select("name,mission,vision,status").eq("id", organizationId).single(),
    supabase.from("company_knowledge").select("id", { count:"exact", head:true }).eq("organization_id",organizationId).eq("status","active").eq("ingestion_status","ready"),
    supabase.from("company_knowledge").select("id", { count:"exact", head:true }).eq("organization_id",organizationId).eq("category","legal").eq("status","active").eq("ingestion_status","ready"),
    supabase.from("organization_integrations").select("id", { count:"exact", head:true }).eq("organization_id",organizationId).eq("status","connected"),
    supabase.from("agents").select("id,enabled").eq("organization_id",organizationId),
    supabase.from("projects").select("id", { count:"exact", head:true }).eq("organization_id",organizationId),
    supabase.from("meetings").select("id", { count:"exact", head:true }).eq("organization_id",organizationId),
    supabase.from("organization_template_installations").select("id,template_key,template_version,template_snapshot_digest").eq("organization_id",organizationId).order("installed_at",{ascending:false}).limit(1).maybeSingle(),
  ]);

  const organization = organizationResult.data;
  const agents = agentsResult.data ?? [];
  const enabledAgents = agents.filter((agent) => Boolean(agent.enabled)).length;
  const checks: Check[] = [
    { title:"Company profile", detail:"Add the company identity, mission, vision and operating information. You can edit this profile again at any time after launch.", done:Boolean(organization?.name && organization?.mission && organization?.vision), href:"/company/profile", action:"Complete profile" },
    { title:"Company knowledge", detail:"Upload the files the workforce needs: services, brand, policies, processes and operating material.", done:(knowledgeResult.count ?? 0)>0, href:"/company-library", action:"Add company knowledge" },
    { title:"Legal foundation", detail:"Add legal/company formation, contract, policy or compliance material relevant to the business.", done:(legalResult.count ?? 0)>0, href:"/company-library", action:"Add legal knowledge" },
    { title:"Business integrations", detail:"Connect company-owned tools such as email, calendar, CRM, advertising, accounting or website systems.", done:(integrationsResult.count ?? 0)>0, href:"/integrations", action:"Connect tools" },
    { title:"Agent workforce", detail:`Review the provisioned workforce and enable the Agents you are ready to use. ${enabledAgents}/${agents.length} enabled.`, done:enabledAgents>0, href:"/agents", action:"Review Agents" },
    { title:"First project", detail:"Create the first client or internal project so work has an accountable operating context.", done:(projectsResult.count ?? 0)>0, href:"/projects", action:"Create project" },
    { title:"First company meeting", detail:"Start the first governed multi-Agent meeting when the relevant team is ready.", done:(meetingsResult.count ?? 0)>0, href:"/meetings", action:"Start meeting" },
  ];
  const completed = checks.filter((check)=>check.done).length;
  const percent = Math.round((completed/checks.length)*100);
  const ready = completed === checks.length;
  const installation = installationResult.data;

  return <main className="command-shell">
    <header className="command-header">
      <div>
        <p className="eyebrow">READY COMPANY · LAUNCH CONTROL</p>
        <h1>{ready ? "Your company is ready to operate." : "Finish setting up your company."}</h1>
        <p className="subtitle">Provisioning created the governed operating system. Complete the launch checklist before treating the company as operational. After launch, all company information remains editable from Company Profile and the relevant workspace sections.</p>
      </div>
      <Link className="secondary-button" href="/command-center">Enter Command</Link>
    </header>

    <section className="panel" style={{marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:18,alignItems:"end",flexWrap:"wrap"}}>
        <div><p className="label">COMPANY READINESS</p><h2 style={{margin:"6px 0"}}>{percent}% complete</h2><p style={{margin:0,color:"#667085"}}>{completed} of {checks.length} launch requirements completed.</p></div>
        <div style={{fontSize:"2.8rem",fontWeight:900,lineHeight:1,color:ready?"#16845b":"#5367ef"}}>{percent}%</div>
      </div>
      <div style={{height:12,borderRadius:999,background:"#e8ecf4",overflow:"hidden",marginTop:18}}><div style={{height:"100%",width:`${percent}%`,background:ready?"#16845b":"#5367ef"}} /></div>
      {installation ? <p className="security-note" style={{marginTop:14}}>Template {installation.template_key} v{installation.template_version} · snapshot {String(installation.template_snapshot_digest ?? "pending").slice(0,12)}</p> : null}
    </section>

    <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:14}}>
      {checks.map((check,index)=><article className="panel" key={check.title} style={{borderColor:check.done?"#b7e3d1":"#dfe4ec"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"start"}}><div><p className="label">STEP {index+1}</p><h2 style={{marginTop:6}}>{check.title}</h2></div><span style={{borderRadius:999,padding:"6px 9px",fontSize:12,fontWeight:800,background:check.done?"#e9f8f1":"#eef2ff",color:check.done?"#147454":"#3346a8"}}>{check.done?"Complete":"Required"}</span></div>
        <p style={{color:"#667085",lineHeight:1.6,minHeight:76}}>{check.detail}</p>
        <Link href={check.href} className={check.done?"secondary-button":"primary-button"}>{check.done?"Review":check.action}</Link>
      </article>)}
    </section>

    <section className="panel" style={{marginTop:18}}>
      <p className="label">WHEN YOU ARE READY</p><h2>Start operating</h2><p style={{color:"#667085",lineHeight:1.7}}>Command is the Human CEO control plane. Projects hold accountable work, Actions hold tasks, Meetings coordinate Agents, Approvals gate consequential execution, and each Agent profile controls runtime state and role-specific knowledge.</p>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Link className="primary-button" href="/command-center">Enter Company</Link><Link className="secondary-button" href="/company/profile">Edit Company Profile</Link><Link className="secondary-button" href="/agents">Open Agent workforce</Link><Link className="secondary-button" href="/integrations">Open Integrations</Link></div>
    </section>
  </main>;
}
