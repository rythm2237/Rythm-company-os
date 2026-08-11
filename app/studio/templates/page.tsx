import Link from "next/link";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { provisionCompanyTemplate } from "./actions";

export const dynamic = "force-dynamic";

type TemplatePageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
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
  department_templates: Array<{ key?: string; name?: string }>;
  agent_template_refs: string[];
  governance_profile: Record<string, unknown>;
  launch_configuration: Record<string, unknown>;
};

export default async function CompanyTemplateLibraryPage({ searchParams }: TemplatePageProps) {
  const context = await requireOwnerOrganizationContext();
  const params = await searchParams;

  if (!context.entitlement?.company_template_access) {
    return (
      <main className="page-shell">
        <section className="panel">
          <p className="eyebrow">RYTHM TEMPLATE LIBRARY</p>
          <h1>Company Templates</h1>
          <p>Company Template access is not enabled for this organization.</p>
          <Link href="/command-center">Return to Command Center</Link>
        </section>
      </main>
    );
  }

  const { data } = await context.supabase
    .from("company_templates")
    .select("id,template_key,name,company_type,category,description,positioning,version,supported_product_codes,department_templates,agent_template_refs,governance_profile,launch_configuration")
    .eq("status", "active")
    .order("name");

  const templates = (data ?? []) as CompanyTemplateRow[];

  return (
    <main className="page-shell">
      <section className="panel">
        <p className="eyebrow">RYTHM TEMPLATE LIBRARY</p>
        <h1>Company Templates</h1>
        <p>Provision versioned RYTHM templates into the active tenant. Templates never operate directly; provisioning creates organization-owned instances.</p>
        <p><strong>Active organization:</strong> {context.organization.name}</p>
      </section>

      {params.message ? <p className="form-success" role="status">{params.message}</p> : null}
      {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}

      {templates.length ? templates.map((template) => (
        <section className="panel" key={`${template.template_key}-${template.version}`}>
          <p className="eyebrow">{template.category}</p>
          <h2>{template.name}</h2>
          <p>{template.description}</p>
          {template.positioning ? <p>{template.positioning}</p> : null}
          <p><strong>Company type:</strong> {template.company_type}</p>
          <p><strong>Version:</strong> {template.version}</p>
          <p><strong>Departments:</strong> {template.department_templates.length}</p>
          <p><strong>AI Agents:</strong> {template.agent_template_refs.length}</p>
          <p><strong>Human CEO authority:</strong> Required</p>
          <p><strong>External actions:</strong> Disabled by default</p>
          <form action={provisionCompanyTemplate}>
            <input type="hidden" name="templateKey" value={template.template_key} />
            <input type="hidden" name="templateVersion" value={template.version} />
            <button type="submit">Provision this company template</button>
          </form>
        </section>
      )) : (
        <section className="panel"><p>No active templates are available.</p></section>
      )}

      <p><Link href="/studio/builder">Open Company Builder</Link> · <Link href="/command-center">Return to Command Center</Link></p>
    </main>
  );
}
