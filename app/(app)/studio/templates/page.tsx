import Link from "next/link";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { provisionAgentTemplate, provisionCompanyTemplate, startSoftwareProjectBlueprint } from "./actions";

export const dynamic = "force-dynamic";

type TemplatePageProps = { searchParams: Promise<{ error?: string; message?: string }> };
type DepartmentTemplate = { key?: string; name?: string; description?: string };
type CompanyTemplateRow = {
  id: string; template_key: string; name: string; company_type: string; category: string;
  description: string; positioning: string | null; version: string; supported_product_codes: string[];
  department_templates: DepartmentTemplate[]; agent_template_refs: string[]; workflow_template_refs: string[];
  governance_profile: Record<string, unknown>; launch_configuration: Record<string, unknown>;
};
type AgentTemplateRow = {
  id: string; template_key: string; version: string; name: string; role: string; purpose: string;
  department_template_key: string | null; reports_to_template_key: string | null; canonical_role: string | null;
  role_family: string | null; default_specializations: string[]; default_risk_ceiling: string;
  default_authority_level: number; monthly_company_cost: number; cost_currency: string; cost_model: string;
  sale_price_monthly: number | null;
};
type WorkflowRow = {
  workflow_key: string; version: string; company_template_key: string; name: string; description: string;
  stages: Array<{ key: string; name: string; owner: string; approval_required?: boolean }>;
  completion_evidence: Record<string, string[]>;
};
type MeetingTypeRow = { company_template_key: string; meeting_key: string; name: string; purpose: string };
type RequirementRow = { company_template_key: string; provider_key: string; requirement_level: string; purpose: string };
type DependencyRow = { template_key: string; dependency_key: string; requirement_level: string; status: string; detail: string };

function money(value: number | null, currency: string) {
  if (value == null) return "Not separately priced";
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(value);
}

export default async function CompanyTemplateLibraryPage({ searchParams }: TemplatePageProps) {
  const context = await requireActiveOwnerOrganizationContext();
  const params = await searchParams;
  if (!context.entitlement.company_template_access) {
    return <main className="page-shell"><section className="panel"><p className="eyebrow">RYTHM TEMPLATE LIBRARY</p><h1>Company Templates</h1><p>Company Template access is not enabled for this organization.</p><Link href="/command-center">Return to Command Center</Link></section></main>;
  }

  const [templatesResult, agentsResult, installationsResult, workflowsResult, meetingsResult, requirementsResult, dependenciesResult, tenantAgentsResult] = await Promise.all([
    context.supabase.from("company_templates").select("id,template_key,name,company_type,category,description,positioning,version,supported_product_codes,department_templates,agent_template_refs,workflow_template_refs,governance_profile,launch_configuration").eq("status", "active").order("name"),
    context.supabase.from("agent_templates").select("id,template_key,version,name,role,purpose,department_template_key,reports_to_template_key,canonical_role,role_family,default_specializations,default_risk_ceiling,default_authority_level,monthly_company_cost,cost_currency,cost_model,sale_price_monthly").eq("is_active", true).order("name"),
    context.supabase.from("organization_template_installations").select("template_key,template_version,installed_at").eq("organization_id", context.organizationId),
    context.supabase.from("company_template_workflows").select("workflow_key,version,company_template_key,name,description,stages,completion_evidence").eq("active", true),
    context.supabase.from("company_template_meeting_types").select("company_template_key,meeting_key,name,purpose").eq("active", true).order("name"),
    context.supabase.from("company_template_integration_requirements").select("company_template_key,provider_key,requirement_level,purpose").order("provider_key"),
    context.supabase.from("organization_setup_dependencies").select("template_key,dependency_key,requirement_level,status,detail").eq("organization_id", context.organizationId),
    context.supabase.from("agents").select("agent_template_id,agent_status").eq("organization_id", context.organizationId).neq("agent_status", "archived"),
  ]);
  const templates = (templatesResult.data ?? []) as CompanyTemplateRow[];
  const allAgentTemplates = (agentsResult.data ?? []) as AgentTemplateRow[];
  const installedKeys = new Set((installationsResult.data ?? []).map((row) => `${row.template_key}:${row.template_version}`));
  const tenantAgentTemplateIds = new Set((tenantAgentsResult.data ?? []).map((row) => row.agent_template_id).filter(Boolean));
  const workflows = (workflowsResult.data ?? []) as WorkflowRow[];
  const meetings = (meetingsResult.data ?? []) as MeetingTypeRow[];
  const requirements = (requirementsResult.data ?? []) as RequirementRow[];
  const dependencies = (dependenciesResult.data ?? []) as DependencyRow[];
  const catalogRefs = new Set(templates.flatMap((template) => template.agent_template_refs));
  const agentCatalog = allAgentTemplates.filter((agent) => catalogRefs.has(agent.template_key));

  return <main className="page-shell">
    <section className="panel">
      <p className="eyebrow">RYTHM TEMPLATE LIBRARY</p><h1>Ready Companies & reusable Agents</h1>
      <p>Materialize versioned operating systems into the active tenant. Professional knowledge is platform-managed; company memory, credentials and execution authority remain tenant-owned.</p>
      <p><strong>Active organization:</strong> {context.organization.name} · <strong>Agent capacity:</strong> {context.entitlement.max_active_agents}</p>
    </section>
    {params.message ? <p className="form-success" role="status">{params.message}</p> : null}
    {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}

    {templates.length ? templates.map((template) => {
      const installed = installedKeys.has(`${template.template_key}:${template.version}`);
      const supported = template.supported_product_codes.includes(context.entitlement.product_code);
      const templateWorkflow = workflows.find((workflow) => template.workflow_template_refs.includes(workflow.workflow_key));
      const templateMeetings = meetings.filter((meeting) => meeting.company_template_key === template.template_key);
      const templateRequirements = requirements.filter((requirement) => requirement.company_template_key === template.template_key);
      const templateDependencies = dependencies.filter((dependency) => dependency.template_key === template.template_key);
      return <section className="panel panel-wide" key={`${template.template_key}-${template.version}`}>
        <div className="panel-heading"><div><p className="eyebrow">{template.category}</p><h2>{template.name}</h2></div><span className="pill">{installed ? "Installed" : `v${template.version}`}</span></div>
        <p>{template.description}</p>{template.positioning ? <p>{template.positioning}</p> : null}
        <div className="compact-list">
          <div><strong>{template.department_templates.length} departments</strong><span>{template.department_templates.map((department) => department.name).join(" · ")}</span></div>
          <div><strong>{template.agent_template_refs.length} professional Agents</strong><span>Tenant-owned, Master-level internally verified, paused at launch.</span></div>
          <div><strong>Human CEO governance</strong><span>Production, migrations, protected merges and consequential external actions require approval.</span></div>
          <div><strong>Adaptive model routing</strong><span>Task-aware routing within entitlement, cost and quality policy—without hard-wiring one model.</span></div>
        </div>
        {!installed ? <form action={provisionCompanyTemplate} style={{ marginTop: 18 }}>
          <input type="hidden" name="templateKey" value={template.template_key}/><input type="hidden" name="templateVersion" value={template.version}/>
          <button className="primary-button" type="submit" disabled={!supported || context.entitlement.max_active_agents < template.agent_template_refs.length}>Provision this company</button>
          {!supported ? <p className="form-error">This 19-Agent release is available to Company Studio organizations.</p> : null}
          {context.entitlement.max_active_agents < template.agent_template_refs.length ? <p className="form-error">This template requires capacity for {template.agent_template_refs.length} active Agents.</p> : null}
        </form> : <form action={startSoftwareProjectBlueprint} className="stacked-form" style={{ maxWidth: 620, marginTop: 18 }}>
          <label>Start the first governed product project<input name="projectName" minLength={2} maxLength={160} placeholder="Your product or initiative name" required/></label>
          <button className="primary-button" type="submit">Create workflow and first brief action</button>
        </form>}

        {templateWorkflow ? <div style={{ marginTop: 24 }}><p className="label">DELIVERY WORKFLOW · {templateWorkflow.stages.length} EVIDENCE GATES</p><h3>{templateWorkflow.name}</h3><p>{templateWorkflow.description}</p><div className="data-list">{templateWorkflow.stages.map((stage, index) => <div className="data-row" key={stage.key}><div><strong>{String(index + 1).padStart(2, "0")} · {stage.name}</strong><span>{stage.key} · owner: {stage.owner}</span></div>{stage.approval_required ? <span className="pill">Approval</span> : null}</div>)}</div></div> : null}

        <div className="executive-grid" style={{ marginTop: 24 }}>
          <article><p className="label">OPERATING MEETINGS</p><div className="compact-list">{templateMeetings.map((meeting) => <div key={meeting.meeting_key}><strong>{meeting.name}</strong><span>{meeting.purpose}</span></div>)}</div></article>
          <article><p className="label">SETUP DEPENDENCIES</p><div className="compact-list">{templateRequirements.map((requirement) => {
            const dependency = templateDependencies.find((item) => item.dependency_key === requirement.provider_key);
            return <div key={requirement.provider_key}><strong>{requirement.provider_key} · {dependency?.status ?? (installed ? "pending" : requirement.requirement_level)}</strong><span>{requirement.purpose}</span></div>;
          })}</div>{installed ? <p><Link href="/integrations">Connect services and apply recommended grants</Link></p> : null}</article>
        </div>
      </section>;
    }) : <section className="panel"><p>No active templates are available.</p></section>}

    <section className="panel panel-wide">
      <div className="panel-heading"><div><p className="eyebrow">REUSABLE AGENT CATALOG</p><h2>Provision roles individually</h2></div><span className="pill">{agentCatalog.length} roles</span></div>
      <p>Each role includes reusable professional foundations and specializations. Provisioning creates a paused tenant instance; it never copies company memory, integration credentials or external authority.</p>
      <div className="data-list">{agentCatalog.map((agent) => {
        const alreadyPresent = tenantAgentTemplateIds.has(agent.id);
        return <div className="data-row" key={agent.id}><div><strong>{agent.name}</strong><span>{agent.role_family} · {agent.default_specializations.join(", ") || "foundation"} · risk ceiling {agent.default_risk_ceiling}</span><span>{agent.purpose}</span><span>Company cost: {money(Number(agent.monthly_company_cost), agent.cost_currency)} ({agent.cost_model}) · Sale price: {money(agent.sale_price_monthly == null ? null : Number(agent.sale_price_monthly), agent.cost_currency)}</span></div><form action={provisionAgentTemplate}><input type="hidden" name="templateKey" value={agent.template_key}/><input type="hidden" name="templateVersion" value={agent.version}/><button className="secondary-button" disabled={alreadyPresent}>{alreadyPresent ? "Provisioned" : "Add Agent"}</button></form></div>;
      })}</div>
    </section>
    <p><Link href="/studio/builder">Open Company Builder</Link> · <Link href="/studio/agents">Open Agent Studio</Link> · <Link href="/command-center">Return to Command Center</Link></p>
  </main>;
}
