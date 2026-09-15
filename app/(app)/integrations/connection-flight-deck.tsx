"use client";

import { useEffect, useMemo, useState } from "react";
import { askCustomerConnectionAgent, controlCustomerConnectionAgent } from "./connection-agent-actions";
import type { ProviderSetupPlan } from "@/lib/integrations/connections/setup-plans";

type EventView = { id:string; event_type:string; safe_message:string|null; created_at:string; status?:string|null; step_key?:string|null };
type BrowserView = { viewerUrl:string|null; currentUrl:string|null; state:string; controlMode:string; expiresAt:string|null } | null;
type SessionView = {
  id:string;
  session_status:string;
  current_step:number;
  control_mode:string;
  requires_user_action:boolean;
  user_action_type:string|null;
  human_takeover_reason?:string|null;
  started_at?:string|null;
  updated_at?:string|null;
  metadata?:Record<string,unknown>|null;
};

type LiveStatus = {
  id:string;
  integrationId:string;
  projectId:string|null;
  providerKey:string;
  providerName:string;
  connectionStatus:string;
  sessionStatus:string;
  currentStep:number;
  totalSteps:number;
  controlMode:string;
  requiresUserAction:boolean;
  userActionType:string|null;
  humanTakeoverReason:string|null;
  browserSessionExists:boolean;
  step:{stepKey:string;title:string;description:string;risk:string}|null;
  securityNote:string;
  browser:BrowserView;
  events:EventView[];
};

function statusText(session:LiveStatus) {
  if (["completed","failed","cancelled","expired"].includes(session.sessionStatus)) {
    if (session.sessionStatus === "completed") return "Mission complete";
    if (session.sessionStatus === "failed") return "Needs attention";
    if (session.sessionStatus === "cancelled") return "Stopped";
    return "Session expired";
  }
  if (session.controlMode === "human") return "Human control";
  if (session.sessionStatus === "waiting_for_user") return "Waiting for you";
  if (session.sessionStatus === "paused") return "Paused";
  if (session.sessionStatus === "verifying") return "Verifying evidence";
  if (session.browser?.viewerUrl && session.controlMode === "ai") return "Agent operating browser";
  if (session.browserSessionExists) return "Connecting live workspace";
  if (["queued","starting","retrying"].includes(session.sessionStatus)) return "Provisioning secure workspace";
  return "Agent processing";
}

function statusTone(session:LiveStatus) {
  if (session.sessionStatus === "completed") return "success";
  if (session.sessionStatus === "failed") return "danger";
  if (session.sessionStatus === "waiting_for_user" || session.controlMode === "human") return "attention";
  if (session.sessionStatus === "paused") return "muted";
  return "live";
}

function domainOf(url:string|null|undefined) {
  if (!url) return null;
  try { return new URL(url).hostname; } catch { return null; }
}

export function ConnectionFlightDeck({
  integrationId,
  projectId,
  providerName,
  providerKey,
  plan,
  initialSession,
  initialEvents,
  initialBrowser,
  openInitially = false,
}:{
  integrationId:string;
  projectId?:string;
  providerName:string;
  providerKey:string;
  plan:ProviderSetupPlan|null;
  initialSession:SessionView;
  initialEvents:EventView[];
  initialBrowser:BrowserView;
  openInitially?:boolean;
}) {
  const [open,setOpen] = useState(openInitially);
  const [full,setFull] = useState(false);
  const [pollError,setPollError] = useState<string|null>(null);
  const [live,setLive] = useState<LiveStatus>({
    id:initialSession.id,
    integrationId,
    projectId:projectId ?? null,
    providerKey,
    providerName,
    connectionStatus:"setup_required",
    sessionStatus:initialSession.session_status,
    currentStep:initialSession.current_step,
    totalSteps:plan?.steps.length ?? 0,
    controlMode:initialSession.control_mode,
    requiresUserAction:initialSession.requires_user_action,
    userActionType:initialSession.user_action_type,
    humanTakeoverReason:initialSession.human_takeover_reason ?? null,
    browserSessionExists:Boolean(initialBrowser),
    step:plan?.steps[initialSession.current_step] ? {
      stepKey:plan.steps[initialSession.current_step].stepKey,
      title:plan.steps[initialSession.current_step].title,
      description:plan.steps[initialSession.current_step].description,
      risk:plan.steps[initialSession.current_step].risk,
    } : null,
    securityNote:plan?.securityNote ?? "Sensitive identity steps remain under Human control.",
    browser:initialBrowser,
    events:initialEvents,
  });

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/integrations/connection-agent/status?sessionId=${encodeURIComponent(initialSession.id)}`, { cache:"no-store" });
        if (!response.ok) throw new Error(`Live status unavailable (${response.status})`);
        const payload = await response.json() as {session:LiveStatus|null};
        if (active && payload.session) {
          setLive(payload.session);
          setPollError(null);
        }
      } catch (error) {
        if (active) setPollError(error instanceof Error ? error.message : "Live status unavailable.");
      }
    };
    poll();
    const timer = window.setInterval(poll, 3500);
    return () => { active=false; window.clearInterval(timer); };
  },[initialSession.id]);

  useEffect(() => {
    const onKey = (event:KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown",onKey);
    return () => window.removeEventListener("keydown",onKey);
  },[]);

  const terminal = ["completed","failed","cancelled","expired"].includes(live.sessionStatus);
  const viewer = live.browser?.viewerUrl ?? null;
  const currentDomain = domainOf(live.browser?.currentUrl);
  const humanInteractive = live.controlMode === "human";
  const progress = useMemo(() => {
    if (!live.totalSteps) return 0;
    return Math.max(4,Math.min(100,Math.round(((live.currentStep + (live.sessionStatus === "completed" ? 1 : 0))/live.totalSteps)*100)));
  },[live.currentStep,live.totalSteps,live.sessionStatus]);

  return <>
    <button type="button" className="flight-deck-launch" onClick={() => setOpen(true)}>
      <span className="flight-deck-launch-orb" aria-hidden="true"><i/><i/><i/></span>
      <span><strong>Open Connection Flight Deck</strong><small>{statusText(live)}</small></span>
      <b aria-hidden="true">↗</b>
    </button>

    {open ? <div className="flight-deck-backdrop" role="dialog" aria-modal="true" aria-label={`${providerName} Connection Flight Deck`}>
      <section className={`flight-deck${full ? " is-full" : ""}`}>
        <div className="flight-deck-ambient" aria-hidden="true"><i/><i/><i/></div>
        <header className="flight-deck-header">
          <div className="flight-deck-brand">
            <div className="flight-deck-sigil" aria-hidden="true"><span>R</span><i/></div>
            <div><p>RYTHM CONNECTION FLIGHT DECK</p><h2>{providerName}</h2></div>
          </div>
          <div className="flight-deck-header-state">
            <span className={`flight-deck-status is-${statusTone(live)}`}><i/>{statusText(live)}</span>
            {currentDomain ? <span className="flight-deck-domain">{currentDomain}</span> : null}
          </div>
          <div className="flight-deck-window-controls">
            <button type="button" onClick={() => setFull(value => !value)} aria-label={full?"Exit expanded mode":"Expand Flight Deck"}>{full?"↙":"↗"}</button>
            <button type="button" onClick={() => setOpen(false)} title="The agent continues unless paused or stopped">Minimize</button>
          </div>
        </header>

        <div className="flight-deck-progress" aria-label={`Step ${live.currentStep+1} of ${live.totalSteps}`}><span style={{width:`${progress}%`}}/></div>

        <div className="flight-deck-grid">
          <section className="flight-deck-browser-shell">
            <div className="flight-deck-browser-toolbar">
              <span className="flight-deck-browser-lights" aria-hidden="true"><i/><i/><i/></span>
              <div className="flight-deck-browser-address"><span>SECURE CLOUD BROWSER</span><strong>{currentDomain ?? "Provisioning isolated browser…"}</strong></div>
              <span className={`flight-deck-control-badge ${humanInteractive?"is-human":"is-agent"}`}>{humanInteractive?"YOU HAVE CONTROL":"AI CONTROL"}</span>
            </div>
            <div className={`flight-deck-browser${humanInteractive?" is-interactive":" is-observe"}`}>
              {viewer ? <>
                <iframe src={viewer} title={`${providerName} live secure browser`} referrerPolicy="no-referrer" allow="clipboard-read; clipboard-write" />
                {!humanInteractive && !terminal ? <div className="flight-deck-observe-shield"><span><i/>Live · Agent operating</span><small>Take Control when RYTHM requests identity, MFA, consent, or another Human-only action.</small></div> : null}
              </> : <div className="flight-deck-provisioning">
                <div className="flight-deck-reactor" aria-hidden="true"><span/><i/><b/></div>
                <p>ESTABLISHING SECURE EXECUTION CHANNEL</p>
                <h3>{live.browserSessionExists ? "Connecting live telemetry…" : "Provisioning an isolated cloud browser…"}</h3>
                <span>RYTHM is preparing an allowlisted provider workspace. No password, MFA, passkey, or CAPTCHA data is captured.</span>
              </div>}
            </div>
          </section>

          <aside className="flight-deck-sidecar">
            <section className="flight-deck-mission-card">
              <div className="flight-deck-section-kicker"><span>CURRENT MISSION</span><b>{live.totalSteps ? `${Math.min(live.currentStep+1,live.totalSteps)}/${live.totalSteps}` : "—"}</b></div>
              <h3>{live.step?.title ?? statusText(live)}</h3>
              <p>{live.humanTakeoverReason ?? live.step?.description ?? "RYTHM is synchronizing the provider connection state."}</p>
              {live.requiresUserAction ? <div className="flight-deck-human-callout"><i/>Human decision boundary reached</div> : <div className="flight-deck-agent-intent"><i/>Agent intent: advance only after verifiable provider evidence.</div>}
            </section>

            <section className="flight-deck-controls-card">
              <div className="flight-deck-section-kicker"><span>CONTROL PLANE</span><b>{live.controlMode.toUpperCase()}</b></div>
              <div className="flight-deck-controls">
                {!terminal && viewer && live.controlMode !== "human" ? <form action={controlCustomerConnectionAgent}>
                  <input type="hidden" name="integrationId" value={integrationId}/><input type="hidden" name="sessionId" value={live.id}/>{projectId?<input type="hidden" name="projectId" value={projectId}/>:null}<input type="hidden" name="command" value="take_control"/>
                  <button className="flight-deck-primary" type="submit">Take Control</button>
                </form> : null}
                {!terminal && live.controlMode === "human" ? <form action={controlCustomerConnectionAgent}>
                  <input type="hidden" name="integrationId" value={integrationId}/><input type="hidden" name="sessionId" value={live.id}/>{projectId?<input type="hidden" name="projectId" value={projectId}/>:null}<input type="hidden" name="command" value="return_control"/>
                  <button className="flight-deck-primary" type="submit">Continue with AI</button>
                </form> : null}
                {!terminal && live.sessionStatus !== "paused" ? <form action={controlCustomerConnectionAgent}>
                  <input type="hidden" name="integrationId" value={integrationId}/><input type="hidden" name="sessionId" value={live.id}/>{projectId?<input type="hidden" name="projectId" value={projectId}/>:null}<input type="hidden" name="command" value="pause"/>
                  <button type="submit">Pause Agent</button>
                </form> : null}
                {!terminal && live.sessionStatus === "paused" ? <form action={controlCustomerConnectionAgent}>
                  <input type="hidden" name="integrationId" value={integrationId}/><input type="hidden" name="sessionId" value={live.id}/>{projectId?<input type="hidden" name="projectId" value={projectId}/>:null}<input type="hidden" name="command" value="resume"/>
                  <button className="flight-deck-primary" type="submit">Resume Agent</button>
                </form> : null}
                {!terminal ? <button type="button" onClick={() => setOpen(false)}>Continue in Background</button> : null}
                {!terminal ? <form action={controlCustomerConnectionAgent}>
                  <input type="hidden" name="integrationId" value={integrationId}/><input type="hidden" name="sessionId" value={live.id}/>{projectId?<input type="hidden" name="projectId" value={projectId}/>:null}<input type="hidden" name="command" value="stop"/>
                  <button className="is-danger" type="submit">Stop</button>
                </form> : null}
              </div>
            </section>

            <section className="flight-deck-timeline-card">
              <div className="flight-deck-section-kicker"><span>AGENT TRACE</span><b>LIVE</b></div>
              <div className="flight-deck-timeline">
                {live.events.length ? live.events.slice(0,7).map((event,index)=><article key={event.id} className={index===0?"is-latest":""}>
                  <i/><div><strong>{event.safe_message ?? event.event_type}</strong><small>{new Date(event.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})}</small></div>
                </article>) : <article className="is-latest"><i/><div><strong>Waiting for first execution signal…</strong><small>Live trace</small></div></article>}
              </div>
            </section>

            <section className="flight-deck-safety-card">
              <div className="flight-deck-section-kicker"><span>HUMAN AUTHORITY</span><b>ENFORCED</b></div>
              <p>{live.securityNote}</p>
              <ul><li>Password & MFA remain Human-only</li><li>Consent is never silently approved</li><li>Cloud browser recording is disabled</li></ul>
            </section>
          </aside>
        </div>

        <footer className="flight-deck-footer">
          <form action={askCustomerConnectionAgent} className="flight-deck-ask">
            <input type="hidden" name="integrationId" value={integrationId}/><input type="hidden" name="sessionId" value={live.id}/>{projectId?<input type="hidden" name="projectId" value={projectId}/>:null}
            <span>ASK CONNECTION AGENT</span><input name="question" maxLength={300} placeholder="What are you doing right now?"/><button type="submit">Ask</button>
          </form>
          <div className="flight-deck-background-note"><i/>You can leave this page. Durable execution continues until RYTHM needs you, completes, pauses, or is stopped.</div>
          {pollError ? <div className="flight-deck-poll-error">{pollError}</div> : null}
        </footer>
      </section>
    </div> : null}
  </>;
}
