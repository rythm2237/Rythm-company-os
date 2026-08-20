import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  requireOrganizationContext,
  requireOwnerOrganizationContext,
} from "@/lib/auth/organization-context";

export const dynamic = "force-dynamic";

type MailboxRow = {
  id: string;
  local_part: string;
  address: string;
  display_name: string;
  purpose: string;
  assigned_agent_id: string | null;
  approval_mode: string;
  is_active: boolean;
};

type ForwardingRow = {
  id: string;
  mailbox_id: string;
  destination_email: string;
  verification_status: string;
  is_active: boolean;
  created_at: string;
};

type ProviderRow = {
  id: string;
  provider_code: string;
  display_name: string;
  status: string;
  external_domain: string | null;
  inbound_enabled: boolean;
  outbound_enabled: boolean;
  metadata: Record<string, unknown>;
};

type ThreadRow = {
  id: string;
  mailbox_id: string | null;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  sender_name: string | null;
  sender_email: string | null;
  assigned_agent_id: string | null;
  requires_manager_attention: boolean;
  manager_attention_reason: string | null;
  ai_summary: string | null;
  related_meeting_id: string | null;
  related_action_item_id: string | null;
  last_message_at: string;
};

type MessageRow = {
  id: string;
  direction: string;
  status: string;
  sender_name: string | null;
  sender_email: string | null;
  recipients: unknown;
  subject: string | null;
  body_text: string | null;
  drafted_by_agent_id: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
};

type AgentRow = {
  id: string;
  name: string;
  display_name: string | null;
  role_title: string;
  agent_code: string;
  department: string | null;
  enabled: boolean;
};

type CommunicationPageProps = {
  searchParams: Promise<{
    view?: string;
    mailbox?: string;
    thread?: string;
    message?: string;
    error?: string;
  }>;
};

const validViews = new Set(["inbox", "waiting", "approvals", "resolved", "settings"]);
const validApprovalModes = new Set(["draft_only", "approval_required"]);

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function priorityLabel(priority: string) {
  if (priority === "urgent") return "Urgent";
  if (priority === "high") return "High";
  if (priority === "low") return "Low";
  return "Normal";
}

async function updateMailboxRouting(formData: FormData) {
  "use server";

  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const mailboxId = String(formData.get("mailboxId") ?? "").trim();
  const assignedAgentId = String(formData.get("assignedAgentId") ?? "").trim() || null;
  const approvalMode = String(formData.get("approvalMode") ?? "approval_required").trim();
  const isActive = formData.get("isActive") === "on";

  if (!mailboxId || !validApprovalModes.has(approvalMode)) {
    redirect("/communication?view=settings&error=Invalid%20mailbox%20configuration.");
  }

  const { data: mailbox } = await supabase
    .from("communication_mailboxes")
    .select("id,address")
    .eq("organization_id", organizationId)
    .eq("id", mailboxId)
    .maybeSingle();

  if (!mailbox) {
    redirect("/communication?view=settings&error=Mailbox%20not%20found.");
  }

  if (assignedAgentId) {
    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", assignedAgentId)
      .eq("enabled", true)
      .maybeSingle();

    if (!agent) {
      redirect("/communication?view=settings&error=Assigned%20agent%20is%20not%20available.");
    }
  }

  const { error } = await supabase
    .from("communication_mailboxes")
    .update({
      assigned_agent_id: assignedAgentId,
      approval_mode: approvalMode,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", mailboxId);

  if (error) {
    redirect(`/communication?view=settings&error=${encodeURIComponent(error.message)}`);
  }

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "communication.mailbox_updated",
    object_type: "communication_mailbox",
    object_id: mailboxId,
    risk_level: "low",
    payload: {
      address: mailbox.address,
      assigned_agent_id: assignedAgentId,
      approval_mode: approvalMode,
      is_active: isActive,
      auto_send_enabled: false,
    },
  });

  revalidatePath("/communication");
  redirect("/communication?view=settings&message=Mailbox%20routing%20updated.");
}

async function createForwardingRule(formData: FormData) {
  "use server";

  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const mailboxId = String(formData.get("mailboxId") ?? "").trim();
  const destinationEmail = String(formData.get("destinationEmail") ?? "").trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!mailboxId || !emailPattern.test(destinationEmail) || destinationEmail.length > 254) {
    redirect("/communication?view=settings&error=Enter%20a%20valid%20forwarding%20email.");
  }

  const { data: mailbox } = await supabase
    .from("communication_mailboxes")
    .select("id,address")
    .eq("organization_id", organizationId)
    .eq("id", mailboxId)
    .maybeSingle();

  if (!mailbox) {
    redirect("/communication?view=settings&error=Mailbox%20not%20found.");
  }

  const { data: rule, error } = await supabase
    .from("communication_forwarding_rules")
    .insert({
      organization_id: organizationId,
      mailbox_id: mailboxId,
      destination_email: destinationEmail,
      verification_status: "pending",
      is_active: false,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (error || !rule) {
    const message = error?.code === "23505"
      ? "This forwarding destination already exists for the mailbox."
      : error?.message ?? "Forwarding rule could not be created.";
    redirect(`/communication?view=settings&error=${encodeURIComponent(message)}`);
  }

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "communication.forwarding_requested",
    object_type: "communication_forwarding_rule",
    object_id: rule.id,
    risk_level: "medium",
    payload: {
      mailbox: mailbox.address,
      destination_email: destinationEmail,
      verification_status: "pending",
      forwarding_active: false,
    },
  });

  revalidatePath("/communication");
  redirect("/communication?view=settings&message=Forwarding%20destination%20saved.%20Verification%20is%20required%20before%20activation.");
}

async function disableForwardingRule(formData: FormData) {
  "use server";

  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const ruleId = String(formData.get("ruleId") ?? "").trim();
  if (!ruleId) redirect("/communication?view=settings&error=Forwarding%20rule%20not%20found.");

  const { data: rule } = await supabase
    .from("communication_forwarding_rules")
    .select("id,destination_email")
    .eq("organization_id", organizationId)
    .eq("id", ruleId)
    .maybeSingle();

  if (!rule) redirect("/communication?view=settings&error=Forwarding%20rule%20not%20found.");

  const { error } = await supabase
    .from("communication_forwarding_rules")
    .update({
      verification_status: "disabled",
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", ruleId);

  if (error) redirect(`/communication?view=settings&error=${encodeURIComponent(error.message)}`);

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "communication.forwarding_disabled",
    object_type: "communication_forwarding_rule",
    object_id: ruleId,
    risk_level: "low",
    payload: { destination_email: rule.destination_email },
  });

  revalidatePath("/communication");
  redirect("/communication?view=settings&message=Forwarding%20rule%20disabled.");
}

async function resolveThread(formData: FormData) {
  "use server";

  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const threadId = String(formData.get("threadId") ?? "").trim();
  if (!threadId) redirect("/communication?error=Conversation%20not%20found.");

  const { error } = await supabase
    .from("communication_threads")
    .update({ status: "resolved", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", threadId);

  if (error) redirect(`/communication?error=${encodeURIComponent(error.message)}`);

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "communication.thread_resolved",
    object_type: "communication_thread",
    object_id: threadId,
    risk_level: "low",
    payload: { status: "resolved" },
  });

  revalidatePath("/communication");
  redirect("/communication?view=inbox&message=Conversation%20resolved.");
}

export default async function CommunicationPage({ searchParams }: CommunicationPageProps) {
  const params = await searchParams;
  const context = await requireOrganizationContext();
  const { supabase, organizationId, organization, role } = context;
  const view = validViews.has(params.view ?? "") ? (params.view as string) : "inbox";
  const selectedMailboxId = params.mailbox?.trim() ?? "";
  const selectedThreadId = params.thread?.trim() ?? "";
  const isOwner = role === "owner";

  const [settingsResult, providersResult, mailboxesResult, forwardingResult, agentsResult] = await Promise.all([
    supabase
      .from("communication_settings")
      .select("managed_subdomain,managed_domain,communication_manager_agent_id,default_approval_mode,manager_escalation_priority,auto_send_enabled")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("communication_provider_connections")
      .select("id,provider_code,display_name,status,external_domain,inbound_enabled,outbound_enabled,metadata")
      .eq("organization_id", organizationId)
      .order("created_at"),
    supabase
      .from("communication_mailboxes")
      .select("id,local_part,address,display_name,purpose,assigned_agent_id,approval_mode,is_active")
      .eq("organization_id", organizationId)
      .order("local_part"),
    supabase
      .from("communication_forwarding_rules")
      .select("id,mailbox_id,destination_email,verification_status,is_active,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("agents")
      .select("id,name,display_name,role_title,agent_code,department,enabled")
      .eq("organization_id", organizationId)
      .eq("enabled", true)
      .order("name"),
  ]);

  const settings = settingsResult.data;
  const providers = (providersResult.data ?? []) as ProviderRow[];
  const mailboxes = (mailboxesResult.data ?? []) as MailboxRow[];
  const forwardingRules = (forwardingResult.data ?? []) as ForwardingRow[];
  const agents = (agentsResult.data ?? []) as AgentRow[];
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const mailboxById = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]));

  let threadQuery = supabase
    .from("communication_threads")
    .select("id,mailbox_id,subject,status,priority,category,sender_name,sender_email,assigned_agent_id,requires_manager_attention,manager_attention_reason,ai_summary,related_meeting_id,related_action_item_id,last_message_at")
    .eq("organization_id", organizationId)
    .order("last_message_at", { ascending: false })
    .limit(75);

  if (selectedMailboxId) threadQuery = threadQuery.eq("mailbox_id", selectedMailboxId);
  if (view === "waiting") threadQuery = threadQuery.in("status", ["waiting_external", "waiting_internal"]);
  if (view === "approvals") threadQuery = threadQuery.eq("status", "approval_required");
  if (view === "resolved") threadQuery = threadQuery.eq("status", "resolved");
  if (view === "inbox") threadQuery = threadQuery.in("status", ["open", "waiting_external", "waiting_internal", "approval_required"]);

  const [threadsResult, openCountResult, approvalCountResult, attentionCountResult] = await Promise.all([
    view === "settings" ? Promise.resolve({ data: [] as ThreadRow[] }) : threadQuery,
    supabase
      .from("communication_threads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["open", "waiting_external", "waiting_internal", "approval_required"]),
    supabase
      .from("communication_messages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "pending_approval"),
    supabase
      .from("communication_threads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("requires_manager_attention", true)
      .neq("status", "resolved"),
  ]);

  const threads = (threadsResult.data ?? []) as ThreadRow[];

  let selectedThread: ThreadRow | null = null;
  let messages: MessageRow[] = [];
  if (selectedThreadId) {
    const [threadResult, messageResult] = await Promise.all([
      supabase
        .from("communication_threads")
        .select("id,mailbox_id,subject,status,priority,category,sender_name,sender_email,assigned_agent_id,requires_manager_attention,manager_attention_reason,ai_summary,related_meeting_id,related_action_item_id,last_message_at")
        .eq("organization_id", organizationId)
        .eq("id", selectedThreadId)
        .maybeSingle(),
      supabase
        .from("communication_messages")
        .select("id,direction,status,sender_name,sender_email,recipients,subject,body_text,drafted_by_agent_id,approved_by_user_id,approved_at,sent_at,created_at")
        .eq("organization_id", organizationId)
        .eq("thread_id", selectedThreadId)
        .order("created_at"),
    ]);
    selectedThread = (threadResult.data as ThreadRow | null) ?? null;
    messages = (messageResult.data ?? []) as MessageRow[];
  }

  const managedHost = settings
    ? `${settings.managed_subdomain}.${settings.managed_domain}`
    : `${organization.slug}.rythm-os.com`;
  const managedProvider = providers.find((provider) => provider.provider_code === "rythm_managed");
  const transportReady = Boolean(managedProvider?.inbound_enabled && managedProvider?.outbound_enabled);
  const communicationManager = settings?.communication_manager_agent_id
    ? agentById.get(settings.communication_manager_agent_id)
    : agents.find((agent) => agent.agent_code === "RYTHM-COMMS");

  const navigation = [
    ["inbox", "Inbox"],
    ["waiting", "Waiting"],
    ["approvals", "Approvals"],
    ["resolved", "Resolved"],
    ["settings", "Settings"],
  ] as const;

  return (
    <main className="communication-shell">
      <header className="communication-hero">
        <div>
          <p className="eyebrow">RYTHM COMMUNICATION CENTER</p>
          <h1>Company communications, governed by agents.</h1>
          <p className="communication-subtitle">
            One control plane for managed company email, triage, routing, drafts, escalation, and human approval.
          </p>
        </div>
        <div className="communication-hero-state">
          <span className={transportReady ? "comm-status is-ready" : "comm-status is-pending"}>
            <i aria-hidden="true" />{transportReady ? "Transport connected" : "Transport integration pending"}
          </span>
          <strong>{managedHost}</strong>
          <small>Auto-send: {settings?.auto_send_enabled ? "Enabled" : "Locked"}</small>
        </div>
      </header>

      {(params.message || params.error) ? (
        <div className={params.error ? "communication-alert is-error" : "communication-alert is-success"} role={params.error ? "alert" : "status"}>
          {params.error ?? params.message}
        </div>
      ) : null}

      <section className="communication-metrics" aria-label="Communication overview">
        <article><span>Open conversations</span><strong>{openCountResult.count ?? 0}</strong></article>
        <article><span>Pending approvals</span><strong>{approvalCountResult.count ?? 0}</strong></article>
        <article><span>Manager attention</span><strong>{attentionCountResult.count ?? 0}</strong></article>
        <article><span>Managed addresses</span><strong>{mailboxes.filter((mailbox) => mailbox.is_active).length}</strong></article>
      </section>

      <section className="communication-manager-card">
        <div>
          <span className="communication-manager-avatar" aria-hidden="true">@</span>
          <div>
            <p className="label">Communication owner</p>
            <h2>{communicationManager?.display_name ?? communicationManager?.name ?? "Communication Manager"}</h2>
            <p>{communicationManager?.role_title ?? "System communication orchestration agent"} · A2 governed authority</p>
          </div>
        </div>
        <div className="communication-capabilities" aria-label="Communication Manager authority">
          <span>Read</span><span>Classify</span><span>Assign</span><span>Summarize</span><span>Draft</span><span className="is-locked">Send locked</span>
        </div>
      </section>

      <nav className="communication-tabs" aria-label="Communication views">
        {navigation.map(([key, label]) => (
          <Link className={view === key ? "is-active" : ""} href={`/communication?view=${key}`} key={key}>{label}</Link>
        ))}
      </nav>

      {view === "settings" ? (
        <section className="communication-settings-grid">
          <div className="communication-panel communication-panel-wide">
            <div className="communication-panel-heading">
              <div><p className="label">Managed company email</p><h2>Virtual addresses</h2></div>
              <span className="comm-status is-ready">Provisioned</span>
            </div>
            <p className="communication-help">
              These addresses are the stable RYTHM identity for this company. Provider delivery is separated from the mailbox model so Gmail, Microsoft 365, custom domains, or managed transport can be connected later without changing agent workflows.
            </p>

            <div className="communication-mailbox-settings">
              {mailboxes.map((mailbox) => {
                const assignedAgent = mailbox.assigned_agent_id ? agentById.get(mailbox.assigned_agent_id) : null;
                return (
                  <article className="communication-mailbox-card" key={mailbox.id}>
                    <div className="communication-mailbox-title">
                      <div><strong>{mailbox.address}</strong><span>{mailbox.purpose}</span></div>
                      <span className={mailbox.is_active ? "comm-status is-ready" : "comm-status is-off"}>{mailbox.is_active ? "Active" : "Paused"}</span>
                    </div>
                    {isOwner ? (
                      <form action={updateMailboxRouting} className="communication-setting-form">
                        <input type="hidden" name="mailboxId" value={mailbox.id} />
                        <label>
                          <span>Responsible agent</span>
                          <select name="assignedAgentId" defaultValue={mailbox.assigned_agent_id ?? ""}>
                            <option value="">Unassigned</option>
                            {agents.map((agent) => (
                              <option value={agent.id} key={agent.id}>{agent.display_name ?? agent.name} — {agent.role_title}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Outbound governance</span>
                          <select name="approvalMode" defaultValue={validApprovalModes.has(mailbox.approval_mode) ? mailbox.approval_mode : "approval_required"}>
                            <option value="approval_required">Human approval required</option>
                            <option value="draft_only">Draft only</option>
                          </select>
                        </label>
                        <label className="communication-checkbox">
                          <input type="checkbox" name="isActive" defaultChecked={mailbox.is_active} />
                          <span>Mailbox active</span>
                        </label>
                        <button type="submit">Save routing</button>
                      </form>
                    ) : (
                      <p className="communication-readonly">Assigned to {assignedAgent?.display_name ?? assignedAgent?.name ?? "Unassigned"}. Owner access is required to change routing.</p>
                    )}
                  </article>
                );
              })}
            </div>
          </div>

          <div className="communication-panel">
            <div className="communication-panel-heading">
              <div><p className="label">Delivery layer</p><h2>Providers</h2></div>
            </div>
            <div className="communication-provider-list">
              {providers.map((provider) => (
                <article key={provider.id}>
                  <div><strong>{provider.display_name}</strong><span>{provider.external_domain ?? "No domain connected"}</span></div>
                  <span className={`comm-status ${provider.status === "connected" ? "is-ready" : "is-pending"}`}>{provider.status}</span>
                  <p>Inbound {provider.inbound_enabled ? "on" : "off"} · Outbound {provider.outbound_enabled ? "on" : "off"}</p>
                </article>
              ))}
              <article className="is-future"><div><strong>Google Workspace</strong><span>Existing company mailbox</span></div><span className="comm-status is-off">Not connected</span></article>
              <article className="is-future"><div><strong>Microsoft 365</strong><span>Existing company mailbox</span></div><span className="comm-status is-off">Not connected</span></article>
              <article className="is-future"><div><strong>Custom domain</strong><span>Bring your own domain</span></div><span className="comm-status is-off">Next phase</span></article>
            </div>
          </div>

          <div className="communication-panel communication-panel-wide">
            <div className="communication-panel-heading">
              <div><p className="label">Optional copies</p><h2>Forwarding destinations</h2></div>
              <span className="comm-status is-pending">Verification required</span>
            </div>
            <p className="communication-help">A forwarding address stays inactive until verification is completed. RYTHM remains the system of record even when a copy is forwarded elsewhere.</p>

            {isOwner ? (
              <form action={createForwardingRule} className="communication-forward-form">
                <label><span>Mailbox</span><select name="mailboxId" required>{mailboxes.map((mailbox) => <option value={mailbox.id} key={mailbox.id}>{mailbox.address}</option>)}</select></label>
                <label><span>Forward copy to</span><input type="email" name="destinationEmail" placeholder="name@example.com" required /></label>
                <button type="submit">Add destination</button>
              </form>
            ) : null}

            <div className="communication-forward-list">
              {forwardingRules.length ? forwardingRules.map((rule) => (
                <article key={rule.id}>
                  <div>
                    <strong>{rule.destination_email}</strong>
                    <span>{mailboxById.get(rule.mailbox_id)?.address ?? "Mailbox"} · Added {formatDate(rule.created_at)}</span>
                  </div>
                  <div className="communication-forward-actions">
                    <span className={`comm-status ${rule.is_active ? "is-ready" : "is-pending"}`}>{rule.verification_status}</span>
                    {isOwner && rule.verification_status !== "disabled" ? (
                      <form action={disableForwardingRule}><input type="hidden" name="ruleId" value={rule.id} /><button className="communication-text-button" type="submit">Disable</button></form>
                    ) : null}
                  </div>
                </article>
              )) : <p className="communication-empty">No forwarding destinations configured.</p>}
            </div>
          </div>
        </section>
      ) : (
        <section className="communication-inbox-layout">
          <aside className="communication-mailbox-nav">
            <div><p className="label">Addresses</p><strong>Company inboxes</strong></div>
            <Link href={`/communication?view=${view}`} className={!selectedMailboxId ? "is-active" : ""}><span>@</span><div><strong>All mail</strong><small>Every managed address</small></div></Link>
            {mailboxes.filter((mailbox) => mailbox.is_active).map((mailbox) => (
              <Link href={`/communication?view=${view}&mailbox=${mailbox.id}`} className={selectedMailboxId === mailbox.id ? "is-active" : ""} key={mailbox.id}>
                <span>{mailbox.local_part.slice(0, 1).toUpperCase()}</span><div><strong>{mailbox.display_name}</strong><small>{mailbox.address}</small></div>
              </Link>
            ))}
          </aside>

          <div className="communication-thread-list">
            <div className="communication-list-heading">
              <div><p className="label">{view}</p><h2>{selectedMailboxId ? mailboxById.get(selectedMailboxId)?.display_name ?? "Mailbox" : "All company communication"}</h2></div>
              <span>{threads.length} shown</span>
            </div>

            {threads.length ? threads.map((thread) => {
              const assignedAgent = thread.assigned_agent_id ? agentById.get(thread.assigned_agent_id) : null;
              return (
                <Link href={`/communication?view=${view}${selectedMailboxId ? `&mailbox=${selectedMailboxId}` : ""}&thread=${thread.id}`} className={`communication-thread-row${selectedThreadId === thread.id ? " is-active" : ""}`} key={thread.id}>
                  <div className="communication-thread-topline">
                    <strong>{thread.sender_name ?? thread.sender_email ?? "Unknown sender"}</strong>
                    <time>{formatDate(thread.last_message_at)}</time>
                  </div>
                  <h3>{thread.subject}</h3>
                  <p>{thread.ai_summary ?? "No AI summary yet."}</p>
                  <div className="communication-thread-meta">
                    <span className={`priority-${thread.priority}`}>{priorityLabel(thread.priority)}</span>
                    <span>{thread.category ?? "Unclassified"}</span>
                    <span>{assignedAgent?.display_name ?? assignedAgent?.name ?? "Unassigned"}</span>
                    {thread.requires_manager_attention ? <span className="needs-attention">Manager attention</span> : null}
                  </div>
                </Link>
              );
            }) : (
              <div className="communication-empty-state">
                <span aria-hidden="true">@</span>
                <h2>No conversations in this view.</h2>
                <p>Managed addresses and routing are provisioned. Real inbound messages will appear here once the email transport provider is connected.</p>
                <Link href="/communication?view=settings">Review email setup</Link>
              </div>
            )}
          </div>

          <aside className="communication-thread-detail">
            {selectedThread ? (
              <>
                <div className="communication-detail-heading">
                  <div><p className="label">Conversation</p><h2>{selectedThread.subject}</h2></div>
                  <span className={`comm-status ${selectedThread.status === "resolved" ? "is-ready" : "is-pending"}`}>{selectedThread.status.replaceAll("_", " ")}</span>
                </div>
                <div className="communication-detail-meta">
                  <div><span>From</span><strong>{selectedThread.sender_name ?? selectedThread.sender_email ?? "Unknown"}</strong></div>
                  <div><span>Mailbox</span><strong>{selectedThread.mailbox_id ? mailboxById.get(selectedThread.mailbox_id)?.address ?? "—" : "—"}</strong></div>
                  <div><span>Owner</span><strong>{selectedThread.assigned_agent_id ? agentById.get(selectedThread.assigned_agent_id)?.display_name ?? agentById.get(selectedThread.assigned_agent_id)?.name ?? "Unassigned" : "Unassigned"}</strong></div>
                  <div><span>Priority</span><strong>{priorityLabel(selectedThread.priority)}</strong></div>
                </div>

                {selectedThread.ai_summary ? <div className="communication-summary"><span>AI summary</span><p>{selectedThread.ai_summary}</p></div> : null}
                {selectedThread.requires_manager_attention ? <div className="communication-escalation"><strong>Manager attention required</strong><p>{selectedThread.manager_attention_reason ?? "This conversation was escalated by the communication workflow."}</p></div> : null}

                <div className="communication-message-list">
                  {messages.length ? messages.map((message) => (
                    <article className={`communication-message is-${message.direction}`} key={message.id}>
                      <header><strong>{message.sender_name ?? message.sender_email ?? (message.direction === "draft" ? "Agent draft" : "Company")}</strong><span>{message.direction} · {message.status} · {formatDate(message.created_at)}</span></header>
                      <p>{message.body_text ?? "Message body is not available in plain text."}</p>
                      {message.status === "pending_approval" ? <div className="communication-approval-note">External sending remains blocked until a Human CEO approves this draft.</div> : null}
                    </article>
                  )) : <p className="communication-empty">No messages are stored for this conversation.</p>}
                </div>

                {isOwner && selectedThread.status !== "resolved" ? (
                  <form action={resolveThread} className="communication-detail-actions">
                    <input type="hidden" name="threadId" value={selectedThread.id} />
                    <button type="submit">Mark resolved</button>
                  </form>
                ) : null}
              </>
            ) : (
              <div className="communication-detail-empty"><span aria-hidden="true">↗</span><strong>Select a conversation</strong><p>Review the message history, AI summary, routing owner, escalation state, and governed drafts here.</p></div>
            )}
          </aside>
        </section>
      )}

      <section className="communication-governance-note">
        <strong>Human-governed by default</strong>
        <p>RYTHM agents can read, classify, route, summarize, and draft. Autonomous external sending is intentionally disabled in this MVP. Financial, legal, contractual, security, urgent, and high-impact communication must be escalated for human review.</p>
      </section>
    </main>
  );
}
