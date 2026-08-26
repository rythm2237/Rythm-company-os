"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AgentPortrait } from "@/app/components/agent-portrait";
import styles from "./boardroom-immersive.module.css";

type TranscriptMessage = { id?: string; turnIndex: number; roundNo: number; messageType: string; content: string; speakerCode: string; speakerName: string; speakerRole?: string };
type Participant = { id: string; agentCode: string; name: string; roleTitle: string; avatarUrl: string | null; enabled: boolean };
type LegalReview = { id?: string; status?: string; outcome?: string | null; executive_note?: string | null; risk_summary?: string | null; conditions?: unknown; jurisdictions?: unknown; licensed_counsel_required?: boolean; estimated_cost_usd?: number; error_message?: string | null };
type Props = { sessionId: string; meetingStatus: string; initialStatus: string; initialMessages: TranscriptMessage[]; initialError?: string | null; meetingTitle: string; decisionQuestion: string; maxRounds: number; budgetCapUsd: number; participants: Participant[] };
type RailMode = "transcript" | "summary" | "governance";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const excerpt = (value: string, max = 190) => value.replace(/[#*_`>-]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) + (value.length > max ? "…" : "");

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

export default function DeliberationConsole({ sessionId, meetingStatus, initialStatus, initialMessages, initialError, meetingTitle, decisionQuestion, maxRounds, budgetCapUsd, participants }: Props) {
  const router = useRouter();
  const pauseRef = useRef(false);
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
  const [navOpen, setNavOpen] = useState(false);

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
    if (status !== "completed" || meetingState !== "completed") return;
    let cancelled = false;
    (async () => {
      try {
        const triage = await jsonGet(`/api/meetings/legal-triage?sessionId=${encodeURIComponent(sessionId)}`);
        if (cancelled) return;
        let triageStatus = (triage.status ?? "pending") as "pending" | "recommended" | "not_indicated";
        let reason = String(triage.reason ?? "");
        if (triageStatus === "pending") {
          const completed = await jsonPost("/api/meetings/legal-triage", { sessionId });
          triageStatus = (completed.status ?? "pending") as typeof triageStatus;
          reason = String(completed.reason ?? "");
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
  const sendCeoContribution = async () => {
    const text = ceoText.trim(); if (text.length < 2) return;
    setCeoSending(true); setError("");
    try {
      const target = recipient === "ALL" ? "EVERYONE" : recipient;
      const content = `CHAIR MESSAGE TO ${target} — ${text}`;
      const payload = await jsonPost("/api/meetings/ceo-contribute", { sessionId, content });
      setMessages((current) => [...current, { turnIndex: Number(payload.turnIndex ?? current.length + 1), roundNo: Number(payload.roundNo ?? 1), messageType: "ceo_contribution", content: String(payload.content ?? content), speakerCode: "CEO", speakerName: "Human CEO", speakerRole: "Meeting Chair" }]);
      setStatus(String(payload.sessionStatus ?? status)); setCeoText(""); setPaused(true); pauseRef.current = true; setActiveSpeaker("CEO"); setProgressText(`Chair message recorded for ${target}. Select Release floor to let Agents respond.`);
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
  const leftAgents = participants.filter((_, i) => i % 2 === 0);
  const rightAgents = participants.filter((_, i) => i % 2 === 1);
  const meetingSlide = useMemo(() => {
    const synthesis = [...messages].reverse().find((m) => m.messageType === "synthesis");
    const recentChallenges = [...messages].filter((m) => m.messageType === "challenge").slice(-3);
    const recentPositions = [...messages].filter((m) => m.messageType === "position").slice(-3);
    if (synthesis) return { eyebrow: "DECISION BRIEF", title: "Synthesis ready for Human CEO", bullets: synthesis.content.split(/\n+/).filter(Boolean).slice(0, 4).map((x) => excerpt(x, 220)), footer: "AI recommendation is non-binding. Human CEO retains final authority." };
    if (recentChallenges.length) return { eyebrow: `ROUND ${currentRound} · CHALLENGE`, title: "Assumptions under challenge", bullets: recentChallenges.map((m) => `${m.speakerName}: ${excerpt(m.content, 180)}`), footer: "The room is testing risks, evidence and execution constraints." };
    if (recentPositions.length) return { eyebrow: `ROUND ${currentRound} · POSITIONS`, title: "Current executive positions", bullets: recentPositions.map((m) => `${m.speakerName}: ${excerpt(m.content, 180)}`), footer: "Positions update automatically as each governed turn completes." };
    return { eyebrow: "MEETING OBJECTIVE", title: decisionQuestion, bullets: ["Clarify the decision to be made.", "Surface strategic, operational, legal and governance constraints.", "Challenge assumptions before producing a recommendation."], footer: "Press Play to begin the governed deliberation." };
  }, [messages, currentRound, decisionQuestion]);
  const progressDenominator = Math.max(1, participants.length * maxRounds + 1);
  const progressPct = Math.min(100, Math.round((agentTurns / progressDenominator) * 100));

  const ParticipantCard = ({ agent }: { agent: Participant }) => {
    const speaking = activeSpeaker === agent.agentCode;
    return <article className={`${styles.participantCard} ${speaking ? styles.participantCardActive : ""}`}>
      <AgentPortrait agentCode={agent.agentCode} avatarUrl={agent.avatarUrl} alt={agent.name} className={styles.participantAvatar} />
      <div><strong>{agent.name}</strong><span>{agent.agentCode} · {agent.roleTitle}</span><b>{speaking ? "Speaking" : completed ? "Done" : paused ? "Waiting" : running ? "Listening" : "Ready"}</b></div>
    </article>;
  };

  return <section className={styles.immersiveBoardroom} aria-label="RYTHM executive presentation room">
    <header className={styles.controlHeader}>
      <div className={styles.headerLeft}>
        <button className={styles.navTrigger} onClick={() => setNavOpen((v) => !v)} aria-label="Open workspace navigation">☰</button>
        <div className={styles.titleCluster}><span className={styles.liveDot} /><div><p>RYTHM BOARDROOM</p><h2>{meetingTitle}</h2><span>{decisionQuestion}</span></div></div>
      </div>
      <div className={styles.headerMetrics}><span>R{currentRound}/{maxRounds}</span><span>${budgetCapUsd.toFixed(2)} cap</span><span>{chairHasFloor ? "Chair has floor" : paused ? "Paused" : running ? "Running" : completed ? "Synthesis ready" : "Ready"}</span>{chairHasFloor ? <button onClick={continueDiscussion}>Release floor</button> : null}<button onClick={() => setRailOpen((v) => !v)}>{railOpen ? "Close panel" : "Notes"}</button></div>
    </header>

    {navOpen ? <div className={styles.navDrawerBackdrop} onClick={() => setNavOpen(false)}><nav className={styles.navDrawer} onClick={(e) => e.stopPropagation()}><div><strong>RYTHM Workspace</strong><button onClick={() => setNavOpen(false)}>×</button></div><button onClick={() => router.push("/meetings")}>Meetings</button><button onClick={() => router.push("/command-center")}>Command Center</button><button onClick={() => router.push("/company-library")}>Company Library</button><button onClick={() => router.push("/studio/agents")}>Agent Studio</button><button onClick={() => router.push("/projects")}>Projects</button></nav></div> : null}

    <div className={styles.presentationRoom}>
      <aside className={styles.participantRail}>{leftAgents.map((agent) => <ParticipantCard key={agent.id} agent={agent} />)}</aside>
      <main className={styles.presentationStage}>
        <div className={styles.screenFrame}>
          <div className={styles.screenTop}><span>{meetingSlide.eyebrow}</span><span>{progressPct}%</span></div>
          <div className={styles.screenContent}><h1>{meetingSlide.title}</h1><ul>{meetingSlide.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul></div>
          <div className={styles.screenFooter}><span>{meetingSlide.footer}</span><div className={styles.progressTrack}><i style={{ width: `${progressPct}%` }} /></div></div>
        </div>
        <div className={styles.liveCaption}><span>{active ? `${active.agentCode} · ${active.name}` : activeSpeaker === "CEO" ? "Human CEO" : completed ? "Deliberation complete" : paused ? "Meeting paused" : running ? "Preparing next speaker" : "Room ready"}</span><p>{lastAgentMessage ? excerpt(lastAgentMessage.content, 240) : progressText || "The central screen follows the live discussion automatically."}</p></div>
        <div className={styles.ceoCard}><div className={styles.ceoMonogram}>YOU</div><div><strong>Human CEO</strong><span>Chair · Final authority</span><b>{activeSpeaker === "CEO" ? "Speaking" : "In control"}</b></div></div>
        {error ? <div className={styles.stageError}>{error}</div> : null}
      </main>
      <aside className={styles.participantRail}>{rightAgents.map((agent) => <ParticipantCard key={agent.id} agent={agent} />)}</aside>
    </div>

    <aside className={`${styles.liveRail} ${railOpen ? styles.liveRailOpen : ""}`}>
      <nav className={styles.railTabs}><button className={railMode === "transcript" ? styles.railTabActive : ""} onClick={() => setRailMode("transcript")}>Live</button><button className={railMode === "summary" ? styles.railTabActive : ""} onClick={() => setRailMode("summary")}>Summary</button><button className={railMode === "governance" ? styles.railTabActive : ""} onClick={() => setRailMode("governance")}>Governance</button></nav>
      {railMode === "transcript" ? <div className={styles.railScroll}>{latest.length ? latest.map((m, index) => <article key={`${m.turnIndex}-${index}`} className={`${styles.liveMessage} ${m.speakerCode === "CEO" ? styles.liveMessageCeo : ""}`}><div><strong>{m.speakerCode} · {m.speakerName}</strong><span>R{m.roundNo}</span></div><p>{m.content}</p></article>) : <p className={styles.railEmpty}>Press Play or Step to begin the governed deliberation.</p>}</div> : null}
      {railMode === "summary" ? <div className={styles.railScroll}><div className={styles.railTools}><select value={summaryLanguage} onChange={(e) => setSummaryLanguage(e.target.value)}><option value="__meeting__">Meeting language</option><option value="Persian">Persian</option><option value="English">English</option><option value="German">German</option><option value="Hungarian">Hungarian</option><option value="__other__">Other…</option></select>{summaryLanguage === "__other__" ? <input value={customSummaryLanguage} onChange={(e) => setCustomSummaryLanguage(e.target.value)} placeholder="Language" /> : null}<button onClick={requestSummary} disabled={summarizing || messages.length < 2}>{summarizing ? "Working…" : "Generate summary"}</button></div><div className={styles.summaryPane}>{summary || "No summary generated yet."}</div></div> : null}
      {railMode === "governance" ? <div className={styles.railScroll}><div className={styles.governancePane}><strong>Human CEO authority</strong><p>No Agent can finalize consequential decisions or authorize external actions.</p><strong>Legal triage</strong><p>{legalTriageReason || legalTriage}</p>{legalTriage === "recommended" && !legalReview ? <button onClick={requestLegalReview} disabled={legalReviewRunning}>{legalReviewRunning ? "Running A-106…" : "Run A-106 review"}</button> : null}{legalReview ? <><strong>{legalReview.outcome}</strong><p>{legalReview.executive_note}</p><p>{legalReview.risk_summary}</p></> : null}</div></div> : null}
    </aside>

    <div className={styles.commandDock}>
      <div className={styles.transportControls}><button className={styles.transportButton} onClick={() => void stepMeeting()} disabled={!canRun || running} title="Run one Agent turn">▌▶<span>Step</span></button><button className={`${styles.transportButton} ${styles.playButton}`} onClick={() => void (paused ? continueDiscussion() : runMeeting())} disabled={!canRun || running} title={paused ? "Release the floor to Agents" : "Run deliberation"}>▶<span>{paused ? "Release" : "Play"}</span></button><button className={styles.transportButton} onClick={pauseAgents} disabled={!running} title="Pause at safe boundary">Ⅱ<span>Pause</span></button></div>
      <div className={styles.messageComposer}><select value={recipient} onChange={(e) => setRecipient(e.target.value)}><option value="ALL">To: Everyone</option>{participants.map((agent) => <option key={agent.id} value={agent.agentCode}>To: {agent.agentCode}</option>)}</select><input value={ceoText} onChange={(e) => setCeoText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendCeoContribution(); } }} placeholder="Message, question, challenge or direction…" /><button onClick={() => void sendCeoContribution()} disabled={ceoSending || ceoText.trim().length < 2}>{ceoSending ? "…" : "Send"}</button></div>
      <button className={styles.endControl} onClick={() => void closeMeeting()} disabled={!awaitingChairClose || chairClosing}>{chairClosing ? "Closing…" : "End meeting"}</button>
    </div>
  </section>;
}