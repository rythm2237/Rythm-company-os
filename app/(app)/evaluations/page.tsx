import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { runAgentEvaluationFleet } from "@/lib/evaluation/runtime";
import { runSeniorPromotionEvaluation } from "@/lib/evaluation/promotion";
import { BASE_EVALUATION_SCENARIOS } from "@/lib/evaluation/harness";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ message?: string; error?: string }> };

async function ownerContext() {
  const auth = await createAuthServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await auth.from("organization_members").select("organization_id").eq("user_id", user.id).eq("role", "owner").maybeSingle();
  if (!membership) redirect("/login?error=Owner%20authorization%20required.");
  return { user, organizationId: membership.organization_id as string };
}

async function resolveCanonicalEvaluationOrganizationId(preferredOrganizationId: string) {
  const server = createServerSupabaseClient();
  if (!server) throw new Error("Server Supabase client is not configured.");
  const requiredCodes = Array.from(new Set(BASE_EVALUATION_SCENARIOS.map((scenario) => scenario.agentCode)));
  const { data: rows, error } = await server.from("agents").select("organization_id,agent_code").in("agent_code", requiredCodes);
  if (error) throw new Error(`Canonical Agent Fleet lookup failed: ${error.message}`);
  const codesByOrganization = new Map<string, Set<string>>();
  for (const row of rows ?? []) {
    const organizationId = String(row.organization_id);
    const codes = codesByOrganization.get(organizationId) ?? new Set<string>();
    codes.add(String(row.agent_code));
    codesByOrganization.set(organizationId, codes);
  }
  const completeOrganizations = Array.from(codesByOrganization.entries()).filter(([, codes]) => requiredCodes.every((code) => codes.has(code))).map(([organizationId]) => organizationId);
  if (completeOrganizations.includes(preferredOrganizationId)) return preferredOrganizationId;
  if (!completeOrganizations.length) throw new Error("Evaluation blocked: no complete canonical 8-Agent Fleet exists.");
  const { data: organizations, error: organizationsError } = await server.from("organizations").select("id,name").in("id", completeOrganizations);
  if (organizationsError) throw new Error(`Canonical organization lookup failed: ${organizationsError.message}`);
  const namedRythm = (organizations ?? []).filter((organization: any) => String(organization.name).trim().toUpperCase() === "RYTHM");
  if (namedRythm.length === 1) return String(namedRythm[0].id);
  if (completeOrganizations.length === 1) return completeOrganizations[0];
  throw new Error("Evaluation blocked: multiple complete Agent Fleets exist and no unique canonical RYTHM Fleet could be selected safely.");
}

async function runEvaluation() {
  "use server";
  const { user, organizationId } = await ownerContext();
  let result: Awaited<ReturnType<typeof runAgentEvaluationFleet>>;
  try {
    const evaluationOrganizationId = await resolveCanonicalEvaluationOrganizationId(organizationId);
    result = await runAgentEvaluationFleet({ organizationId: evaluationOrganizationId, requestedBy: user.id });
  } catch (error) {
    redirect(`/evaluations?error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
  }
  revalidatePath("/evaluations");
  redirect(`/evaluations?message=${encodeURIComponent(`Evaluation completed: ${result.summary.pass} PASS, ${result.summary.conditional_pass} conditional, ${result.summary.fail} FAIL.`)}`);
}

async function runSeniorAssessment(formData: FormData) {
  "use server";
  const agentCode = String(formData.get("agentCode") ?? "").trim().toUpperCase();
  const allowed = new Set(BASE_EVALUATION_SCENARIOS.map((scenario) => scenario.agentCode));
  if (!allowed.has(agentCode)) redirect("/evaluations?error=Unknown%20Agent%20code.");
  const { user, organizationId } = await ownerContext();
  try {
    const evaluationOrganizationId = await resolveCanonicalEvaluationOrganizationId(organizationId);
    const result = await runSeniorPromotionEvaluation({ organizationId: evaluationOrganizationId, agentCode, requestedBy: user.id });
    revalidatePath("/evaluations");
    revalidatePath(`/agents/${agentCode.toLowerCase()}`);
    const note = result.status === "eligible" ? `${agentCode} reached Senior evidence threshold and now requires human certification review.` : `${agentCode} assessment completed but remains blocked from Senior until all evidence thresholds are satisfied.`;
    redirect(`/evaluations?message=${encodeURIComponent(note)}`);
  } catch (error) {
    redirect(`/evaluations?error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
  }
}

export default async function EvaluationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { organizationId } = await ownerContext();
  const evaluationOrganizationId = await resolveCanonicalEvaluationOrganizationId(organizationId);
  const server = createServerSupabaseClient();
  if (!server) throw new Error("Server Supabase client is not configured.");

  const { data: latestBatch } = await server.from("agent_evaluation_batches").select("id,status,model,started_at,completed_at,summary,error_message").eq("organization_id", evaluationOrganizationId).order("started_at", { ascending: false }).limit(1).maybeSingle();
  const { data: results } = latestBatch ? await server.from("agent_evaluation_results").select("agent_code,scenario_title,score,verdict,governance_violation,duration_ms,created_at").eq("batch_id", latestBatch.id).order("agent_code") : { data: [] };
  const { data: agents } = await server.from("agents").select("id,agent_code,display_name,name").eq("organization_id", evaluationOrganizationId).in("agent_code", BASE_EVALUATION_SCENARIOS.map((scenario) => scenario.agentCode)).order("agent_code");
  const readinessRows = await Promise.all((agents ?? []).map(async (agent:any) => {
    const { data: asset } = await server.from("agent_asset_profiles").select("current_level,level_score,certification_status").eq("agent_id", agent.id).maybeSingle();
    const { data: readiness } = await server.rpc("agent_level_readiness", { p_agent_id: agent.id, p_target_level: "senior" });
    return { ...agent, asset, readiness };
  }));

  return <main style={{maxWidth:1180,margin:"0 auto",padding:"32px 24px"}}>
    <p style={{letterSpacing:".12em",textTransform:"uppercase",opacity:.65}}>RYTHM Assurance</p>
    <h1>Agent Evaluation Console</h1>
    <p>Evidence-based capability assessment. Evaluation never expands Agent authority, enables external actions, or promotes an Agent automatically.</p>
    {params.message ? <p role="status" style={{padding:12,border:"1px solid #b7dec4",borderRadius:10}}>{params.message}</p> : null}
    {params.error ? <p role="alert" style={{color:"crimson"}}>{params.error}</p> : null}

    <section style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginTop:20}}>
      <form action={runEvaluation}><button type="submit" style={{padding:"12px 18px",fontWeight:700}}>Run full 8-Agent baseline evaluation</button></form>
      <small>Baseline establishes domain evidence. Senior requires independent holdout + adversarial passes + validated real-world experience.</small>
    </section>

    <section style={{marginTop:34}}>
      <h2>Specialist → Senior readiness</h2>
      <p>Senior requires at least 3 passed evaluations averaging ≥85, ≥1 holdout pass, ≥1 adversarial pass, ≥3 validated real-world experience events, and zero governance violations. Passing the threshold only creates eligibility; final certification remains human-reviewed.</p>
      <div style={{display:"grid",gap:12}}>{readinessRows.map((row:any)=>{
        const r=row.readiness??{};
        return <article key={row.id} style={{padding:16,border:"1px solid rgba(127,127,127,.25)",borderRadius:14,display:"grid",gridTemplateColumns:"minmax(180px,1.4fr) repeat(5,minmax(80px,.7fr)) auto",gap:12,alignItems:"center"}}>
          <div><strong>{row.display_name??row.name}</strong><br/><small>{row.agent_code} · {row.asset?.current_level??"unknown"} {row.asset?.level_score!=null?`· ${row.asset.level_score}/100`:""}</small></div>
          <div><small>Evaluations</small><br/><strong>{r.evaluation_count??0}/{r.minimum_evaluations??3}</strong></div>
          <div><small>Average</small><br/><strong>{r.average_score??0}/{r.minimum_average_score??85}</strong></div>
          <div><small>Holdout</small><br/><strong>{r.holdout_pass_count??0}/1</strong></div>
          <div><small>Adversarial</small><br/><strong>{r.adversarial_pass_count??0}/1</strong></div>
          <div><small>Experience</small><br/><strong>{r.validated_experience_count??0}/{r.minimum_validated_experience??3}</strong></div>
          <form action={runSeniorAssessment}><input type="hidden" name="agentCode" value={row.agent_code}/><button type="submit" disabled={row.asset?.current_level!=="specialist"} style={{padding:"10px 12px",fontWeight:700}}>{r.eligible?"Re-assess Senior":"Run Senior assessment"}</button></form>
        </article>;
      })}</div>
    </section>

    <section style={{marginTop:34}}>
      <h2>Latest evaluation batch</h2>
      {!latestBatch ? <p>No evaluation evidence recorded yet.</p> : <>
        <p><strong>Status:</strong> {latestBatch.status} · <strong>Model:</strong> {latestBatch.model}</p>
        <pre style={{whiteSpace:"pre-wrap",padding:16,border:"1px solid rgba(127,127,127,.25)",borderRadius:12}}>{JSON.stringify(latestBatch.summary,null,2)}</pre>
        <div style={{display:"grid",gap:10}}>{(results ?? []).map((row:any,index:number)=><article key={`${row.agent_code}-${index}`} style={{padding:14,border:"1px solid rgba(127,127,127,.25)",borderRadius:12}}><strong>{row.agent_code}</strong> — {row.verdict} · {row.score}/100{row.governance_violation ? " · GOVERNANCE VIOLATION" : ""}<br/><small>{row.scenario_title} · {row.duration_ms ?? "—"} ms</small></article>)}</div>
      </>}
    </section>
  </main>;
}
