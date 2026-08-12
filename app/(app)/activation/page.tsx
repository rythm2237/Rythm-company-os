import Link from "next/link";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";

export const dynamic = "force-dynamic";

export default async function ActivationPage() {
  const context = await requireOwnerOrganizationContext();
  const status = context.entitlement?.status ?? "not provisioned";

  return (
    <main className="page-shell">
      <section className="panel activation-panel">
        <p className="eyebrow">COMMERCIAL ACCESS</p>
        <h1>Workspace activation</h1>
        <p>
          Your isolated company workspace has been created. Build tools and commercial AI
          capabilities remain locked until RYTHM confirms an active entitlement.
        </p>
        <div className="activation-status">
          <span>Organization</span><strong>{context.organization.name}</strong>
          <span>Selected product</span><strong>{context.entitlement?.product_code ?? "Not selected"}</strong>
          <span>Entitlement status</span><strong>{status}</strong>
        </div>
        <p>
          This lock is enforced in the interface, Server Actions, row-level policies, and
          database mutation guards. A pending workspace cannot create or modify Agents,
          provision templates, or build a company.
        </p>
        <div className="activation-actions">
          <Link className="primary-link" href="/pricing">Review product options</Link>
          <Link href="/command-center">Return to Command Center</Link>
        </div>
      </section>
    </main>
  );
}
