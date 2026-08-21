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

type ThreadRow = {
  id: string;
  mailbox_id: string | null;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  sender_name: string | null;
  sender_email: string | null;
  draft_recipient_email: string | null;
  assigned_agent_id: string | null;
  requires_manager_attention: boolean;
  manager_attention_reason: string | null;
  ai_summary: string | null;
  last_message_at: string;
  updated_at: string;
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
    compose?: string;
    message?: string;
    error?: string;
  }>;
};

const validViews = new Set(["inbox", "drafts", "waiting", "approvals", "resolved", "settings"]);
const validApprovalModes = new Set(["draft_only", "approval_required"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function recipientLabel(recipients: unknown) {
  if (!Array.isArray(recipients)) return "—";
  return recipients.filter((item) => typeof item === "string").join(", ") || "—";
}

async function createDraft(formData: FormData) {
  "use server";

  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const mailboxId = String(formData.get("mailboxId") ?? "").trim();
  const recipient = String(formData.get("recipient") ?? "").trim().toLowerCase();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!mailboxId || !emailPattern.test(recipient) || !subject || !body) {
    redirect("/communication?compose=1&error=From,%20recipient,%20subject,%20and%20message%20are%20required.");
  }

  const { data: mailbox } = await supabase
    .from("communication_mailboxes")
    .select("id,address,assigned_agent_id,is_active")
    .eq("organization_id", organizationId)
    .eq("id", mailboxId)
    .maybeSingle();

  if (!mailbox?.is_active) {
    redirect("/communication?compose=1&error=The%20selected%20mailbox%20is%20not%20available.");
  }

  const now = new Date().toISOString();
  const { data: thread, error: threadError } = await supabase
    .from("communication_threads")
    .insert({
      organization_id: organizationId,
      mailbox_id: mailbox.id,
      subject: subject.slice(0, 300),
      normalized_subject: subject.toLowerCase().slice(0, 300),
      status: "draft",
      priority: "normal",
      category: "Outbound",
      sender_name: "RYTHM Company",
      sender_email: mailbox.address,
      draft_recipient_email: recipient,
      assigned_agent_id: mailbox.assigned_agent_id,
      created_by_user_id: user.id,
      last_message_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (threadError || !thread) {
    redirect(`/communication?compose=1&error=${encodeURIComponent(threadError?.message ?? "Draft could not be created.")}`);
  }

  const { data: message, error: messageError } = await supabase
    .from("communication_messages")
    .insert({
      organization_id: organizationId,
      thread_id: thread.id,
      mailbox_id: mailbox.id,
      direction: "draft",
      status: "draft",
      sender_name: "RYTHM Company",
      sender_email: mailbox.address,
      recipients: [recipient],
      subject: subject.slice(0, 300),
      body_text: body,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (messageError || !message) {
    await supabase.from("communication_threads").delete().eq("organization_id", organizationId).eq("id", thread.id);
    redirect(`/communication?compose=1&error=${encodeURIComponent(messageError?.message ?? "Draft message could not be created.")}`);
  }

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "communication.native_draft_created",
    object_type: "communication_thread",
    object_id: thread.id,
    risk_level: "low",
    payload: {
      mailbox: mailbox.address,
      recipient,
      message_id: message.id,
      external_delivery_attempted: false,
    },
  });

  revalidatePath("/communication");
  redirect(`/communication?view=drafts&thread=${thread.id}&message=Draft%20saved%20inside%20RYTHM.`);
}

async function createReplyDraft(formData: FormData) {
  "use server";

  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const threadId = String(formData.get("threadId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!threadId || !body) redirect("/communication?error=Reply%20text%20is%20required.");

  const { data: thread } = await supabase
    .from("communication_threads")
    .select("id,mailbox_id,subject,sender_email,draft_recipient_email")
    .eq("organization_id", organizationId)
    .eq("id", threadId)
    .maybeSingle();

  if (!thread?.mailbox_id) redirect("/communication?error=Conversation%20mailbox%20is%20not%20available.");

  const { data: mailbox } = await supabase
    .from("communication_mailboxes")
    .select("address")
    .eq("organization_id", organizationId)
    .eq("id", thread.mailbox_id)
    .maybeSingle();

  const recipient = thread.draft_recipient_email || thread.sender_email;
  if (!mailbox || !recipient || !emailPattern.test(recipient)) {
    redirect(`/communication?thread=${threadId}&error=No%20valid%20reply%20recipient%20was%20found.`);
  }

  const { error } = await supabase.from("communication_messages").insert({
    organization_id: organizationId,
    thread_id: threadId,
    mailbox_id: thread.mailbox_id,
    direction: "draft",
    status: "draft",
    sender_name: "RYTHM Company",
    sender_email: mailbox.address,
    recipients: [recipient],
    subject: thread.subject,
    body_text: body,
    created_by_user_id: user.id,
  });

  if (error) redirect(`/communication?thread=${threadId}&error=${encodeURIComponent(error.message)}`);

  await supabase
    .from("communication_threads")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", threadId);

  revalidatePath("/communication");
  redirect(`/communication?view=drafts&thread=${threadId}&message=Reply%20draft%20saved.`);
}

async function submitDraftForApproval(formData: FormData) {
  "use server";

  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const threadId = String(formData.get("threadId") ?? "").trim();
  const messageId = String(formData.get("messageId") ?? "").trim();
  if (!threadId || !messageId) redirect("/communication?view=drafts&error=Draft%20not%20found.");

  const { data: message } = await supabase
    .from("communication_messages")
    .select("id,status,thread_id")
    .eq("organization_id", organizationId)
    .eq("thread_id", threadId)
    .eq("id", messageId)
    .maybeSingle();

  if (!message || message.status !== "draft") {
    redirect(`/communication?view=drafts&thread=${threadId}&error=Only%20saved%20drafts%20can%20be%20submitted.`);
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("communication_messages")
    .update({ status: "pending_approval", updated_at: now })
    .eq("organization_id", organizationId)
    .eq("id", messageId);

  if (error) redirect(`/communication?view=drafts&thread=${threadId}&error=${encodeURIComponent(error.message)}`);

  await supabase
    .from("communication_threads")
    .update({ status: "approval_required", updated_at: now })
    .eq("organization_id", organizationId)
    .eq("id", threadId);

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "communication.draft_submitted_for_approval",
    object_type: "communication_message",
    object_id: messageId,
    risk_level: "medium",
    payload: { thread_id: threadId, external_delivery_attempted: false },
  });

  revalidatePath("/communication");
  redirect(`/communication?view=approvals&thread=${threadId}&message=Draft%20moved%20to%20Human%20approval.`);
}

async function approveDraftForDelivery(formData: FormData) {
  "use server";

  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const threadId = String(formData.get("threadId") ?? "").trim();
  const messageId = String(formData.get("messageId") ?? "").trim();
  if (!threadId || !messageId) redirect("/communication?view=approvals&error=Approval%20item%20not%20found.");

  const now = new Date().toISOString();
  const { data: message } = await supabase
    .from("communication_messages")
    .select("id,status")
    .eq("organization_id", organizationId)
    .eq("thread_id", threadId)
    .eq("id", messageId)
    .maybeSingle();

  if (!message || message.status !== "pending_approval") {
    redirect(`/communication?view=approvals&thread=${threadId}&error=This%20draft%20is%20not%20awaiting%20approval.`);
  }

  const { error } = await supabase
    .from("communication_messages")
    .update({
      status: "ready_for_delivery",
      approved_by_user_id: user.id,
      approved_at: now,
      updated_at: now,
    })
    .eq("organization_id", organizationId)
    .eq("id", messageId);

  if (error) redirect(`/communication?view=approvals&thread=${threadId}&error=${encodeURIComponent(error.message)}`);

  await supabase
    .from("communication_threads")
    .update({ status: "waiting_internal", updated_at: now })
    .eq("organization_id", organizationId)
    .eq("id", threadId);

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "communication.message_approved_for_delivery",
    object_type: "communication_message",
    object_id: messageId,
    risk_level: "medium",
    payload: {
      thread_id: threadId,
      delivery_state: "ready_for_delivery",
      external_delivery_attempted: false,
      reason: "RYTHM managed transport is not enabled yet",
    },
  });

  revalidatePath("/communication");
  redirect(`/communication?view=waiting&thread=${threadId}&message=Approved.%20Message%20is%20ready%20for%20RYTHM%20delivery%20when%20transport%20is%20enabled.`);
}

async function updateThreadAssignment(formData: FormData) {
  "use server";

  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const threadId = String(formData.get("threadId") ?? "").trim();
  const assignedAgentId = String(formData.get("assignedAgentId") ?? "").trim() || null;
  const priority = String(formData.get("priority") ?? "normal").trim();
  if (!threadId || !["low", "normal", "high", "urgent"].includes(priority)) {
    redirect("/communication?error=Invalid%20conversation%20routing.");
  }

  if (assignedAgentId) {
    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", assignedAgentId)
      .eq("enabled", true)
      .maybeSingle();
    if (!agent) redirect(`/communication?thread=${threadId}&error=Agent%20is%20not%20available.`);
  }

  const { error } = await supabase
    .from("communication_threads")
    .update({ assigned_agent_id: assignedAgentId, priority, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", threadId);

  if (error) redirect(`/communication?thread=${threadId}&error=${encodeURIComponent(error.message)}`);

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "communication.thread_routed",
    object_type: "communication_thread",
    object_id: threadId,
    risk_level: "low",
    payload: { assigned_agent_id: assignedAgentId, priority },
  });

  revalidatePath("/communication");
  redirect(`/communication?thread=${threadId}&message=Conversation%20routing%20updated.`);
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

  if (assignedAgentId) {
    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", assignedAgentId)
      .eq("enabled", true)
      .maybeSingle();
    if (!agent) redirect("/communication?view=settings&error=Assigned%20agent%20is%20not%20available.");
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

  if (error) redirect(`/communication?view=settings&error=${encodeURIComponent(error.message)}`);

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "communication.mailbox_updated",
    object_type: "communication_mailbox",
    object_id: mailboxId,
    risk_level: "low",
    payload: { assigned_agent_id: assignedAgentId, approval_mode: approvalMode, is_active: isActive },
  });

  revalidatePath("/communication");
  redirect("/communication?view=settings&message=Mailbox%20routing%20updated.");
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
  const { supabase, organizationId, organization, role } = await requireOrganizationContext();
  const view = validViews.has(params.view ?? "") ? (params.view as string) : "inbox";
  const selectedMailboxId = params.mailbox?.trim() ?? "";
  const selectedThreadId = params.thread?.trim() ?? "";
  const composeOpen = params.compose === "1";
  const isOwner = role === "owner";

  const [settingsResult, providersResult, mailboxesResult, agentsResult] = await Promise.all([
    supabase
      .from("communication_settings")
      .select("managed_subdomain,managed_domain,communication_manager_agent_id,auto_send_enabled,mailbox_mode,external_integrations_visible")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("communication_provider_connections")
      .select("provider_code,inbound_enabled,outbound_enabled,status")
      .eq("organization_id", organizationId),
    supabase
      .from("communication_mailboxes")
      .select("id,local_part,address,display_name,purpose,assigned_agent_id,approval_mode,is_active")
      .eq("organization_id", organizationId)
      .order("local_part"),
    supabase
      .from("agents")
      .select("id,name,display_name,role_title,agent_code,department,enabled")
      .eq("organization_id", organizationId)
      .eq("enabled", true)
      .order("name"),
  ]);

  const settings = settingsResult.data;
  const mailboxes = (mailboxesResult.data ?? []) as MailboxRow[];
  const agents = (agentsResult.data ?? []) as AgentRow[];
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const mailboxById = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]));
  const managedProvider = (providersResult.data ?? []).find((provider) => provider.provider_code === "rythm_managed");
  const transportReady = Boolean(managedProvider?.inbound_enabled && managedProvider?.outbound_enabled);
  const managedHost = settings
    ? `${settings.managed_subdomain}.${settings.managed_domain}`
    : `${organization.slug}.rythm-os.com`;
  const communicationManager = settings?.communication_manager_agent_id
    ? agentById.get(settings.communication_manager_agent_id)
    : agents.find((agent) => agent.agent_code === "RYTHM-COMMS");

  let threadQuery = supabase
    .from("communication_threads")
    .select("id,mailbox_id,subject,status,priority,category,sender_name,sender_email,draft_recipient_email,assigned_agent_id,requires_manager_attention,manager_attention_reason,ai_summary,last_message_at,updated_at")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (selectedMailboxId) threadQuery = threadQuery.eq("mailbox_id", selectedMailboxId);
  if (view === "drafts") threadQuery = threadQuery.eq("status", "draft");
  if (view === "waiting") threadQuery = threadQuery.in("status", ["waiting_external", "waiting_internal"]);
  if (view === "approvals") threadQuery = threadQuery.eq("status", "approval_required");
  if (view === "resolved") threadQuery = threadQuery.eq("status", "resolved");
  if (view === "inbox") threadQuery = threadQuery.in("status", ["open", "waiting_external", "approval_required"]);

  const [threadsResult, openCountResult, draftCountResult, approvalCountResult, readyCountResult] = await Promise.all([
    view === "settings" ? Promise.resolve({ data: [] as ThreadRow[] }) : threadQuery,
    supabase.from("communication_threads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["open", "waiting_external", "approval_required"]),
    supabase.from("communication_threads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "draft"),
    supabase.from("communication_messages").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pending_approval"),
    supabase.from("communication_messages").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "ready_for_delivery"),
  ]);

  const threads = (threadsResult.data ?? []) as ThreadRow[];
  let selectedThread: ThreadRow | null = null;
  let messages: MessageRow[] = [];

  if (selectedThreadId) {
    const [threadResult, messageResult] = await Promise.all([
      supabase
        .from("communication_threads")
        .select("id,mailbox_id,subject,status,priority,category,sender_name,sender_email,draft_recipient_email,assigned_agent_id,requires_manager_attention,manager_attention_reason,ai_summary,last_message_at,updated_at")
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

  const navigation = [
    ["inbox", "Inbox"],
    ["drafts", "Drafts"],
    ["approvals", "Approvals"],
    ["waiting", "Waiting"],
    ["resolved", "Resolved"],
    ["settings", "Settings"],
  ] as const;

  return (
    <main className="communication-shell native-mailbox-shell">
      <header className="communication-hero native-mailbox-hero">
        <div>
          <p className="eyebrow">RYTHM MAIL</p>
          <h1>Your company mailbox lives inside RYTHM.</h1>
          <p className="communication-subtitle">
            Read, compose, route, review, and manage company communication with your AI team from one governed workspace.
          </p>
        </div>
        <div className="communication-hero-state">
          <span className="comm-status is-ready"><i aria-hidden="true" />RYTHM mailbox active</span>
          <strong>{managedHost}</strong>
          <small>{transportReady ? "Internet delivery connected" : "Internet delivery adapter not connected yet"}</small>
        </div>
      </header>

      {(params.message || params.error) ? (
        <div className={params.error ? "communication-alert is-error" : "communication-alert is-success"} role={params.error ? "alert" : "status"}>
          {params.error ?? params.message}
        </div>
      ) : null}

      <section className="native-mailbox-toolbar">
        <div>
          <Link className="native-compose-button" href="/communication?compose=1">+ Compose</Link>
          <div className="native-mailbox-identity">
            <span>Company mailbox</span>
            <strong>{mailboxes.find((mailbox) => mailbox.local_part === "contact")?.address ?? `contact@${managedHost}`}</strong>
          </div>
        </div>
        {!transportReady ? (
          <div className="native-transport-note">
            <strong>Mailbox workflow is live.</strong>
            <span>External send/receive remains safely blocked until the RYTHM transport adapter is activated.</span>
          </div>
        ) : null}
      </section>

      <section className="communication-metrics" aria-label="Mailbox overview">
        <article><span>Inbox</span><strong>{openCountResult.count ?? 0}</strong></article>
        <article><span>Drafts</span><strong>{draftCountResult.count ?? 0}</strong></article>
        <article><span>Needs approval</span><strong>{approvalCountResult.count ?? 0}</strong></article>
        <article><span>Ready for delivery</span><strong>{readyCountResult.count ?? 0}</strong></article>
      </section>

      {composeOpen ? (
        <section className="communication-panel native-compose-panel">
          <div className="communication-panel-heading">
            <div><p className="label">New message</p><h2>Compose inside RYTHM</h2></div>
            <Link href="/communication?view=inbox">Close</Link>
          </div>
          {isOwner ? (
            <form action={createDraft} className="native-compose-form">
              <label>
                <span>From</span>
                <select name="mailboxId" required defaultValue={mailboxes.find((mailbox) => mailbox.local_part === "contact")?.id ?? ""}>
                  {mailboxes.filter((mailbox) => mailbox.is_active).map((mailbox) => (
                    <option value={mailbox.id} key={mailbox.id}>{mailbox.address}</option>
                  ))}
                </select>
              </label>
              <label><span>To</span><input name="recipient" type="email" autoComplete="off" placeholder="customer@example.com" required /></label>
              <label><span>Subject</span><input name="subject" maxLength={300} required /></label>
              <label className="native-compose-body"><span>Message</span><textarea name="body" rows={10} required placeholder="Write the message or prepare it for an agent to refine." /></label>
              <div className="native-compose-actions">
                <button type="submit">Save draft</button>
                <span>No external message is sent by this action.</span>
              </div>
            </form>
          ) : <p className="communication-readonly">Owner access is required to compose external company email in the current beta.</p>}
        </section>
      ) : null}

      <section className="communication-manager-card">
        <div>
          <span className="communication-manager-avatar" aria-hidden="true">@</span>
          <div>
            <p className="label">AI mailbox operator</p>
            <h2>{communicationManager?.display_name ?? communicationManager?.name ?? "Communication Manager"}</h2>
            <p>{communicationManager?.role_title ?? "Communication orchestration agent"} · A2 governed authority</p>
          </div>
        </div>
        <div className="communication-capabilities">
          <span>Read</span><span>Classify</span><span>Assign</span><span>Summarize</span><span>Draft</span><span className="is-locked">Auto-send locked</span>
        </div>
      </section>

      <nav className="communication-tabs" aria-label="Mailbox views">
        {navigation.map(([key, label]) => (
          <Link className={view === key ? "is-active" : ""} href={`/communication?view=${key}`} key={key}>{label}</Link>
        ))}
      </nav>

      {view === "settings" ? (
        <section className="communication-settings-grid">
          <div className="communication-panel communication-panel-wide">
            <div className="communication-panel-heading">
              <div><p className="label">RYTHM-native company email</p><h2>Company addresses</h2></div>
              <span className="comm-status is-ready">Mailbox-first</span>
            </div>
            <p className="communication-help">
              These are the company identities employees and agents work with inside RYTHM. Gmail and Microsoft connections are optional future integrations, not requirements for using the Communication Center.
            </p>
            <div className="communication-mailbox-settings">
              {mailboxes.map((mailbox) => (
                <article className="communication-mailbox-card" key={mailbox.id}>
                  <div className="communication-mailbox-title">
                    <div><strong>{mailbox.address}</strong><span>{mailbox.purpose}</span></div>
                    <span className={mailbox.is_active ? "comm-status is-ready" : "comm-status is-off"}>{mailbox.is_active ? "Active" : "Paused"}</span>
                  </div>
                  {isOwner ? (
                    <form action={updateMailboxRouting} className="communication-setting-form">
                      <input type="hidden" name="mailboxId" value={mailbox.id} />
                      <label><span>Responsible agent</span><select name="assignedAgentId" defaultValue={mailbox.assigned_agent_id ?? ""}>
                        <option value="">Unassigned</option>
                        {agents.map((agent) => <option value={agent.id} key={agent.id}>{agent.display_name ?? agent.name} — {agent.role_title}</option>)}
                      </select></label>
                      <label><span>Outbound governance</span><select name="approvalMode" defaultValue={validApprovalModes.has(mailbox.approval_mode) ? mailbox.approval_mode : "approval_required"}>
                        <option value="approval_required">Human approval required</option>
                        <option value="draft_only">Draft only</option>
                      </select></label>
                      <label className="communication-checkbox"><input type="checkbox" name="isActive" defaultChecked={mailbox.is_active} /><span>Mailbox active</span></label>
                      <button type="submit">Save</button>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
          <div className="communication-panel">
            <div className="communication-panel-heading"><div><p className="label">Future option</p><h2>External integrations</h2></div></div>
            <div className="native-future-integrations">
              <strong>Not required</strong>
              <p>Google Workspace, Microsoft 365, personal forwarding, and custom-domain connections will be added later as optional convenience features.</p>
              <span>The RYTHM mailbox remains the canonical communication record.</span>
            </div>
          </div>
        </section>
      ) : (
        <section className="communication-workspace native-mailbox-workspace">
          <div className="communication-inbox-panel">
            <div className="communication-inbox-toolbar">
              <div>
                <strong>{navigation.find(([key]) => key === view)?.[1] ?? "Inbox"}</strong>
                <span>{threads.length} conversation{threads.length === 1 ? "" : "s"}</span>
              </div>
              <select aria-label="Filter mailbox" value={selectedMailboxId} onChange={() => undefined} disabled>
                <option value="">All company addresses</option>
              </select>
            </div>
            {threads.length ? threads.map((thread) => {
              const assignedAgent = thread.assigned_agent_id ? agentById.get(thread.assigned_agent_id) : null;
              const mailbox = thread.mailbox_id ? mailboxById.get(thread.mailbox_id) : null;
              return (
                <Link href={`/communication?view=${view}${selectedMailboxId ? `&mailbox=${selectedMailboxId}` : ""}&thread=${thread.id}`} className={`communication-thread-row${selectedThreadId === thread.id ? " is-active" : ""}`} key={thread.id}>
                  <div className="communication-thread-topline">
                    <strong>{thread.status === "draft" ? `To: ${thread.draft_recipient_email ?? "recipient"}` : thread.sender_name ?? thread.sender_email ?? "Unknown sender"}</strong>
                    <time>{formatDate(thread.updated_at)}</time>
                  </div>
                  <h3>{thread.subject}</h3>
                  <p>{thread.ai_summary ?? (thread.status === "draft" ? "Draft prepared inside RYTHM." : "No AI summary yet.")}</p>
                  <div className="communication-thread-meta">
                    <span className={`priority-${thread.priority}`}>{priorityLabel(thread.priority)}</span>
                    <span>{mailbox?.display_name ?? "Mailbox"}</span>
                    <span>{assignedAgent?.display_name ?? assignedAgent?.name ?? "Unassigned"}</span>
                    {thread.requires_manager_attention ? <span className="needs-attention">Manager attention</span> : null}
                  </div>
                </Link>
              );
            }) : (
              <div className="communication-empty-state">
                <span aria-hidden="true">@</span>
                <h2>{view === "inbox" ? "Your RYTHM inbox is ready." : "Nothing in this view."}</h2>
                <p>{view === "inbox" ? "Compose and govern company email here. Incoming internet email will appear in the same inbox once the backend transport adapter is activated." : "Items will appear here as the communication workflow progresses."}</p>
                {view === "inbox" ? <Link href="/communication?compose=1">Compose first message</Link> : null}
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
                  <div><span>{selectedThread.status === "draft" ? "To" : "From"}</span><strong>{selectedThread.status === "draft" ? selectedThread.draft_recipient_email ?? "—" : selectedThread.sender_name ?? selectedThread.sender_email ?? "Unknown"}</strong></div>
                  <div><span>Mailbox</span><strong>{selectedThread.mailbox_id ? mailboxById.get(selectedThread.mailbox_id)?.address ?? "—" : "—"}</strong></div>
                  <div><span>Owner</span><strong>{selectedThread.assigned_agent_id ? agentById.get(selectedThread.assigned_agent_id)?.display_name ?? agentById.get(selectedThread.assigned_agent_id)?.name ?? "Unassigned" : "Unassigned"}</strong></div>
                  <div><span>Priority</span><strong>{priorityLabel(selectedThread.priority)}</strong></div>
                </div>

                {selectedThread.ai_summary ? <div className="communication-summary"><span>AI summary</span><p>{selectedThread.ai_summary}</p></div> : null}
                {selectedThread.requires_manager_attention ? <div className="communication-escalation"><strong>Manager attention required</strong><p>{selectedThread.manager_attention_reason ?? "Escalated by the communication workflow."}</p></div> : null}

                {isOwner ? (
                  <form action={updateThreadAssignment} className="native-routing-form">
                    <input type="hidden" name="threadId" value={selectedThread.id} />
                    <label><span>Assign to agent</span><select name="assignedAgentId" defaultValue={selectedThread.assigned_agent_id ?? ""}><option value="">Unassigned</option>{agents.map((agent) => <option value={agent.id} key={agent.id}>{agent.display_name ?? agent.name}</option>)}</select></label>
                    <label><span>Priority</span><select name="priority" defaultValue={selectedThread.priority}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                    <button type="submit">Update routing</button>
                  </form>
                ) : null}

                <div className="communication-message-list">
                  {messages.length ? messages.map((message) => (
                    <article className={`communication-message is-${message.direction}`} key={message.id}>
                      <header>
                        <strong>{message.direction === "draft" ? `Draft to ${recipientLabel(message.recipients)}` : message.sender_name ?? message.sender_email ?? "Company"}</strong>
                        <span>{message.direction} · {message.status.replaceAll("_", " ")} · {formatDate(message.created_at)}</span>
                      </header>
                      <p>{message.body_text ?? "Message body is not available in plain text."}</p>
                      {message.status === "draft" && isOwner ? (
                        <form action={submitDraftForApproval} className="native-inline-action">
                          <input type="hidden" name="threadId" value={selectedThread.id} />
                          <input type="hidden" name="messageId" value={message.id} />
                          <button type="submit">Request approval</button>
                        </form>
                      ) : null}
                      {message.status === "pending_approval" && isOwner ? (
                        <form action={approveDraftForDelivery} className="native-inline-action is-approval">
                          <input type="hidden" name="threadId" value={selectedThread.id} />
                          <input type="hidden" name="messageId" value={message.id} />
                          <button type="submit">Approve for delivery</button>
                          <small>Approval does not falsely mark this as sent. It waits for the RYTHM transport adapter.</small>
                        </form>
                      ) : null}
                      {message.status === "ready_for_delivery" ? <div className="communication-approval-note">Approved by Human CEO. Ready for RYTHM delivery; internet transport is currently offline.</div> : null}
                    </article>
                  )) : <p className="communication-empty">No messages are stored for this conversation.</p>}
                </div>

                {isOwner && selectedThread.status !== "resolved" && selectedThread.status !== "draft" ? (
                  <form action={createReplyDraft} className="native-reply-form">
                    <input type="hidden" name="threadId" value={selectedThread.id} />
                    <label><span>Reply draft</span><textarea name="body" rows={5} required placeholder="Write a reply or hand it to the assigned agent for refinement." /></label>
                    <button type="submit">Save reply draft</button>
                  </form>
                ) : null}

                {isOwner && selectedThread.status !== "resolved" ? (
                  <form action={resolveThread} className="communication-detail-actions">
                    <input type="hidden" name="threadId" value={selectedThread.id} />
                    <button type="submit">Mark resolved</button>
                  </form>
                ) : null}
              </>
            ) : (
              <div className="communication-detail-empty"><span aria-hidden="true">↗</span><strong>Select a conversation</strong><p>Read the thread, assign an agent, prepare a response, and move it through human approval without leaving RYTHM.</p></div>
            )}
          </aside>
        </section>
      )}

      <section className="communication-governance-note">
        <strong>RYTHM is the mailbox. Human governance remains the safety boundary.</strong>
        <p>External Gmail or Microsoft accounts are not required. Agents can operate the communication workflow inside RYTHM; consequential outbound communication still requires explicit human approval, and external delivery remains fail-closed until the managed transport layer is activated.</p>
      </section>
    </main>
  );
}
