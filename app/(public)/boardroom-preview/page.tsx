import styles from "./preview.module.css";

const agents = [
  { name: "Daniel Hart", role: "Principal Strategy & Growth", code: "A-101", initials: "DH", side: "left", accent: "sun" },
  { name: "Mira Kovacs", role: "Principal AI Compliance", code: "A-104", initials: "MK", side: "left", accent: "rose" },
  { name: "Avery Morgan", role: "Executive Orchestrator", code: "B-001", initials: "AM", side: "left", accent: "blue" },
  { name: "Noah Bennett", role: "Principal Operations & Transformation", code: "A-102", initials: "NB", side: "right", accent: "steel" },
  { name: "Elias Reed", role: "Principal Research & Intelligence", code: "A-103", initials: "ER", side: "right", accent: "violet" },
];

export const metadata = {
  title: "RYTHM Boardroom Design Preview",
  robots: { index: false, follow: false },
};

function AgentSeat({ agent, speaking = false }: { agent: (typeof agents)[number]; speaking?: boolean }) {
  return (
    <article className={`${styles.agentSeat} ${speaking ? styles.speaking : ""}`}>
      <div className={`${styles.avatar} ${styles[agent.accent]}`}>{agent.initials}</div>
      <div className={styles.agentCopy}>
        <strong>{agent.name}</strong>
        <span>{agent.code} · {agent.role}</span>
        <b>{speaking ? "Speaking" : "Listening"}</b>
      </div>
      {speaking ? <span className={styles.speakerPulse}>●●●</span> : null}
    </article>
  );
}

export default function BoardroomPreviewPage() {
  const left = agents.filter((agent) => agent.side === "left");
  const right = agents.filter((agent) => agent.side === "right");

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brandCluster}>
          <button className={styles.iconButton} aria-label="Menu">☰</button>
          <div>
            <p>RYTHM BOARDROOM · DESIGN PREVIEW</p>
            <h1>AI-PR-001 — Future Strategy and 90-Day Feature Scope</h1>
            <span>Human CEO-led governed multi-Agent deliberation</span>
          </div>
        </div>
        <div className={styles.metrics}>
          <span>LIVE</span>
          <span>06 attendees</span>
          <span>18:42</span>
          <button>Notes</button>
        </div>
      </header>

      <section className={styles.workspace}>
        <aside className={styles.sidePanel}>
          <div className={styles.panelHeader}><span>Agenda</span><b>3 / 4</b></div>
          <ol className={styles.agenda}>
            <li className={styles.done}>Define decision scope</li>
            <li className={styles.done}>Challenge assumptions</li>
            <li className={styles.activeAgenda}>Evaluate 90-day options</li>
            <li>CEO decision & next action</li>
          </ol>
          <div className={styles.divider} />
          <div className={styles.panelHeader}><span>Key decisions</span><b>2</b></div>
          <div className={styles.decisionCard}><strong>Primary direction</strong><p>Controlled Feature Expansion</p></div>
          <div className={styles.decisionCard}><strong>Guardrail</strong><p>Maintain full governance enforcement</p></div>
        </aside>

        <section className={styles.roomScene}>
          <div className={styles.wallGlow} />
          <div className={styles.monitor}>
            <div className={styles.monitorTop}><span>STRATEGY REVIEW · SLIDE 04</span><span>76%</span></div>
            <div className={styles.monitorBody}>
              <small>RECOMMENDED DIRECTION</small>
              <h2>Controlled Feature Expansion for the next 90 days</h2>
              <ul>
                <li>Release in measured waves with explicit governance checkpoints.</li>
                <li>Prioritize user learning velocity over maximum feature breadth.</li>
                <li>Keep Human CEO approval for consequential scope changes.</li>
              </ul>
              <div className={styles.chart}>
                <div><span>Learning velocity</span><i style={{ width: "88%" }} /></div>
                <div><span>Execution risk</span><i style={{ width: "42%" }} /></div>
                <div><span>Governance readiness</span><i style={{ width: "81%" }} /></div>
              </div>
            </div>
            <div className={styles.monitorFooter}><span>AI recommendation is advisory. Human CEO retains final authority.</span><span>4 / 6</span></div>
          </div>

          <div className={styles.roomFloor}>
            <div className={styles.tableShadow} />
            <div className={styles.table}>
              <div className={styles.tableInset}><span>RYTHM</span><strong>Executive Boardroom</strong><small>Governed · Traceable · Human-led</small></div>
            </div>

            <div className={styles.leftSeats}>
              {left.map((agent, index) => <AgentSeat key={agent.code} agent={agent} speaking={index === 0} />)}
            </div>
            <div className={styles.rightSeats}>
              {right.map((agent) => <AgentSeat key={agent.code} agent={agent} />)}
            </div>

            <article className={styles.ceoSeat}>
              <div className={styles.ceoAvatar}>YOU</div>
              <div><strong>Human CEO</strong><span>Chair · Final authority</span><b>In control</b></div>
            </article>
          </div>

          <div className={styles.caption}>
            <span>Daniel Hart speaking</span>
            <p>“The 90-day scope should preserve optionality while forcing measurable learning at each release gate.”</p>
          </div>
        </section>

        <aside className={styles.sidePanelRight}>
          <div className={styles.panelHeader}><span>Participants</span><b>6</b></div>
          <div className={styles.participantList}>
            {[...agents, { name: "Human CEO", code: "YOU", role: "Chair" }].map((person, index) => (
              <div key={person.code} className={styles.participantRow}>
                <span className={index === 0 ? styles.dotSpeaking : styles.dot} />
                <div><strong>{person.name}</strong><small>{person.code} · {person.role}</small></div>
                <b>{index === 0 ? "Speaking" : "Ready"}</b>
              </div>
            ))}
          </div>
          <div className={styles.divider} />
          <div className={styles.systemCard}>
            <span>System status</span>
            <strong>Listening & analyzing</strong>
            <p>Current speaker is being transcribed and routed into the governed meeting context.</p>
          </div>
        </aside>
      </section>

      <footer className={styles.controls}>
        <button className={styles.approve}>✓ <span>Approve</span></button>
        <button>Ⅱ <span>Pause</span></button>
        <button className={styles.takeFloor}>● <span>Take floor</span></button>
        <button>≡ <span>Request summary</span></button>
        <button>→ <span>Next action</span></button>
        <button>▣ <span>Next slide</span></button>
        <button className={styles.end}>■ <span>End meeting</span></button>
      </footer>

      <div className={styles.previewBadge}>STATIC DESIGN PREVIEW · NO LOGIN REQUIRED</div>
    </main>
  );
}
