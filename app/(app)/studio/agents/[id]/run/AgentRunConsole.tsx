"use client";

import { useMemo, useState, useTransition } from "react";
import { runAgentConsole } from "./actions";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: string;
};

type Props = {
  agentId: string;
  agentName: string;
  roleTitle: string;
  status: string;
  provider: string;
  model: string;
};

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AgentRunConsole({ agentId, agentName, roleTitle, status, provider, model }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"chat" | "task">("task");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const transcript = useMemo(() => messages.map(({ role, content }) => ({ role, content })), [messages]);

  function submit() {
    const value = prompt.trim();
    if (!value || isPending) return;
    setError("");
    setPrompt("");
    const userMessage: Message = { id: id(), role: "user", content: value };
    setMessages((current) => [...current, userMessage]);

    startTransition(async () => {
      const result = await runAgentConsole({
        agentId,
        prompt: value,
        mode,
        messages: transcript,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessages((current) => [
        ...current,
        {
          id: id(),
          role: "assistant",
          content: result.response,
          meta: `${result.provider} · ${result.model} · ${(result.latencyMs / 1000).toFixed(1)}s · external actions disabled`,
        },
      ]);
    });
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <section className="panel" style={{ margin: 0 }}>
        <p className="eyebrow">SAFE AGENT CONSOLE</p>
        <h2>{agentName}</h2>
        <p>{roleTitle}</p>
        <p>
          Status: <strong>{status}</strong> · Brain: <strong>{provider}</strong> · {model}
        </p>
        <p>
          This console is evaluation-only. The Agent can produce analysis, designs, plans, drafts, and other text deliverables, but it cannot execute external actions.
        </p>
      </section>

      <section className="panel" style={{ margin: 0 }}>
        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <button type="button" onClick={() => setMode("task")} aria-pressed={mode === "task"}>
            {mode === "task" ? "✓ " : ""}Run Task
          </button>
          <button type="button" onClick={() => setMode("chat")} aria-pressed={mode === "chat"}>
            {mode === "chat" ? "✓ " : ""}Chat
          </button>
          {messages.length > 0 ? <button type="button" onClick={() => { setMessages([]); setError(""); }}>Clear session</button> : null}
        </div>

        {messages.length === 0 ? (
          <div style={{ padding: "1rem 0" }}>
            <h3>Test this Agent</h3>
            <p>Give a real assignment. For a designer, ask for a concrete concept, layout, visual direction, critique, or design brief.</p>
            <button
              type="button"
              onClick={() => setPrompt("Design a premium landing-page hero for RYTHM Company OS. Audience: founders and operations leaders. Deliver the concept, layout, typography direction, visual hierarchy, CTA structure, image/art direction, and a short design rationale. Flag UX risks before finalizing.")}
            >
              Load example design task
            </button>
          </div>
        ) : (
          <div aria-live="polite" style={{ display: "grid", gap: ".85rem", marginBottom: "1.25rem" }}>
            {messages.map((message) => (
              <article key={message.id} className="kpi-card" style={{ maxWidth: "100%" }}>
                <p className="eyebrow">{message.role === "user" ? "YOU" : agentName.toUpperCase()}</p>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{message.content}</div>
                {message.meta ? <p style={{ marginTop: ".75rem", opacity: .7, fontSize: ".85rem" }}>{message.meta}</p> : null}
              </article>
            ))}
          </div>
        )}

        <label style={{ display: "grid", gap: ".5rem" }}>
          {mode === "task" ? "Task for this Agent" : `Message ${agentName}`}
          <textarea
            rows={7}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={mode === "task" ? "Describe the work you want the Agent to complete…" : "Ask the Agent a question…"}
            maxLength={12000}
          />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div style={{ display: "flex", alignItems: "center", gap: ".75rem", flexWrap: "wrap", marginTop: ".75rem" }}>
          <button type="button" onClick={submit} disabled={!prompt.trim() || isPending}>
            {isPending ? "Agent is working…" : mode === "task" ? "Run Agent" : "Send message"}
          </button>
          <span style={{ opacity: .7, fontSize: ".85rem" }}>Session transcript is temporary and is not saved by this V1 console.</span>
        </div>
      </section>
    </div>
  );
}
