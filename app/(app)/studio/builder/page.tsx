import Link from "next/link";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import {
  addCompanyKnowledgeText,
  addCompanyKnowledgeUrl,
  archiveCompanyKnowledge,
  buildCompanyFromDraft,
  createCompanyBuilderDraft,
  uploadCompanyKnowledgeFile,
} from "./actions";

export const dynamic = "force-dynamic";

type BuilderPageProps = { searchParams: Promise<{ draft?: string; error?: string; message?: string }> };
type DraftRow = {
  id:string; company_name:string; company_type:string; primary_services:string[]; business_model:string; company_size_intent:string;
  required_capabilities:string[]; desired_ai_authority:number; preferred_language:string;
  proposed_structure:{departments?:Array<{key?:string;name?:string;description?:string}>;agents?:Array<{name?:string;role?:string;department_key?:string;purpose?:string;authority_level?:number;risk_ceiling?:string}>}; status:string;
};
type KnowledgeRow = { id:string; title:string; category:string; source_type:string; confidentiality:string; source_url:string|null; mime_type:string|null; allowed_departments:string[]; allowed_role_keywords:string[]; updated_at:string };

const categories=["general","brand","people","contact","product","service","process","operations","analytics","finance","sales","legal","website","other"];

function KnowledgeFields() {
  return <>
    <label>Category<select name="category" defaultValue="general">{categories.map((value)=><option key={value} value={value}>{value}</option>)}</select></label>
    <label>Confidentiality<select name="confidentiality" defaultValue="internal"><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option></select></label>
    <label>Only these departments <input name="allowedDepartments" placeholder="Optional: Design, Finance, Operations" /></label>
    <label>Only roles containing <input name="allowedRoles" placeholder="Optional: Designer, CFO, Analyst" /></label>
  </>;
}

export default async function CompanyBuilderPage({searchParams}:BuilderPageProps) {
  const context=await requireActiveOwnerOrganizationContext();
  const params=await searchParams;
  if (!context.entitlement.company_builder_enabled) return <main className="page-shell"><section className="panel"><p className="eyebrow">RYTHM COMPANY STUDIO</p><h1>Company Builder</h1><p>Company Builder is not enabled for this organization&apos;s current commercial entitlement.</p><Link href="/command-center">Return to Command Center</Link></section></main>;

  let draft:DraftRow|null=null;
  if (params.draft) {
    const {data}=await context.supabase.from("company_builder_drafts").select("id,company_name,company_type,primary_services,business_model,company_size_intent,required_capabilities,desired_ai_authority,preferred_language,proposed_structure,status").eq("id",params.draft).maybeSingle();
    draft=(data as DraftRow|null)??null;
  }
  const {data:knowledgeData}=await context.supabase.from("company_knowledge").select("id,title,category,source_type,confidentiality,source_url,mime_type,allowed_departments,allowed_role_keywords,updated_at").eq("organization_id",context.organizationId).eq("status","active").order("updated_at",{ascending:false}).limit(40);
  const knowledge=(knowledgeData??[]) as KnowledgeRow[];
  const departments=draft?.proposed_structure?.departments??[];
  const agents=draft?.proposed_structure?.agents??[];

  return <main className="page-shell">
    <section className="panel">
      <p className="eyebrow">RYTHM COMPANY STUDIO</p><h1>Build your AI company</h1>
      <p>Create the company and its shared knowledge foundation. Every active Agent reads the latest relevant Company Knowledge automatically at runtime; you do not need to repeat company facts in every task.</p>
      <p><strong>Active organization:</strong> {context.organization.name}</p><p><strong>Human authority:</strong> Human CEO / Owner</p><p><strong>External actions:</strong> Disabled by default</p>
    </section>
    {params.message?<p className="form-success" role="status">{params.message}</p>:null}{params.error?<p className="form-error" role="alert">{params.error}</p>:null}

    <section className="panel">
      <p className="eyebrow">OPTIONAL SETUP · LIVE KNOWLEDGE</p><h2>0. Company Knowledge</h2>
      <p>Add facts, documents, brand assets, or a website. RYTHM keeps this knowledge company-scoped and injects only relevant items into each Agent while that Agent works for this company. New or updated knowledge becomes available automatically on the Agent&apos;s next run.</p>
      <p><strong>Confidentiality:</strong> company knowledge is non-transferable by default. Public/Internal/Confidential/Restricted classification and optional role/department scopes are stored with every item so company-specific knowledge can be cleanly removed if an Agent is ever transferred.</p>
      <div className="kpi-grid" style={{marginTop:"1rem"}}>
        <article className="kpi-card"><h3>Add text / company facts</h3><form action={addCompanyKnowledgeText} className="auth-form"><label>Title<input name="title" placeholder="Brand guidelines, CEO contact, product facts" required /></label><label>Knowledge<textarea name="content" rows={6} placeholder="Paste the information Agents should know..." required /></label><KnowledgeFields/><button type="submit">Add to Company Knowledge</button></form></article>
        <article className="kpi-card"><h3>Import website / URL</h3><form action={addCompanyKnowledgeUrl} className="auth-form"><label>Title<input name="title" placeholder="Company website or logo reference" /></label><label>URL<input name="url" type="url" placeholder="https://example.com" required /></label><KnowledgeFields/><button type="submit">Import URL</button></form></article>
        <article className="kpi-card"><h3>Upload reference file</h3><form action={uploadCompanyKnowledgeFile} className="auth-form"><label>Title<input name="title" placeholder="Logo, brand guide, price list, org chart" /></label><label>File<input name="file" type="file" required accept="image/*,.pdf,.csv,.txt,.md,.json,.xml,.xlsx,.xls,.xlsm,.doc,.docx,.ppt,.pptx" /></label><KnowledgeFields/><button type="submit">Upload private file</button></form></article>
      </div>
      <h3 style={{marginTop:"1.5rem"}}>Active knowledge ({knowledge.length})</h3>
      {knowledge.length===0?<p className="empty-state">No Company Knowledge added yet. Agents will still know the organization name, mission and vision if configured.</p>:<div className="data-list">{knowledge.map((item)=><div className="data-row" key={item.id}><div><strong>{item.title}</strong><span>{item.category} · {item.source_type}{item.mime_type?` · ${item.mime_type}`:""}{item.source_url?` · ${item.source_url}`:""}</span></div><div className="row-meta"><b>{item.confidentiality}</b>{item.allowed_role_keywords?.length?<span>roles: {item.allowed_role_keywords.join(", ")}</span>:<span>role-aware auto scope</span>}<form action={archiveCompanyKnowledge}><input type="hidden" name="knowledgeId" value={item.id}/><button type="submit">Archive</button></form></div></div>)}</div>}
    </section>

    {!draft?<section className="panel"><h2>1. Describe the company</h2><form action={createCompanyBuilderDraft} className="auth-form"><label>Company name<input name="companyName" defaultValue={context.organization.name} required minLength={2} maxLength={120}/></label><label>Company type<input name="companyType" placeholder="e.g. Consulting company, SaaS studio, advertising agency" required/></label><label>Primary services<textarea name="primaryServices" rows={3} placeholder="Separate services with commas or new lines"/></label><label>Business model<input name="businessModel" placeholder="e.g. B2B services, subscription, project-based"/></label><label>Company size intent<select name="companySizeIntent" defaultValue="Lean"><option value="Lean">Lean</option><option value="Standard">Standard</option><option value="Expanded">Expanded</option></select></label><label>Required capabilities<textarea name="requiredCapabilities" rows={3} placeholder="Strategy, sales, operations, analytics..."/></label><label>Desired AI authority<select name="desiredAiAuthority" defaultValue="1"><option value="0">A0 — advisory only</option><option value="1">A1 — low authority</option><option value="2">A2 — bounded operational authority</option><option value="3">A3 — high authority, approval constrained</option><option value="4">A4 — maximum internal authority</option></select></label><label>Preferred language<input name="preferredLanguage" defaultValue="English"/></label><button type="submit">Generate company proposal</button></form></section>:<>
      <section className="panel"><h2>2. Review proposal</h2><p><strong>{draft.company_name}</strong> — {draft.company_type}</p><p>Status: <strong>{draft.status}</strong></p><h3>Departments</h3><div className="kpi-grid">{departments.map((department,index)=><article className="kpi-card" key={`${department.key??department.name}-${index}`}><strong>{department.name}</strong><p>{department.description}</p></article>)}</div><h3>Proposed AI Agents</h3><div className="kpi-grid">{agents.map((agent,index)=><article className="kpi-card" key={`${agent.role??agent.name}-${index}`}><strong>{agent.name??agent.role}</strong><p>{agent.role} · {agent.department_key}</p><p>{agent.purpose}</p><p>A{agent.authority_level??1} · {agent.risk_ceiling??"medium"} risk · AI Agent</p></article>)}</div></section>
      <section className="panel"><h2>3. Build confirmation</h2><p>This creates organization-owned Departments and AI Agents. Agents start paused. External actions remain disabled. Company Knowledge is resolved live for each Agent at runtime.</p>{draft.status==="built"?<p className="form-success">This proposal has already been built.</p>:<form action={buildCompanyFromDraft}><input type="hidden" name="draftId" value={draft.id}/><button type="submit">BUILD MY COMPANY</button></form>}</section>
    </>}
    <p><Link href="/command-center">Return to Command Center</Link></p>
  </main>;
}
