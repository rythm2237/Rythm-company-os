"use client";

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
          <button onClick={toggleFocus} title="Focus room">{focusRoom ? "Exit Focus" : "Focus Room"}</button>
          <button onClick={enterFullscreen} title="Fullscreen">⛶</button>
          <button className={styles.managerChip}><span className={styles.avatarMini}>YO</span><span><small>Meeting manager</small><strong>You</strong></span></button>
        </div>
      </header>

      <aside className={styles.leftPanel}>
        <button className={styles.collapseButton} onClick={() => setLeftOpen((v) => !v)} title={leftOpen ? "Collapse left panel" : "Expand left panel"}>{leftOpen ? "‹" : "›"}</button>
        <nav className={styles.nav}>
          <button className={styles.navActive}>⌂ <span>Meeting Room</span></button>
          <button>☷ <span>Agenda</span></button>
          <button>⌘ <span>Key Decisions</span></button>
          <button>□ <span>Files & Docs</span></button>
          <button>◔ <span>Reports</span></button>
          <button>⚙ <span>Settings</span></button>
          <button>↶ <span>Meeting History</span></button>
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
        <img className={styles.roomPhoto} src="/boardroom-room-final.webp" alt="Executive boardroom with conference table, chairs, human meeting manager and presentation screen" />

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
          <button onClick={() => setLeftOpen((v) => !v)} title="Toggle left panel">☰</button>
          <button onClick={toggleFocus} title="Focus room">◫</button>
          <button onClick={enterFullscreen} title="Fullscreen">⛶</button>
          <button onClick={() => setRightOpen((v) => !v)} title="Toggle participants">👥</button>
        </div>
      </section>

      <aside className={styles.rightPanel}>
        <button className={styles.collapseButtonRight} onClick={() => setRightOpen((v) => !v)} title={rightOpen ? "Collapse participants" : "Expand participants"}>{rightOpen ? "›" : "‹"}</button>
        <div className={styles.participantHeader}><strong>Participants (6)</strong><button onClick={() => run("Invite participant")}>＋</button></div>
        <div className={styles.humanRow}><span className={styles.avatar}>YO</span><div><strong>Meeting Manager</strong><small>Human · Final authority</small></div></div>
        <div className={styles.sectionLabel}>AI Agents</div>
        {agents.map(([name, role, speaking]) => (
          <div key={name} className={`${styles.personRow} ${speaking ? styles.speaking : ""}`}>
            <span className={styles.avatar}>{name.slice(0, 2).toUpperCase()}</span>
            <div><strong>{role}</strong><small>{name} · AI Agent</small></div>
            {speaking ? <b>Speaking</b> : <span className={styles.onlineDot} />}
          </div>
        ))}
        <button className={styles.invite} onClick={() => run("Invite participant")}>＋ Invite participant</button>
      </aside>

      <footer className={styles.controls}>
        <button className={styles.approve} onClick={() => run("Approve")}>✓ Approve</button>
        <button className={styles.pause} onClick={() => run("Pause")}>Ⅱ Pause</button>
        <button className={styles.intervene} onClick={() => run("Manager Intervention")}>♙ Manager Intervention</button>
        <button onClick={() => run("Request Summary")}>▤ Request Summary</button>
        <button className={styles.nextAction} onClick={() => run("Next Action")}>↗ Next Action</button>
        <button className={styles.nextSlide} onClick={() => run("Next Slide")}>→ Next Slide</button>
        <button className={styles.end} onClick={() => run("End Meeting")}>⌁ End Meeting</button>
        <div className={styles.status}>✦ {notice}</div>
      </footer>
    </main>
  );
}
