import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import {
  requireOrganizationContext,
  requireOwnerOrganizationContext,
} from "@/lib/auth/organization-context";
import {
  asOperationalReadiness,
  operationalReadinessLabel,
} from "@/lib/agents/operational-readiness";
import AgentTaskConsole from "./AgentTaskConsole";

export const dynamic = "force-dynamic";

async function createWorkAssignment(formData: FormData) {
  "use server";
  const { supabase, organizationId } = await requireOwnerOrganizationContext();
  const agentId = String(formData.get("agentId") ?? "");
  const agentCode = String(formData.get("agentCode") ?? "").toLowerCase();
  const title = String(formData.get("title") ?? "").trim();
  const brief = String(formData.get("brief") ?? "").trim();
  const taskType = String(formData.get("taskType") ?? "general").trim();
  const riskLevel = String(formData.get("riskLevel") ?? "low");
  const externalSideEffect = formData.get("externalSideEffect") === "on";
  const acceptanceCriteria = String(formData.get("acceptanceCriteria") ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!agent) redirect("/agents?error=Agent%20not%20found.");

  const { error } = await supabase.rpc("create_agent_work_assignment_v1", {
    target_agent_id: agentId,
    target_title: title,
    target_task_brief: brief,
    target_task_type: taskType,
    target_acceptance_criteria: acceptanceCriteria,
    target_risk_level: riskLevel,
    target_external_side_effect: externalSideEffect,
  });
  if (error)
    redirect(`/agents/${agentCode}/task?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/agents/${agentCode}`);
  revalidatePath(`/agents/${agentCode}/task`);
  revalidatePath("/agents");
  redirect(
    `/agents/${agentCode}/task?message=Governed%20work%20assignment%20created.%20It%20will%20not%20count%20as%20experience%20until%20execution%20and%20verification%20are%20complete.`,
  );
}

async function reviewWorkOutcome(formData: FormData) {
  "use server";
  const { supabase, organizationId } = await requireOwnerOrganizationContext();
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const agentId = String(formData.get("agentId") ?? "");
  const agentCode = String(formData.get("agentCode") ?? "").toLowerCase();
  const accepted = String(formData.get("decision") ?? "reject") === "accept";
  const qualityScore = Number(formData.get("qualityScore") ?? -1);
  const reviewNote = String(formData.get("reviewNote") ?? "").trim();
  const { data: assignment } = await supabase.from("agent_work_assignments").select("id").eq("id",assignmentId).eq("agent_id",agentId).eq("organization_id",organizationId).maybeSingle();
  if(!assignment)redirect(`/agents/${agentCode}/task?error=Assignment%20not%20found.`);
  const {error}=await supabase.rpc("validate_agent_work_outcome_v1",{
    target_assignment_id:assignmentId,
    target_accepted:accepted,
    target_quality_score:qualityScore,
    target_review_note:reviewNote,
  });
  if(error)redirect(`/agents/${agentCode}/task?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/agents/${agentCode}`);revalidatePath(`/agents/${agentCode}/task`);revalidatePath("/agents");
  redirect(`/agents/${agentCode}/task?message=${accepted?"Work%20outcome%20verified%20and%20recorded%20as%20validated%20experience.":"Work%20outcome%20rejected%20and%20excluded%20from%20experience."}`);
}

export default async function AgentTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const { supabase, organizationId, role } = await requireOrganizationContext();
  const { data: agent } = await supabase
    .from("agents")
    .select("id,agent_code,display_name,name,role_title,enabled,agent_status,risk_ceiling")
    .eq("organization_id", organizationId)
    .ilike("agent_code", code)
    .maybeSingle();
  if (!agent) notFound();

  const [contractResult, autonomyResult, readinessResult, assignmentsResult] =
    await Promise.all([
      supabase
        .from("agent_position_contracts")
        .select("id,position_title,mission,status,success_metrics,task_boundaries")
        .eq("agent_id", agent.id)
        .order("contract_version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("agent_autonomy_profiles")
        .select("current_level,status,allowed_risk_levels,requires_approval_for_external_actions")
        .eq("agent_id", agent.id)
        .maybeSingle(),
      supabase.rpc("agent_operational_readiness_v1", {
        target_agent_id: agent.id,
      }),
      supabase
        .from("agent_work_assignments")
        .select(
          "id,title,task_type,risk_level,approval_mode,status,outcome_status,verification_status,quality_score,created_at",
        )
        .eq("agent_id", agent.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
  const contract = contractResult.data;
  const autonomy = autonomyResult.data;
  const readiness = asOperationalReadiness(readinessResult.data, agent.id);
  const assignments=assignmentsResult.data??[];
  const runnableAssignments=assignments.filter((assignment:any)=>["assigned","planning","blocked"].includes(assignment.status));
  const canAssign =
    role === "owner" &&
    agent.enabled &&
    agent.agent_status === "enabled" &&
    contract?.status === "approved" &&
    autonomy &&
    !["locked", "suspended"].includes(autonomy.status);

  return (
    <main className="command-shell">
      <header className="command-header">
        <div>
          <p className="eyebrow">AGENT WORKSPACE · GOVERNED TASK</p>
          <h1>Assign work to {agent.display_name ?? agent.name}</h1>
          <p className="subtitle">
            {agent.role_title} · Adaptive Routing · {operationalReadinessLabel(readiness.readiness_state)}
          </p>
        </div>
        <Link className="secondary-button" href={`/agents/${code}`}>
          Open Agent profile
        </Link>
      </header>

      {query.message ? <p className="form-success">{query.message}</p> : null}
      {query.error ? <p className="form-error">{query.error}</p> : null}

      <section className="organization-banner">
        <div><span>Position contract</span><strong>{contract?.status ?? "Missing"}</strong></div>
        <div><span>Autonomy</span><strong>L{autonomy?.current_level ?? 0} · {autonomy?.status ?? "locked"}</strong></div>
        <div><span>Readiness</span><strong>{readiness.readiness_score}/100</strong></div>
      </section>

      <section className="executive-grid" style={{ marginTop: 18 }}>
        <article className="panel panel-wide">
          <div className="panel-heading"><div><p className="label">Position contract</p><h2>{contract?.position_title ?? agent.role_title}</h2></div></div>
          <p>{contract?.mission ?? "Approve the position contract before assigning governed work."}</p>
          {contract?.status !== "approved" ? (
            <p className="security-note">
              Work assignment is locked until the owner reviews and approves the position contract on the Agent profile.
            </p>
          ) : null}
        </article>

        <article className="panel">
          <div className="panel-heading"><div><p className="label">Evidence rule</p><h2>No synthetic experience</h2></div></div>
          <p className="security-note">
            Creating a task does not improve readiness. This workspace cannot publish, spend money, or make legal commitments. Work counts only after a terminal Agent-owned execution is recorded, the result is independently verifiable, and the human owner validates the outcome.
          </p>
        </article>
      </section>

      <section className="panel panel-wide" style={{ marginTop: 18 }}>
        <div className="panel-heading"><div><p className="label">New work assignment</p><h2>Define the outcome, not just a prompt</h2></div></div>
        {canAssign ? (
          <form action={createWorkAssignment} className="auth-form">
            <input type="hidden" name="agentId" value={agent.id} />
            <input type="hidden" name="agentCode" value={agent.agent_code} />
            <label>Assignment title<input name="title" minLength={3} required placeholder="Example: Prepare Q4 market-entry brief" /></label>
            <label>Task brief<textarea name="brief" rows={6} minLength={10} required placeholder="Context, expected outcome, available evidence and constraints" /></label>
            <label>Acceptance criteria<textarea name="acceptanceCriteria" rows={5} required placeholder={"One measurable criterion per line\nSources are traceable\nRisks and uncertainty are explicit"} /></label>
            <label>Task type<input name="taskType" defaultValue="general" required /></label>
            <label>Risk level<select name="riskLevel" defaultValue="low"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="restricted">Restricted</option></select></label>
            <label style={{display:"flex",gap:10,alignItems:"center"}}><input name="externalSideEffect" type="checkbox" style={{width:"auto"}} />This task is expected to change an external system or communicate externally</label>
            <button type="submit">Create governed work assignment</button>
          </form>
        ) : (
          <p className="empty-state">
            Assignment is locked. The Agent must be enabled, have an approved position contract and an active autonomy profile; only the organization owner can assign work.
          </p>
        )}
      </section>

      {role==="owner"?<AgentTaskConsole agentCode={agent.agent_code} agentName={agent.display_name??agent.name} assignments={runnableAssignments.map((assignment:any)=>({id:assignment.id,title:assignment.title,approval_mode:assignment.approval_mode,risk_level:assignment.risk_level}))}/>:null}

      <section className="panel panel-wide" style={{ marginTop: 18 }}>
        <div className="panel-heading"><div><p className="label">Evidence ledger</p><h2>Recent assignments</h2></div></div>
        {assignments.length ? (
          <div className="data-list">{assignments.map((assignment: any) => (
            <div className="data-row" key={assignment.id} style={{alignItems:"flex-start"}}><div><strong>{assignment.title}</strong><span>{assignment.task_type} · {assignment.risk_level} risk · {assignment.approval_mode}</span>{assignment.verification_status==="pending_review"&&role==="owner"?<form action={reviewWorkOutcome} className="auth-form" style={{marginTop:12}}><input type="hidden" name="assignmentId" value={assignment.id}/><input type="hidden" name="agentId" value={agent.id}/><input type="hidden" name="agentCode" value={agent.agent_code}/><label>Quality score<input name="qualityScore" type="number" min="0" max="100" required/></label><label>Evidence review note<textarea name="reviewNote" rows={3} minLength={5} required/></label><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button name="decision" value="accept" type="submit">Verify outcome</button><button name="decision" value="reject" type="submit" className="secondary-button">Reject evidence</button></div></form>:null}</div><b>{assignment.status} · {assignment.verification_status}</b></div>
          ))}</div>
        ) : <p className="empty-state">No governed work assignments exist for this Agent.</p>}
      </section>
    </main>
  );
}
