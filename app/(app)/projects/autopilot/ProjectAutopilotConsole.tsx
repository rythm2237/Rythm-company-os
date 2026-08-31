"use client";

import { useState, useTransition } from "react";
import { runNextProjectAutopilotAction, type ProjectAutopilotState } from "./actions";

export default function ProjectAutopilotConsole({ projectId, projectCode }: { projectId: string; projectCode: string }) {
  const [state, setState] = useState<ProjectAutopilotState>({ status: "idle" });
  const [running, startTransition] = useTransition();
  const [history, setHistory] = useState<Array<{ actionCode?: string | null; title?: string; output?: string }>>([]);

  const runOnce = async () => {
    const next = await runNextProjectAutopilotAction(projectId);
    setState(next);
    if (next.status === "completed") {
      setHistory((items) => [...items, { actionCode: next.actionCode, title: next.title, output: next.output }]);
    }
    return next;
  };

  const runAutopilot = () => startTransition(async () => {
    setState({ status: "running", message: "RYTHM is executing internal project actions in dependency order…" });
    for (let step = 0; step < 20; step += 1) {
      const next = await runOnce();
      if (next.status !== "completed") break;
    }
  });

  return <section className="panel" style={{ marginTop: 18 }}>
    <div className="panel-heading"><div><p className="label">PROJECT AUTOPILOT · {projectCode}</p><h2>Run internal work without per-action approval</h2></div><span className="pill">{running ? "RUNNING" : state.status.replaceAll("_", " ").toUpperCase()}</span></div>
    <p className="subtitle">RYTHM runs ready internal actions in dependency order. Analysis, drafting, planning and internal Agent handoffs do not require Human approval. The flow stops automatically at consequential external-action gates.</p>
    <button onClick={runAutopilot} disabled={running || state.status === "approval_required"} style={{ marginTop: 12 }}>{running ? "Project autopilot running…" : "Run project autopilot"}</button>
    {running ? <div style={{ marginTop: 16 }}><div style={{ height: 8, borderRadius: 999, overflow: "hidden", background: "#e8edf7" }}><div style={{ width: "55%", height: "100%", background: "currentColor", animation: "pulse 1.2s ease-in-out infinite" }}/></div><p className="subtitle">Keep this page open while the current internal action completes. The next eligible action starts automatically.</p></div> : null}
    {state.message ? <p className={state.status === "error" ? "form-error" : state.status === "approval_required" ? "security-note" : "form-success"} style={{ marginTop: 14 }}>{state.message}</p> : null}
    {state.status === "approval_required" ? <p style={{ marginTop: 10 }}><a className="secondary-button" href="/approvals">Open Human CEO approval gate</a></p> : null}
    {history.length ? <div style={{ marginTop: 20 }}><p className="label">Completed this run</p><div className="data-list">{history.map((item, index) => <details key={`${item.actionCode ?? index}`} className="data-row"><summary><strong>{item.actionCode ?? "Action"} · {item.title ?? "Completed"}</strong></summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 12 }}>{item.output}</pre></details>)}</div></div> : null}
  </section>;
}
