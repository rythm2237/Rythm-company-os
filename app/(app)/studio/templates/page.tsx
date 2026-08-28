import Link from "next/link";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import {
  provisionAgentTemplate,
  provisionCompanyTemplate,
  startSoftwareProjectBlueprint,
} from "./actions";
import styles from "./marketplace.module.css";

export const dynamic = "force-dynamic";

type TemplatePageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};
type DepartmentTemplate = {
  key?: string;
  name?: string;
  description?: string;
};
type CompanyTemplateRow = {
  id: string;
  template_key: string;
  name: string;
  company_type: string;
  category: string;
  description: string;
  positioning: string | null;
  version: string;
  supported_product_codes: string[];
  department_templates: DepartmentTemplate[];
  agent_template_refs: string[];
  workflow_template_refs: string[];
  governance_profile: Record<string, unknown>;
  launch_configuration: Record<string, unknown>;
  catalog_slug: string | null;
  display_order: number;
  industry_tags: string[];
  recommended_for: string[];
  maturity: string;
  is_featured: boolean;
  compatibility_contract: Record<string, unknown>;
  upgrade_strategy: string;
};
type AgentTemplateRow = {
  id: string;
  template_key: string;
  version: string;
  name: string;
  role: string;
  purpose: string;
  role_family: string | null;
  default_specializations: string[];
  default_risk_ceiling: string;
  monthly_company_cost: number;
  cost_currency: string;
  cost_model: string;
  sale_price_monthly: number | null;
};
type WorkflowRow = {
  workflow_key: string;
  version: string;
  company_template_key: string;
  name: string;
  description: string;
  stages: Array<{
    key: string;
    name: string;
    owner: string;
    approval_required?: boolean;
  }>;
};
type MeetingTypeRow = {
  company_template_key: string;
  meeting_key: string;
  name: string;
  purpose: string;
};
type RequirementRow = {
  company_template_key: string;
  provider_key: string;
  requirement_level: string;
  purpose: string;
};
type DependencyRow = {
  template_key: string;
  dependency_key: string;
  requirement_level: string;
  status: string;
  detail: string;
};
type InstallationRow = {
  template_key: string;
  template_version: string;
  installed_at: string;
  template_snapshot_digest: string | null;
  upgrade_status: string;
};

function money(value: number | null, currency: string) {
  if (value == null) return "Not separately priced";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).format(value);
}

function shortCategory(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function CompanyTemplateLibraryPage({
  searchParams,
}: TemplatePageProps) {
  const context = await requireActiveOwnerOrganizationContext();
  const params = await searchParams;

  if (!context.entitlement.company_template_access) {
    return (
      <main className="page-shell">
        <section className="panel">
          <p className="eyebrow">RYTHM READY COMPANY LIBRARY</p>
          <h1>Ready AI Companies</h1>
          <p>Company Template access is not enabled for this organization.</p>
          <Link href="/command-center">Return to Command Center</Link>
        </section>
      </main>
    );
  }

  const [
    templatesResult,
    agentsResult,
    installationsResult,
    workflowsResult,
    meetingsResult,
    requirementsResult,
    dependenciesResult,
    tenantAgentsResult,
  ] = await Promise.all([
    context.supabase
      .from("company_templates")
      .select(
        "id,template_key,name,company_type,category,description,positioning,version,supported_product_codes,department_templates,agent_template_refs,workflow_template_refs,governance_profile,launch_configuration,catalog_slug,display_order,industry_tags,recommended_for,maturity,is_featured,compatibility_contract,upgrade_strategy",
      )
      .eq("status", "active")
      .order("display_order")
      .order("name"),
    context.supabase
      .from("agent_templates")
      .select(
        "id,template_key,version,name,role,purpose,role_family,default_specializations,default_risk_ceiling,monthly_company_cost,cost_currency,cost_model,sale_price_monthly",
      )
      .eq("is_active", true)
      .order("name"),
    context.supabase
      .from("organization_template_installations")
      .select(
        "template_key,template_version,installed_at,template_snapshot_digest,upgrade_status",
      )
      .eq("organization_id", context.organizationId),
    context.supabase
      .from("company_template_workflows")
      .select(
        "workflow_key,version,company_template_key,name,description,stages",
      )
      .eq("active", true),
    context.supabase
      .from("company_template_meeting_types")
      .select("company_template_key,meeting_key,name,purpose")
      .eq("active", true)
      .order("name"),
    context.supabase
      .from("company_template_integration_requirements")
      .select(
        "company_template_key,provider_key,requirement_level,purpose",
      )
      .order("provider_key"),
    context.supabase
      .from("organization_setup_dependencies")
      .select("template_key,dependency_key,requirement_level,status,detail")
      .eq("organization_id", context.organizationId),
    context.supabase
      .from("agents")
      .select("agent_template_id,agent_status")
      .eq("organization_id", context.organizationId)
      .neq("agent_status", "archived"),
  ]);

  const templates = (templatesResult.data ?? []) as CompanyTemplateRow[];
  const allAgentTemplates = (agentsResult.data ?? []) as AgentTemplateRow[];
  const installations = (installationsResult.data ?? []) as InstallationRow[];
  const workflows = (workflowsResult.data ?? []) as WorkflowRow[];
  const meetings = (meetingsResult.data ?? []) as MeetingTypeRow[];
  const requirements = (requirementsResult.data ?? []) as RequirementRow[];
  const dependencies = (dependenciesResult.data ?? []) as DependencyRow[];
  const tenantAgentTemplateIds = new Set(
    (tenantAgentsResult.data ?? [])
      .map((row) => row.agent_template_id)
      .filter(Boolean),
  );
  const catalogRefs = new Set(
    templates.flatMap((template) => template.agent_template_refs),
  );
  const agentCatalog = allAgentTemplates.filter((agent) =>
    catalogRefs.has(agent.template_key),
  );

  return (
    <main className="page-shell">
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className="eyebrow">RYTHM READY COMPANY MARKETPLACE</p>
            <h1>Start with a company that is already designed to operate.</h1>
          </div>
          <div className={styles.orgBadge}>
            <span>Active organization</span>
            <strong>{context.organization.name}</strong>
            <span>
              {context.entitlement.max_active_agents} Agent capacity · {templates.length} ready companies
            </span>
          </div>
        </div>
        <p className={styles.heroCopy}>
          Browse governed Ready Companies like a marketplace. Open any company to inspect its departments,
          AI workforce, workflows, meetings and integration requirements, then provision it directly into this organization.
        </p>
      </section>

      {params.message ? (
        <p className="form-success" role="status">
          {params.message}
        </p>
      ) : null}
      {params.error ? (
        <p className="form-error" role="alert">
          {params.error}
        </p>
      ) : null}

      <div className={styles.marketHeader}>
        <div>
          <h2>Ready Companies</h2>
          <p>Choose a company card to see the full operating model.</p>
        </div>
        <span className="pill">Immutable catalog releases</span>
      </div>

      {templates.length ? (
        <section className={styles.grid}>
          {templates.map((template) => {
            const installation = installations.find(
              (row) =>
                row.template_key === template.template_key &&
                row.template_version === template.version,
            );
            const installed = Boolean(installation);
            const supported = template.supported_product_codes.includes(
              context.entitlement.product_code,
            );
            const hasCapacity =
              context.entitlement.max_active_agents >=
              template.agent_template_refs.length;
            const templateWorkflow = workflows.find((workflow) =>
              template.workflow_template_refs.includes(workflow.workflow_key),
            );
            const templateMeetings = meetings.filter(
              (meeting) =>
                meeting.company_template_key === template.template_key,
            );
            const templateRequirements = requirements.filter(
              (requirement) =>
                requirement.company_template_key === template.template_key,
            );
            const templateDependencies = dependencies.filter(
              (dependency) =>
                dependency.template_key === template.template_key,
            );
            const canStartLegacyBlueprint =
              installed && template.template_key === "ready_software_company_v1";

            return (
              <details
                className={styles.card}
                key={`${template.template_key}-${template.version}`}
              >
                <summary className={styles.summary}>
                  <div className={styles.cardTop}>
                    <div style={{ display: "flex", gap: 14 }}>
                      <div className={styles.icon} aria-hidden="true">
                        {template.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((word) => word[0])
                          .join("")}
                      </div>
                      <div>
                        <p className={styles.kicker}>
                          {template.is_featured ? "Featured · " : ""}
                          {shortCategory(template.category)}
                        </p>
                        <h2 className={styles.title}>{template.name}</h2>
                      </div>
                    </div>
                    <span
                      className={`${styles.chip} ${
                        installed ? styles.chipSuccess : styles.chipPrimary
                      }`}
                    >
                      {installed ? "Installed" : `v${template.version}`}
                    </span>
                  </div>

                  <p className={styles.description}>{template.description}</p>

                  <div className={styles.meta}>
                    <span className={styles.chip}>
                      {template.department_templates.length} departments
                    </span>
                    <span className={styles.chip}>
                      {template.agent_template_refs.length} AI Agents
                    </span>
                    <span className={styles.chip}>{template.maturity}</span>
                    {template.industry_tags.slice(0, 2).map((tag) => (
                      <span className={styles.chip} key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className={styles.openHint}>
                    <span>View company details</span>
                    <span aria-hidden="true">＋</span>
                  </div>
                </summary>

                <div className={styles.details}>
                  {template.positioning ? <p>{template.positioning}</p> : null}

                  <div className={styles.detailGrid}>
                    <div className={styles.detailBox}>
                      <strong>Departments</strong>
                      <span>
                        {template.department_templates
                          .map((department) => department.name)
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    <div className={styles.detailBox}>
                      <strong>{template.agent_template_refs.length} professional AI Agents</strong>
                      <span>
                        Tenant-owned and paused at launch. External actions remain disabled until explicit integration grants are configured.
                      </span>
                    </div>
                    <div className={styles.detailBox}>
                      <strong>Human CEO governance</strong>
                      <span>
                        High-risk actions remain behind approval, execution and audit controls.
                      </span>
                    </div>
                    <div className={styles.detailBox}>
                      <strong>Version snapshot isolation</strong>
                      <span>
                        {installation?.template_snapshot_digest
                          ? `Installed snapshot ${installation.template_snapshot_digest.slice(0, 12)}…`
                          : "The exact catalog release is locked when you provision."}
                      </span>
                    </div>
                  </div>

                  {template.recommended_for.length ? (
                    <div className={styles.section}>
                      <h3>Recommended for</h3>
                      <div className={styles.meta}>
                        {template.recommended_for.map((item) => (
                          <span className={styles.chip} key={item}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {templateWorkflow ? (
                    <div className={styles.section}>
                      <h3>{templateWorkflow.name}</h3>
                      <p>{templateWorkflow.description}</p>
                      <div className={styles.rows}>
                        {templateWorkflow.stages.map((stage, index) => (
                          <div className={styles.row} key={stage.key}>
                            <div>
                              <strong>
                                {String(index + 1).padStart(2, "0")} · {stage.name}
                              </strong>
                              <div>
                                <span>
                                  {stage.key} · owner: {stage.owner}
                                </span>
                              </div>
                            </div>
                            {stage.approval_required ? (
                              <span className="pill">Approval</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className={styles.detailGrid}>
                    <div className={styles.section}>
                      <h3>Operating meetings</h3>
                      <div className={styles.rows}>
                        {templateMeetings.length ? (
                          templateMeetings.map((meeting) => (
                            <div className={styles.row} key={meeting.meeting_key}>
                              <div>
                                <strong>{meeting.name}</strong>
                                <div>
                                  <span>{meeting.purpose}</span>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className={styles.row}>
                            <span>No dedicated meeting catalog for this template.</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className={styles.section}>
                      <h3>Integration requirements</h3>
                      <div className={styles.rows}>
                        {templateRequirements.length ? (
                          templateRequirements.map((requirement) => {
                            const dependency = templateDependencies.find(
                              (item) =>
                                item.dependency_key === requirement.provider_key,
                            );
                            return (
                              <div className={styles.row} key={requirement.provider_key}>
                                <div>
                                  <strong>{requirement.provider_key}</strong>
                                  <div>
                                    <span>{requirement.purpose}</span>
                                  </div>
                                </div>
                                <span className="pill">
                                  {dependency?.status ??
                                    (installed
                                      ? "pending"
                                      : requirement.requirement_level)}
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <div className={styles.row}>
                            <span>No dedicated integrations are required to provision.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className={styles.actions}>
                    {!installed ? (
                      <form action={provisionCompanyTemplate}>
                        <input
                          type="hidden"
                          name="templateKey"
                          value={template.template_key}
                        />
                        <input
                          type="hidden"
                          name="templateVersion"
                          value={template.version}
                        />
                        <button
                          className="primary-button"
                          type="submit"
                          disabled={!supported || !hasCapacity}
                        >
                          Provision {template.name}
                        </button>
                      </form>
                    ) : canStartLegacyBlueprint ? (
                      <form
                        action={startSoftwareProjectBlueprint}
                        className="stacked-form"
                        style={{ maxWidth: 620 }}
                      >
                        <label>
                          Start the first governed product project
                          <input
                            name="projectName"
                            minLength={2}
                            maxLength={160}
                            placeholder="Your product or initiative name"
                            required
                          />
                        </label>
                        <button className="primary-button" type="submit">
                          Create workflow and first brief action
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="pill">
                          Snapshot locked · {installation?.upgrade_status ?? "current"}
                        </span>
                        <Link href="/integrations">
                          Configure integrations
                        </Link>
                      </>
                    )}

                    {!supported ? (
                      <span className="form-error">
                        Not included in the active product entitlement.
                      </span>
                    ) : null}
                    {!hasCapacity ? (
                      <span className="form-error">
                        Requires {template.agent_template_refs.length} Agent capacity; this organization currently allows {context.entitlement.max_active_agents}.
                      </span>
                    ) : null}
                  </div>
                </div>
              </details>
            );
          })}
        </section>
      ) : (
        <section className="panel">
          <p>No active templates are available.</p>
        </section>
      )}

      <details className={styles.agentCatalog}>
        <summary>
          Reusable Agent Catalog · {agentCatalog.length} individual roles
        </summary>
        <div className={styles.agentCatalogBody}>
          <p>
            Company Studio organizations can also provision individual roles. Each role starts paused and never inherits company memory, credentials or external authority.
          </p>
          <div className="data-list">
            {agentCatalog.map((agent) => {
              const alreadyPresent = tenantAgentTemplateIds.has(agent.id);
              return (
                <div className="data-row" key={agent.id}>
                  <div>
                    <strong>{agent.name}</strong>
                    <span>
                      {agent.role_family} · {agent.default_specializations.join(", ") || "foundation"} · risk ceiling {agent.default_risk_ceiling}
                    </span>
                    <span>{agent.purpose}</span>
                    <span>
                      Company cost: {money(Number(agent.monthly_company_cost), agent.cost_currency)} ({agent.cost_model}) · Sale price: {money(agent.sale_price_monthly == null ? null : Number(agent.sale_price_monthly), agent.cost_currency)}
                    </span>
                  </div>
                  <form action={provisionAgentTemplate}>
                    <input
                      type="hidden"
                      name="templateKey"
                      value={agent.template_key}
                    />
                    <input
                      type="hidden"
                      name="templateVersion"
                      value={agent.version}
                    />
                    <button className="secondary-button" disabled={alreadyPresent}>
                      {alreadyPresent ? "Provisioned" : "Add Agent"}
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </div>
      </details>

      <p>
        <Link href="/studio/builder">Open Company Builder</Link> ·{" "}
        <Link href="/studio/agents">Open Agent Studio</Link> ·{" "}
        <Link href="/command-center">Return to Command Center</Link>
      </p>
    </main>
  );
}
