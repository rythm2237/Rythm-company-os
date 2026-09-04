import styles from "./preview.module.css";

const people = [
  { name: "Ava", title: "Market Analyst", initials: "AV", active: true },
  { name: "Sara", title: "Strategist", initials: "SA" },
  { name: "Ryan", title: "Financial Analyst", initials: "RY" },
  { name: "Ken", title: "Product Engineer", initials: "KE" },
  { name: "Dina", title: "Data Lead", initials: "DI" },
];

export const metadata = {
  title: "RYTHM Boardroom — Visual Preview",
  robots: { index: false, follow: false },
};

function Avatar({ initials, active = false }: { initials: string; active?: boolean }) {
  return <span className={`${styles.avatar} ${active ? styles.avatarActive : ""}`}>{initials}</span>;
}

export default function BoardroomPreviewPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.logo}><span className={styles.logoMark}>R</span><strong>Rythm</strong><span>OS</span></div>
        <div className={styles.meetingChip}><span className={styles.clockIcon}>◷</span><strong>Q3 Strategy Meeting</strong><b>● Live</b></div>
        <div className={styles.topMetrics}>
          <div><small>Meeting time</small><strong>00:24:37</strong></div>
          <div><small>Participants</small><strong>6</strong></div>
          <div className={styles.speakerMetric}><span className={styles.wave}>▮▮▮▮▮▮▮</span><div><small>Current speaker</small><strong>Market Analyst (Ava)</strong></div><Avatar initials="AV" active /></div>
        </div>
        <div className={styles.topActions}><button>♢</button><button>⚙</button><button className={styles.managerButton}><Avatar initials="YO" /><span><small>Meeting manager</small><strong>You</strong></span><b>⌄</b></button></div>
      </header>

      <aside className={styles.nav}>
        <button className={styles.navActive}>⌂ <span>Meeting Room</span></button>
        <button>▣ <span>Agenda</span></button>
        <button>⌘ <span>Key Decisions</span></button>
        <button>□ <span>Files & Docs</span></button>
        <button>◔ <span>Reports</span></button>
        <button>⚙ <span>Settings</span></button>
        <button>↶ <span>Meeting History</span></button>
        <div className={styles.navBottom}><div><span className={styles.logoMarkSmall}>R</span><strong>Rythm OS</strong><span>AI</span></div><small>Version 2.4.1</small><p><i /> All systems active</p></div>
      </aside>

      <section className={styles.leftRail}>
        <div className={styles.card}>
          <div className={styles.cardTitle}><strong>Agenda</strong><span>60%</span></div>
          <div className={styles.progress}><i /></div>
          <ol className={styles.agendaList}>
            <li className={styles.agendaDone}><b>1</b><span>Q2 performance review</span><small>10:00</small><em>✓</em></li>
            <li className={styles.agendaActive}><b>2</b><span>Market trends analysis</span><small>20:00</small><em>●</em></li>
            <li><b>3</b><span>Growth opportunities</span><small>20:00</small></li>
            <li><b>4</b><span>Decision & prioritization</span><small>15:00</small></li>
            <li><b>5</b><span>Next steps & actions</span><small>10:00</small></li>
          </ol>
        </div>

        <div className={styles.card}>
          <div className={styles.cardTitle}><strong>Key Decisions</strong><span className={styles.badge}>2</span></div>
          <div className={`${styles.decision} ${styles.decisionApproved}`}><div><span>✓</span><strong>Focus on Middle East market</strong></div><small>Approved · 5 of 6</small><b>Approved</b></div>
          <div className={styles.decision}><div><span>○</span><strong>Allocate marketing budget</strong></div><small>Awaiting approval</small></div>
          <button className={styles.viewAll}>View all</button>
        </div>
      </section>

      <section className={styles.room}>
        <div className={styles.windowGlow} />
        <div className={styles.wallLeft} />
        <div className={styles.wallRight} />
        <div className={styles.plant}>♧</div>
        <div className={styles.screen}>
          <div className={styles.slide}>
            <h2>Market Analysis & Key Trends</h2>
            <div className={styles.slideGrid}>
              <ul>
                <li>18% target market growth</li>
                <li>Rising demand for smart products</li>
                <li>Regional expansion opportunities</li>
                <li>Need for stronger customer insight</li>
              </ul>
              <div className={styles.chartBox}><small>Revenue growth</small><div className={styles.bars}><i style={{height:"42%"}} /><i style={{height:"62%"}} /><i style={{height:"82%"}} /></div><div className={styles.chartLabels}><span>2023</span><span>2024</span><span>2025</span></div></div>
            </div>
            <footer><span>Rythm OS</span><small>2 / 5</small></footer>
          </div>
        </div>

        <div className={styles.tableShadow} />
        <div className={styles.table}><div className={styles.tableCenter} /></div>
        <div className={styles.camera}>●</div>
        <div className={styles.laptop}>▦</div>
        <div className={styles.mug}>◉</div>

        <div className={`${styles.seat} ${styles.seatSara}`}><Avatar initials="SA" /><div><strong>Strategist (Sara)</strong><small>AI Agent</small></div></div>
        <div className={`${styles.seat} ${styles.seatRyan}`}><Avatar initials="RY" /><div><strong>Financial Analyst (Ryan)</strong><small>AI Agent</small></div></div>
        <div className={`${styles.seat} ${styles.seatAva}`}><Avatar initials="AV" active /><div><strong>Market Analyst (Ava)</strong><small>AI Agent</small></div><span className={styles.speechWave}>▮▮▮▮▮▮</span></div>
        <div className={`${styles.seat} ${styles.seatKen}`}><Avatar initials="KE" /><div><strong>Product Engineer (Ken)</strong><small>AI Agent</small></div></div>
        <div className={`${styles.seat} ${styles.seatDina}`}><Avatar initials="DI" /><div><strong>Data Lead (Dina)</strong><small>AI Agent</small></div></div>

        <div className={styles.ceoBody}><div className={styles.shoulders} /><div className={styles.head} /></div>
        <div className={styles.ceoLabel}><strong>Meeting Manager (You)</strong><span>●</span></div>
      </section>

      <aside className={styles.participants}>
        <div className={styles.participantHeader}><strong>Participants (6)</strong><button>✣</button></div>
        <div className={styles.humanRow}><Avatar initials="YO" /><div><strong>Meeting Manager (You)</strong><small>Human</small></div></div>
        <div className={styles.sectionLabel}>AI Agents</div>
        {people.map((p) => <div className={`${styles.personRow} ${p.active ? styles.personActive : ""}`} key={p.name}><Avatar initials={p.initials} active={p.active} /><div><strong>{p.title} ({p.name})</strong><small>AI Agent</small></div>{p.active ? <><b>Speaking</b><span className={styles.sideWave}>▮▮▮</span></> : null}</div>)}
        <button className={styles.invite}>Invite participant <span>♙</span></button>
      </aside>

      <footer className={styles.controls}>
        <button className={styles.approve}>Approve <span>✓</span></button>
        <button className={styles.pause}>Pause <span>Ⅱ</span></button>
        <button className={styles.intervene}>Manager Intervention <span>♙</span></button>
        <button className={styles.summary}>Request Summary <span>▤</span></button>
        <button className={styles.nextAction}>Next Action <span>↗</span></button>
        <button className={styles.nextSlide}>Next Slide <span>→</span></button>
        <button className={styles.end}>End Meeting <span>⌁</span></button>
        <div className={styles.listening}>✦ Rythm OS is listening and analyzing… <span>▮▮▮▮▮</span></div>
      </footer>
    </main>
  );
}
