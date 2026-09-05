"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { AgentPortrait } from "@/app/components/agent-portrait";
import styles from "./boardroom-immersive.module.css";

type TranscriptMessage = { id?: string; turnIndex: number; roundNo: number; messageType: string; content: string; speakerCode: string; speakerName: string; speakerRole?: string };
type Participant = { id: string; agentCode: string; name: string; roleTitle: string; avatarUrl: string | null; enabled: boolean };
type LegalReview = { id?: string; status?: string; outcome?: string | null; executive_note?: string | null; risk_summary?: string | null; conditions?: unknown; jurisdictions?: unknown; licensed_counsel_required?: boolean; estimated_cost_usd?: number; error_message?: string | null };
type Props = {
  sessionId: string;
  meetingStatus: string;
  initialStatus: string;
  initialMessages: TranscriptMessage[];
  initialError?: string | null;
  meetingTitle: string;
  decisionQuestion: string;
  maxRounds: number;
  budgetCapUsd: number;
  participants: Participant[];
  meetingAgenda?: string[];
  meetingStartedAt?: string | null;
  humanAvatarUrl?: string | null;
  humanName?: string | null;
};
type RailMode = "transcript" | "summary" | "governance";
type LeftMode = "agenda" | "decisions";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const excerpt = (value: string, max = 190) => value.replace(/[#*_`>-]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) + (value.length > max ? "…" : "");
const seatPositions = [
  ["18%", "44%"], ["8%", "61%"], ["24%", "73%"],
  ["69%", "43%"], ["82%", "59%"], ["72%", "72%"],
  ["32%", "35%"], ["58%", "35%"],
];

async function jsonPost(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, credentials: "same-origin", cache: "no-store", body: JSON.stringify(body) });
  const raw = await response.text();
  let payload: Record<string, any> = {};
  if (raw) { try { payload = JSON.parse(raw); } catch { throw new Error(`Meeting runtime returned HTTP ${response.status} with a non-JSON response.`); } }
  if (!response.ok || !payload.ok) throw new Error(String(payload.error ?? `Request failed with HTTP ${response.status}.`));
  return payload;
}
async function jsonGet(path: string) {
  const response = await fetch(path, { headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store" });
  const raw = await response.text();
  let payload: Record<string, any> = {};
  if (raw) { try { payload = JSON.parse(raw); } catch { throw new Error(`Meeting runtime returned HTTP ${response.status} with a non-JSON response.`); } }
  if (!response.ok || !payload.ok) throw new Error(String(payload.error ?? `Request failed with HTTP ${response.status}.`));
  return payload;
}
async function postMeetingTurn(sessionId: string) {
  let last: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await jsonPost("/api/meetings/deliberate", { sessionId }); }
    catch (cause) {
      last = cause;
      const network = cause instanceof TypeError || (cause instanceof Error && cause.message === "Failed to fetch");
      if (!network || attempt === 3) throw cause;
      await delay(900 * attempt);
    }
  }
  throw last instanceof Error ? last : new Error("Meeting runtime could not be reached.");
}

export default function DeliberationConsole({
  sessionId, meetingStatus, initialStatus, initialMessages, initialError, meetingTitle, decisionQuestion,
  maxRounds, budgetCapUsd, participants, meetingAgenda = [], meetingStartedAt, humanAvatarUrl, humanName,
}: Props) {
  const router = useRouter();
  const pauseRef = useRef(false);
  const ceoInputRef = useRef<HTMLInputElement>(null);
  const [meetingState, setMeetingState] = useState(meetingStatus);
  const [status, setStatus] = useState(initialStatus);
  const [messages, setMessages] = useState(initialMessages);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const [progressText, setProgressText] = useState("");
  const [activeSpeaker, setActiveSpeaker] = useState("");
  const [paused, setPaused] = useState(false);
  const [ceoText, setCeoText] = useState("");
  const [ceoSending, setCeoSending] = useState(false);
  const [recipient, setRecipient] = useState("ALL");
  const [chairClosing, setChairClosing] = useState(false);
  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [summaryLanguage, setSummaryLanguage] = useState("__meeting__");
  const [customSummaryLanguage, setCustomSummaryLanguage] = useState("");
  const [legalTriage, setLegalTriage] = useState<"pending" | "recommended" | "not_indicated">("pending");
  const [legalTriageReason, setLegalTriageReason] = useState("");
  const [legalReview, setLegalReview] = useState<LegalReview | null>(null);
  const [legalReviewRunning, setLegalReviewRunning] = useState(false);
  const [railMode, setRailMode] = useState<RailMode>("transcript");
  const [railOpen, setRailOpen] = useState(false);
  const [leftMode, setLeftMode] = useState<LeftMode>("agenda");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [focusRoom, setFocusRoom] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [slideOffset, setSlideOffset] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("rythm-boardroom-active");
    return () => { document.body.style.overflow = previousOverflow; document.documentElement.classList.remove("rythm-boardroom-active"); };
  }, []);
  useEffect(() => { try { const saved = localStorage.getItem(`rythm:boardroom:ceo:${sessionId}`); if (saved) setCeoText(saved); } catch {} }, [sessionId]);
  useEffect(() => { try { if (ceoText) localStorage.setItem(`rythm:boardroom:ceo:${sessionId}`, ceoText); else localStorage.removeItem(`rythm:boardroom:ceo:${sessionId}`); } catch {} }, [ceoText, sessionId]);
  useEffect(() => {
    setMeetingState(meetingStatus);
    setStatus(initialStatus);
    setMessages((current) => {
      const currentTurn = current.reduce((max, message) => Math.max(max, Number(message.turnIndex ?? 0)), 0);
      const incomingTurn = initialMessages.reduce((max, message) => Math.max(max, Number(message.turnIndex ?? 0)), 0);
      return incomingTurn > currentTurn || initialMessages.length > current.length ? initialMessages : current;
    });
  }, [meetingStatus, initialStatus, initialMessages]);
  useEffect(() => {
    if (meetingState !== "running") return;
    const timer = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [meetingState, router]);
  useEffect(() => {
    const update = () => {
      if (!meetingStartedAt) { setElapsed(0); return; }
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(meetingStartedAt).getTime()) / 1000)));
    };
    update();
    if (meetingState !== "running") return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [meetingStartedAt, meetingState]);
  useEffect(() => {
    if (status !== "completed" || meetingState !== "completed") return;
    let cancelled = false;
    (async () => {
      try {
        const triage = await jsonGet(`/api/meetings/legal-triage?sessionId=${encodeURIComponent(sessionId)}`);
        if (cancelled) return;
        let triageStatus = (triage.status ?? "pending") as "pending" | "recommended" | "not_indicated";
        let reason = String(triage.reason ?? "");
        if (triageStatus === "pending") {
          const completedTriage = await jsonPost("/api/meetings/legal-triage", { sessionId });
          triageStatus = (completedTriage.status ?? "pending") as typeof triageStatus;
          reason = String(completedTriage.reason ?? "");
        }
        if (!cancelled) { setLegalTriage(triageStatus); setLegalTriageReason(reason); }
        const reviewPayload = await jsonGet(`/api/meetings/legal-review?sessionId=${encodeURIComponent(sessionId)}`);
        if (!cancelled) setLegalReview((reviewPayload.review ?? null) as LegalReview | null);
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Legal governance status could not be loaded."); }
    })();
    return () => { cancelled = true; };
  }, [sessionId, status, meetingState]);

  const agentTurns = useMemo(() => messages.filter((m) => m.speakerCode !== "CEO" && m.speakerCode !== "SYSTEM" && ["position", "challenge", "synthesis", "chair_follow_up"].includes(m.messageType)).length, [messages]);
  const canRun = meetingState === "running" && ["ready", "running"].includes(status);
  const awaitingChairClose = meetingState === "running" && status === "completed";
  const expectedSpeaker = () => {
    const last = messages.at(-1);
    if (last?.speakerCode === "CEO" && agentTurns >= participants.length * maxRounds) return participants.find((p) => p.agentCode === "B-001")?.agentCode ?? "B-001";
    return participants.length ? participants[agentTurns % participants.length]?.agentCode ?? "" : "";
  };
  const appendTurn = (payload: Record<string, any>) => {
    if (!payload.content) return;
    const next: TranscriptMessage = { turnIndex: Number(payload.turnIndex ?? 0), roundNo: Number(payload.roundNo ?? 1), messageType: String(payload.phase ?? "position"), content: String(payload.content), speakerCode: String(payload.speaker?.code ?? "B-001"), speakerName: String(payload.speaker?.name ?? "Executive Orchestrator"), speakerRole: String(payload.speaker?.role ?? "Meeting synthesis") };
    setMessages((current) => current.some((message) => message.turnIndex === next.turnIndex) ? current : [...current, next]);
    setActiveSpeaker(next.speakerCode);
  };

  const stepMeeting = async () => {
    if (running || !canRun) return;
    pauseRef.current = false; setPaused(false); setRunning(true); setError(""); setActiveSpeaker(expectedSpeaker()); setProgressText("Running one governed turn…");
    try {
      const payload = await postMeetingTurn(sessionId); appendTurn(payload); setStatus(String(payload.status ?? "running"));
      if (payload.status === "completed") { setProgressText("Agent synthesis is complete. Human CEO closure is required."); setActiveSpeaker(""); router.refresh(); }
      else { pauseRef.current = true; setPaused(true); setProgressText(`${payload.speaker?.code ?? "Agent"} completed one turn. Meeting paused for Chair review.`); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Meeting execution failed."); }
    finally { setRunning(false); }
  };
  const runMeeting = async () => {
    if (running) return;
    pauseRef.current = false; setPaused(false); setRunning(true); setError(""); setProgressText("Governed deliberation running…");
    try {
      for (let step = 0; step < 40; step += 1) {
        if (pauseRef.current) { setPaused(true); setProgressText("Paused by Human CEO at a safe turn boundary."); return; }
        setActiveSpeaker(expectedSpeaker());
        const payload = await postMeetingTurn(sessionId); appendTurn(payload); setStatus(String(payload.status ?? "running"));
        if (payload.status === "completed") { setProgressText("Agent synthesis complete. Awaiting Human CEO closure."); setActiveSpeaker(""); router.refresh(); return; }
        setProgressText(`${payload.speaker?.code ?? "Agent"} completed ${payload.phase ?? "turn"}. ${Number(payload.remainingTurns ?? 0)} turns remain.`);
        await delay(600);
      }
      throw new Error("Meeting exceeded the maximum client orchestration steps.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Meeting execution failed."); router.refresh(); }
    finally { setRunning(false); if (!pauseRef.current) setActiveSpeaker(""); }
  };
  const pauseAgents = () => { pauseRef.current = true; setPaused(true); setProgressText("Pause requested. The current safe turn will finish before Agents stop."); };
  const continueDiscussion = () => { pauseRef.current = false; setPaused(false); setActiveSpeaker(""); setProgressText("Human CEO released the floor. Agents are continuing deliberation…"); void runMeeting(); };
  const managerIntervention = () => {
    if (running) pauseAgents();
    setRailMode("transcript"); setRailOpen(true);
    window.setTimeout(() => ceoInputRef.current?.focus(), 80);
  };
  const sendCeoContribution = async () => {
    const text = ceoText.trim(); if (text.length < 2) return;
    setCeoSending(true); setError("");
    try {
      const target = recipient === "ALL" ? "EVERYONE" : recipient;
      const content = `CHAIR MESSAGE TO ${target} — ${text}`;
      const payload = await jsonPost("/api/meetings/ceo-contribute", { sessionId, content });
      setMessages((current) => [...current, { turnIndex: Number(payload.turnIndex ?? current.length + 1), roundNo: Number(payload.roundNo ?? 1), messageType: "ceo_contribution", content: String(payload.content ?? content), speakerCode: "CEO", speakerName: "Human CEO", speakerRole: "Meeting Chair" }]);
      setStatus(String(payload.sessionStatus ?? status)); setCeoText(""); setPaused(true); pauseRef.current = true; setActiveSpeaker("CEO"); setProgressText(`Chair message recorded for ${target}. Select Next Action to let Agents respond.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "CEO contribution could not be added."); }
    finally { setCeoSending(false); }
  };
  const closeMeeting = async () => {
    setChairClosing(true); setError("");
    try { await jsonPost("/api/meetings/close", { sessionId }); setMeetingState("completed"); setActiveSpeaker(""); setPaused(true); setProgressText("Meeting closed by Human CEO. Decision governance is available."); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Meeting could not be closed."); }
    finally { setChairClosing(false); }
  };
  const requestSummary = async () => {
    const requested = summaryLanguage === "__meeting__" ? "" : summaryLanguage === "__other__" ? customSummaryLanguage.trim() : summaryLanguage;
    if (summaryLanguage === "__other__" && requested.length < 2) { setError("Enter the summary language."); return; }
    if (messages.length < 2) { setRailMode("summary"); setRailOpen(true); return; }
    setSummarizing(true); setError("");
    try { const payload = await jsonPost("/api/meetings/summarize", { sessionId, summaryLanguage: requested }); setSummary(String(payload.summary ?? "")); setRailMode("summary"); setRailOpen(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Meeting summary failed."); }
    finally { setSummarizing(false); }
  };
  const requestLegalReview = async () => {
    setLegalReviewRunning(true); setError("");
    try { const payload = await jsonPost("/api/meetings/legal-review", { sessionId }); setLegalReview((payload.review ?? null) as LegalReview | null); setRailMode("governance"); setRailOpen(true); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "AI legal review failed."); }
    finally { setLegalReviewRunning(false); }
  };

  const latest = [...messages].slice(-20).reverse();
  const lastAgentMessage = [...messages].reverse().find((m) => !["CEO", "SYSTEM"].includes(m.speakerCode));
  const currentRound = lastAgentMessage?.roundNo ?? 1;
  const active = participants.find((p) => p.agentCode === activeSpeaker);
  const completed = status === "completed";
  const lastMessage = messages.at(-1);
  const chairHasFloor = canRun && paused && lastMessage?.speakerCode === "CEO";
  const synthesis = [...messages].reverse().find((m) => m.messageType === "synthesis");
  const recentChallenges = [...messages].filter((m) => m.messageType === "challenge").slice(-3);
  const recentPositions = [...messages].filter((m) => m.messageType === "position").slice(-3);
  const slideDeck = useMemo(() => [
    { eyebrow: "MEETING OBJECTIVE", title: decisionQuestion, bullets: meetingAgenda.length ? meetingAgenda.slice(0, 4) : ["Clarify the decision to be made.", "Surface strategic and operational constraints.", "Challenge assumptions before recommendation."], footer: "Human CEO retains final authority." },
    { eyebrow: `ROUND ${currentRound} · POSITIONS`, title: "Current executive positions", bullets: recentPositions.length ? recentPositions.map((m) => `${m.speakerName}: ${excerpt(m.content, 150)}`) : ["Positions will appear as Agents complete governed turns."], footer: "Only authorized meeting participants are represented in this room." },
    { eyebrow: `ROUND ${currentRound} · CHALLENGE`, title: "Assumptions under challenge", bullets: recentChallenges.length ? recentChallenges.map((m) => `${m.speakerName}: ${excerpt(m.content, 150)}`) : ["Challenge rounds will surface risk, evidence and execution constraints."], footer: "The Human CEO can intervene at any safe turn boundary." },
    { eyebrow: "DECISION BRIEF", title: synthesis ? "Synthesis ready for Human CEO" : "Decision synthesis", bullets: synthesis ? synthesis.content.split(/\n+/).filter(Boolean).slice(0, 4).map((x) => excerpt(x, 180)) : ["The final synthesis appears here after governed deliberation."], footer: "AI recommendation is advisory and non-binding." },
  ], [decisionQuestion, meetingAgenda, currentRound, recentPositions, recentChallenges, synthesis]);
  const meetingSlide = slideDeck[slideOffset % slideDeck.length];
  const progressDenominator = Math.max(1, participants.length * maxRounds + 1);
  const progressPct = Math.min(100, Math.round((agentTurns / progressDenominator) * 100));
  const agendaItems = meetingAgenda.length ? meetingAgenda : ["Meeting objective", "Agent positions", "Challenge round", "Synthesis", "Human CEO decision"];
  const formatElapsed = (seconds: number) => `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const roomState = chairHasFloor ? "Chair has floor" : paused ? "Paused" : running ? "Running" : completed ? "Synthesis ready" : "Ready";
  const managerDisplayName = humanName?.trim() || "Human CEO";

  return <section className={`${styles.immersiveBoardroom} ${leftCollapsed ? styles.leftCollapsed : ""} ${rightCollapsed ? styles.rightCollapsed : ""} ${focusRoom ? styles.focusRoom : ""}`} aria-label="RYTHM executive boardroom">
    <div className={styles.desktopExperience}>
      <header className={styles.controlHeader}>
        <div className={styles.brandCluster}>
          <Image src="/brand/logo-navbar-inverse.svg" width={154} height={38} alt="RYTHM Company OS" priority />
        </div>
        <div className={styles.meetingIdentity}><span className={styles.liveDot} /><div><strong>{meetingTitle}</strong><small>Live governed meeting</small></div></div>
        <div className={styles.headerMetrics}>
          <div><small>Meeting time</small><strong>{formatElapsed(elapsed)}</strong></div>
          <div><small>Participants</small><strong>{participants.length}</strong></div>
          <div className={styles.currentSpeaker}><small>Current speaker</small><strong>{active?.name ?? (activeSpeaker === "CEO" ? managerDisplayName : roomState)}</strong><span className={styles.headerWave}>▮▮▮▮▮</span></div>
        </div>
        <div className={styles.headerActions}>
          <button onClick={() => setFocusRoom(true)}>Focus Room</button>
          <button onClick={() => document.documentElement.requestFullscreen?.()} aria-label="Enter fullscreen">⛶</button>
          <button onClick={() => setRailOpen((v) => !v)}>{railOpen ? "Close Notes" : "Notes"}</button>
        </div>
      </header>

      <aside className={styles.leftSidebar}>
        <button className={styles.collapseLeft} onClick={() => setLeftCollapsed((v) => !v)} aria-label="Toggle left menu">{leftCollapsed ? "›" : "‹"}</button>
        <nav className={styles.leftNav}>
          <button className={styles.navActive} onClick={() => setLeftMode("agenda")}><span>◫</span><b>Meeting Room</b></button>
          <button onClick={() => setLeftMode("agenda")}><span>☷</span><b>Agenda</b></button>
          <button onClick={() => { setLeftMode("decisions"); setRailMode("governance"); }}><span>◇</span><b>Key Decisions</b></button>
          <button onClick={() => router.push("/company-library")}><span>▤</span><b>Files & Docs</b></button>
          <button onClick={() => router.push("/command-center")}><span>▥</span><b>Reports</b></button>
          <button onClick={() => router.push("/settings")}><span>⚙</span><b>Settings</b></button>
          <button onClick={() => router.push("/meetings")}><span>↶</span><b>Meeting History</b></button>
        </nav>
        {!leftCollapsed ? <div className={styles.leftPanelContent}>
          {leftMode === "agenda" ? <div className={styles.panelCard}><div className={styles.panelTitle}><strong>Agenda</strong><span>{progressPct}%</span></div><div className={styles.progressBar}><i style={{ width: `${progressPct}%` }} /></div><ol>{agendaItems.map((item, index) => <li key={`${item}-${index}`} className={index === Math.min(agendaItems.length - 1, Math.floor((progressPct / 100) * agendaItems.length)) ? styles.agendaActive : ""}><span>{index + 1}</span><b>{item}</b></li>)}</ol></div> : <div className={styles.panelCard}><div className={styles.panelTitle}><strong>Key Decisions</strong><span>{completed ? "Ready" : "Open"}</span></div><div className={styles.decisionCard}><b>{completed ? "Synthesis available for Human CEO review" : "No final decision yet"}</b><small>{completed ? "Review governance before recording the Human CEO decision." : "The decision remains open while deliberation is running."}</small></div><button className={styles.panelAction} onClick={() => { setRailMode("governance"); setRailOpen(true); }}>Open Governance</button></div>}
        </div> : null}
      </aside>

      <main className={styles.roomStage}>
        <Image src="/api/boardroom-preview-scene" alt="RYTHM executive boardroom" fill priority unoptimized className={styles.roomScene} />
        <div className={styles.screenOverlay}>
          <div className={styles.screenTop}><span>{meetingSlide.eyebrow}</span><span>{slideOffset + 1}/{slideDeck.length}</span></div>
          <h2>{meetingSlide.title}</h2>
          <ul>{meetingSlide.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>
          <footer>{meetingSlide.footer}</footer>
        </div>
        {participants.map((agent, index) => {
          const [x, y] = seatPositions[index % seatPositions.length];
          const speaking = activeSpeaker === agent.agentCode;
          const seatStyle = { "--seat-x": x, "--seat-y": y } as CSSProperties;
          return <button key={agent.id} type="button" className={`${styles.agentSeat} ${speaking ? styles.agentSeatActive : ""}`} style={seatStyle} onClick={() => { setRecipient(agent.agentCode); managerIntervention(); }}>
            <AgentPortrait agentCode={agent.agentCode} avatarUrl={agent.avatarUrl} alt={agent.name} className={styles.seatAvatar} />
            <span><b>{agent.name}</b><small>{agent.roleTitle}</small></span>
            {speaking ? <em>▮▮▮▮</em> : null}
          </button>;
        })}
        <div className={styles.managerSeat}>
          {humanAvatarUrl ? <Image src={humanAvatarUrl} width={42} height={42} alt={managerDisplayName} className={styles.managerAvatar} unoptimized /> : <span className={styles.managerMonogram}>YOU</span>}
          <span><b>{managerDisplayName}</b><small>Meeting Manager · Final authority</small></span>
        </div>
        <div className={styles.stageStatus}><b>{active ? `${active.name} is speaking` : activeSpeaker === "CEO" ? `${managerDisplayName} has the floor` : roomState}</b><span>{lastAgentMessage ? excerpt(lastAgentMessage.content, 170) : progressText || "Boardroom ready for governed deliberation."}</span></div>
        {error ? <div className={styles.stageError}>{error}</div> : null}
        {focusRoom ? <button className={styles.exitFocus} onClick={() => setFocusRoom(false)}>Exit Focus Room</button> : null}
      </main>

      <aside className={styles.rightSidebar}>
        <button className={styles.collapseRight} onClick={() => setRightCollapsed((v) => !v)} aria-label="Toggle participants panel">{rightCollapsed ? "‹" : "›"}</button>
        {!rightCollapsed ? <><div className={styles.participantHeader}><strong>Participants ({participants.length})</strong></div><div className={styles.managerRow}>{humanAvatarUrl ? <Image src={humanAvatarUrl} width={42} height={42} alt={managerDisplayName} className={styles.listAvatar} unoptimized /> : <span className={styles.listMonogram}>YOU</span>}<div><b>{managerDisplayName}</b><small>Human · Meeting Manager</small></div></div><div className={styles.sectionLabel}>AI Agents</div><div className={styles.participantList}>{participants.map((agent) => { const speaking = activeSpeaker === agent.agentCode; return <button key={agent.id} className={speaking ? styles.participantActive : ""} onClick={() => { setRecipient(agent.agentCode); managerIntervention(); }}><AgentPortrait agentCode={agent.agentCode} avatarUrl={agent.avatarUrl} alt={agent.name} className={styles.listAvatar} /><span><b>{agent.name}</b><small>{agent.agentCode} · {agent.roleTitle}</small></span>{speaking ? <em>Speaking</em> : <i />}</button>; })}</div></> : null}
      </aside>

      <footer className={styles.controlDock}>
        <button className={styles.approveAction} onClick={() => { setRailMode("governance"); setRailOpen(true); }}>✓ Approve / Review</button>
        <button className={styles.pauseAction} onClick={pauseAgents} disabled={!running}>Ⅱ Pause</button>
        <button className={styles.interventionAction} onClick={managerIntervention}>◉ Manager Intervention</button>
        <button className={styles.summaryAction} onClick={() => void requestSummary()} disabled={summarizing}>{summarizing ? "Working…" : "▤ Request Summary"}</button>
        <button className={styles.nextAction} onClick={() => void (chairHasFloor ? continueDiscussion() : stepMeeting())} disabled={running || !canRun}>↗ Next Action</button>
        <button className={styles.nextSlideAction} onClick={() => setSlideOffset((v) => (v + 1) % slideDeck.length)}>→ Next Slide</button>
        <button className={styles.endAction} onClick={() => void closeMeeting()} disabled={!awaitingChairClose || chairClosing}>{chairClosing ? "Closing…" : "⌁ End Meeting"}</button>
        <div className={styles.listeningStatus}>✦ RYTHM OS is listening and analyzing <span>▮▮▮▮▮</span></div>
      </footer>
    </div>

    <div className={styles.mobileExperience}>
      <header className={styles.mobileHeader}><button onClick={() => setNavOpen((v) => !v)}>☰</button><div><small>RYTHM BOARDROOM</small><strong>{meetingTitle}</strong></div><button onClick={() => setRailOpen((v) => !v)}>Notes</button></header>
      <div className={styles.mobileGrid}>{participants.map((agent) => { const speaking = activeSpeaker === agent.agentCode; return <article key={agent.id} className={`${styles.mobileParticipant} ${speaking ? styles.mobileParticipantActive : ""}`}><AgentPortrait agentCode={agent.agentCode} avatarUrl={agent.avatarUrl} alt={agent.name} className={styles.mobileAvatar} /><div><b>{agent.name}</b><small>{agent.roleTitle}</small></div></article>; })}<article className={styles.mobileManager}>{humanAvatarUrl ? <Image src={humanAvatarUrl} fill alt={managerDisplayName} className={styles.mobileAvatar} unoptimized /> : <span>YOU</span>}<div><b>{managerDisplayName}</b><small>Meeting Manager</small></div></article></div>
      <div className={styles.mobileControls}><button onClick={() => void stepMeeting()} disabled={!canRun || running}>Step</button><button onClick={() => void (paused ? continueDiscussion() : runMeeting())} disabled={!canRun || running}>{paused ? "Release" : "Play"}</button><button onClick={pauseAgents} disabled={!running}>Pause</button><button onClick={managerIntervention}>Intervene</button><button onClick={() => void closeMeeting()} disabled={!awaitingChairClose || chairClosing}>End</button></div>
    </div>

    {navOpen ? <div className={styles.navDrawerBackdrop} onClick={() => setNavOpen(false)}><nav className={styles.navDrawer} onClick={(e) => e.stopPropagation()}><div><strong>RYTHM Workspace</strong><button onClick={() => setNavOpen(false)}>×</button></div><button onClick={() => router.push("/meetings")}>Meetings</button><button onClick={() => router.push("/command-center")}>Command Center</button><button onClick={() => router.push("/company-library")}>Company Library</button><button onClick={() => router.push("/studio/agents")}>Agent Studio</button><button onClick={() => router.push("/projects")}>Projects</button></nav></div> : null}

    <aside className={`${styles.liveRail} ${railOpen ? styles.liveRailOpen : ""}`}>
      <nav className={styles.railTabs}><button className={railMode === "transcript" ? styles.railTabActive : ""} onClick={() => setRailMode("transcript")}>Live</button><button className={railMode === "summary" ? styles.railTabActive : ""} onClick={() => setRailMode("summary")}>Summary</button><button className={railMode === "governance" ? styles.railTabActive : ""} onClick={() => setRailMode("governance")}>Governance</button><button onClick={() => setRailOpen(false)}>×</button></nav>
      {railMode === "transcript" ? <div className={styles.railScroll}><div className={styles.railTools}><select value={recipient} onChange={(e) => setRecipient(e.target.value)}><option value="ALL">To: Everyone</option>{participants.map((agent) => <option key={agent.id} value={agent.agentCode}>To: {agent.name}</option>)}</select><input ref={ceoInputRef} value={ceoText} onChange={(e) => setCeoText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendCeoContribution(); } }} placeholder="Message, question, challenge or direction…" /><button onClick={() => void sendCeoContribution()} disabled={ceoSending || ceoText.trim().length < 2}>{ceoSending ? "Sending…" : "Send"}</button></div>{latest.length ? latest.map((m, index) => <article key={`${m.turnIndex}-${index}`} className={`${styles.liveMessage} ${m.speakerCode === "CEO" ? styles.liveMessageCeo : ""}`}><div><strong>{m.speakerName}</strong><span>R{m.roundNo}</span></div><p>{m.content}</p></article>) : <p className={styles.railEmpty}>No transcript yet. Use Next Action or Play to begin.</p>}</div> : null}
      {railMode === "summary" ? <div className={styles.railScroll}><div className={styles.railTools}><select value={summaryLanguage} onChange={(e) => setSummaryLanguage(e.target.value)}><option value="__meeting__">Meeting language</option><option value="English">English</option><option value="German">German</option><option value="Hungarian">Hungarian</option><option value="__other__">Other…</option></select>{summaryLanguage === "__other__" ? <input value={customSummaryLanguage} onChange={(e) => setCustomSummaryLanguage(e.target.value)} placeholder="Language" /> : null}<button onClick={() => void requestSummary()} disabled={summarizing || messages.length < 2}>{summarizing ? "Working…" : "Generate summary"}</button></div><div className={styles.summaryPane}>{summary || "No summary generated yet."}</div></div> : null}
      {railMode === "governance" ? <div className={styles.railScroll}><div className={styles.governancePane}><strong>Human CEO authority</strong><p>No Agent can finalize consequential decisions or authorize external actions.</p><strong>Legal triage</strong><p>{legalTriageReason || legalTriage}</p>{legalTriage === "recommended" && !legalReview ? <button onClick={requestLegalReview} disabled={legalReviewRunning}>{legalReviewRunning ? "Running A-106…" : "Run A-106 review"}</button> : null}{legalReview ? <><strong>{legalReview.outcome}</strong><p>{legalReview.executive_note}</p><p>{legalReview.risk_summary}</p></> : null}<p>Budget cap: ${budgetCapUsd.toFixed(2)}</p></div></div> : null}
    </aside>
  </section>;
}
