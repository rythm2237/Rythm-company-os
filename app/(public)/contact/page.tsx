import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact | RYTHM Company OS",
  description: "Contact RYTHM Company OS for product questions, support, billing, legal, and privacy matters.",
};

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

export default function ContactPage() {
  return (
    <main className="contact-page marketing-section public-contact-page">
      <div className="marketing-section-heading">
        <p className="marketing-kicker">Contact RYTHM</p>
        <h1>Reach the right team.</h1>
        <p>Choose the channel that matches your request so it can be handled correctly.</p>
      </div>

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
