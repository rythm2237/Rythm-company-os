import Link from "next/link";

type BriefInput = {
  projectId: string;
  objective: string | null;
  readiness: { execution_readiness?: number | null; evidence?: unknown; risks?: unknown; required_connections?: unknown };
  team: Array<{ assignment_role: string; agents: unknown }>;
  clarifications: Array<{ question: string; materiality: string }>;
  assumptions: unknown;
};

function items(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function description(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  return [row.title, row.name, row.provider, row.reason, row.description].filter(part => typeof part === "string" && part.trim()).join(" · ");
}
function Section({ title, values, empty }: { title: string; values: unknown[]; empty: string }) {
  return <div><strong>{title}</strong>{values.length ? <ul>{values.slice(0, 6).map((value, index) => <li key={index}>{description(value) || "Details available in the project record"}</li>)}</ul> : <p className="subtitle">{empty}</p>}</div>;
}

export default function ProjectAnalysisBrief({ projectId, objective, readiness, team, clarifications, assumptions }: BriefInput) {
  const evidence = readiness.evidence && typeof readiness.evidence === "object" ? readiness.evidence as Record<string, unknown> : {};
  const members = team.map(row => {
    const agent = Array.isArray(row.agents) ? row.agents[0] : row.agents;
    const member = agent && typeof agent === "object" ? agent as Record<string, unknown> : {};
    return String(member.display_name || member.name || row.assignment_role);
  });
  return <section className="panel project-view-panel" aria-labelledby="analysis-brief-title">
    <div className="panel-heading"><div><p className="label">Executive brief</p><h2 id="analysis-brief-title">What RYTHM understood</h2></div><span className="pill">Analysis · {readiness.execution_readiness ?? 0}% ready</span></div>
    <p className="subtitle">{typeof evidence.understanding_summary === "string" ? evidence.understanding_summary : objective || "Review the project objective."}</p>
    <div className="executive-grid">
      <Section title="Desired outcome" values={objective ? [objective] : []} empty="No outcome recorded." />
      <Section title="Proposed roadmap" values={items(evidence.plan_outline)} empty="Create the manager-reviewed execution roadmap before starting work." />
      <Section title="Project team" values={members} empty="No company agents assigned by analysis." />
      <Section title="Required connections" values={items(readiness.required_connections)} empty="No required connection identified." />
      <Section title="Important assumptions" values={items(assumptions)} empty="No assumptions recorded in the current scope." />
      <Section title="Risks" values={items(readiness.risks)} empty="No risk recorded by the latest analysis." />
      <Section title="Decisions needed" values={clarifications.map(item => item.question)} empty="No material clarification currently open." />
      <div><strong>Estimated cost</strong><p className="subtitle">Not estimated by Project Analysis. Review budgets and governed external actions before approval.</p></div>
    </div>
    <Link className="secondary-button" href={`/projects/operating?project=${encodeURIComponent(projectId)}&view=agents`}>Review assigned team</Link>
  </section>;
}
