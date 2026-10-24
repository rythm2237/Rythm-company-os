"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { AssignmentCandidate } from "@/lib/projects/project-agent-assignment";

/** Existing projects use the same eligibility service and atomic reservation as guided intake. */
export function ProjectTeamAssignment({ projectId, skills, domain }: { projectId: string; skills: string[]; domain?: string }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<AssignmentCandidate[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const skillKey = skills.join(",");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/projects/assignment?projectId=${encodeURIComponent(projectId)}&skills=${encodeURIComponent(skillKey)}&domain=${encodeURIComponent(domain ?? "")}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Team recommendations are unavailable.");
        setCandidates(data.candidates); setSelected(data.recommendedAgentId ?? "");
      } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Team recommendations are unavailable."); }
    }
    void load();
    return () => controller.abort();
  }, [projectId, skillKey, domain]);
  async function assign(mode: "auto" | "manual") {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/projects/assignment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, mode, agentId: selected, skills, domain }) });
      const data = await response.json();
      if (Array.isArray(data.candidates)) setCandidates(data.candidates);
      if (!response.ok || !data.ok) throw new Error(data.error || data.reason || "No eligible lead could be assigned.");
      setMessage(`AI lead assigned. ${data.reason}`);
      window.dispatchEvent(new CustomEvent("rythm:project-updated", { detail: { projectId } }));
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Assignment did not finish."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="panel project-view-panel" aria-label="AI project lead assignment"><div className="panel-heading"><div><p className="label">AI delegation</p><h2>Review or recover the project lead</h2></div></div><p className="subtitle">The human manager remains accountable. Selection uses listed skills, actual workload and authorization; every assignment is checked again when saved.</p>
    <label>AI lead candidate<select style={{ width: "100%", minWidth: 0 }} value={selected} onChange={event => setSelected(event.target.value)}><option value="">Select an eligible company specialist</option>{candidates.map(candidate => <option key={candidate.agentId} value={candidate.agentId} disabled={!candidate.eligible}>{candidate.name} · {candidate.eligible ? `${candidate.capacity.availablePercent}% available` : candidate.blockers.join(" ")}</option>)}</select></label>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}><Button type="button" disabled={busy || !skills.length} onClick={() => assign("auto")}>Auto Assign</Button><Button type="button" className="secondary-button" disabled={busy || !selected} onClick={() => assign("manual")}>Assign selected lead</Button></div>
    {!skills.length ? <p className="security-note">Analyze the project to identify required capabilities before selecting a lead.</p> : null}
    {candidates.map(candidate => <details key={candidate.agentId}><summary>{candidate.name} · {candidate.role} · {candidate.eligible ? "Eligible" : "Unavailable"}</summary><p>{candidate.reason}</p><p>Skills: {candidate.skills.join(", ")} · Evidence: {candidate.evidence.skills} · Quality history: {candidate.evidence.qualitySamples || "unknown"}</p></details>)}
    {message ? <p role="status" className="security-note">{message}</p> : null}
  </section>;
}
