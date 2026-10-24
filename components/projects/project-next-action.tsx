"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ProjectNextAction } from "@/lib/projects/project-next-action";
import { Button } from "@/components/ui/Button";

export function ProjectNextActionCard({ projectId, initial }: { projectId: string; initial: ProjectNextAction }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  useEffect(() => { setState(initial); }, [initial]);
  useEffect(() => {
    const controller = new AbortController();
    const update = async () => {
      if (document.hidden || lock.current) return;
      try {
        const response = await fetch(`/api/projects/next-action?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (response.ok && payload.ok && !lock.current) setState(payload.nextAction);
      } catch { /* Keep the last confirmed guidance during temporary connection loss. */ }
    };
    const timer = window.setInterval(() => void update(), 15000);
    window.addEventListener("rythm:project-updated", update);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("rythm:project-updated", update); };
  }, [projectId]);
  const execute = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage("");
    try {
      const endpoint = state.action === "analyze" ? "/api/projects/analyze" : "/api/projects/run";
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The project action could not finish. Retry safely.");
      setMessage(state.action === "analyze" ? "Analysis saved. Review the findings and essential clarifications below." : payload.mode === "execution_started" ? "Approved execution is running. Follow live operations below." : "The roadmap is ready for review.");
      window.dispatchEvent(new CustomEvent("rythm:project-updated", { detail: { projectId } }));
      if (state.action !== "analyze") router.push(state.href);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The project action could not finish."); }
    finally { lock.current = false; setBusy(false); }
  };
  const direct = state.action === "analyze" || state.action === "create_roadmap" || state.action === "start";
  return <section className="project-detail-next-action" role="status" aria-label="Required next action">
    <div style={{ minWidth: 0, overflowWrap: "anywhere" }}><p className="label">{state.stage.replaceAll("_", " ")}</p><strong>{state.label}</strong><p>{state.reason}</p>
      {state.blockers.map(blocker => <p key={blocker}>{blocker}</p>)}{message ? <p role="status">{message}</p> : null}
    </div>
    {direct ? <Button type="button" onClick={execute} disabled={busy || !state.eligible}>{busy ? "Working…" : state.label}</Button> : <Link className="secondary-button" href={state.href}>{state.label} →</Link>}
  </section>;
}
