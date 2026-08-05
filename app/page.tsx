import { getRuntimeConfig } from "@/lib/runtime-config";

const modules = [
  { name: "Executive Orchestrator", status: "Specification approved", code: "B-001" },
  { name: "Company Memory", status: "Database migration ready", code: "CORE-02" },
  { name: "Approvals", status: "Database migration ready", code: "CORE-03" },
  { name: "Meetings", status: "Database migration ready", code: "CORE-04" },
  { name: "Decisions", status: "Database migration ready", code: "CORE-05" },
  { name: "Audit & Agent Runs", status: "Database migration ready", code: "CORE-06" },
];

export default function HomePage() {
  const config = getRuntimeConfig();
  const checks = [
    ["Vercel runtime", "Ready"],
    ["Supabase connection", config.supabaseConfigured ? "Configured" : "Needs environment variables"],
    ["OpenAI connection", config.openAIConfigured ? "Configured" : "Not configured"],
    ["Agent execution", config.agentExecutionEnabled ? "Enabled" : "Safely disabled"],
    ["External actions", config.externalActionsEnabled ? "Enabled" : "Safely disabled"],
  ];

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">RYTHM COMPANY OS</p>
          <h1>Executive Command Center</h1>
          <p className="subtitle">
            Governed coordination for company memory, decisions, meetings, approvals, and AI agents.
          </p>
        </div>
        <div className="authority">
          <span>Human authority</span>
          <strong>CEO approval required</strong>
        </div>
      </header>

      <section className="statusPanel" aria-label="Runtime readiness">
        <div>
          <p className="label">Implementation stage</p>
          <h2>Company Core foundation</h2>
          <p>Database and governance contracts are ready for migration. B-001 remains non-autonomous.</p>
        </div>
        <div className="readiness">Phase 1</div>
      </section>

      <section className="contentGrid">
        <div className="moduleArea">
          <div className="sectionHeading">
            <div>
              <p className="label">Core modules</p>
              <h2>Operational foundation</h2>
            </div>
            <span className="pill">External writes locked</span>
          </div>
          <div className="grid">
            {modules.map((module) => (
              <article className="card" key={module.code}>
                <span>{module.code}</span>
                <h3>{module.name}</h3>
                <p>{module.status}</p>
              </article>
            ))}
          </div>
        </div>

        <aside className="checklist">
          <p className="label">Runtime checks</p>
          <h2>Connection status</h2>
          <div className="checkRows">
            {checks.map(([name, status]) => (
              <div className="checkRow" key={name}>
                <span>{name}</span>
                <strong>{status}</strong>
              </div>
            ))}
          </div>
          <a className="healthLink" href="/api/health">View health endpoint</a>
        </aside>
      </section>

      <footer>
        <span>Specification lineage: Foundation v1.0 → B-001 v1.0 → Core Runtime v1.0</span>
        <span>AI budget guardrail: ${config.monthlyAiBudgetUsd}/month</span>
      </footer>
    </main>
  );
}
