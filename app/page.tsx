const modules = [
  "Executive Orchestrator",
  "Company Memory",
  "Approvals",
  "Meetings",
  "Decisions",
  "Audit Log",
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">RYTHM COMPANY OS</p>
        <h1>Governed AI operations for modern companies.</h1>
        <p className="subtitle">
          The initial runtime is being built around human authority, explainable decisions,
          shared organizational memory, and auditable agent workflows.
        </p>
      </section>

      <section className="grid" aria-label="Initial RYTHM modules">
        {modules.map((module) => (
          <article className="card" key={module}>
            <span>Foundation module</span>
            <h2>{module}</h2>
            <p>Specification ready. Runtime implementation pending.</p>
          </article>
        ))}
      </section>
    </main>
  );
}
