"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ProviderOption } from "@/lib/agent-builder";

type Department = { id: string; name: string };
type ExistingAgent = { id: string; name: string; role_title: string };
type Props = {
  action: (formData: FormData) => void | Promise<void>;
  departments: Department[];
  existingAgents: ExistingAgent[];
  providers: ProviderOption[];
};

type Draft = {
  name: string;
  roleTitle: string;
  expertise: string;
  purpose: string;
  departmentId: string;
  reportsToAgentId: string;
  responsibilities: string;
  skills: string;
  kpis: string;
  language: string;
  workStyle: string;
  authorityLevel: string;
  riskCeiling: string;
  approvalRequirements: string;
  allowedTools: string;
  provider: string;
};

const steps = ["Role", "Mission", "Behavior", "Governance", "AI & Generate"];
const presets = {
  workStyle: ["Analytical & concise", "Strategic & challenging", "Collaborative & diplomatic", "Creative & exploratory"],
  responsibilities: ["Research and analysis", "Planning and recommendations", "Quality review", "Meeting participation", "Decision support"],
};

const initialDraft: Draft = {
  name: "",
  roleTitle: "",
  expertise: "",
  purpose: "",
  departmentId: "",
  reportsToAgentId: "",
  responsibilities: "",
  skills: "",
  kpis: "",
  language: "English",
  workStyle: "Analytical & concise",
  authorityLevel: "1",
  riskCeiling: "medium",
  approvalRequirements: "Consequential external actions\nMaterial financial commitments\nLegal, privacy, or security commitments",
  allowedTools: "company_memory\nprojects\nmeetings\ndecisions\nactions",
  provider: "openai",
};

function GenerateButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending}>{pending ? "RYTHM is generating your Agent…" : "Generate AI Agent"}</button>;
}

function split(value: string) {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

export default function AgentBuilderWizard({ action, departments, existingAgents, providers }: Props) {
  const firstConfigured = providers.find((provider) => provider.configured)?.id ?? "openai";
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({ ...initialDraft, provider: firstConfigured });
  const update = (key: keyof Draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const departmentName = departments.find((department) => department.id === draft.departmentId)?.name ?? "Executive Office / unassigned";
  const selectedProvider = providers.find((provider) => provider.id === draft.provider);

  const blueprint = useMemo(() => {
    const lines = [
      `${draft.name || "Your Agent"} — ${draft.roleTitle || "Role not selected"}`,
      `Expertise: ${draft.expertise || "Add the Agent's specialist domain"}`,
      `Mission: ${draft.purpose || "Define what this Agent should achieve"}`,
      `Department: ${departmentName}`,
      `Language: ${draft.language}`,
      `Work style: ${draft.workStyle}`,
      `Authority: A${draft.authorityLevel} · ${draft.riskCeiling} risk ceiling`,
      "",
      "Responsibilities:", ...split(draft.responsibilities).map((item) => `• ${item}`),
      "",
      "Skills:", ...split(draft.skills).map((item) => `• ${item}`),
      "",
      "KPIs:", ...split(draft.kpis).map((item) => `• ${item}`),
      "",
      `Runtime: ${selectedProvider?.label ?? "Select AI"}${selectedProvider?.model ? ` · ${selectedProvider.model}` : ""}`,
      "Governance: Human CEO final authority · external actions disabled by default.",
    ];
    return lines.join("\n");
  }, [draft, departmentName, selectedProvider]);

  const roleReady = draft.name.trim().length >= 2 && draft.roleTitle.trim().length >= 2 && draft.expertise.trim().length >= 2;
  const missionReady = draft.purpose.trim().length >= 10;
  const providerReady = Boolean(selectedProvider?.configured);
  const canGenerate = roleReady && missionReady && providerReady;

  const shell: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, .65fr)", gap: "1.25rem", alignItems: "start" };
  const chips: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: ".5rem", margin: ".6rem 0 1rem" };
  const card: React.CSSProperties = { border: "1px solid var(--border, rgba(255,255,255,.12))", borderRadius: "14px", padding: "1rem", cursor: "pointer" };

  return (
    <div style={shell}>
      <form action={action} className="auth-form">
        <input type="hidden" name="departmentName" value={departmentName} />
        {Object.entries(draft).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}

        <div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap", marginBottom: "1.25rem" }} aria-label="Agent Builder progress">
          {steps.map((label, index) => (
            <button key={label} type="button" onClick={() => setStep(index)} aria-current={step === index ? "step" : undefined} style={{ opacity: step === index ? 1 : .58 }}>
              {index + 1}. {label}
            </button>
          ))}
        </div>

        {step === 0 ? <div>
          <p className="eyebrow">STEP 1 · WHO SHOULD RYTHM HIRE?</p>
          <h3>Define the role</h3>
          <label>Position / role title<input value={draft.roleTitle} onChange={(e) => update("roleTitle", e.target.value)} placeholder="e.g. Senior Market Research Analyst" autoFocus /></label>
          <label>Core expertise<input value={draft.expertise} onChange={(e) => update("expertise", e.target.value)} placeholder="e.g. European B2B SaaS market intelligence" /></label>
          <label>Agent name<input value={draft.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Mira" /></label>
          <label>Department<select value={draft.departmentId} onChange={(e) => update("departmentId", e.target.value)}><option value="">Executive Office / unassigned</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          <label>Reports to<select value={draft.reportsToAgentId} onChange={(e) => update("reportsToAgentId", e.target.value)}><option value="">Human CEO / no AI manager</option>{existingAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} — {agent.role_title}</option>)}</select></label>
        </div> : null}

        {step === 1 ? <div>
          <p className="eyebrow">STEP 2 · WHAT SHOULD THIS AGENT ACHIEVE?</p>
          <h3>Mission and output</h3>
          <label>Primary mission<textarea rows={4} value={draft.purpose} onChange={(e) => update("purpose", e.target.value)} placeholder="Describe the outcome you expect. RYTHM will turn this into an operational mandate." autoFocus /></label>
          <p>Common responsibilities</p>
          <div style={chips}>{presets.responsibilities.map((item) => <button key={item} type="button" onClick={() => { if (!split(draft.responsibilities).includes(item)) update("responsibilities", [draft.responsibilities, item].filter(Boolean).join("\n")); }}>{item}</button>)}</div>
          <label>Responsibilities<textarea rows={4} value={draft.responsibilities} onChange={(e) => update("responsibilities", e.target.value)} placeholder="One per line — or use the quick options above" /></label>
          <label>Skills / knowledge<textarea rows={3} value={draft.skills} onChange={(e) => update("skills", e.target.value)} placeholder="e.g. competitive analysis, financial modeling, stakeholder interviews" /></label>
          <label>Success measures / KPIs<textarea rows={3} value={draft.kpis} onChange={(e) => update("kpis", e.target.value)} placeholder="Optional — RYTHM will still create a default success standard" /></label>
        </div> : null}

        {step === 2 ? <div>
          <p className="eyebrow">STEP 3 · HOW SHOULD IT WORK?</p>
          <h3>Behavior and communication</h3>
          <p>Work style</p>
          <div style={chips}>{presets.workStyle.map((item) => <button key={item} type="button" onClick={() => update("workStyle", item)} aria-pressed={draft.workStyle === item}>{item}</button>)}</div>
          <label>Custom work style<input value={draft.workStyle} onChange={(e) => update("workStyle", e.target.value)} /></label>
          <label>Working language<input value={draft.language} onChange={(e) => update("language", e.target.value)} placeholder="English, Persian, German…" /></label>
          <p>In multi-Agent meetings, RYTHM will instruct this Agent to contribute independently, challenge weak assumptions, stay inside its professional lens, and respect Human CEO authority.</p>
        </div> : null}

        {step === 3 ? <div>
          <p className="eyebrow">STEP 4 · SET THE GUARDRAILS</p>
          <h3>Authority and governance</h3>
          <label>Authority level<select value={draft.authorityLevel} onChange={(e) => update("authorityLevel", e.target.value)}><option value="0">A0 — advisory only</option><option value="1">A1 — low authority</option><option value="2">A2 — bounded operational authority</option><option value="3">A3 — high authority, approval constrained</option><option value="4">A4 — maximum internal authority</option></select></label>
          <label>Risk ceiling<select value={draft.riskCeiling} onChange={(e) => update("riskCeiling", e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
          <label>Must ask the Human CEO before<textarea rows={4} value={draft.approvalRequirements} onChange={(e) => update("approvalRequirements", e.target.value)} /></label>
          <label>Allowed internal tools<textarea rows={4} value={draft.allowedTools} onChange={(e) => update("allowedTools", e.target.value)} /></label>
          <p><strong>Public Beta safety:</strong> generating an Agent never enables external actions. Every new Agent starts Paused.</p>
        </div> : null}

        {step === 4 ? <div>
          <p className="eyebrow">STEP 5 · CHOOSE THE AI BRAIN</p>
          <h3>AI provider</h3>
          <div style={{ display: "grid", gap: ".75rem", margin: "1rem 0" }}>
            {providers.map((provider) => <label key={provider.id} style={{ ...card, opacity: provider.configured ? 1 : .48 }}>
              <input type="radio" name="provider-selector" value={provider.id} checked={draft.provider === provider.id} disabled={!provider.configured} onChange={() => update("provider", provider.id)} />
              <strong style={{ marginLeft: ".5rem" }}>{provider.label}</strong>
              <span style={{ display: "block", marginTop: ".35rem" }}>{provider.model ?? "Model not configured"}</span>
              <small>{provider.configured ? provider.description : "Provider API/model must be configured by RYTHM before customers can select it."}</small>
            </label>)}
          </div>
          <p>When you press Generate, the selected AI receives the structured RYTHM Blueprint, turns it into the final system instruction, and the Agent is saved as a governed, Paused workforce member.</p>
          <GenerateButton disabled={!canGenerate} />
        </div> : null}

        <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", marginTop: "1.5rem" }}>
          <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>Back</button>
          {step < steps.length - 1 ? <button type="button" onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))} disabled={(step === 0 && !roleReady) || (step === 1 && !missionReady)}>Continue</button> : null}
        </div>
      </form>

      <aside className="panel" style={{ position: "sticky", top: "1rem", maxHeight: "80vh", overflow: "auto" }}>
        <p className="eyebrow">LIVE AGENT BLUEPRINT</p>
        <h3>RYTHM is building the prompt</h3>
        <p style={{ opacity: .72 }}>Updates instantly as you answer. No API cost is incurred until Generate.</p>
        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: ".9rem", lineHeight: 1.55 }}>{blueprint}</pre>
      </aside>
    </div>
  );
}
