import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { syncToolExecutionApproval } from "@/lib/integrations/execution-gateway";
import { createExecutionServiceClient } from "@/lib/integrations/service-runner";

export const dynamic = "force-dynamic";

type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";
type RiskLevel = "low" | "medium" | "high" | "critical";

type ApprovalRow = {
  id: string;
  subject_type: string;
  subject_id: string;
  title: string;
  summary: string;
  risk_level: RiskLevel;
  requested_by_agent_id: string | null;
  requested_by_user_id: string | null;
  approver_user_id: string | null;
  status: ApprovalStatus;
  conditions: unknown;
  execution_payload_summary: Record<string, unknown>;
  execution_expected_impact: string | null;
  execution_reversibility: string | null;
  response_note: string | null;
  expires_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

type AuditRow = {
  id: number;
  actor_type: string;
  event_type: string;
  risk_level: RiskLevel;
  payload: Record<string, unknown>;
  created_at: string;
};

type ApprovalPageProps = {
  searchParams: Promise<{
    approval?: string;
    status?: string;
    risk?: string;
    message?: string;
    error?: string;
  }>;
};

const statusValues = new Set<ApprovalStatus>([
  "pending",
  "approved",
  "rejected",
  "expired",
  "cancelled",
]);
const riskValues = new Set<RiskLevel>(["low", "medium", "high", "critical"]);

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not set";

const conditionsToList = (conditions: unknown): string[] => {
  if (Array.isArray(conditions)) {
    return conditions.map((condition) =>
      typeof condition === "string" ? condition : JSON.stringify(condition),
    );
  }
  if (conditions && typeof conditions === "object") {
    const row = conditions as Record<string, unknown>;
    const labels: Record<string, string> = {
      tool: "Tool",
      operation: "Action",
      target: "Target",
      external_side_effect: "External side effect",
      financial_impact: "Financial impact",
      reversibility: "Reversibility",
    };
    return Object.entries(labels)
      .filter(([key]) => row[key] !== undefined)
      .map(
        ([key, label]) =>
          `${label}: ${typeof row[key] === "boolean" ? (row[key] ? "Yes" : "No") : String(row[key] ?? "Not specified")}`,
      );
  }
  return [];
};

async function getOwnerContext() {
  const { supabase, user, organizationId } =
    await requireOwnerOrganizationContext();
  return { supabase, user, organizationId };
}

async function expirePendingApprovals(
  organizationId: string,
  userId: string,
  supabase: Awaited<
    ReturnType<typeof requireOwnerOrganizationContext>
  >["supabase"],
) {
  const now = new Date().toISOString();
  const { data: expired } = await supabase
    .from("approval_requests")
    .update({ status: "expired", resolved_at: now })
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .lt("expires_at", now)
    .select("id, title, risk_level, subject_type, subject_id");

  if (!expired?.length) return;

  await supabase.from("audit_events").insert(
    expired.map((approval) => ({
      organization_id: organizationId,
      actor_type: "user",
      actor_user_id: userId,
      event_type: "approval.expired",
      object_type: "approval_request",
      object_id: approval.id,
      risk_level: approval.risk_level,
      payload: { title: approval.title, reason: "Expiration deadline passed" },
    })),
  );
  const service = createExecutionServiceClient();
  await Promise.all(
    expired
      .filter((approval) => approval.subject_type === "tool_execution")
      .map((approval) =>
        syncToolExecutionApproval(service, organizationId, approval.subject_id),
      ),
  );
}

async function resolveApproval(formData: FormData) {
  "use server";

  const { supabase, user, organizationId } = await getOwnerContext();
  const approvalId = String(formData.get("approvalId") ?? "");
  const resolution = String(formData.get("resolution") ?? "");
  const responseNote = String(formData.get("responseNote") ?? "").trim();

  if (!approvalId || (resolution !== "approved" && resolution !== "rejected")) {
    redirect("/approvals?error=Invalid%20approval%20resolution.");
  }

  if (responseNote.length < 3) {
    redirect(
      `/approvals?approval=${approvalId}&error=CEO%20response%20note%20is%20required.`,
    );
  }

  const { data: approval } = await supabase
    .from("approval_requests")
    .select(
      "id, title, risk_level, status, expires_at, approver_user_id,subject_type,subject_id",
    )
    .eq("id", approvalId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!approval) redirect("/approvals?error=Approval%20request%20not%20found.");
  if (approval.status !== "pending") {
    redirect(
      `/approvals?approval=${approvalId}&error=Only%20pending%20requests%20can%20be%20resolved.`,
    );
  }

  const now = new Date();
  if (approval.expires_at && new Date(approval.expires_at) <= now) {
    await supabase
      .from("approval_requests")
      .update({
        status: "expired",
        resolved_at: now.toISOString(),
        approver_user_id: user.id,
      })
      .eq("id", approvalId)
      .eq("organization_id", organizationId)
      .eq("status", "pending");

    await supabase.from("audit_events").insert({
      organization_id: organizationId,
      actor_type: "user",
      actor_user_id: user.id,
      event_type: "approval.expired",
      object_type: "approval_request",
      object_id: approvalId,
      risk_level: approval.risk_level,
      payload: { title: approval.title, attempted_resolution: resolution },
    });

    redirect(
      `/approvals?approval=${approvalId}&error=This%20request%20expired%20before%20resolution.`,
    );
  }

  const resolvedAt = now.toISOString();
  const { data: resolved, error } = await supabase
    .from("approval_requests")
    .update({
      status: resolution,
      response_note: responseNote,
      resolved_at: resolvedAt,
      approver_user_id: user.id,
    })
    .eq("id", approvalId)
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error || !resolved) {
    redirect(
      `/approvals?approval=${approvalId}&error=${encodeURIComponent(error?.message ?? "Approval could not be resolved.")}`,
    );
  }

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: `approval.${resolution}`,
    object_type: "approval_request",
    object_id: approvalId,
    risk_level: approval.risk_level,
    payload: {
      title: approval.title,
      resolution,
      response_note: responseNote,
      human_authority: "Human CEO / Owner",
      resolved_at: resolvedAt,
    },
  });

  if (approval.subject_type === "tool_execution") {
    await syncToolExecutionApproval(
      createExecutionServiceClient(),
      organizationId,
      approval.subject_id,
    );
  }

  revalidatePath("/approvals");
  revalidatePath("/command-center");
  redirect(
    `/approvals?approval=${approvalId}&message=Approval%20${resolution}.`,
  );
}

export default async function ApprovalEnginePage({
  searchParams,
}: ApprovalPageProps) {
  const params = await searchParams;
  const { supabase, user, organizationId } = await getOwnerContext();

  await expirePendingApprovals(organizationId, user.id, supabase);

  const selectedStatus = statusValues.has(params.status as ApprovalStatus)
    ? (params.status as ApprovalStatus)
    : "pending";
  const selectedRisk = riskValues.has(params.risk as RiskLevel)
    ? (params.risk as RiskLevel)
    : "";

  let approvalsQuery = supabase
    .from("approval_requests")
    .select(
      "id, subject_type, subject_id, title, summary, risk_level, requested_by_agent_id, requested_by_user_id, approver_user_id, status, conditions, execution_payload_summary, execution_expected_impact, execution_reversibility, response_note, expires_at, resolved_at, created_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (selectedStatus)
    approvalsQuery = approvalsQuery.eq("status", selectedStatus);
  if (selectedRisk)
    approvalsQuery = approvalsQuery.eq("risk_level", selectedRisk);

  const { data: approvalData } = await approvalsQuery;
  const approvals = (approvalData ?? []) as ApprovalRow[];
  const selectedId = params.approval ?? approvals[0]?.id ?? null;

  const selectedApproval = selectedId
    ? ((
        await supabase
          .from("approval_requests")
          .select(
            "id, subject_type, subject_id, title, summary, risk_level, requested_by_agent_id, requested_by_user_id, approver_user_id, status, conditions, execution_payload_summary, execution_expected_impact, execution_reversibility, response_note, expires_at, resolved_at, created_at",
          )
          .eq("organization_id", organizationId)
          .eq("id", selectedId)
          .maybeSingle()
      ).data as ApprovalRow | null)
    : null;

  const approvalAudit = selectedApproval
    ? (((
        await supabase
          .from("audit_events")
          .select("id, actor_type, event_type, risk_level, payload, created_at")
          .eq("organization_id", organizationId)
          .eq("object_type", "approval_request")
          .eq("object_id", selectedApproval.id)
          .order("created_at", { ascending: false })
          .limit(25)
      ).data ?? []) as AuditRow[])
    : [];
  const executionAudit =
    selectedApproval?.subject_type === "tool_execution"
      ? (((
          await supabase
            .from("audit_events")
            .select(
              "id, actor_type, event_type, risk_level, payload, created_at",
            )
            .eq("organization_id", organizationId)
            .eq("object_type", "tool_execution_request")
            .eq("object_id", selectedApproval.subject_id)
            .order("created_at", { ascending: false })
            .limit(25)
        ).data ?? []) as AuditRow[])
      : [];
  const audit = [...approvalAudit, ...executionAudit]
    .sort(
      (left, right) =>
        new Date(right.created_at).valueOf() -
        new Date(left.created_at).valueOf(),
    )
    .slice(0, 25);

  const conditions = selectedApproval
    ? conditionsToList(selectedApproval.conditions)
    : [];
  const isPending = selectedApproval?.status === "pending";

  return (
    <main className="command-shell">
      <header className="command-header">
        <div>
          <p className="eyebrow">RYTHM APPROVAL ENGINE</p>
          <h1>Human authority gateway</h1>
          <p className="subtitle">
            Review consequential requests, impose conditions, record the CEO
            response, and preserve a complete audit trail.
          </p>
        </div>
        <Link className="secondary-button" href="/command-center">
          Command Center
        </Link>
      </header>

      <section className="organization-banner">
        <div>
          <span>Authority</span>
          <strong>Human CEO / Owner</strong>
        </div>
        <div>
          <span>Organization</span>
          <strong>RYTHM</strong>
        </div>
        <div>
          <span>Enforcement</span>
          <strong>Owner-only resolution</strong>
        </div>
      </section>

      {params.message ? (
        <p className="form-success" role="status">
          {params.message}
        </p>
      ) : null}
      {params.error ? (
        <p className="form-error" role="alert">
          {params.error}
        </p>
      ) : null}

      <section className="panel panel-wide" style={{ marginTop: 18 }}>
        <div className="panel-heading">
          <div>
            <p className="label">Governance queue</p>
            <h2>Approval Inbox</h2>
          </div>
          <span className="pill">{approvals.length} matching requests</span>
        </div>

        <form
          method="get"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
            gap: 10,
            marginBottom: 18,
          }}
        >
          <select
            name="status"
            defaultValue={selectedStatus}
            aria-label="Filter approval status"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            name="risk"
            defaultValue={selectedRisk}
            aria-label="Filter risk level"
          >
            <option value="">All risk levels</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button className="secondary-button" type="submit">
            Apply filters
          </button>
        </form>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))",
            gap: 18,
          }}
        >
          <div className="data-list">
            {approvals.length ? (
              approvals.map((approval) => (
                <Link
                  href={`/approvals?status=${selectedStatus}&risk=${selectedRisk}&approval=${approval.id}`}
                  key={approval.id}
                  style={{
                    display: "block",
                    padding: "15px 0",
                    borderBottom: "1px solid #e7eaf0",
                    textDecoration: "none",
                  }}
                >
                  <strong>{approval.title}</strong>
                  <span
                    style={{
                      display: "block",
                      marginTop: 6,
                      color: "#717b8e",
                      fontSize: ".82rem",
                    }}
                  >
                    {approval.risk_level} risk · {approval.status} ·{" "}
                    {formatDate(approval.created_at)}
                  </span>
                </Link>
              ))
            ) : (
              <p className="empty-state">
                No approval requests match these filters.
              </p>
            )}
          </div>

          {selectedApproval ? (
            <article
              style={{
                border: "1px solid #dfe4ec",
                borderRadius: 16,
                padding: 20,
                background: "#f8f9fb",
              }}
            >
              <div className="panel-heading">
                <div>
                  <p className="label">Request details</p>
                  <h2>{selectedApproval.title}</h2>
                </div>
                <div className="row-meta">
                  <span>{selectedApproval.risk_level} risk</span>
                  <b className={isPending ? "state-paused" : "state-active"}>
                    {selectedApproval.status}
                  </b>
                </div>
              </div>

              <p style={{ color: "#596579", lineHeight: 1.65 }}>
                {selectedApproval.summary}
              </p>

              <div className="compact-list">
                <div>
                  <strong>Subject</strong>
                  <span>
                    {selectedApproval.subject_type} ·{" "}
                    {selectedApproval.subject_id}
                  </span>
                </div>
                {selectedApproval.execution_expected_impact ? (
                  <div>
                    <strong>Expected impact</strong>
                    <span>{selectedApproval.execution_expected_impact}</span>
                  </div>
                ) : null}
                {selectedApproval.execution_reversibility ? (
                  <div>
                    <strong>Reversibility</strong>
                    <span>{selectedApproval.execution_reversibility}</span>
                  </div>
                ) : null}
                {Object.keys(selectedApproval.execution_payload_summary ?? {})
                  .length ? (
                  <div>
                    <strong>Data affected</strong>
                    <span>
                      {Object.entries(
                        selectedApproval.execution_payload_summary,
                      )
                        .map(([key, value]) => `${key}: ${String(value)}`)
                        .join(" · ")}
                    </span>
                  </div>
                ) : null}
                <div>
                  <strong>Requested</strong>
                  <span>{formatDate(selectedApproval.created_at)}</span>
                </div>
                <div>
                  <strong>Expires</strong>
                  <span>{formatDate(selectedApproval.expires_at)}</span>
                </div>
                <div>
                  <strong>Resolved</strong>
                  <span>{formatDate(selectedApproval.resolved_at)}</span>
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <p className="label">Conditions</p>
                {conditions.length ? (
                  <ul
                    style={{
                      paddingLeft: 20,
                      color: "#596579",
                      lineHeight: 1.7,
                    }}
                  >
                    {conditions.map((condition, index) => (
                      <li key={`${condition}-${index}`}>{condition}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-state">No conditions attached.</p>
                )}
              </div>

              {isPending ? (
                <form
                  action={resolveApproval}
                  className="auth-form"
                  style={{ marginTop: 20 }}
                >
                  <input
                    type="hidden"
                    name="approvalId"
                    value={selectedApproval.id}
                  />
                  <label>
                    CEO response note
                    <textarea
                      name="responseNote"
                      minLength={3}
                      required
                      rows={5}
                      placeholder="State the rationale, imposed conditions, or rejection reason."
                      style={{
                        width: "100%",
                        resize: "vertical",
                        padding: 12,
                        border: "1px solid #cfd6e2",
                        borderRadius: 10,
                        font: "inherit",
                      }}
                    />
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
                      gap: 10,
                    }}
                  >
                    <button name="resolution" value="approved" type="submit">
                      Approve request
                    </button>
                    <button
                      name="resolution"
                      value="rejected"
                      type="submit"
                      style={{ background: "#8f2335" }}
                    >
                      Reject request
                    </button>
                  </div>
                  <p className="security-note">
                    Only the authenticated organization Owner can execute this
                    resolution.
                  </p>
                </form>
              ) : (
                <div
                  style={{
                    marginTop: 18,
                    padding: 14,
                    borderRadius: 12,
                    background: "#fff",
                  }}
                >
                  <p className="label">CEO response</p>
                  <p style={{ color: "#596579", lineHeight: 1.6 }}>
                    {selectedApproval.response_note ??
                      "No response note recorded."}
                  </p>
                </div>
              )}

              <div style={{ marginTop: 22 }}>
                <p className="label">Audit trail</p>
                <div className="compact-list">
                  {audit.length ? (
                    audit.map((event) => (
                      <div key={event.id}>
                        <strong>{event.event_type}</strong>
                        <span>
                          {event.actor_type} · {event.risk_level} risk ·{" "}
                          {formatDate(event.created_at)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="empty-state">
                      No audit events recorded for this request.
                    </p>
                  )}
                </div>
              </div>
            </article>
          ) : (
            <p className="empty-state">
              Select an approval request to inspect its details.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
