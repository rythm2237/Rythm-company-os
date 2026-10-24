import Link from "next/link";
import { ProjectContextCorrection } from "@/components/projects/project-context-correction";

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
  const diagnosis = evidence.diagnosis && typeof evidence.diagnosis === "object" ? evidence.diagnosis as Record<string, unknown> : {};
  const context = evidence.business_context && typeof evidence.business_context === "object" ? evidence.business_context as Record<string, unknown> : {};
  const claims = items(context.claims).filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"));
  const sources = items(context.sources).filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"));
  const members = team.map(row => {
    const agent = Array.isArray(row.agents) ? row.agents[0] : row.agents;
    const member = agent && typeof agent === "object" ? agent as Record<string, unknown> : {};
    return String(member.display_name || member.name || row.assignment_role);
  });
  return <section className="panel project-view-panel" aria-labelledby="analysis-brief-title">
    <div className="panel-heading"><div><p className="label">Executive brief</p><h2 id="analysis-brief-title">What RYTHM understood</h2></div><span className="pill">Analysis · {readiness.execution_readiness ?? 0}% ready</span></div>
    <p className="subtitle">{typeof evidence.understanding_summary === "string" ? evidence.understanding_summary : objective || "Review the project objective."}</p>
    {typeof diagnosis.proposedProblemDefinition === "string" ? <div className="security-note"><strong>Proposed problem definition · {diagnosis.planKind === "discovery" ? "Discovery Plan needed" : "Delivery planning"}</strong><p>{diagnosis.proposedProblemDefinition}</p><p>Diagnosis is provisional until the scoped roadmap is reviewed. Contractual changes and protected access need separate authorization.</p></div> : null}
    {claims.length ? <details><summary>Business context, sources and uncertainty</summary><div className="data-list">{claims.map((claim, index) => <div className="data-row" key={index}><div><strong>{String(claim.key).replaceAll("_", " ")}</strong><span>{String(claim.value)}</span><small>{String(claim.status)} · {items(claim.sourceIds).map(String).join(", ") || "No supporting source"}</small></div></div>)}</div><p className="security-note">Sources describe recorded context, not independent verification. External research: {String(context.externalResearch ?? "not performed").replaceAll("_", " ")}.</p><ul>{sources.map((source, index) => <li key={index}>{String(source.id)} · {String(source.kind)} · {String(source.verification)} · {typeof source.recordedAt === "string" ? source.recordedAt : "Date not recorded"}</li>)}</ul></details> : null}
    <div className="executive-grid">
      <Section title="Competing root-cause hypotheses" values={items(diagnosis.hypotheses).map(value => value && typeof value === "object" ? String((value as Record<string,unknown>).explanation ?? "") : "")} empty="No competing hypothesis recorded; review the proportional discovery findings." />
      <Section title="Remaining uncertainties" values={items(diagnosis.uncertainties)} empty="No uncertainty recorded. This alone does not verify the diagnosis." />
      <Section title="Proposed success measures" values={items(diagnosis.successMetrics)} empty="Define measurable success in roadmap review." />
      <Section title="Desired outcome" values={objective ? [objective] : []} empty="No outcome recorded." />
      <Section title="Proposed roadmap" values={items(evidence.plan_outline)} empty="Create the manager-reviewed execution roadmap before starting work." />
      <Section title="Project team" values={members} empty="No company agents assigned by analysis." />
      <Section title="Required connections" values={items(readiness.required_connections)} empty="No required connection identified." />
      <Section title="Important assumptions" values={items(assumptions)} empty="No assumptions recorded in the current scope." />
      <Section title="Risks" values={items(readiness.risks)} empty="No risk recorded by the latest analysis." />
      <Section title="Decisions needed" values={clarifications.map(item => item.question)} empty="No material clarification currently open." />
      <div><strong>Estimated cost</strong><p className="subtitle">Not estimated by Project Analysis. Review budgets and governed external actions before approval.</p></div>
    </div>
    <ProjectContextCorrection projectId={projectId}/>
    <Link className="secondary-button" href={`/projects/operating?project=${encodeURIComponent(projectId)}&view=agents`}>Review assigned team</Link>
  </section>;
}
