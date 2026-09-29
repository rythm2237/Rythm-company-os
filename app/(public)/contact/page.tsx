import type { Metadata } from "next";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/contact");

const contactChannels = [
  {
    title: "General & partnerships",
    email: "hello@rythm-os.com",
    detail: "Product questions, partnerships, press, and general enquiries.",
  },
  {
    title: "Product support",
    email: "support@rythm-os.com",
    detail: "Account access, workspace issues, and product assistance.",
  },
  {
    title: "Billing",
    email: "billing@rythm-os.com",
    detail: "Invoices, subscriptions, commercial offers, and billing questions.",
  },
  {
    title: "Legal",
    email: "legal@rythm-os.com",
    detail: "Contracts, regulatory matters, and formal legal correspondence.",
  },
  {
    title: "Privacy",
    email: "privacy@rythm-os.com",
    detail: "Privacy enquiries and data-protection matters. Formal data-rights requests can also use the Data Requests page.",
  },
] as const;

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string; offer?: string }> }) {
  const params = await searchParams;
  const activation = params.topic === "activation";
  const offer = ["ready_ai_company", "custom_ai_company", "ai_workspace_starter", "ai_workspace_pro", "ai_workspace_power"].includes(params.offer ?? "") ? params.offer : "";
  const subject = `RYTHM activation request${offer ? ` — ${offer}` : ""}`;

  return (
    <main className="contact-page marketing-section public-contact-page">
      <div className="marketing-section-heading">
        <p className="marketing-kicker">Contact RYTHM</p>
        <h1>Reach the right team.</h1>
        <p>Choose the channel that matches your request so it can be handled correctly.</p>
      </div>

      {activation ? <section className="contact-card"><h2>Request assisted activation</h2>
        <p>For business company access, email Billing with your organization ID and selected product. RYTHM confirms scope, taxes, invoice, service dates and payment before activating access. No order or charge is created by this request.</p>
        {offer?.startsWith("ai_workspace_") ? <p>Online purchase of personal AI plans is unavailable. Contact us about availability; this request does not activate a paid AI allowance.</p> : null}
        <a className="marketing-button" href={`mailto:billing@rythm-os.com?subject=${encodeURIComponent(subject)}`}>Email Billing about activation</a>
      </section> : null}
      <div className="public-contact-grid">
        {contactChannels.map((channel) => (
          <article className="contact-card public-contact-card" key={channel.email}>
            <h2>{channel.title}</h2>
            <p>{channel.detail}</p>
            <a className="marketing-button" href={`mailto:${channel.email}`}>{channel.email}</a>
          </article>
        ))}
      </div>

      <p className="contact-notice public-contact-notice">
        For formal access, deletion, correction, portability, or other data-subject requests, use the <a href="/data-requests">Data Requests</a> workflow.
      </p>
    </main>
  );
}
