"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TranscriptMessage = {
  id?: string;
  turnIndex: number;
  roundNo: number;
  messageType: string;
  content: string;
  speakerCode: string;
  speakerName: string;
  speakerRole?: string;
};

type Props = {
  sessionId: string;
  meetingStatus: string;
  initialStatus: string;
  initialMessages: TranscriptMessage[];
  initialError?: string | null;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function DeliberationConsole({ sessionId, meetingStatus, initialStatus, initialMessages, initialError }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [messages, setMessages] = useState(initialMessages);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const [progressText, setProgressText] = useState("");

  const runMeeting = async () => {
    setRunning(true);
    setError("");
    setProgressText("Opening governed agent deliberation…");
    try {
      for (let step = 0; step < 40; step += 1) {
        const response = await fetch("/api/meetings/deliberate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Meeting turn failed.");

        if (payload.content) {
          setMessages((current) => [...current, {
            turnIndex: Number(payload.turnIndex ?? current.length + 1),
            roundNo: Number(payload.roundNo ?? 1),
            messageType: String(payload.phase ?? "position"),
            content: String(payload.content),
            speakerCode: String(payload.speaker?.code ?? "B-001"),
            speakerName: String(payload.speaker?.name ?? "Executive Orchestrator"),
            speakerRole: String(payload.speaker?.role ?? "Meeting synthesis"),
          }]);
        }

        setStatus(String(payload.status ?? "running"));
        if (payload.status === "completed") {
          setProgressText("Deliberation complete. Human CEO decision is now required.");
          router.refresh();
          return;
        }

        const remaining = Number(payload.remainingTurns ?? 0);
        setProgressText(`${payload.speaker?.code ?? "Agent"} completed ${payload.phase ?? "turn"}. ${remaining} deliberation turns remain before synthesis.`);
        await delay(350);
      }
      throw new Error("Meeting exceeded the maximum client orchestration steps.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Meeting execution failed.");
      setProgressText("");
      router.refresh();
    } finally {
      setRunning(false);
    }
  };

  const canRun = meetingStatus === "running" && ["ready", "running"].includes(status);

  return <section style={{ marginTop: 20 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div>
        <p className="label">Live transcript</p>
        <h2 style={{ margin: 0 }}>Multi-Agent Deliberation</h2>
      </div>
      <div className="row-meta"><span>Session: {status}</span><b className={status === "completed" ? "state-active" : "state-paused"}>{running ? "Agents speaking…" : status}</b></div>
    </div>

    {meetingStatus !== "running" && ["ready", "running"].includes(status) ? <p className="security-note">Start the governed meeting first. Agent deliberation cannot execute while the meeting is {meetingStatus}.</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {progressText ? <p className="form-success" role="status">{progressText}</p> : null}

    {canRun ? <button type="button" onClick={runMeeting} disabled={running} style={{ margin: "12px 0 18px" }}>
      {running ? "Running governed deliberation…" : status === "running" ? "Continue agent meeting" : "Start agent deliberation"}
    </button> : null}

    <div style={{ display: "grid", gap: 12, maxHeight: 720, overflowY: "auto", paddingRight: 4 }} aria-live="polite">
      {messages.length ? messages.map((message, index) => <article key={`${message.turnIndex}-${index}`} style={{ border: "1px solid #dfe4ec", borderRadius: 14, padding: 16, background: message.messageType === "synthesis" ? "#f3f6fb" : "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div><strong>{message.speakerCode} · {message.speakerName}</strong><span style={{ display: "block", color: "#717b8e", fontSize: ".82rem", marginTop: 3 }}>{message.speakerRole}</span></div>
          <span className="pill">{message.messageType} · round {message.roundNo}</span>
        </div>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.65, color: "#46536a", marginBottom: 0 }}>{message.content}</p>
      </article>) : <p className="empty-state">No agent has spoken yet.</p>}
    </div>
  </section>;
}
