import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizationContext, requireOwnerOrganizationContext } from "@/lib/auth/organization-context";

export const dynamic = "force-dynamic";

function text(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }
function nullable(formData: FormData, key: string) { return text(formData, key) || null; }

async function createCalendarEvent(formData: FormData) {
  "use server";
  const { supabase, user, organizationId, organization } = await requireOwnerOrganizationContext();
  const title = text(formData, "title");
  const startsAt = text(formData, "startsAt");
  const endsAt = text(formData, "endsAt");
  const timezone = text(formData, "timezone") || "UTC";
  if (!title || !startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) redirect("/calendar?error=Enter%20a%20valid%20title%20and%20time%20range.");
  const { data: event, error } = await supabase.from("calendar_events").insert({
    organization_id: organizationId,
    title,
    description: nullable(formData, "description"),
    starts_at: new Date(startsAt).toISOString(),
    ends_at: new Date(endsAt).toISOString(),
    timezone,
    location: nullable(formData, "location"),
    meeting_url: nullable(formData, "meetingUrl"),
    provider: "rythm",
    created_by_user_id: user.id,
  }).select("id").single();
  if (error || !event) redirect(`/calendar?error=${encodeURIComponent(error?.message ?? "Event could not be created.")}`);

  const participants = text(formData, "participants").split(",").map(value => value.trim()).filter(Boolean);
  if (participants.length) {
    await supabase.from("calendar_event_participants").insert(participants.map(email => ({ event_id: event.id, email, response_status: "needs_action" })));
  }
  await supabase.from("notifications").insert({
    organization_id: organizationId,
    user_id: user.id,
    category: "meeting",
    severity: "info",
    title: `Calendar event created: ${title}`,
    body: `${organization.name} · ${new Date(startsAt).toLocaleString()}`,
    action_url: "/calendar",
    source_type: "calendar_event",
    source_id: event.id,
    dedupe_key: `calendar-created:${event.id}`,
    delivery_status: "pending",
  });
  await supabase.from("audit_events").insert({ organization_id: organizationId, actor_type: "user", actor_user_id: user.id, event_type: "calendar.event_created", object_type: "calendar_event", object_id: event.id, risk_level: "low", payload: { title, participants_count: participants.length } });
  revalidatePath("/calendar");
  revalidatePath("/notifications");
  redirect("/calendar?message=Event%20created.");
}

async function cancelEvent(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const eventId = text(formData, "eventId");
  const { error } = await supabase.from("calendar_events").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("id", eventId);
  if (error) redirect(`/calendar?error=${encodeURIComponent(error.message)}`);
  await supabase.from("audit_events").insert({ organization_id: organizationId, actor_type: "user", actor_user_id: user.id, event_type: "calendar.event_cancelled", object_type: "calendar_event", object_id: eventId, risk_level: "low", payload: {} });
  revalidatePath("/calendar");
}

type Props = { searchParams: Promise<{ message?: string; error?: string }> };

export default async function CalendarPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, organizationId, user, organization, role } = await requireOrganizationContext();
  const [eventsResult, connectionsResult, orgResult] = await Promise.all([
    supabase.from("calendar_events").select("id,title,description,starts_at,ends_at,timezone,location,meeting_url,provider,status,external_event_id").eq("organization_id", organizationId).gte("ends_at", new Date(Date.now() - 86400000).toISOString()).order("starts_at").limit(100),
    supabase.from("calendar_provider_connections").select("id,provider,provider_account_email,status,last_sync_at,last_error").eq("organization_id", organizationId).eq("user_id", user.id),
    supabase.from("organizations").select("timezone").eq("id", organizationId).single(),
  ]);
  const events = eventsResult.data ?? [];
  const connections = connectionsResult.data ?? [];
  const timezone = orgResult.data?.timezone ?? "UTC";
  const isOwner = role === "owner";

  return <main className="command-shell ops-shell">
    <header className="command-header"><div><p className="eyebrow">COMPANY CALENDAR</p><h1>Calendar</h1><p className="subtitle">A shared company calendar for human and AI participants. Provider connections are isolated per user and ready for Google/Microsoft synchronization.</p></div><div className="ops-header-actions"><a className="secondary-button" href="/company">Company</a><a className="secondary-button" href="/notifications">Notifications</a></div></header>
    {params.message ? <p className="ops-message">{params.message}</p> : null}{params.error ? <p className="form-error">{params.error}</p> : null}

    <section className="ops-two-col">
      <div className="panel ops-section"><div className="panel-heading"><div><p className="label">Provider status</p><h2>Calendar connections</h2></div></div>
        {["google","microsoft"].map(provider => { const connection = connections.find(item => item.provider === provider); return <div className="ops-provider-row" key={provider}><div><strong>{provider === "google" ? "Google Calendar" : "Microsoft Calendar"}</strong><small>{connection?.provider_account_email ?? "Not connected"}</small></div><span className={`ops-status ${connection?.status === "connected" ? "is-ok" : ""}`}>{connection?.status ?? "disconnected"}</span></div>; })}
        <p className="ops-note">OAuth tokens are never exposed in the browser. The connection model stores only server-side secret references and synchronization metadata.</p>
      </div>
      <div className="panel ops-section"><div className="panel-heading"><div><p className="label">Workspace</p><h2>{organization.name}</h2></div><span className="pill">{timezone}</span></div><div className="ops-kpi-line"><span>Upcoming events</span><strong>{events.filter(event => event.status !== "cancelled").length}</strong></div><div className="ops-kpi-line"><span>Connected providers</span><strong>{connections.filter(item => item.status === "connected").length}/2</strong></div></div>
    </section>

    {isOwner ? <section className="panel ops-section"><div className="panel-heading"><div><p className="label">Create</p><h2>New calendar event</h2></div></div><form action={createCalendarEvent} className="ops-form-grid"><label className="ops-span-2"><span>Title</span><input name="title" required/></label><label><span>Starts</span><input name="startsAt" type="datetime-local" required/></label><label><span>Ends</span><input name="endsAt" type="datetime-local" required/></label><label><span>Timezone</span><input name="timezone" defaultValue={timezone}/></label><label><span>Location</span><input name="location"/></label><label className="ops-span-2"><span>Meeting URL</span><input name="meetingUrl" type="url" placeholder="https://..."/></label><label className="ops-span-2"><span>Participants</span><input name="participants" placeholder="person@company.com, client@example.com"/></label><label className="ops-span-2"><span>Description</span><textarea name="description" rows={3}/></label><div className="ops-form-actions"><button>Create event</button></div></form></section> : null}

    <section className="panel ops-section"><div className="panel-heading"><div><p className="label">Schedule</p><h2>Upcoming events</h2></div></div><div className="ops-calendar-list">{events.length ? events.map(event => <article key={event.id} className={`ops-event ${event.status === "cancelled" ? "is-cancelled" : ""}`}><div className="ops-event-time"><strong>{new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: event.timezone }).format(new Date(event.starts_at))}</strong><span>{new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: event.timezone }).format(new Date(event.starts_at))}</span></div><div className="ops-event-body"><div><span className="pill">{event.provider}</span><span className="pill">{event.status}</span></div><h3>{event.title}</h3><p>{event.description || event.location || "No additional details"}</p>{event.meeting_url ? <a href={event.meeting_url} target="_blank" rel="noreferrer">Open meeting link ↗</a> : null}</div>{isOwner && event.status !== "cancelled" ? <form action={cancelEvent}><input type="hidden" name="eventId" value={event.id}/><button className="secondary-button">Cancel</button></form> : null}</article>) : <p className="empty-state">No upcoming events.</p>}</div></section>
  </main>;
}
