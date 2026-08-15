"use client";

import { FormEvent, useState } from "react";

type Receipt = {
  id: string;
  name: string;
  email: string;
  contractReference: string;
  statement: string;
  submittedAt: string;
  status: string;
  trader: string;
};

function receiptText(receipt: Receipt) {
  return [
    "RYTHM Company OS — Consumer withdrawal acknowledgement",
    "",
    `Receipt ID: ${receipt.id}`,
    `Received: ${receipt.submittedAt}`,
    `Trader: ${receipt.trader}`,
    `Consumer: ${receipt.name}`,
    `Consumer email: ${receipt.email}`,
    `Contract / order reference: ${receipt.contractReference}`,
    `Statement: ${receipt.statement}`,
    `Status: ${receipt.status}`,
    "",
    "Keep this file as evidence that your online withdrawal statement was received.",
    "Withdrawal and refund eligibility are assessed under mandatory consumer law and the applicable contract.",
  ].join("\n");
}

export default function ConsumerWithdrawalForm() {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    setReceipt(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      contractReference: String(form.get("contractReference") ?? ""),
      companyWebsite: String(form.get("companyWebsite") ?? ""),
    };

    try {
      const response = await fetch("/api/consumer/withdrawal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result?.receipt) throw new Error(result?.error ?? "SUBMISSION_FAILED");
      setReceipt(result.receipt as Receipt);
    } catch {
      setError("The online withdrawal could not be recorded. Please send the same statement to legal@rythm-os.com and keep a copy of your message.");
    } finally {
      setSubmitting(false);
    }
  }

  function downloadReceipt() {
    if (!receipt) return;
    const blob = new Blob([receiptText(receipt)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rythm-withdrawal-${receipt.id}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="enterprise-capabilities">
      <p className="marketing-kicker">WITHDRAW FROM CONTRACT</p>
      <h2>Submit an online withdrawal statement.</h2>
      <p>This function is intended for consumers who concluded an eligible distance contract through RYTHM. It does not reduce any other lawful way to exercise withdrawal rights.</p>
      <form onSubmit={submit} className="consumer-legal-form">
        <label>Full name<input name="name" autoComplete="name" required maxLength={200} /></label>
        <label>Email for this contract<input name="email" type="email" autoComplete="email" required maxLength={320} /></label>
        <label>Order / contract reference<input name="contractReference" required maxLength={200} placeholder="Order ID, invoice number, or meeting purchase reference" /></label>
        <label aria-hidden="true" style={{ position: "absolute", left: "-10000px" }}>Website<input name="companyWebsite" tabIndex={-1} autoComplete="off" /></label>
        <p>By selecting the confirmation button below, you state: “I withdraw from the identified distance contract.”</p>
        <button className="marketing-button" type="submit" disabled={submitting}>{submitting ? "Recording withdrawal…" : "Confirm withdrawal"}</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {receipt ? (
        <div role="status" className="consumer-legal-receipt">
          <h3>Withdrawal received</h3>
          <p>Receipt: <strong>{receipt.id}</strong></p>
          <p>Received: {new Date(receipt.submittedAt).toLocaleString()}</p>
          <p>Your statement has been recorded. Save the acknowledgement below as a durable copy.</p>
          <button className="marketing-button" type="button" onClick={downloadReceipt}>Download acknowledgement</button>
        </div>
      ) : null}
    </div>
  );
}
