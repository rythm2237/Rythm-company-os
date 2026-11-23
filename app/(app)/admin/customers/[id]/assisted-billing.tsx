import type { ReactNode } from "react";
import { SubmitButton } from "@/components/ui/Button";
import { recordAssistedBillingAction } from "./activation-actions";

function EvidenceForm({ company, order, step, label, evidence, confirmation, children }: {
  company: string;
  order?: string;
  step: string;
  label: string;
  evidence: string;
  confirmation: string;
  children?: ReactNode;
}) {
  return <details>
    <summary>{label}</summary>
    <form action={recordAssistedBillingAction} className="auth-form">
      <input type="hidden" name="organizationId" value={company}/>
      <input type="hidden" name="orderId" value={order ?? ""}/>
      <input type="hidden" name="step" value={step}/>
      <label>{evidence}<input name="reference" required minLength={3} maxLength={160}/></label>
      {children}
      <label><input type="checkbox" name="verified" value="yes" required/>{confirmation}</label>
      <SubmitButton type="submit">{label}</SubmitButton>
    </form>
  </details>;
}

type Order = {
  id: string;
  quote_reference: string;
  state: string;
  invoice_reference: string | null;
  net_amount: number;
  vat_amount: number | null;
  currency: string;
  period_start: string;
  period_end: string;
  due_at: string | null;
  agent_limit: number | null;
};

export function AssistedBilling({ company, orders, offboarded }: {
  company: string; orders: Order[]; offboarded: boolean;
}) {
  return <>
    {!offboarded && <EvidenceForm company={company} step="quote" label="Record quote" evidence="External quote reference"
      confirmation="I verified the quote and service terms for this company.">
      <label>Net amount in company billing currency<input name="amount" type="number" min="0.01" step="0.01" required/></label>
      <label>Service start (UTC)<input name="start" type="date" required/></label>
      <label>Service end (UTC, exclusive)<input name="end" type="date" required/></label>
      <label>Reduced agent limit, if agreed<input name="agentLimit" type="number" min="1" step="1"/></label>
    </EvidenceForm>}
    {orders.map(order => <article key={order.id}>
      <h3>{order.quote_reference} · {order.state}</h3>
      <p>{order.period_start.slice(0, 10)} → {order.period_end.slice(0, 10)} UTC · {order.net_amount} {order.currency} net
        {order.vat_amount !== null ? ` + ${order.vat_amount} VAT · ${order.invoice_reference} · Due ${order.due_at?.slice(0, 10)} UTC` : ""}
        {order.agent_limit !== null ? ` · Agent limit ${order.agent_limit}` : ""}</p>
      {order.state === "quoted" && <EvidenceForm company={company} order={order.id} step="sign" label="Record signed order"
        evidence="Signed order reference" confirmation="I verified the signed order and applicable terms."/>}
      {order.state === "signed" && <EvidenceForm company={company} order={order.id} step="approve" label="Record finance approval"
        evidence="Professional VAT, terms and invoice approval reference"
        confirmation="I verified the finance review and approved external invoice hand-off.">
        <label>External invoice reference<input name="invoice" required minLength={3} maxLength={160}/></label>
        <label>Approved VAT amount ({order.currency})<input name="amount" type="number" min="0" step="0.01" required/></label>
        <label>Payment deadline (UTC)<input name="due" type="date" required/></label>
      </EvidenceForm>}
      {order.state === "approved" && <EvidenceForm company={company} order={order.id} step="late" label="Mark payment late"
        evidence="Overdue reconciliation reference" confirmation="I verified this invoice is overdue and unpaid."/>}
      {["approved", "late"].includes(order.state) && <EvidenceForm company={company} order={order.id} step="settle"
        label="Confirm payment and activate service" evidence="Unique bank or accounting receipt reference"
        confirmation="I matched the received funds to this approved invoice.">
        <label>Amount received<input name="amount" type="number" min="0.01" step="0.01" required/></label>
        <label>Received currency<input name="currency" required minLength={3} maxLength={3}/></label>
      </EvidenceForm>}
      {["quoted", "signed", "approved", "late"].includes(order.state) && <EvidenceForm company={company} order={order.id}
        step="void" label="Void unpaid order" evidence="Void or credit-note approval reference"
        confirmation="I verified the external cancellation and invoice handling."/>}
      {order.state === "paid" && <EvidenceForm company={company} order={order.id} step="refund" label="Record confirmed full refund"
        evidence="Unique completed refund and credit-note reference"
        confirmation="I matched the full returned amount and currency to the original payment. A current-period refund ends access.">
        <label>Amount returned<input name="amount" type="number" min="0.01" step="0.01" required/></label>
        <label>Refund currency<input name="currency" required minLength={3} maxLength={3}/></label>
      </EvidenceForm>}
    </article>)}
    {!offboarded && <>
      <EvidenceForm company={company} step="cancel" label="Cancel at paid period end" evidence="Cancellation approval reference"
        confirmation="I verified cancellation and resolved pending external invoices. Paid service remains available through the period end."/>
      <EvidenceForm company={company} step="offboard" label="Revoke paid service access" evidence="Approved offboarding checklist reference"
        confirmation="I verified the authorized offboarding, including export, retention, jobs and integration hand-off."/>
    </>}
  </>;
}
