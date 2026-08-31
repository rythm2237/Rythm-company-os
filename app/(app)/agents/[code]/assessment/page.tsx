import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganizationContext } from "@/lib/auth/organization-context";
import { getProfessionalAssessmentSummary } from "@/lib/agent-professional-assessment";
import { getAgencySpecialistAssessmentSummary, isAgencySpecialistRole } from "@/lib/agency-specialist-assessment";
import { runProfessionalBenchmark } from "./actions";

export const dynamic = "force-dynamic";

function value(input: unknown, fallback = "0") {
  return input == null ? fallback : String(input);
}

function readinessLine(readiness: any) {
  if (!readiness) return "Not available";
  if (readiness.eligible) return "Eligible now";
  const gaps: string[] = [];
  if (!readiness.level_sequence_valid) gaps.push("complete the previous professional level first");
  if (Number(readiness.evaluation_count ?? 0) < Number(readiness.minimum_evaluations ?? 0)) gaps.push(`${readiness.minimum_evaluations} completed evaluations required`);
  if (Number(readiness.average_score ?? 0) < Number(readiness.minimum_average_score ?? 0)) gaps.push(`average score ≥ ${readiness.minimum_average_score}`);
  if (readiness.holdout_required && Number(readiness.holdout_pass_count ?? 0) < 1) gaps.push("holdout pass required");
  if (readiness.adversarial_required && Number(readiness.adversarial_pass_count ?? 0) < 1) gaps.push("adversarial pass required");
  if (Number(readiness.validated_experience_count ?? 0) < Number(readiness.minimum_validated_experience ?? 0)) gaps.push(`${readiness.minimum_validated_experience} validated real-world experience events required`);
  if (Number(readiness.governance_violation_count ?? 0) > 0) gaps.push("governance record must be clean");
  return gaps.length ? gaps.join(" · ") : "Evidence gate not yet met";
}

export default async function AgentProfessionalAssessment({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const { supabase, organizationId, role } = await requireOrganizationContext();
  const { data: agent } = await supabase
    .from("agents")
    .select("id,agent_code,display_name,name,role_title,canonical_role,role_family,enabled")
    .eq("organization_id", organizationId)
    .ilike("agent_code", code)
    .maybeSingle();
  if (!agent) notFound();

  const summary = isAgencySpecialistRole(agent.canonical_role)
    ? await getAgencySpecialistAssessmentSummary({ organizationId, agentId: agent.id, canonicalRole: agent.canonical_role })
    : await getProfessionalAssessmentSummary({ organizationId, agentId: agent.id, canonicalRole: agent.canonical_role });
  const owner = role === "owner";
  const specialist = summary?.specialistReadiness as any;
  const senior = summary?.seniorReadiness as any;
  const suiteLabel = (summary as any)?.suiteLabel ?? "GTM Professional Benchmark";

  return <main className="command-shell">
    <header className="command-header">
      <div>
        <p className="eyebrow">PROFESSIONAL ASSESSMENT</p>
        <h1>{agent.display_name ?? agent.name}</h1>
        <p className="subtitle">{agent.role_title} · evidence-based competency gate</p>
      </div>
      <Link className="secondary-button" href={`/agents/${agent.agent_code.toLowerCase()}`}>Back to Agent profile</Link>
    </header>

    {query.error ? <p className="form-error">{query.error}</p> : null}
    {query.message ? <p className="form-success">{query.message}</p> : null}

    {!summary ? <section className="panel">
      <p className="label">Assessment catalog</p>
      <h2>No role-specific benchmark published yet</h2>
      <p className="security-note">RYTHM will not infer a professional level from the Agent title. A source-backed benchmark must exist for the canonical role first.</p>
    </section> : <>
      <section className="panel">
        <p className="label">{suiteLabel.toUpperCase()}</p>
        <h2>{summary.completed}/{summary.total} scenarios completed · {summary.passed} passed</h2>
        <p style={{color:"#596579",lineHeight:1.7}}>This role-specific suite evaluates professional judgment against a source-backed scenario and an independent judge. The current catalog is backed by {summary.sourceCount} verified professional sources.</p>
        <div className="compact-list">
          <div><strong>Suite version</strong><span>{summary.suiteVersion}</span></div>
          <div><strong>Last score</strong><span>{summary.lastResult ? `${value(summary.lastResult.score)}/100 · ${summary.lastResult.verdict}` : "Not run"}</span></div>
          <div><strong>Next scenario</strong><span>{summary.nextScenario ? `${summary.nextScenario.title} · ${summary.nextScenario.type}` : "Suite complete"}</span></div>
          <div><strong>Runtime</strong><span>{agent.enabled ? "Enabled" : "Paused"}</span></div>
        </div>
        <p className="security-note" style={{marginTop:14}}>Benchmark runs are internal evaluation only. They cannot publish, spend money, change pricing, create contractual commitments or expand Agent runtime authority.</p>
        {owner && summary.nextScenario ? <div style={{marginTop:18}}>
          {agent.enabled ? <form action={runProfessionalBenchmark}>
            <input type="hidden" name="agentCode" value={agent.agent_code}/>
            <button type="submit">Run next benchmark scenario</button>
          </form> : <p className="security-note">Enable the Agent runtime from its profile before running the next benchmark.</p>}
        </div> : null}
      </section>

      <section className="panel">
        <p className="label">PROMOTION READINESS</p>
        <h2>Professional level is evidence, not title</h2>
        <div className="compact-list">
          <div><strong>Specialist gate</strong><span>{readinessLine(specialist)}</span></div>
          <div><strong>Senior gate</strong><span>{readinessLine(senior)}</span></div>
          <div><strong>Validated real-world experience</strong><span>{value(senior?.validated_experience_count)} / {value(senior?.minimum_validated_experience)}</span></div>
          <div><strong>Governance violations</strong><span>{value(senior?.governance_violation_count)}</span></div>
        </div>
        <p className="security-note" style={{marginTop:14}}>Specialist promotion requires passing evidence and a clean governance record. Holdout/adversarial benchmark evidence never counts as real-world experience; Senior promotion remains separately review-gated.</p>
      </section>
    </>}
  </main>;
}
