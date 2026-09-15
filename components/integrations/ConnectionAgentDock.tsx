"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DockSession = {
  id:string;
  integrationId:string;
  projectId:string|null;
  providerName:string;
  sessionStatus:string;
  controlMode:string;
  requiresUserAction:boolean;
  browserSessionExists:boolean;
  browser:{viewerUrl:string|null;currentUrl:string|null;state:string}|null;
  step:{title:string;description:string}|null;
};

function label(session:DockSession) {
  if (session.sessionStatus === "waiting_for_user") return "Needs your attention";
  if (session.controlMode === "human") return "You have control";
  if (session.sessionStatus === "paused") return "Paused";
  if (session.sessionStatus === "verifying") return "Verifying connection";
  if (session.browser?.viewerUrl && session.controlMode === "ai") return "Agent operating live";
  if (session.browserSessionExists) return "Connecting live workspace";
  if (["queued","starting","retrying"].includes(session.sessionStatus)) return "Preparing secure workspace";
  return "Agent working";
}

export default function ConnectionAgentDock() {
  const [session,setSession] = useState<DockSession|null>(null);
  const [dismissed,setDismissed] = useState<string|null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const response = await fetch("/api/integrations/connection-agent/status", { cache:"no-store" });
        if (!response.ok) return;
        const payload = await response.json() as {session:DockSession|null};
        if (alive) setSession(payload.session ?? null);
      } catch { /* fail quietly: dock must never block workspace */ }
    };
    poll();
    const timer = window.setInterval(poll,5000);
    return () => { alive=false; window.clearInterval(timer); };
  },[]);

  const href = useMemo(() => {
    if (!session) return "/integrations";
    const query = new URLSearchParams({ live:"1" });
    if (session.projectId) query.set("project",session.projectId);
    return `/integrations/${encodeURIComponent(session.integrationId)}/setup?${query.toString()}`;
  },[session]);

  if (!session || dismissed === session.id) return null;
  const attention = session.requiresUserAction || session.sessionStatus === "waiting_for_user";

  return <aside className={`connection-agent-dock${attention?" needs-attention":""}`} aria-label="Active Connection Agent">
    <div className="connection-agent-dock-reactor" aria-hidden="true"><span/><i/></div>
    <div className="connection-agent-dock-copy">
      <p>{attention?"HUMAN INPUT REQUIRED":"CONNECTION AGENT ACTIVE"}</p>
      <strong>{session.providerName}</strong>
      <span>{label(session)}{session.step?.title?` · ${session.step.title}`:""}</span>
    </div>
    <div className="connection-agent-dock-actions">
      <Link href={href}>{attention?"Respond":"View Live"}</Link>
      <button type="button" onClick={() => setDismissed(session.id)} aria-label="Dismiss Connection Agent dock">×</button>
    </div>
  </aside>;
}
