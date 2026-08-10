"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  meetingId: string;
  sessionId: string;
  decisionOptions: string[];
  customOptionValue: string;
  restoreDraft: boolean;
};

type Draft = {
  selectedOption: string;
  customDecision: string;
  rationale: string;
  riskLevel: string;
};

const emptyDraft: Draft = {
  selectedOption: "",
  customDecision: "",
  rationale: "",
  riskLevel: "medium",
};

function SubmitButton(){
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? "Recording Human CEO decision…" : "Record Human CEO decision"}</button>;
}

export default function CeoDecisionForm({
  action,
  meetingId,
  sessionId,
  decisionOptions,
  customOptionValue,
  restoreDraft,
}: Props){
  const storageKey = useMemo(() => `rythm-ceo-decision-draft:${sessionId}`, [sessionId]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (restoreDraft) {
      try {
        const stored = window.sessionStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<Draft>;
          setDraft({
            selectedOption: parsed.selectedOption ?? "",
            customDecision: parsed.customDecision ?? "",
            rationale: parsed.rationale ?? "",
            riskLevel: parsed.riskLevel ?? "medium",
          });
        }
      } catch {
        window.sessionStorage.removeItem(storageKey);
      }
    } else {
      window.sessionStorage.removeItem(storageKey);
    }
    setHydrated(true);
  }, [restoreDraft, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      // Draft persistence is a UX safeguard only; governance must not depend on it.
    }
  }, [draft, hydrated, storageKey]);

  const isCustom = draft.selectedOption === customOptionValue;

  return <form action={action} className="auth-form">
    <input type="hidden" name="meetingId" value={meetingId}/>
    <input type="hidden" name="sessionId" value={sessionId}/>

    <label>CEO selected option
      <select
        name="selectedOption"
        required
        value={draft.selectedOption}
        onChange={(event) => setDraft(current => ({ ...current, selectedOption: event.target.value }))}
      >
        <option value="" disabled>Select decision</option>
        {decisionOptions.map(option => <option key={option} value={option}>{option}</option>)}
        <option value={customOptionValue}>Other — Custom Human CEO Decision</option>
      </select>
    </label>

    {isCustom ? <label>CEO custom decision
      <textarea
        name="customDecision"
        required
        minLength={10}
        maxLength={2000}
        rows={3}
        value={draft.customDecision}
        onChange={(event) => setDraft(current => ({ ...current, customDecision: event.target.value }))}
        placeholder="Enter the Human CEO decision in your own words."
        style={{width:"100%",maxWidth:"100%",minWidth:0,boxSizing:"border-box",resize:"vertical",padding:12,border:"1px solid #cfd6e2",borderRadius:10}}
      />
      <small style={{display:"block",marginTop:6,color:"#717b8e",lineHeight:1.5}}>
        This decision is independent of the B-001 options and remains subject to the same legal, risk, approval, audit, and external-action controls.
      </small>
    </label> : null}

    <label>CEO rationale
      <textarea
        name="rationale"
        required
        minLength={3}
        rows={5}
        value={draft.rationale}
        onChange={(event) => setDraft(current => ({ ...current, rationale: event.target.value }))}
        style={{width:"100%",maxWidth:"100%",minWidth:0,boxSizing:"border-box",resize:"vertical",padding:12,border:"1px solid #cfd6e2",borderRadius:10}}
      />
    </label>

    <label>Decision risk
      <select
        name="riskLevel"
        value={draft.riskLevel}
        onChange={(event) => setDraft(current => ({ ...current, riskLevel: event.target.value }))}
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High — routes to Approval Engine</option>
        <option value="critical">Critical — routes to Approval Engine</option>
      </select>
    </label>

    <SubmitButton/>
    <p className="security-note">
      This gate appears only after explicit chair closure. The Human CEO may choose a B-001 option or record a custom decision. The session can create only one canonical CEO decision. Low/medium decisions are finalized here; High/Critical decisions create a governed Approval Request. If submission fails, the entered decision and rationale are restored automatically.
    </p>
  </form>;
}
