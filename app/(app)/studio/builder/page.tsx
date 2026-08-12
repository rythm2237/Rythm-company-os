import Link from "next/link";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { buildCompanyFromDraft, createCompanyBuilderDraft } from "./actions";

export const dynamic = "force-dynamic";

type BuilderPageProps = {
  searchParams: Promise<{ draft?: string; error?: string; message?: string }>;
};

type DraftRow = {
  id: string;
  company_name: string;
  company_type: string;
  primary_services: string[];
  business_model: string;
  company_size_intent: string;
  required_capabilities: string[];
  desired_ai_authority: number;
  preferred_language: string;
  proposed_structure: {
    departments?: Array<{ key?: string; name?: string; description?: string }>;
    agents?: Array<{ name?: string; role?: string; department_key?: string; purpose?: string; authority_level?: number; risk_ceiling?: string }>;
  };
  status: string;
};

export default async function CompanyBuilderPage({ searchParams }: BuilderPageProps) {
  const context = await requireActiveOwnerOrganizationContext();
  const params = await searchParams;

  if (!context.entitlement.company_builder_enabled) {
    return (
      <main className="page-shell">
        <section className="panel">
          <p className="eyebrow">RYTHM COMPANY STUDIO</p>
          <h1>Company Builder</h1>
          <p>Company Builder is not enabled for this organization&apos;s current commercial entitlement.</p>
          <Link href="/command-center">Return to Command Center</Link>
        </section>
      </main>
    );
  }

  let draft: DraftRow | null = null;
  if (params.draft) {
    const { data } = await context.supabase
      .from("company_builder_drafts")
      .select("id,company_name,company_type,primary_services,business_model,company_size_intent,required_capabilities,desired_ai_authority,preferred_language,proposed_structure,status")
      .eq("id", params.draft)
      .maybeSingle();
    draft = (data as DraftRow | null) ?? null;
  }

  const departments = draft?.proposed_structure?.departments ?? [];
  const agents = draft?.proposed_structure?.agents ?? [];

  return (
    <main className="page-shell">
      <section className="panel">
        <p className="eyebrow">RYTHM COMPANY STUDIO</p>
        <h1>Build your AI company</h1>
        <p>
          Create a governed company proposal first. Nothing becomes an operational AI Agent until you explicitly confirm BUILD MY COMPANY.
        </p>
        <p><strong>Active organization:</strong> {context.organization.name}</p>
        <p><strong>Human authority:</strong> Human CEO / Owner</p>
        <p><strong>External actions:</strong> Disabled by default</p>
      </section>

      {params.message ? <p className="form-success" role="status">{params.message}</p> : null}
      {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}

      {!draft ? (
        <section className="panel">
          <h2>1. Describe the company</h2>
          <form action={createCompanyBuilderDraft} className="auth-form">
            <label>Company name<input name="companyName" defaultValue={context.organization.name} required minLength={2} maxLength={120} /></label>
            <label>Company type<input name="companyType" placeholder="e.g. Consulting company, SaaS studio, advertising agency" required /></label>
            <label>Primary services<textarea name="primaryServices" rows={3} placeholder="Separate services with commas or new lines" /></label>
            <label>Business model<input name="businessModel" placeholder="e.g. B2B services, subscription, project-based" /></label>
            <label>Company size intent
              <select name="companySizeIntent" defaultValue="Lean">
                <option value="Lean">Lean</option>
                <option value="Standard">Standard</option>
                <option value="Expanded">Expanded</option>
              </select>
            </label>
            <label>Required capabilities<textarea name="requiredCapabilities" rows={3} placeholder="Strategy, sales, operations, analytics..." /></label>
            <label>Desired AI authority
              <select name="desiredAiAuthority" defaultValue="1">
                <option value="0">A0 — advisory only</option>
                <option value="1">A1 — low authority</option>
                <option value="2">A2 — bounded operational authority</option>
                <option value="3">A3 — high authority, approval constrained</option>
                <option value="4">A4 — maximum internal authority</option>
              </select>
            </label>
            <label>Preferred language<input name="preferredLanguage" defaultValue="English" /></label>
            <button type="submit">Generate company proposal</button>
          </form>
        </section>
      ) : (
        <>
          <section className="panel">
            <h2>2. Review proposal</h2>
            <p><strong>{draft.company_name}</strong> — {draft.company_type}</p>
            <p>Status: <strong>{draft.status}</strong></p>

            <h3>Departments</h3>
            <div className="kpi-grid">
              {departments.map((department, index) => (
                <article className="kpi-card" key={`${department.key ?? department.name}-${index}`}>
                  <strong>{department.name}</strong>
                  <p>{department.description}</p>
                </article>
              ))}
            </div>

            <h3>Proposed AI Agents</h3>
            <div className="kpi-grid">
              {agents.map((agent, index) => (
                <article className="kpi-card" key={`${agent.role ?? agent.name}-${index}`}>
                  <strong>{agent.name ?? agent.role}</strong>
                  <p>{agent.role} · {agent.department_key}</p>
                  <p>{agent.purpose}</p>
                  <p>A{agent.authority_level ?? 1} · {agent.risk_ceiling ?? "medium"} risk · AI Agent</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>3. Build confirmation</h2>
            <p>
              This creates organization-owned Department and AI Agent instances. Agents start paused. External actions remain disabled. Human CEO authority remains mandatory.
            </p>
            {draft.status === "built" ? (
              <p className="form-success">This proposal has already been built.</p>
            ) : (
              <form action={buildCompanyFromDraft}>
                <input type="hidden" name="draftId" value={draft.id} />
                <button type="submit">BUILD MY COMPANY</button>
              </form>
            )}
          </section>
        </>
      )}

      <p><Link href="/command-center">Return to Command Center</Link></p>
    </main>
  );
}
