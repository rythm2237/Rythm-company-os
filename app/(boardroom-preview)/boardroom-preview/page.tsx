"use client";

import { Button } from "@/components/ui/Button";

import { useState } from "react";
import styles from "./preview.module.css";

const agents = [
  ["Ava", "Market Analyst", true],
  ["Sara", "Strategist", false],
  ["Ryan", "Financial Analyst", false],
  ["Ken", "Product Engineer", false],
  ["Dina", "Data Lead", false],
] as const;

export default function BoardroomPreviewPage() {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [focusRoom, setFocusRoom] = useState(false);
  const [notice, setNotice] = useState("Live meeting preview");

  const run = (label: string) => setNotice(`${label} selected`);
  const toggleFocus = () => setFocusRoom((v) => !v);
  const enterFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      setNotice("Fullscreen is not available in this browser context");
    }
  };

  return (
    <main className={`${styles.shell} ${focusRoom ? styles.focusRoom : ""} ${!leftOpen ? styles.leftClosed : ""} ${!rightOpen ? styles.rightClosed : ""}`}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <img src="/brand/logo-navbar-inverse.svg" alt="RYTHM Company OS" />
        </div>
        <div className={styles.meetingTitle}>
          <strong>Q3 Strategy Meeting</strong><span>● Live</span>
        </div>
        <div className={styles.metrics}>
          <div><small>Meeting time</small><strong>00:24:37</strong></div>
          <div><small>Participants</small><strong>6</strong></div>
          <div className={styles.speakerMetric}><small>Current speaker</small><strong>Market Analyst (Ava)</strong><span className={styles.wave}>▮▮▮▮▮</span></div>
        </div>
        <div className={styles.headerActions}>
          <Button onClick={toggleFocus} title="Focus room">{focusRoom ? "Exit Focus" : "Focus Room"}</Button>
          <Button onClick={enterFullscreen} title="Fullscreen">⛶</Button>
          <Button className={styles.managerChip}><span className={styles.avatarMini}>YO</span><span><small>Meeting manager</small><strong>You</strong></span></Button>
        </div>
      </header>

      <aside className={styles.leftPanel}>
        <Button className={styles.collapseButton} onClick={() => setLeftOpen((v) => !v)} title={leftOpen ? "Collapse left panel" : "Expand left panel"}>{leftOpen ? "‹" : "›"}</Button>
        <nav className={styles.nav}>
          <Button className={styles.navActive}>⌂ <span>Meeting Room</span></Button>
          <Button>☷ <span>Agenda</span></Button>
          <Button>⌘ <span>Key Decisions</span></Button>
          <Button>□ <span>Files & Docs</span></Button>
          <Button>◔ <span>Reports</span></Button>
          <Button>⚙ <span>Settings</span></Button>
          <Button>↶ <span>Meeting History</span></Button>
        </nav>
        <section className={styles.panelCard}>
          <div className={styles.cardHeader}><strong>Agenda</strong><span>60%</span></div>
          <div className={styles.progress}><i /></div>
          <ol className={styles.agenda}>
            <li className={styles.done}>Q2 performance review <span>✓</span></li>
            <li className={styles.active}>Market trends analysis <span>20:00</span></li>
            <li>Growth opportunities</li>
            <li>Decision & prioritization</li>
            <li>Next steps & actions</li>
          </ol>
        </section>
        <section className={styles.panelCard}>
          <div className={styles.cardHeader}><strong>Key Decisions</strong><span>2</span></div>
          <div className={styles.decisionApproved}><strong>Focus on Middle East market</strong><small>Approved · 5 of 6</small></div>
          <div className={styles.decisionPending}><strong>Allocate marketing budget</strong><small>Awaiting approval</small></div>
        </section>
      </aside>

      <section className={styles.roomStage}>
        {/* The approved scene is intentionally served as an unchanged static binary. */}
        <img className={styles.roomPhoto} src="/boardroom/boardroom-room-8bf0f8f2.png" alt="Executive boardroom with conference table, chairs, meeting participants and presentation screen" />

        <div className={styles.presentation}>
          <div><small>RYTHM OS · STRATEGY REVIEW</small><h2>Market Analysis & Key Trends</h2></div>
          <div className={styles.slideBody}>
            <ul><li>18% target market growth</li><li>Rising demand for smart products</li><li>Regional expansion opportunities</li><li>Stronger customer insight required</li></ul>
            <div className={styles.chart}><i /><i /><i /></div>
          </div>
          <footer><span>Decision Brief</span><span>2 / 5</span></footer>
        </div>

        <div className={`${styles.agentTag} ${styles.sara}`}><b>Sara</b><span>Strategist</span></div>
        <div className={`${styles.agentTag} ${styles.ryan}`}><b>Ryan</b><span>Financial Analyst</span></div>
        <div className={`${styles.agentTag} ${styles.ava}`}><b>Ava</b><span>Market Analyst · Speaking</span><em>▮▮▮▮▮</em></div>
        <div className={`${styles.agentTag} ${styles.ken}`}><b>Ken</b><span>Product Engineer</span></div>
        <div className={`${styles.agentTag} ${styles.dina}`}><b>Dina</b><span>Data Lead</span></div>
        <div className={styles.ceoTag}><b>Meeting Manager</b><span>You · Human CEO</span></div>

        <div className={styles.roomToolbar}>
          <Button onClick={() => setLeftOpen((v) => !v)} title="Toggle left panel">☰</Button>
          <Button onClick={toggleFocus} title="Focus room">◫</Button>
          <Button onClick={enterFullscreen} title="Fullscreen">⛶</Button>
          <Button onClick={() => setRightOpen((v) => !v)} title="Toggle participants">👥</Button>
        </div>
      </section>

      <aside className={styles.rightPanel}>
        <Button className={styles.collapseButtonRight} onClick={() => setRightOpen((v) => !v)} title={rightOpen ? "Collapse participants" : "Expand participants"}>{rightOpen ? "›" : "‹"}</Button>
        <div className={styles.participantHeader}><strong>Participants (6)</strong><Button onClick={() => run("Invite participant")}>＋</Button></div>
        <div className={styles.humanRow}><span className={styles.avatar}>YO</span><div><strong>Meeting Manager</strong><small>Human · Final authority</small></div></div>
        <div className={styles.sectionLabel}>AI Agents</div>
        {agents.map(([name, role, speaking]) => (
          <div key={name} className={`${styles.personRow} ${speaking ? styles.speaking : ""}`}>
            <span className={styles.avatar}>{name.slice(0, 2).toUpperCase()}</span>
            <div><strong>{role}</strong><small>{name} · AI Agent</small></div>
            {speaking ? <b>Speaking</b> : <span className={styles.onlineDot} />}
          </div>
        ))}
        <Button className={styles.invite} onClick={() => run("Invite participant")}>＋ Invite participant</Button>
      </aside>

      <footer className={styles.controls}>
        <Button className={styles.approve} onClick={() => run("Approve")}>✓ Approve</Button>
        <Button className={styles.pause} onClick={() => run("Pause")}>Ⅱ Pause</Button>
        <Button className={styles.intervene} onClick={() => run("Manager Intervention")}>♙ Manager Intervention</Button>
        <Button onClick={() => run("Request Summary")}>▤ Request Summary</Button>
        <Button className={styles.nextAction} onClick={() => run("Next Action")}>↗ Next Action</Button>
        <Button className={styles.nextSlide} onClick={() => run("Next Slide")}>→ Next Slide</Button>
        <Button className={styles.end} onClick={() => run("End Meeting")}>⌁ End Meeting</Button>
        <div className={styles.status}>✦ {notice}</div>
      </footer>
    </main>
  );
}
