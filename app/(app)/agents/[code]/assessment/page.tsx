import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganizationContext } from "@/lib/auth/organization-context";
import { getProfessionalAssessmentSummary } from "@/lib/agent-professional-assessment";
import { getAgencyLevelAssessmentSummary, isAgencyProgressionRole } from "@/lib/agency-level-progression";
import { runProfessionalBenchmark } from "./actions";
import PendingBenchmarkButton from "./PendingBenchmarkButton";

export const dynamic = "force-dynamic";

function value(input: unknown, fallback = "0") {
  return input == null ? fallback : String(input);
}

function titleCase(input: unknown) {
  const text = String(input ?? "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
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
  searchParams: Promise<{ error?: string; message?: string; status?: string }>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const { supabase, organizationId, role } = await requireOrganizationContext();
  const { data: agent } = await supabase
    .from("agents")
    .select("id,agent_code,display_name,name,role_title,canonical_role,role_family,enabled,agent_asset_profiles(current_level,level_score,certification_status)")
    .eq("organization_id", organizationId)
    .ilike("agent_code", code)
    .maybeSingle();
  if (!agent) notFound();

  const rawAsset=(agent as any).agent_asset_profiles;
  const asset=Array.isArray(rawAsset)?rawAsset[0]??null:rawAsset??null;
  const currentLevel=String(asset?.current_level??"associate");
  const agencyProgression = isAgencyProgressionRole(agent.canonical_role);
  const summary = agencyProgression
    ? await getAgencyLevelAssessmentSummary({ organizationId, agentId: agent.id, canonicalRole: agent.canonical_role })
    : await getProfessionalAssessmentSummary({ organizationId, agentId: agent.id, canonicalRole: agent.canonical_role });
  const owner = role === "owner";
  const targetLevel = String((summary as any)?.targetLevel ?? (currentLevel === "associate" ? "specialist" : "senior"));
  const targetReadiness = (summary as any)?.targetReadiness ?? (targetLevel === "specialist" ? (summary as any)?.specialistReadiness : (summary as any)?.seniorReadiness);
  const suiteLabel = (summary as any)?.suiteLabel ?? "GTM Professional Benchmark";
  const lastFailed = String((summary as any)?.lastResult?.verdict ?? "").toUpperCase() === "FAIL";
  const topLevel = Boolean((summary as any)?.topLevel);

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
    {query.message ? <p className={query.status === "fail" ? "form-error" : "form-success"}>{query.message}</p> : null}

    {!summary ? <section className="panel">
      <p className="label">Assessment status</p>
      <h2>No next-level role benchmark published yet</h2>
      <p className="security-note">RYTHM never infers a professional level from the Agent title. A source-backed benchmark must exist for the role and target level before promotion evidence can be generated.</p>
    </section> : topLevel ? <section className="panel">
      <p className="label">PROFESSIONAL PROGRESSION</p>
      <h2>Highest published level reached</h2>
      <p style={{color:"#596579",lineHeight:1.7}}>This Agent is currently certified at {titleCase(currentLevel)}. Director is the highest level in the published RYTHM professional ladder, so there is no higher benchmark target at this time.</p>
    </section> : <>
      <section className="panel">
        <p className="label">{suiteLabel.toUpperCase()}</p>
        <h2>{titleCase(currentLevel)} → {titleCase(targetLevel)}</h2>
        <p style={{color:"#596579",lineHeight:1.7}}>The benchmark always targets the next professional level. It evaluates role-specific judgment against source-backed scenarios and an independent judge. The current suite is backed by {summary.sourceCount} verified professional sources.</p>
        <div className="compact-list">
          <div><strong>Current certified level</strong><span>{titleCase(currentLevel)}</span></div>
          <div><strong>Next target level</strong><span>{titleCase(targetLevel)}</span></div>
          <div><strong>Benchmark progress</strong><span>{summary.completed}/{summary.total} scenarios · {summary.passed} passed</span></div>
          <div><strong>Suite version</strong><span>{summary.suiteVersion}</span></div>
          <div><strong>Last score</strong><span>{summary.lastResult ? `${value(summary.lastResult.score)}/100 · ${summary.lastResult.verdict}` : "Not run"}</span></div>
          <div><strong>Next scenario</strong><span>{summary.nextScenario ? `${summary.nextScenario.title} · ${summary.nextScenario.type}` : "Benchmark suite complete"}</span></div>
          <div><strong>Runtime</strong><span>{agent.enabled ? "Enabled" : "Paused"}</span></div>
        </div>
        {lastFailed ? <p className="security-note" style={{marginTop:14}}>The failed attempt remains in the audit trail. After the Agent is corrected, Retry benchmark creates a new governed attempt; current readiness uses the latest valid attempt for that scenario.</p> : null}
        <p className="security-note" style={{marginTop:14}}>Benchmark runs are internal evaluation only. They cannot publish, spend money, change pricing, create contractual commitments or expand Agent runtime authority. Synthetic benchmark events never count as validated real-world experience.</p>
        {owner && summary.nextScenario ? <div style={{marginTop:18}}>
          {agent.enabled ? <form action={runProfessionalBenchmark}>
            <input type="hidden" name="agentCode" value={agent.agent_code}/>
            <PendingBenchmarkButton label={lastFailed ? `Retry ${titleCase(targetLevel)} benchmark` : `Run ${titleCase(targetLevel)} benchmark`}/>
          </form> : <div>
            <p className="security-note">This Agent is paused. Enable the Agent runtime from its profile; the next-level benchmark becomes available immediately after activation.</p>
            <Link className="secondary-button" href={`/agents/${agent.agent_code.toLowerCase()}`}>Go to Agent profile</Link>
          </div>}
        </div> : null}
        {owner && !summary.nextScenario ? <p className="security-note" style={{marginTop:18}}>Benchmark scenarios for {titleCase(targetLevel)} are complete. Promotion occurs only when all remaining readiness gates, including required validated real-world experience, are satisfied.</p> : null}
      </section>

      <section className="panel">
        <p className="label">NEXT-LEVEL READINESS</p>
        <h2>{titleCase(targetLevel)} promotion gate</h2>
        <div className="compact-list">
          <div><strong>Readiness</strong><span>{readinessLine(targetReadiness)}</span></div>
          <div><strong>Evaluations</strong><span>{value(targetReadiness?.evaluation_count)} / {value(targetReadiness?.minimum_evaluations)}</span></div>
          <div><strong>Average score</strong><span>{value(targetReadiness?.average_score)} / required {value(targetReadiness?.minimum_average_score)}</span></div>
          <div><strong>Validated real-world experience</strong><span>{value(targetReadiness?.validated_experience_count)} / {value(targetReadiness?.minimum_validated_experience)}</span></div>
          <div><strong>Governance violations</strong><span>{value(targetReadiness?.governance_violation_count)}</span></div>
        </div>
        <p className="security-note" style={{marginTop:14}}>Professional progression is sequential: Associate → Specialist → Senior → Lead → Principal → Director. Benchmark success supplies evaluation evidence; it never fabricates the real-world experience required for higher levels.</p>
      </section>
    </>}
  </main>;
}
