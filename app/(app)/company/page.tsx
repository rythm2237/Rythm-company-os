import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizationContext, requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { createWorkforceAdminClient } from "@/lib/supabase/workforce-admin";

export const dynamic = "force-dynamic";

const memberRoles = new Set(["owner", "admin", "manager", "member", "viewer"]);
const memberStatuses = new Set(["active", "suspended", "removed"]);
const costModels = new Set(["included", "fixed", "usage", "hybrid", "custom"]);

function text(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }
function nullable(formData: FormData, key: string) { return text(formData, key) || null; }
function money(formData: FormData, key: string) {
  const value = Number(formData.get(key) ?? 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

async function updateCompanyProfile(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const legalName = text(formData, "legalName");
  const countryCode = text(formData, "countryCode").toUpperCase().slice(0, 2);
  const currency = text(formData, "currency").toUpperCase().slice(0, 3) || "EUR";
  const timezone = text(formData, "timezone") || "UTC";
  if (!legalName) redirect("/company?error=Legal%20name%20is%20required.");

  const registeredAddress = {
    line1: text(formData, "addressLine1"),
    line2: text(formData, "addressLine2"),
    city: text(formData, "city"),
    postal_code: text(formData, "postalCode"),
    country_code: countryCode,
  };

  const { error } = await supabase.from("organizations").update({
    legal_name: legalName,
    legal_entity_type: nullable(formData, "legalEntityType"),
    registration_number: nullable(formData, "registrationNumber"),
    tax_id: nullable(formData, "taxId"),
    vat_id: nullable(formData, "vatId"),
    country_code: countryCode || null,
    registered_address: registeredAddress,
    website_url: nullable(formData, "websiteUrl"),
    primary_email: nullable(formData, "primaryEmail"),
    primary_phone: nullable(formData, "primaryPhone"),
    default_currency: currency,
    timezone,
    updated_at: new Date().toISOString(),
  }).eq("id", organizationId);
  if (error) redirect(`/company?error=${encodeURIComponent(error.message)}`);

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "organization.profile_updated",
    object_type: "organization",
    object_id: organizationId,
    risk_level: "medium",
    payload: { legal_name: legalName, country_code: countryCode, currency, timezone },
  });
  revalidatePath("/company");
  redirect("/company?message=Company%20profile%20updated.");
}

async function createDepartment(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const name = text(formData, "name");
  if (!name) redirect("/company?error=Department%20name%20is%20required.");
  const { data, error } = await supabase.from("departments").insert({
    organization_id: organizationId,
    name,
    description: nullable(formData, "description"),
    parent_department_id: nullable(formData, "parentDepartmentId"),
    status: "active",
  }).select("id").single();
  if (error || !data) redirect(`/company?error=${encodeURIComponent(error?.message ?? "Department could not be created.")}`);
  await supabase.from("audit_events").insert({ organization_id: organizationId, actor_type: "user", actor_user_id: user.id, event_type: "organization.department_created", object_type: "department", object_id: data.id, risk_level: "low", payload: { name } });
  revalidatePath("/company");
}

async function createTeam(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const name = text(formData, "name");
  if (!name) redirect("/company?error=Team%20name%20is%20required.");
  const { data, error } = await supabase.from("teams").insert({
    organization_id: organizationId,
    department_id: nullable(formData, "departmentId"),
    name,
    description: nullable(formData, "description"),
    manager_agent_id: nullable(formData, "managerAgentId"),
  }).select("id").single();
  if (error || !data) redirect(`/company?error=${encodeURIComponent(error?.message ?? "Team could not be created.")}`);
  await supabase.from("audit_events").insert({ organization_id: organizationId, actor_type: "user", actor_user_id: user.id, event_type: "organization.team_created", object_type: "team", object_id: data.id, risk_level: "low", payload: { name } });
  revalidatePath("/company");
}

async function inviteMember(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const email = text(formData, "email").toLowerCase();
  const role = text(formData, "role") || "member";
  const departmentId = nullable(formData, "departmentId");
  if (!email.includes("@") || !memberRoles.has(role) || role === "owner") redirect("/company?error=Enter%20a%20valid%20email%20and%20role.");
  const admin = createWorkforceAdminClient();
  if (!admin) redirect("/company?error=Invitation%20service%20is%20not%20configured.");

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://rythm-os.com"}/auth/callback`;
  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { organization_id: organizationId, organization_role: role } });
  if (inviteError || !invite.user) redirect(`/company?error=${encodeURIComponent(inviteError?.message ?? "Invitation failed.")}`);

  await admin.from("organization_members").upsert({
    organization_id: organizationId,
    user_id: invite.user.id,
    role,
    department_id: departmentId,
    membership_status: "active",
    invited_at: new Date().toISOString(),
  }, { onConflict: "organization_id,user_id" });
  await admin.from("organization_invitations").insert({ organization_id: organizationId, email, role, department_id: departmentId, invited_by_user_id: user.id, invited_user_id: invite.user.id, status: "invited" });
  await supabase.from("audit_events").insert({ organization_id: organizationId, actor_type: "user", actor_user_id: user.id, event_type: "organization.member_invited", object_type: "organization_member", object_id: invite.user.id, risk_level: "medium", payload: { email, role, department_id: departmentId } });
  revalidatePath("/company");
  redirect("/company?message=Invitation%20sent.");
}

async function updateMember(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const userId = text(formData, "userId");
  const role = text(formData, "role");
  const status = text(formData, "status");
  if (!userId || !memberRoles.has(role) || !memberStatuses.has(status)) redirect("/company?error=Invalid%20member%20update.");
  const { error } = await supabase.from("organization_members").update({
    role,
    membership_status: status,
    job_title: nullable(formData, "jobTitle"),
    department_id: nullable(formData, "departmentId"),
    deactivated_at: status === "active" ? null : new Date().toISOString(),
  }).eq("organization_id", organizationId).eq("user_id", userId);
  if (error) redirect(`/company?error=${encodeURIComponent(error.message)}`);
  await supabase.from("audit_events").insert({ organization_id: organizationId, actor_type: "user", actor_user_id: user.id, event_type: "organization.member_updated", object_type: "organization_member", object_id: userId, risk_level: "medium", payload: { role, status } });
  revalidatePath("/company");
}

async function updateAgentStructure(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const agentId = text(formData, "agentId");
  const { error } = await supabase.from("agents").update({
    department_id: nullable(formData, "departmentId"),
    reports_to_agent_id: nullable(formData, "reportsToAgentId"),
  }).eq("organization_id", organizationId).eq("id", agentId);
  if (error) redirect(`/company?error=${encodeURIComponent(error.message)}`);
  await supabase.from("audit_events").insert({ organization_id: organizationId, actor_type: "user", actor_user_id: user.id, event_type: "organization.agent_structure_updated", object_type: "agent", object_id: agentId, risk_level: "low", payload: {} });
  revalidatePath("/company");
}

async function updateAgentCost(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const agentId = text(formData, "agentId");
  const costModel = text(formData, "costModel");
  if (!agentId || !costModels.has(costModel)) redirect("/company?error=Invalid%20Agent%20Cost%20model.");
  const monthlyCompanyCost = money(formData, "monthlyCompanyCost");
  const usageCostRate = money(formData, "usageCostRate");
  const salePriceMonthly = nullable(formData, "salePriceMonthly") === null ? null : money(formData, "salePriceMonthly");
  const currency = text(formData, "currency").toUpperCase().slice(0, 3) || "EUR";
  const usageCostUnit = nullable(formData, "usageCostUnit");
  const { error } = await supabase.from("agents").update({ cost_model: costModel, monthly_company_cost: monthlyCompanyCost, usage_cost_rate: usageCostRate, usage_cost_unit: usageCostUnit, sale_price_monthly: salePriceMonthly, cost_currency: currency }).eq("organization_id", organizationId).eq("id", agentId);
  if (error) redirect(`/company?error=${encodeURIComponent(error.message)}`);
  await supabase.from("agent_cost_history").insert({ organization_id: organizationId, agent_id: agentId, cost_model: costModel, monthly_company_cost: monthlyCompanyCost, usage_cost_rate: usageCostRate, usage_cost_unit: usageCostUnit, sale_price_monthly: salePriceMonthly, currency, changed_by_user_id: user.id });
  await supabase.from("audit_events").insert({ organization_id: organizationId, actor_type: "user", actor_user_id: user.id, event_type: "workforce.agent_cost_updated", object_type: "agent", object_id: agentId, risk_level: "medium", payload: { cost_model: costModel, monthly_company_cost: monthlyCompanyCost, sale_price_monthly: salePriceMonthly, currency } });
  revalidatePath("/company");
}

type Props = { searchParams: Promise<{ message?: string; error?: string }> };

export default async function CompanyPage({ searchParams }: Props) {
  const params = await searchParams;
  const context = await requireOrganizationContext();
  const { supabase, organizationId } = context;
  const [orgResult, departmentsResult, teamsResult, membersResult, agentsResult, invitationsResult] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", organizationId).single(),
    supabase.from("departments").select("id,name,description,status,parent_department_id,manager_agent_id").eq("organization_id", organizationId).order("name"),
    supabase.from("teams").select("id,name,description,status,department_id,manager_agent_id").eq("organization_id", organizationId).order("name"),
    supabase.from("organization_members").select("organization_id,user_id,role,display_name,job_title,department_id,membership_status,invited_at,joined_at").eq("organization_id", organizationId).order("created_at"),
    supabase.from("agents").select("id,agent_code,name,display_name,role_title,department_id,reports_to_agent_id,agent_status,enabled,cost_model,monthly_company_cost,usage_cost_rate,usage_cost_unit,sale_price_monthly,cost_currency").eq("organization_id", organizationId).neq("agent_status", "archived").order("agent_code"),
    supabase.from("organization_invitations").select("id,email,role,status,invited_user_id,department_id,invited_at").eq("organization_id", organizationId).order("invited_at", { ascending: false }).limit(20),
  ]);
  const org = orgResult.data ?? context.organization;
  const departments = departmentsResult.data ?? [];
  const teams = teamsResult.data ?? [];
  const members = membersResult.data ?? [];
  const agents = agentsResult.data ?? [];
  const invitations = invitationsResult.data ?? [];
  const isOwner = context.role === "owner";
  const address = (org.registered_address && typeof org.registered_address === "object" ? org.registered_address : {}) as Record<string, string>;
  const totalMonthlyCost = agents.reduce((sum, agent) => sum + Number(agent.monthly_company_cost ?? 0), 0);
  const totalMonthlySale = agents.reduce((sum, agent) => sum + Number(agent.sale_price_monthly ?? 0), 0);

  return <main className="command-shell ops-shell">
    <header className="command-header"><div><p className="eyebrow">COMPANY ADMINISTRATION</p><h1>Company & workforce</h1><p className="subtitle">The canonical company identity, hybrid organization chart, human membership lifecycle and AI workforce economics.</p></div><div className="ops-header-actions"><a className="secondary-button" href="/calendar">Calendar</a><a className="secondary-button" href="/notifications">Notifications</a></div></header>
    {params.message ? <p className="ops-message">{params.message}</p> : null}{params.error ? <p className="form-error">{params.error}</p> : null}
    <section className="metrics-grid ops-metrics"><div className="metric-card"><span>Departments</span><strong>{departments.length}</strong></div><div className="metric-card"><span>Teams</span><strong>{teams.length}</strong></div><div className="metric-card"><span>Humans</span><strong>{members.length}</strong></div><div className="metric-card"><span>AI workforce</span><strong>{agents.length}</strong></div><div className="metric-card"><span>Monthly cost</span><strong>€{totalMonthlyCost.toFixed(0)}</strong></div><div className="metric-card"><span>Position revenue</span><strong>€{totalMonthlySale.toFixed(0)}</strong></div></section>

    <section className="panel ops-section"><div className="panel-heading"><div><p className="label">Official identity</p><h2>Company Profile</h2></div><span className="pill">Owner controlled</span></div>
      <form action={updateCompanyProfile} className="ops-form-grid">
        <label><span>Legal name</span><input name="legalName" defaultValue={org.legal_name ?? org.name} required disabled={!isOwner}/></label>
        <label><span>Entity type</span><input name="legalEntityType" defaultValue={org.legal_entity_type ?? ""} placeholder="Kft., Ltd., E.V..." disabled={!isOwner}/></label>
        <label><span>Registration number</span><input name="registrationNumber" defaultValue={org.registration_number ?? ""} disabled={!isOwner}/></label>
        <label><span>Tax ID</span><input name="taxId" defaultValue={org.tax_id ?? ""} disabled={!isOwner}/></label>
        <label><span>VAT ID</span><input name="vatId" defaultValue={org.vat_id ?? ""} disabled={!isOwner}/></label>
        <label><span>Country code</span><input name="countryCode" defaultValue={org.country_code ?? ""} maxLength={2} disabled={!isOwner}/></label>
        <label><span>Official email</span><input name="primaryEmail" type="email" defaultValue={org.primary_email ?? ""} disabled={!isOwner}/></label>
        <label><span>Phone</span><input name="primaryPhone" defaultValue={org.primary_phone ?? ""} disabled={!isOwner}/></label>
        <label><span>Website</span><input name="websiteUrl" type="url" defaultValue={org.website_url ?? ""} disabled={!isOwner}/></label>
        <label><span>Currency</span><input name="currency" defaultValue={org.default_currency ?? "EUR"} maxLength={3} disabled={!isOwner}/></label>
        <label><span>Timezone</span><input name="timezone" defaultValue={org.timezone ?? "UTC"} disabled={!isOwner}/></label>
        <label className="ops-span-2"><span>Registered address</span><input name="addressLine1" defaultValue={address.line1 ?? ""} placeholder="Street and number" disabled={!isOwner}/></label>
        <label><span>Address line 2</span><input name="addressLine2" defaultValue={address.line2 ?? ""} disabled={!isOwner}/></label>
        <label><span>City</span><input name="city" defaultValue={address.city ?? ""} disabled={!isOwner}/></label>
        <label><span>Postal code</span><input name="postalCode" defaultValue={address.postal_code ?? ""} disabled={!isOwner}/></label>
        {isOwner ? <div className="ops-form-actions"><button type="submit">Save company profile</button></div> : null}
      </form>
    </section>

    <div className="ops-two-col">
      <section className="panel ops-section"><div className="panel-heading"><div><p className="label">Structure</p><h2>Departments</h2></div></div>
        <div className="ops-list">{departments.map((department) => <div className="ops-list-row" key={department.id}><div><strong>{department.name}</strong><small>{department.description || "No description"}</small></div><span>{department.status}</span></div>)}</div>
        {isOwner ? <form action={createDepartment} className="ops-inline-form"><input name="name" placeholder="Department name" required/><input name="description" placeholder="Purpose"/><select name="parentDepartmentId"><option value="">Top level</option>{departments.map(d => <option value={d.id} key={d.id}>{d.name}</option>)}</select><button>Add department</button></form> : null}
      </section>
      <section className="panel ops-section"><div className="panel-heading"><div><p className="label">Structure</p><h2>Teams</h2></div></div>
        <div className="ops-list">{teams.map((team) => <div className="ops-list-row" key={team.id}><div><strong>{team.name}</strong><small>{team.description || "Hybrid human/AI team"}</small></div><span>{team.status}</span></div>)}</div>
        {isOwner ? <form action={createTeam} className="ops-inline-form"><input name="name" placeholder="Team name" required/><select name="departmentId"><option value="">No department</option>{departments.map(d => <option value={d.id} key={d.id}>{d.name}</option>)}</select><select name="managerAgentId"><option value="">No AI manager</option>{agents.map(a => <option value={a.id} key={a.id}>{a.display_name || a.name}</option>)}</select><button>Add team</button></form> : null}
      </section>
    </div>

    <section className="panel ops-section"><div className="panel-heading"><div><p className="label">Human workforce</p><h2>Members & invitations</h2></div><span className="pill">{invitations.filter(i => i.status === "invited").length} pending</span></div>
      {isOwner ? <form action={inviteMember} className="ops-invite"><input name="email" type="email" placeholder="person@company.com" required/><select name="role" defaultValue="member"><option>admin</option><option>manager</option><option>member</option><option>viewer</option></select><select name="departmentId"><option value="">No department</option>{departments.map(d => <option value={d.id} key={d.id}>{d.name}</option>)}</select><button>Invite member</button></form> : null}
      <div className="ops-member-grid">{members.map(member => <form action={updateMember} className="ops-member-card" key={member.user_id}><input type="hidden" name="userId" value={member.user_id}/><div><strong>{member.display_name || `User ${member.user_id.slice(0, 8)}`}</strong><small>{member.job_title || "Team member"}</small></div><input name="jobTitle" defaultValue={member.job_title ?? ""} placeholder="Job title" disabled={!isOwner}/><select name="departmentId" defaultValue={member.department_id ?? ""} disabled={!isOwner}><option value="">No department</option>{departments.map(d => <option value={d.id} key={d.id}>{d.name}</option>)}</select><select name="role" defaultValue={member.role} disabled={!isOwner}>{["owner","admin","manager","member","viewer"].map(role => <option key={role}>{role}</option>)}</select><select name="status" defaultValue={member.membership_status ?? "active"} disabled={!isOwner}><option>active</option><option>suspended</option><option>removed</option></select>{isOwner ? <button>Update</button> : null}</form>)}</div>
      {invitations.length ? <div className="ops-invitations"><h3>Recent invitations</h3>{invitations.map(invite => <div key={invite.id}><span>{invite.email}</span><span>{invite.role}</span><strong>{invite.status}</strong></div>)}</div> : null}
    </section>

    <section className="panel ops-section"><div className="panel-heading"><div><p className="label">Hybrid org chart</p><h2>AI reporting structure & cost</h2></div><span className="pill">Cost ≠ payroll</span></div>
      <div className="ops-agent-grid">{agents.map(agent => <article className="ops-agent-card" key={agent.id}><div className="ops-agent-head"><div><span>{agent.agent_code}</span><h3>{agent.display_name || agent.name}</h3><p>{agent.role_title}</p></div><strong>{agent.cost_currency ?? "EUR"} {Number(agent.monthly_company_cost ?? 0).toFixed(2)}/mo</strong></div>
        <form action={updateAgentStructure} className="ops-agent-form"><input type="hidden" name="agentId" value={agent.id}/><label><span>Department</span><select name="departmentId" defaultValue={agent.department_id ?? ""} disabled={!isOwner}><option value="">Unassigned</option>{departments.map(d => <option value={d.id} key={d.id}>{d.name}</option>)}</select></label><label><span>Reports to</span><select name="reportsToAgentId" defaultValue={agent.reports_to_agent_id ?? ""} disabled={!isOwner}><option value="">Human CEO / none</option>{agents.filter(a => a.id !== agent.id).map(a => <option value={a.id} key={a.id}>{a.display_name || a.name}</option>)}</select></label>{isOwner ? <button>Save structure</button> : null}</form>
        <form action={updateAgentCost} className="ops-agent-form ops-cost-form"><input type="hidden" name="agentId" value={agent.id}/><label><span>Cost model</span><select name="costModel" defaultValue={agent.cost_model ?? "included"} disabled={!isOwner}><option value="included">Included / zero</option><option value="fixed">Fixed monthly</option><option value="usage">Usage based</option><option value="hybrid">Fixed + usage</option><option value="custom">Custom</option></select></label><label><span>Base monthly cost</span><input name="monthlyCompanyCost" type="number" min="0" step="0.01" defaultValue={agent.monthly_company_cost ?? 0} disabled={!isOwner}/></label><label><span>Usage rate</span><input name="usageCostRate" type="number" min="0" step="0.0001" defaultValue={agent.usage_cost_rate ?? 0} disabled={!isOwner}/></label><label><span>Usage unit</span><input name="usageCostUnit" defaultValue={agent.usage_cost_unit ?? ""} placeholder="1M tokens / run" disabled={!isOwner}/></label><label><span>Customer monthly price</span><input name="salePriceMonthly" type="number" min="0" step="0.01" defaultValue={agent.sale_price_monthly ?? ""} disabled={!isOwner}/></label><label><span>Currency</span><input name="currency" maxLength={3} defaultValue={agent.cost_currency ?? org.default_currency ?? "EUR"} disabled={!isOwner}/></label>{isOwner ? <button>Save Agent Cost</button> : null}</form>
      </article>)}</div>
    </section>
  </main>;
}
