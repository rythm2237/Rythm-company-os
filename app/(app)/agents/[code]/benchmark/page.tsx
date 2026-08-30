import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { GTM_SENIOR_SCENARIOS, GTM_SENIOR_SUITE_VERSION } from "@/lib/agent-benchmarks/gtm-senior";
import { createEvaluationAdminClient } from "@/lib/supabase/evaluation-admin";
import { BenchmarkConsole } from "./BenchmarkConsole";

export const dynamic = "force-dynamic";

export default async function AgentBenchmarkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { supabase, organizationId } = await requireOwnerOrganizationContext();
  const { data: agent } = await supabase.from("agents")
    .select("id,agent_code,display_name,name,role_title,enabled,canonical_role")
    .eq("organization_id", organizationId)
    .ilike("agent_code", code)
    .maybeSingle();
  if (!agent || agent.agent_code !== "GTM-STRAT-001" || agent.canonical_role !== "Senior GTM Strategist") notFound();
  const { data: standing } = await supabase.from("agent_asset_profiles")
    .select("current_level,level_score,certification_status,last_assessed_at")
    .eq("organization_id", organizationId)
    .eq("agent_id", agent.id)
    .maybeSingle();
  const { data: seniorDefinition } = await supabase.from("agent_level_definitions").select("min_completed_evaluations,min_average_score,min_validated_experience_events,requires_holdout,requirements").eq("level_key", "senior").maybeSingle();

  let initialRunId: string | null = null;
  let initialResults: Array<{ scenario_id: string; scenario_title: string; score: number; verdict: string; governance_violation: boolean }> = [];
  const admin = createEvaluationAdminClient();
  if (admin) {
    const { data: resumable } = await admin.from("agent_evaluation_batches")
      .select("id,status,created_at")
      .eq("organization_id", organizationId)
      .eq("suite_version", GTM_SENIOR_SUITE_VERSION)
      .in("status", ["running", "failed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (resumable?.id) {
      const { data: prior } = await admin.from("agent_evaluation_results")
        .select("scenario_id,scenario_title,score,verdict,governance_violation")
        .eq("batch_id", resumable.id)
        .eq("organization_id", organizationId)
        .eq("agent_id", agent.id)
        .order("created_at", { ascending: true });
      if ((prior?.length ?? 0) > 0 && (prior?.length ?? 0) < GTM_SENIOR_SCENARIOS.length) {
        initialRunId = resumable.id;
        initialResults = prior ?? [];
      }
    }
  }

  return <main className="command-shell">
    <header className="command-header">
      <div><p className="eyebrow">PROFESSIONAL BENCHMARK · {GTM_SENIOR_SUITE_VERSION.toUpperCase()}</p><h1>{agent.display_name ?? agent.name}</h1><p className="subtitle">{agent.role_title} · controlled Senior-level evaluation</p></div>
      <Link className="secondary-button" href={`/agents/${agent.agent_code.toLowerCase()}`}>Back to Agent profile</Link>
    </header>
    <section style={{display:"grid",gap:18}}>
      <article className="panel">
        <p className="label">CERTIFICATION CONTEXT</p>
        <h2>Evidence first, promotion second</h2>
        <div className="compact-list" style={{marginTop:14}}>
          <div><strong>Current certified level</strong><span>{standing?.current_level ?? "associate"}</span></div>
          <div><strong>Current certification</strong><span>{standing?.certification_status ?? "unverified"}</span></div>
          <div><strong>Senior minimum evaluations</strong><span>{seniorDefinition?.min_completed_evaluations ?? 3}</span></div>
          <div><strong>Senior minimum average</strong><span>{seniorDefinition?.min_average_score ?? 85}/100</span></div>
          <div><strong>Validated real-world experience required</strong><span>{seniorDefinition?.min_validated_experience_events ?? 3}</span></div>
          <div><strong>Holdout required</strong><span>{seniorDefinition?.requires_holdout ? "Yes" : "No"}</span></div>
        </div>
        {!agent.enabled?<p className="form-error" style={{marginTop:14}}>The Agent runtime is paused. Return to the profile and enable it before running this benchmark.</p>:null}
      </article>
      <BenchmarkConsole
        agentCode={agent.agent_code.toLowerCase()}
        scenarios={GTM_SENIOR_SCENARIOS.map(({id,title,category})=>({id,title,category}))}
        initialRunId={initialRunId}
        initialResults={initialResults}
      />
    </section>
  </main>;
}
