import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { runAgentEvaluationFleet } from "@/lib/evaluation/runtime";
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
  const { data: rows, error } = await server
    .from("agents")
    .select("organization_id,agent_code")
    .in("agent_code", requiredCodes);
  if (error) throw new Error(`Canonical Agent Fleet lookup failed: ${error.message}`);

  const codesByOrganization = new Map<string, Set<string>>();
  for (const row of rows ?? []) {
    const organizationId = String(row.organization_id);
    const codes = codesByOrganization.get(organizationId) ?? new Set<string>();
    codes.add(String(row.agent_code));
    codesByOrganization.set(organizationId, codes);
  }

  const completeOrganizations = Array.from(codesByOrganization.entries())
    .filter(([, codes]) => requiredCodes.every((code) => codes.has(code)))
    .map(([organizationId]) => organizationId);

  if (completeOrganizations.includes(preferredOrganizationId)) return preferredOrganizationId;
  if (!completeOrganizations.length) throw new Error("Evaluation blocked: no complete canonical 8-Agent Fleet exists.");

  const { data: organizations, error: organizationsError } = await server
    .from("organizations")
    .select("id,name")
    .in("id", completeOrganizations);
  if (organizationsError) throw new Error(`Canonical organization lookup failed: ${organizationsError.message}`);

  const namedRythm = (organizations ?? []).filter((organization: any) => String(organization.name).trim().toUpperCase() === "RYTHM");
  if (namedRythm.length === 1) return String(namedRythm[0].id);
  if (completeOrganizations.length === 1) return completeOrganizations[0];

  throw new Error("Evaluation blocked: multiple complete Agent Fleets exist and no unique canonical RYTHM Fleet could be selected safely.");
}

async function runEvaluation() {
  "use server";
  const { user, organizationId } = await ownerContext();
  try {
    const evaluationOrganizationId = await resolveCanonicalEvaluationOrganizationId(organizationId);
    const result = await runAgentEvaluationFleet({ organizationId: evaluationOrganizationId, requestedBy: user.id });
    revalidatePath("/evaluations");
    redirect(`/evaluations?message=${encodeURIComponent(`Evaluation completed: ${result.summary.pass} PASS, ${result.summary.conditional_pass} conditional, ${result.summary.fail} FAIL.`)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    redirect(`/evaluations?error=${encodeURIComponent(message)}`);
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

  return <main style={{maxWidth:1100,margin:"0 auto",padding:"32px 24px"}}>
    <p style={{letterSpacing:".12em",textTransform:"uppercase",opacity:.65}}>RYTHM Assurance</p>
    <h1>Agent Evaluation Console</h1>
    <p>Isolated benchmark only. Running this suite evaluates the canonical RYTHM Agent Fleet and does not enable paused Agents, change tenant entitlement, permit external actions, or expand authority.</p>
    {params.message ? <p role="status">{params.message}</p> : null}
    {params.error ? <p role="alert" style={{color:"crimson"}}>{params.error}</p> : null}
    <form action={runEvaluation}><button type="submit" style={{padding:"12px 18px",fontWeight:700}}>Run full 8-Agent evaluation</button></form>
    <section style={{marginTop:32}}>
      <h2>Latest batch</h2>
      {!latestBatch ? <p>No evaluation evidence recorded yet.</p> : <>
        <p><strong>Status:</strong> {latestBatch.status} · <strong>Model:</strong> {latestBatch.model}</p>
        <pre style={{whiteSpace:"pre-wrap",padding:16,border:"1px solid rgba(127,127,127,.25)",borderRadius:12}}>{JSON.stringify(latestBatch.summary,null,2)}</pre>
        <div style={{display:"grid",gap:10}}>{(results ?? []).map((row:any)=><article key={row.agent_code} style={{padding:14,border:"1px solid rgba(127,127,127,.25)",borderRadius:12}}><strong>{row.agent_code}</strong> — {row.verdict} · {row.score}/100{row.governance_violation ? " · GOVERNANCE VIOLATION" : ""}<br/><small>{row.scenario_title} · {row.duration_ms ?? "—"} ms</small></article>)}</div>
      </>}
    </section>
  </main>;
}
