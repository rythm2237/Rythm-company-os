import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizationContext } from "@/lib/auth/organization-context";

export const dynamic = "force-dynamic";

function enabled(formData: FormData, key: string) { return formData.get(key) === "on"; }
function text(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }

async function savePreferences(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await requireOrganizationContext();
  const digest = text(formData, "digestFrequency") || "realtime";
  if (!["realtime","daily","weekly","off"].includes(digest)) redirect("/notifications?error=Invalid%20digest%20frequency.");
  const quietStart = text(formData, "quietStart");
  const quietEnd = text(formData, "quietEnd");
  const { error } = await supabase.from("notification_preferences").upsert({
    organization_id: organizationId,
    user_id: user.id,
    in_app_enabled: enabled(formData, "inAppEnabled"),
    email_enabled: enabled(formData, "emailEnabled"),
    approvals_enabled: enabled(formData, "approvalsEnabled"),
    communications_enabled: enabled(formData, "communicationsEnabled"),
    meetings_enabled: enabled(formData, "meetingsEnabled"),
    projects_enabled: enabled(formData, "projectsEnabled"),
    digest_frequency: digest,
    quiet_hours: quietStart && quietEnd ? { start: quietStart, end: quietEnd } : {},
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,user_id" });
  if (error) redirect(`/notifications?error=${encodeURIComponent(error.message)}`);
  await supabase.from("audit_events").insert({ organization_id: organizationId, actor_type: "user", actor_user_id: user.id, event_type: "notification.preferences_updated", object_type: "notification_preferences", object_id: user.id, risk_level: "low", payload: { digest_frequency: digest } });
  revalidatePath("/notifications");
  redirect("/notifications?message=Notification%20preferences%20saved.");
}

async function markRead(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await requireOrganizationContext();
  const notificationId = text(formData, "notificationId");
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("user_id", user.id).eq("id", notificationId);
  revalidatePath("/notifications");
}

async function markAllRead() {
  "use server";
  const { supabase, user, organizationId } = await requireOrganizationContext();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/notifications");
}

async function archiveNotification(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await requireOrganizationContext();
  const notificationId = text(formData, "notificationId");
  await supabase.from("notifications").update({ archived_at: new Date().toISOString(), read_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("user_id", user.id).eq("id", notificationId);
  revalidatePath("/notifications");
}

type Props = { searchParams: Promise<{ message?: string; error?: string; filter?: string }> };

export default async function NotificationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, user, organizationId, organization } = await requireOrganizationContext();
  const [preferencesResult, notificationsResult] = await Promise.all([
    supabase.from("notification_preferences").select("*").eq("organization_id", organizationId).eq("user_id", user.id).maybeSingle(),
    supabase.from("notifications").select("id,category,severity,title,body,action_url,read_at,archived_at,delivery_status,delivery_attempts,last_delivery_error,created_at").eq("organization_id", organizationId).eq("user_id", user.id).is("archived_at", null).order("created_at", { ascending: false }).limit(100),
  ]);
  const preferences = preferencesResult.data ?? { in_app_enabled: true, email_enabled: true, approvals_enabled: true, communications_enabled: true, meetings_enabled: true, projects_enabled: true, digest_frequency: "realtime", quiet_hours: {} };
  const notifications = notificationsResult.data ?? [];
  const visible = params.filter === "unread" ? notifications.filter(item => !item.read_at) : notifications;
  const unread = notifications.filter(item => !item.read_at).length;
  const failed = notifications.filter(item => item.delivery_status === "failed").length;
  const quietHours = (preferences.quiet_hours && typeof preferences.quiet_hours === "object" ? preferences.quiet_hours : {}) as Record<string,string>;

  return <main className="command-shell ops-shell">
    <header className="command-header"><div><p className="eyebrow">NOTIFICATION CENTER</p><h1>Notifications</h1><p className="subtitle">A tenant-isolated event inbox for approvals, communication, meetings, projects and runtime attention.</p></div><div className="ops-header-actions"><a className="secondary-button" href="/company">Company</a><a className="secondary-button" href="/calendar">Calendar</a></div></header>
    {params.message ? <p className="ops-message">{params.message}</p> : null}{params.error ? <p className="form-error">{params.error}</p> : null}
    <section className="metrics-grid ops-metrics"><div className="metric-card"><span>Unread</span><strong>{unread}</strong></div><div className="metric-card"><span>Visible</span><strong>{notifications.length}</strong></div><div className="metric-card"><span>Delivery failures</span><strong>{failed}</strong></div><div className="metric-card"><span>Digest</span><strong className="ops-metric-text">{preferences.digest_frequency}</strong></div><div className="metric-card"><span>Email</span><strong className="ops-metric-text">{preferences.email_enabled ? "On" : "Off"}</strong></div><div className="metric-card"><span>Company</span><strong className="ops-metric-text">{organization.name}</strong></div></section>

    <div className="ops-two-col">
      <section className="panel ops-section"><div className="panel-heading"><div><p className="label">Preferences</p><h2>Delivery settings</h2></div></div><form action={savePreferences} className="ops-preferences"><label><input type="checkbox" name="inAppEnabled" defaultChecked={preferences.in_app_enabled}/><span>In-app notifications</span></label><label><input type="checkbox" name="emailEnabled" defaultChecked={preferences.email_enabled}/><span>Email delivery</span></label><label><input type="checkbox" name="approvalsEnabled" defaultChecked={preferences.approvals_enabled}/><span>Approvals</span></label><label><input type="checkbox" name="communicationsEnabled" defaultChecked={preferences.communications_enabled}/><span>Communication</span></label><label><input type="checkbox" name="meetingsEnabled" defaultChecked={preferences.meetings_enabled}/><span>Meetings</span></label><label><input type="checkbox" name="projectsEnabled" defaultChecked={preferences.projects_enabled}/><span>Projects</span></label><label className="ops-pref-select"><span>Digest</span><select name="digestFrequency" defaultValue={preferences.digest_frequency}><option value="realtime">Realtime</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="off">Off</option></select></label><div className="ops-quiet-hours"><label><span>Quiet from</span><input type="time" name="quietStart" defaultValue={quietHours.start ?? ""}/></label><label><span>Quiet until</span><input type="time" name="quietEnd" defaultValue={quietHours.end ?? ""}/></label></div><button>Save preferences</button></form></section>
      <section className="panel ops-section"><div className="panel-heading"><div><p className="label">Delivery health</p><h2>Notification performance</h2></div></div><div className="ops-kpi-line"><span>Pending</span><strong>{notifications.filter(item => item.delivery_status === "pending").length}</strong></div><div className="ops-kpi-line"><span>Delivered</span><strong>{notifications.filter(item => item.delivery_status === "delivered").length}</strong></div><div className="ops-kpi-line"><span>Failed</span><strong>{failed}</strong></div><div className="ops-kpi-line"><span>Suppressed</span><strong>{notifications.filter(item => item.delivery_status === "suppressed").length}</strong></div><p className="ops-note">Each event supports a dedupe key, delivery attempts and last-error state so repeated domain events do not produce duplicate user alerts.</p></section>
    </div>

    <section className="panel ops-section"><div className="panel-heading"><div><p className="label">Inbox</p><h2>{params.filter === "unread" ? "Unread notifications" : "All notifications"}</h2></div><div className="ops-header-actions"><a className="secondary-button" href={params.filter === "unread" ? "/notifications" : "/notifications?filter=unread"}>{params.filter === "unread" ? "Show all" : "Unread only"}</a>{unread ? <form action={markAllRead}><button className="secondary-button">Mark all read</button></form> : null}</div></div><div className="ops-notification-list">{visible.length ? visible.map(item => <article className={`ops-notification ${item.read_at ? "is-read" : ""}`} key={item.id}><div className={`ops-notification-dot severity-${item.severity}`} aria-hidden="true"/><div className="ops-notification-body"><div><span className="pill">{item.category}</span><span className={`pill delivery-${item.delivery_status}`}>{item.delivery_status}</span></div><h3>{item.title}</h3><p>{item.body || "No additional details"}</p><small>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}{item.last_delivery_error ? ` · ${item.last_delivery_error}` : ""}</small>{item.action_url ? <a href={item.action_url}>Open related item →</a> : null}</div><div className="ops-notification-actions">{!item.read_at ? <form action={markRead}><input type="hidden" name="notificationId" value={item.id}/><button className="secondary-button">Mark read</button></form> : null}<form action={archiveNotification}><input type="hidden" name="notificationId" value={item.id}/><button className="secondary-button">Archive</button></form></div></article>) : <p className="empty-state">No notifications in this view.</p>}</div></section>
  </main>;
}
