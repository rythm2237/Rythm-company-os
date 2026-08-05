import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { logout } from "./actions";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id, name, slug, status)")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (membershipError || !membership) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">ACCESS DENIED</p>
          <h1 className="auth-title">Owner authorization required</h1>
          <p className="auth-copy">
            This account is authenticated but is not registered as an Owner of the RYTHM organization.
          </p>
          <form action={logout}><button type="submit">Sign out</button></form>
        </section>
      </main>
    );
  }

  const organization = Array.isArray(membership.organizations)
    ? membership.organizations[0]
    : membership.organizations;
  const organizationId = membership.organization_id;

  const [agentsResult, memoryResult, approvalsResult, meetingsResult] = await Promise.all([
    supabase.from("agents").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("company_memory").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pending"),
    supabase.from("meetings").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
  ]);

  const metrics = [
    ["Registered agents", agentsResult.count ?? 0],
    ["Memory records", memoryResult.count ?? 0],
    ["Pending approvals", approvalsResult.count ?? 0],
    ["Meetings", meetingsResult.count ?? 0],
  ] as const;

  return (
    <main className="command-shell">
      <header className="command-header">
        <div>
          <p className="eyebrow">RYTHM EXECUTIVE COMMAND CENTER</p>
          <h1>Human CEO control plane</h1>
          <p className="subtitle">
            Authenticated as {user.email}. Consequential authority remains under your control.
          </p>
        </div>
        <form action={logout}><button className="secondary-button" type="submit">Sign out</button></form>
      </header>

      <section className="organization-banner">
        <div>
          <span>Organization</span>
          <strong>{organization?.name ?? "RYTHM"}</strong>
        </div>
        <div>
          <span>Role</span>
          <strong>Human CEO / Owner</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{organization?.status ?? "approved"}</strong>
        </div>
      </section>

      <section className="metrics-grid" aria-label="Company Core metrics">
        {metrics.map(([label, value]) => (
          <article className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="control-grid">
        <article className="control-card">
          <span className="status-dot safe" />
          <h2>Authentication</h2>
          <p>Supabase session and Owner authorization are active.</p>
        </article>
        <article className="control-card">
          <span className="status-dot paused" />
          <h2>B-001 execution</h2>
          <p>Executive Orchestrator remains disabled until controlled activation.</p>
        </article>
        <article className="control-card">
          <span className="status-dot paused" />
          <h2>External actions</h2>
          <p>Publishing, deployment, deletion, and external writes remain blocked.</p>
        </article>
      </section>
    </main>
  );
}
