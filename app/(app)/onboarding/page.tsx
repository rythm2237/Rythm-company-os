import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

const steps = [
  {
    no: "1",
    title: "Start from the executive context",
    copy: "Use Command Center and Project Operating View to understand the organization, active project, authority and current progress before creating work.",
    href: "/command-center",
    action: "Open Command Center",
  },
  {
    no: "2",
    title: "Capture an Idea or Issue",
    copy: "Create a governed intake item. Routing creates a draft meeting only; it does not authorize agents or execution.",
    href: "/ideas",
    action: "Open Idea Inbox",
  },
  {
    no: "3",
    title: "Deliberate in the Boardroom",
    copy: "Authorize the right agents, run internal analysis, add Human CEO contributions, and close the meeting explicitly as Chair.",
    href: "/meetings/room",
    action: "Open Boardroom",
  },
  {
    no: "4",
    title: "Review governance gates",
    copy: "Inspect legal relevance, pending approvals and attention items before making a consequential commitment.",
    href: "/attention",
    action: "Open Attention Center",
  },
  {
    no: "5",
    title: "Trace decision to execution",
    copy: "Use Traceability and Action Items to verify that decisions, approvals and project execution remain linked and auditable.",
    href: "/workflow/traceability",
    action: "Open Traceability",
  },
  {
    no: "6",
    title: "Review company health",
    copy: "Use Weekly Executive Review and Operations Health before the next commitment. These surfaces are diagnostic and do not authorize execution.",
    href: "/executive-review",
    action: "Open Executive Review",
  },
];

export default async function OnboardingPage() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase.from("organization_members")
    .select("organization_id,role").eq("user_id", user.id).maybeSingle();
  if (!membership) redirect("/login?error=Organization%20membership%20required.");

  return (
    <main className="command-shell">
      <header className="command-header">
        <div>
          <p className="eyebrow">RYTHM MVP GUIDE · A-107 EXPERIENCE PATH</p>
          <h1>Operate the company without losing the governance thread.</h1>
          <p className="subtitle">A guided path through the frozen MVP workflow. Each step links to a real operating surface; no demo control bypasses Human CEO authority.</p>
        </div>
        <div className="authority"><span>Signed-in role</span><strong>{membership.role === "owner" ? "Human CEO / Owner" : membership.role}</strong></div>
      </header>

      <section className="organization-banner" aria-label="MVP operating principles">
        <div><span>Authority</span><strong>Human governed</strong></div>
        <div><span>External actions</span><strong>Disabled</strong></div>
        <div><span>Operating loop</span><strong>Traceable end-to-end</strong></div>
      </section>

      <section className="ux-grid" style={{ marginTop: 18 }} aria-label="Guided operating steps">
        {steps.map((step) => (
          <article className="ux-card ux-step" key={step.no}>
            <span className="ux-step-number" aria-hidden="true">{step.no}</span>
            <h3>{step.title}</h3>
            <p>{step.copy}</p>
            <Link className="secondary-button" href={step.href}>{step.action}</Link>
          </article>
        ))}
      </section>

      <section className="panel panel-wide" style={{ marginTop: 18 }}>
        <div className="panel-heading"><div><p className="label">Investor / stakeholder demo</p><h2>Recommended five-minute story</h2></div><span className="pill">Real governed surfaces</span></div>
        <div className="demo-flow">
          <Link href="/projects/operating"><span>01 · Context</span>Project Operating View</Link>
          <Link href="/ideas"><span>02 · Input</span>Idea / Issue Inbox</Link>
          <Link href="/meetings/room"><span>03 · Intelligence</span>Multi-Agent Boardroom</Link>
          <Link href="/workflow/traceability"><span>04 · Governance</span>Decision → Action Trace</Link>
          <Link href="/executive-review"><span>05 · Control</span>Executive Review</Link>
        </div>
        <p className="security-note">For demos, explain the governance boundary explicitly: agents analyze and recommend; the Human CEO retains consequential authority; external actions remain separately gated.</p>
      </section>
    </main>
  );
}
