import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";

export const dynamic = "force-dynamic";

type DecisionPacket = Record<string, unknown>;
type ApprovalRow = {
  id: string;
  project_id: string | null;
  subject_type: string;
  subject_id: string;
  title: string;
  summary: string;
  risk_level: string;
  status: string;
  conditions: unknown;
  execution_payload_summary: Record<string, unknown> | null;
  execution_expected_impact: string | null;
  execution_reversibility: string | null;
  response_note: string | null;
  created_at: string;
  resolved_at: string | null;
};

const humanize = (key: string) => key.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const asConditions = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not set";

function PacketValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="muted-copy">Not specified</span>;
  if (Array.isArray(value)) return <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>{value.map((item, index) => <li key={index}>{typeof item === "object" ? <PacketValue value={item} /> : String(item)}</li>)}</ul>;
  if (typeof value === "object") return <div style={{ display: "grid", gap: 8 }}>{Object.entries(value as Record<string, unknown>).map(([key, nested]) => <div key={key} style={{ padding: 10, borderRadius: 10, background: "#f6f8fb" }}><strong style={{ display: "block", marginBottom: 4 }}>{humanize(key)}</strong><PacketValue value={nested} /></div>)}</div>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  return <span>{String(value)}</span>;
}

async function resolveDecision(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const approvalId = String(formData.get("approvalId") ?? "");
  const resolution = String(formData.get("resolution") ?? "");
  const responseNote = String(formData.get("responseNote") ?? "").trim();
  if (!approvalId || !["approved", "rejected"].includes(resolution)) redirect("/approvals/decisions?error=Invalid%20decision%20resolution.");
  if (responseNote.length < 3) redirect(`/approvals/decisions?approval=${approvalId}&error=CEO%20decision%20note%20is%20required.`);

  const { data: approval } = await supabase.from("approval_requests")
    .select("id,title,risk_level,status,project_id")
    .eq("organization_id", organizationId).eq("id", approvalId).maybeSingle();
  if (!approval || approval.status !== "pending") redirect("/approvals/decisions?error=Only%20pending%20decisions%20can%20be%20resolved.");

  const now = new Date().toISOString();
  const { error } = await supabase.from("approval_requests").update({ status: resolution, response_note: responseNote, resolved_at: now, approver_user_id: user.id })
    .eq("organization_id", organizationId).eq("id", approvalId).eq("status", "pending");
  if (error) redirect(`/approvals/decisions?approval=${approvalId}&error=${encodeURIComponent(error.message)}`);

  await supabase.from("audit_events").insert({ organization_id: organizationId, actor_type: "user", actor_user_id: user.id, event_type: `approval.${resolution}`, object_type: "approval_request", object_id: approvalId, risk_level: approval.risk_level, payload: { title: approval.title, resolution, response_note: responseNote, decision_workspace: true } });
  revalidatePath("/approvals/decisions");
  revalidatePath("/approvals");
  redirect(`/approvals/decisions?approval=${approvalId}&message=Decision%20${resolution}.`);
}

export default async function DecisionApprovalPage({ searchParams }: { searchParams: Promise<{ approval?: string; project?: string; message?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, organizationId } = await requireOwnerOrganizationContext();
  const { data: org } = await supabase.from("organizations").select("name").eq("id", organizationId).maybeSingle();

  let query = supabase.from("approval_requests")
    .select("id,project_id,subject_type,subject_id,title,summary,risk_level,status,conditions,execution_payload_summary,execution_expected_impact,execution_reversibility,response_note,created_at,resolved_at")
    .eq("organization_id", organizationId)
    .not("execution_payload_summary->decision_packet", "is", null)
    .order("created_at", { ascending: true });
  if (params.project) query = query.eq("project_id", params.project);
  const { data } = await query;
  const approvals = (data ?? []) as ApprovalRow[];
  const selectedId = params.approval ?? approvals.find((item) => item.status === "pending")?.id ?? approvals[0]?.id;
  const selected = approvals.find((item) => item.id === selectedId) ?? null;
  const packet = (selected?.execution_payload_summary?.decision_packet ?? {}) as DecisionPacket;
  const pendingCount = approvals.filter((item) => item.status === "pending").length;
  const approvedCount = approvals.filter((item) => item.status === "approved").length;
  const rejectedCount = approvals.filter((item) => item.status === "rejected").length;

  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM CEO DECISION WORKSPACE</p><h1>Approve decisions, not opaque bundles</h1><p className="subtitle">Each consequential choice is separated so the Human CEO can approve, reject, or impose conditions independently. Final launch remains blocked until required decisions and compliance gates are resolved.</p></div><Link className="secondary-button" href="/approvals">All approvals</Link></header>

    <section className="organization-banner"><div><span>Organization</span><strong>{org?.name ?? "Active company"}</strong></div><div><span>Pending decisions</span><strong>{pendingCount}</strong></div><div><span>Approved</span><strong>{approvedCount}</strong></div><div><span>Rejected</span><strong>{rejectedCount}</strong></div></section>
    {params.message ? <p className="form-success" role="status">{params.message}</p> : null}
    {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}

    <section className="panel panel-wide" style={{ marginTop: 18 }}>
      <div className="panel-heading"><div><p className="label">Decision queue</p><h2>{approvals.length} decision items</h2></div><span className="pill">Granular approval</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 18 }}>
        <nav className="data-list" aria-label="Decision requests">
          {approvals.map((approval) => <Link key={approval.id} href={`/approvals/decisions?approval=${approval.id}`} style={{ display: "block", padding: "15px 0", borderBottom: "1px solid #e7eaf0", textDecoration: "none" }}>
            <strong>{approval.title}</strong><span style={{ display: "block", marginTop: 6, color: "#717b8e", fontSize: ".82rem" }}>{approval.risk_level} risk · {approval.status}</span><span style={{ display: "block", marginTop: 6, color: "#596579", fontSize: ".88rem", lineHeight: 1.5 }}>{approval.summary}</span>
          </Link>)}
        </nav>

        {selected ? <article style={{ border: "1px solid #dfe4ec", borderRadius: 16, padding: 20, background: "#f8f9fb" }}>
          <div className="panel-heading"><div><p className="label">Decision report</p><h2>{selected.title}</h2></div><div className="row-meta"><span>{selected.risk_level} risk</span><b className={selected.status === "pending" ? "state-paused" : "state-active"}>{selected.status}</b></div></div>
          <p style={{ color: "#596579", lineHeight: 1.65 }}>{selected.summary}</p>

          {Object.keys(packet).length ? <section style={{ marginTop: 18 }}><p className="label">What the agency is asking you to decide</p><div style={{ display: "grid", gap: 12 }}>{Object.entries(packet).map(([key, value]) => <div key={key} style={{ border: "1px solid #e1e6ef", borderRadius: 12, background: "#fff", padding: 14 }}><strong style={{ display: "block", marginBottom: 8, fontSize: "1rem" }}>{humanize(key)}</strong><div style={{ color: "#596579" }}><PacketValue value={value} /></div></div>)}</div></section> : null}

          <section style={{ marginTop: 18 }}><p className="label">Governance impact</p><div className="compact-list">{selected.execution_expected_impact ? <div><strong>Expected impact</strong><span>{selected.execution_expected_impact}</span></div> : null}{selected.execution_reversibility ? <div><strong>Reversibility</strong><span>{selected.execution_reversibility}</span></div> : null}<div><strong>Requested</strong><span>{formatDate(selected.created_at)}</span></div></div></section>

          <section style={{ marginTop: 18 }}><p className="label">Binding conditions</p>{asConditions(selected.conditions).length ? <ul style={{ paddingLeft: 20, color: "#596579", lineHeight: 1.7 }}>{asConditions(selected.conditions).map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="empty-state">No conditions attached.</p>}</section>

          {selected.status === "pending" ? <form action={resolveDecision} className="auth-form" style={{ marginTop: 20 }}><input type="hidden" name="approvalId" value={selected.id}/><label>CEO decision note<textarea name="responseNote" minLength={3} required rows={5} placeholder="Explain your decision. If approving with conditions, state the exact limits or changes required." style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10, font: "inherit" }}/></label><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}><button name="resolution" value="approved" type="submit">Approve this decision</button><button name="resolution" value="rejected" type="submit" style={{ background: "#8f2335" }}>Reject this decision</button></div><p className="security-note">Approval applies only to this decision and its listed conditions. Other pending decisions remain independent.</p></form> : <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "#fff" }}><p className="label">CEO response</p><p style={{ color: "#596579", lineHeight: 1.6 }}>{selected.response_note ?? "No response note recorded."}</p><span className="muted-copy">Resolved: {formatDate(selected.resolved_at)}</span></div>}
        </article> : <p className="empty-state">No granular decision requests are available.</p>}
      </div>
    </section>
  </main>;
}
