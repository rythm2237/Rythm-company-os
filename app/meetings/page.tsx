import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type MeetingStatus = "draft" | "scheduled" | "running" | "completed" | "cancelled";

type MeetingRow = {
  id: string;
  title: string;
  purpose: string;
  status: MeetingStatus;
  scheduled_for: string | null;
  started_at: string | null;
  ended_at: string | null;
  human_join_allowed: boolean;
  agenda: unknown;
  minutes: unknown;
  created_at: string;
};

type ActionRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  due_at: string | null;
  created_at: string;
};

type AuditRow = {
  id: number;
  actor_type: string;
  event_type: string;
  risk_level: string;
  created_at: string;
};

type MeetingPageProps = {
  searchParams: Promise<{
    meeting?: string;
    status?: string;
    message?: string;
    error?: string;
  }>;
};

const allowedStatuses = new Set<MeetingStatus>(["draft", "scheduled", "running", "completed", "cancelled"]);

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Not set";

const stringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
};

const minutesText = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    const text = (value as Record<string, unknown>).text;
    if (typeof text === "string") return text;
  }
  return JSON.stringify(value);
};

async function getOwnerContext() {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (!membership) redirect("/login?error=Owner%20authorization%20required.");
  return { supabase, user, organizationId: membership.organization_id as string };
}

async function createMeeting(formData: FormData) {
  "use server";

  const { supabase, user, organizationId } = await getOwnerContext();
  const title = String(formData.get("title") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim();
  const scheduleValue = String(formData.get("scheduledFor") ?? "").trim();
  const agenda = String(formData.get("agenda") ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  if (title.length < 3 || purpose.length < 3 || agenda.length === 0) {
    redirect("/meetings?error=Title%2C%20purpose%2C%20and%20at%20least%20one%20agenda%20item%20are%20required.");
  }

  const scheduledFor = scheduleValue ? new Date(scheduleValue) : null;
  if (scheduledFor && Number.isNaN(scheduledFor.getTime())) {
    redirect("/meetings?error=Scheduled%20date%20is%20invalid.");
  }

  const status: MeetingStatus = scheduledFor ? "scheduled" : "draft";
  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      organization_id: organizationId,
      title,
      purpose,
      status,
      scheduled_for: scheduledFor?.toISOString() ?? null,
      agenda,
      human_join_allowed: true,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (error || !meeting) {
    redirect(`/meetings?error=${encodeURIComponent(error?.message ?? "Meeting could not be created.")}`);
  }

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "meeting.created",
    object_type: "meeting",
    object_id: meeting.id,
    risk_level: "low",
    payload: { title, status, scheduled_for: scheduledFor?.toISOString() ?? null, agenda_count: agenda.length },
  });

  revalidatePath("/meetings");
  revalidatePath("/command-center");
  redirect(`/meetings?meeting=${meeting.id}&status=${status}&message=Meeting%20created.`);
}

async function transitionMeeting(formData: FormData) {
  "use server";

  const { supabase, user, organizationId } = await getOwnerContext();
  const meetingId = String(formData.get("meetingId") ?? "");
  const transition = String(formData.get("transition") ?? "");
  const minutes = String(formData.get("minutes") ?? "").trim();
  const actionItems = String(formData.get("actionItems") ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, title, status, scheduled_for")
    .eq("id", meetingId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!meeting) redirect("/meetings?error=Meeting%20not%20found.");

  const now = new Date().toISOString();
  let update: Record<string, unknown> = {};
  let nextStatus: MeetingStatus;
  let eventType: string;

  if (transition === "schedule" && meeting.status === "draft") {
    if (!meeting.scheduled_for) redirect(`/meetings?meeting=${meetingId}&error=A%20scheduled%20time%20is%20required.`);
    nextStatus = "scheduled";
    eventType = "meeting.scheduled";
    update = { status: nextStatus };
  } else if (transition === "start" && (meeting.status === "draft" || meeting.status === "scheduled")) {
    nextStatus = "running";
    eventType = "meeting.started";
    update = { status: nextStatus, started_at: now };
  } else if (transition === "complete" && meeting.status === "running") {
    if (minutes.length < 3) {
      redirect(`/meetings?meeting=${meetingId}&error=Meeting%20minutes%20are%20required%20before%20completion.`);
    }
    nextStatus = "completed";
    eventType = "meeting.completed";
    update = { status: nextStatus, minutes: { text: minutes }, ended_at: now };
  } else if (transition === "cancel" && meeting.status !== "completed" && meeting.status !== "cancelled") {
    nextStatus = "cancelled";
    eventType = "meeting.cancelled";
    update = { status: nextStatus, ended_at: now };
  } else {
    redirect(`/meetings?meeting=${meetingId}&error=This%20meeting%20transition%20is%20not%20allowed.`);
  }

  const { data: updated, error } = await supabase
    .from("meetings")
    .update(update)
    .eq("id", meetingId)
    .eq("organization_id", organizationId)
    .eq("status", meeting.status)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    redirect(`/meetings?meeting=${meetingId}&error=${encodeURIComponent(error?.message ?? "Meeting could not be updated.")}`);
  }

  if (transition === "complete" && actionItems.length) {
    await supabase.from("action_items").insert(
      actionItems.map((title, index) => ({
        organization_id: organizationId,
        meeting_id: meetingId,
        title,
        description: `Created from meeting: ${meeting.title}`,
        status: "open",
        priority: Math.min(5, index + 1),
        assigned_user_id: user.id,
      })),
    );
  }

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: eventType,
    object_type: "meeting",
    object_id: meetingId,
    risk_level: transition === "complete" ? "medium" : "low",
    payload: {
      title: meeting.title,
      previous_status: meeting.status,
      status: nextStatus,
      action_items_created: transition === "complete" ? actionItems.length : 0,
    },
  });

  revalidatePath("/meetings");
  revalidatePath("/command-center");
  redirect(`/meetings?meeting=${meetingId}&status=${nextStatus}&message=Meeting%20${nextStatus}.`);
}

export default async function MeetingEnginePage({ searchParams }: MeetingPageProps) {
  const params = await searchParams;
  const { supabase, organizationId } = await getOwnerContext();
  const selectedStatus = allowedStatuses.has(params.status as MeetingStatus)
    ? (params.status as MeetingStatus)
    : "scheduled";

  const { data: meetingData } = await supabase
    .from("meetings")
    .select("id, title, purpose, status, scheduled_for, started_at, ended_at, human_join_allowed, agenda, minutes, created_at")
    .eq("organization_id", organizationId)
    .eq("status", selectedStatus)
    .order("scheduled_for", { ascending: true, nullsFirst: false })
    .limit(100);

  const meetings = (meetingData ?? []) as MeetingRow[];
  const selectedId = params.meeting ?? meetings[0]?.id ?? null;

  const selectedMeeting = selectedId
    ? ((await supabase
        .from("meetings")
        .select("id, title, purpose, status, scheduled_for, started_at, ended_at, human_join_allowed, agenda, minutes, created_at")
        .eq("organization_id", organizationId)
        .eq("id", selectedId)
        .maybeSingle()).data as MeetingRow | null)
    : null;

  const actions = selectedMeeting
    ? (((await supabase
        .from("action_items")
        .select("id, title, description, status, priority, due_at, created_at")
        .eq("organization_id", organizationId)
        .eq("meeting_id", selectedMeeting.id)
        .order("priority", { ascending: true })).data ?? []) as ActionRow[])
    : [];

  const audit = selectedMeeting
    ? (((await supabase
        .from("audit_events")
        .select("id, actor_type, event_type, risk_level, created_at")
        .eq("organization_id", organizationId)
        .eq("object_type", "meeting")
        .eq("object_id", selectedMeeting.id)
        .order("created_at", { ascending: false })
        .limit(25)).data ?? []) as AuditRow[])
    : [];

  const agenda = selectedMeeting ? stringList(selectedMeeting.agenda) : [];
  const canStart = selectedMeeting?.status === "draft" || selectedMeeting?.status === "scheduled";
  const canComplete = selectedMeeting?.status === "running";
  const canCancel = selectedMeeting && selectedMeeting.status !== "completed" && selectedMeeting.status !== "cancelled";

  return (
    <main className="command-shell">
      <header className="command-header">
        <div>
          <p className="eyebrow">RYTHM MEETING ENGINE</p>
          <h1>Governed executive coordination</h1>
          <p className="subtitle">
            Plan agendas, control meeting lifecycle, preserve minutes, and convert agreed work into accountable action items.
          </p>
        </div>
        <Link className="secondary-button" href="/command-center">Command Center</Link>
      </header>

      <section className="organization-banner">
        <div><span>Authority</span><strong>Human CEO / Owner</strong></div>
        <div><span>Lifecycle</span><strong>Draft → Scheduled → Running → Completed</strong></div>
        <div><span>Outputs</span><strong>Minutes · Audit · Action Items</strong></div>
      </section>

      {params.message ? <p className="form-success" role="status">{params.message}</p> : null}
      {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}

      <section className="panel panel-wide" style={{ marginTop: 18 }}>
        <div className="panel-heading">
          <div><p className="label">Coordination register</p><h2>Executive Meeting Inbox</h2></div>
          <span className="pill">{meetings.length} matching meetings</span>
        </div>

        <form method="get" style={{ display: "grid", gridTemplateColumns: "240px auto", gap: 10, marginBottom: 18 }}>
          <select name="status" defaultValue={selectedStatus} aria-label="Filter meeting status">
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button className="secondary-button" type="submit">Apply filter</button>
        </form>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, .75fr) minmax(0, 1.45fr) minmax(300px, .8fr)", gap: 18 }}>
          <div className="data-list">
            {meetings.length ? meetings.map((meeting) => (
              <Link
                href={`/meetings?status=${selectedStatus}&meeting=${meeting.id}`}
                key={meeting.id}
                style={{ display: "block", padding: "15px 0", borderBottom: "1px solid #e7eaf0", textDecoration: "none" }}
              >
                <strong>{meeting.title}</strong>
                <span style={{ display: "block", marginTop: 6, color: "#717b8e", fontSize: ".82rem" }}>
                  {meeting.status} · {formatDate(meeting.scheduled_for)}
                </span>
              </Link>
            )) : <p className="empty-state">No meetings match this status.</p>}
          </div>

          {selectedMeeting ? (
            <article style={{ border: "1px solid #dfe4ec", borderRadius: 16, padding: 20, background: "#f8f9fb" }}>
              <div className="panel-heading">
                <div><p className="label">Meeting details</p><h2>{selectedMeeting.title}</h2></div>
                <div className="row-meta"><b className={selectedMeeting.status === "completed" ? "state-active" : "state-paused"}>{selectedMeeting.status}</b></div>
              </div>

              <p style={{ color: "#596579", lineHeight: 1.65 }}>{selectedMeeting.purpose}</p>

              <div className="compact-list">
                <div><strong>Scheduled</strong><span>{formatDate(selectedMeeting.scheduled_for)}</span></div>
                <div><strong>Started</strong><span>{formatDate(selectedMeeting.started_at)}</span></div>
                <div><strong>Ended</strong><span>{formatDate(selectedMeeting.ended_at)}</span></div>
                <div><strong>Human participation</strong><span>{selectedMeeting.human_join_allowed ? "Allowed" : "Blocked"}</span></div>
              </div>

              <div style={{ marginTop: 18 }}>
                <p className="label">Agenda</p>
                <ol style={{ color: "#596579", lineHeight: 1.7 }}>
                  {agenda.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                </ol>
              </div>

              {selectedMeeting.status === "completed" ? (
                <div style={{ marginTop: 18, padding: 16, borderRadius: 12, background: "#fff" }}>
                  <p className="label">Meeting minutes</p>
                  <p style={{ color: "#596579", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{minutesText(selectedMeeting.minutes)}</p>
                </div>
              ) : null}

              {(canStart || canComplete || canCancel) ? (
                <form action={transitionMeeting} className="auth-form" style={{ marginTop: 20 }}>
                  <input type="hidden" name="meetingId" value={selectedMeeting.id} />
                  {canComplete ? (
                    <>
                      <label>
                        Meeting minutes
                        <textarea name="minutes" required rows={6} placeholder="Record conclusions, decisions, unresolved items, and material context." style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10, font: "inherit" }} />
                      </label>
                      <label>
                        Action items, one per line
                        <textarea name="actionItems" rows={5} placeholder="Prepare implementation plan\nValidate production controls" style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10, font: "inherit" }} />
                      </label>
                    </>
                  ) : null}
                  <div style={{ display: "grid", gridTemplateColumns: canCancel ? "1fr 1fr" : "1fr", gap: 10 }}>
                    {canStart ? <button name="transition" value="start" type="submit">Start meeting</button> : null}
                    {canComplete ? <button name="transition" value="complete" type="submit">Complete meeting</button> : null}
                    {canCancel ? <button name="transition" value="cancel" type="submit" style={{ background: "#8f2335" }}>Cancel meeting</button> : null}
                  </div>
                </form>
              ) : null}

              <div style={{ marginTop: 22 }}>
                <p className="label">Action items</p>
                <div className="compact-list">
                  {actions.length ? actions.map((action) => (
                    <div key={action.id}>
                      <strong>{action.title}</strong>
                      <span>{action.status} · Priority {action.priority} · Due {formatDate(action.due_at)}</span>
                    </div>
                  )) : <p className="empty-state">No action items created from this meeting.</p>}
                </div>
              </div>

              <div style={{ marginTop: 22 }}>
                <p className="label">Audit trail</p>
                <div className="compact-list">
                  {audit.length ? audit.map((event) => (
                    <div key={event.id}>
                      <strong>{event.event_type}</strong>
                      <span>{event.actor_type} · {event.risk_level} risk · {formatDate(event.created_at)}</span>
                    </div>
                  )) : <p className="empty-state">No audit events recorded for this meeting.</p>}
                </div>
              </div>
            </article>
          ) : <p className="empty-state">Select a meeting to inspect.</p>}

          <form action={createMeeting} className="auth-form" style={{ marginTop: 0, alignSelf: "start", padding: 18, border: "1px solid #dfe4ec", borderRadius: 16, background: "#f8f9fb" }}>
            <div><p className="label">Human CEO entry</p><h3 style={{ margin: "6px 0 0" }}>Create meeting</h3></div>
            <label>Title<input name="title" minLength={3} required /></label>
            <label>Purpose<textarea name="purpose" rows={4} required style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10, font: "inherit" }} /></label>
            <label>Scheduled time<input name="scheduledFor" type="datetime-local" /></label>
            <label>Agenda, one item per line<textarea name="agenda" rows={6} required style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10, font: "inherit" }} /></label>
            <button type="submit">Create governed meeting</button>
          </form>
        </div>
      </section>
    </main>
  );
}
