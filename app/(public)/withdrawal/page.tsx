import type { Metadata } from "next";
import Link from "next/link";
import ConsumerWithdrawalForm from "@/components/consumer-withdrawal-form";

export const metadata: Metadata = {
  title: "Withdraw from Contract | RYTHM Company OS",
  description: "Use RYTHM's online withdrawal function for eligible consumer distance contracts and download a durable acknowledgement.",
  alternates: { canonical: "/withdrawal" },
};

export default function WithdrawalPage() {
  return (
    <main>
      <section className="public-page-hero enterprise-hero">
        <div><p className="marketing-kicker">WITHDRAW FROM CONTRACT</p><h1>Exercise an eligible consumer withdrawal right online.</h1></div>
        <p>This function is continuously available for RYTHM consumer distance contracts. It is provided in addition to other lawful ways of sending an unequivocal withdrawal statement.</p>
      </section>
      <section className="marketing-section enterprise-model">
        <ConsumerWithdrawalForm />
        <div className="enterprise-capabilities"><p className="marketing-kicker">OTHER WAYS TO WITHDRAW</p><h2>You are not required to use this form.</h2><ul><li>You may send an unequivocal withdrawal statement to <a href="mailto:legal@rythm-os.com">legal@rythm-os.com</a>.</li><li>You may send a written statement to Tayyebialashti Yaser E.V., 1143 Budapest, Gizella út 35, Hungary.</li><li>Send the statement before the applicable deadline. Keep evidence showing when it was sent.</li><li>The statutory model form may be used, but a clear statement is sufficient where the law allows.</li></ul></div>
      </section>
      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">MODEL WITHDRAWAL WORDING</p><h2>A simple statement is enough.</h2><p>“I hereby give notice that I withdraw from my contract for the following RYTHM service: [service/order reference], ordered on [date]. Name: [name]. Address or email: [contact]. Date: [date].”</p></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">IMPORTANT</p><h2>Not every contract has the same withdrawal outcome.</h2><ul><li>Service contracts and digital-content contracts have different rules for performance begun during the withdrawal period.</li><li>If you expressly requested a paid service to begin immediately, a proportionate charge may apply when the legal conditions are met.</li><li>If the service was fully performed after the legally required request and acknowledgement, the withdrawal right may have ended.</li><li>Submitting this function records the withdrawal statement; eligibility and refund consequences are assessed under mandatory law.</li></ul></div>
      </section>
      <section className="enterprise-contact-section"><div><p className="marketing-kicker">NEED CONTEXT?</p><h2>Read the full consumer information.</h2></div><div className="enterprise-contact-card"><div className="hero-actions"><Link href="/consumer-rights">Consumer Rights</Link><Link href="/consumer-terms">Consumer Terms</Link></div></div></section>
    </main>
  );
}
