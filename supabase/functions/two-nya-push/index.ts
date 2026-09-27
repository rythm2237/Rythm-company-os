import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const allowed = new Set(["booking_requested", "request_approved", "request_rejected"]);

Deno.serve(async (req: Request) => {
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const url = Deno.env.get("SUPABASE_URL");
    if (!serviceKey || !url) return Response.json({ ok: false, error: "server_config" }, { status: 500 });
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: initialKeyRow, error: keyError } = await db.from("nail_2nya_push_keys").select("public_key,private_key").eq("singleton", true).maybeSingle();
    let keyRow = initialKeyRow;
    if (keyError) return Response.json({ ok: false, error: "push_key_lookup_failed" }, { status: 500 });
    if (!keyRow) {
      const generated = webpush.generateVAPIDKeys();
      const inserted = await db.from("nail_2nya_push_keys").insert({ singleton: true, public_key: generated.publicKey, private_key: generated.privateKey }).select("public_key,private_key").single();
      if (inserted.error) {
        const fallback = await db.from("nail_2nya_push_keys").select("public_key,private_key").eq("singleton", true).single();
        if (fallback.error || !fallback.data) return Response.json({ ok: false, error: "push_key_init_failed" }, { status: 500 });
        keyRow = fallback.data;
      } else keyRow = inserted.data;
      await db.from("nail_2nya_site_settings").upsert({ key: "push_vapid_public", value: { key: keyRow.public_key } }, { onConflict: "key" });
    }

    if (req.method === "GET") return Response.json({ ok: true, public_key: keyRow.public_key });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    webpush.setVapidDetails("mailto:admin@rythm-os.com", keyRow.public_key, keyRow.private_key);

    const body = await req.json();
    const appointmentId = String(body?.appointment_id ?? "");
    const eventType = String(body?.event_type ?? "booking_requested");
    const target = String(body?.target ?? (eventType === "booking_requested" ? "admin" : "customer"));
    if (!/^[0-9a-f-]{36}$/i.test(appointmentId) || !allowed.has(eventType) || !["admin", "customer"].includes(target)) {
      return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
    }

    const [{ data: appt, error: apptError }, { data: business }] = await Promise.all([
      db.from("nail_2nya_appointments").select("id,booking_reference,start_at,status,nail_2nya_services(name),nail_2nya_customers(name)").eq("id", appointmentId).maybeSingle(),
      db.from("nail_2nya_business_profile").select("timezone").limit(1).maybeSingle(),
    ]);
    if (apptError || !appt) return Response.json({ ok: false, error: "booking_lookup_failed" }, { status: 404 });

    const validState =
      (eventType === "booking_requested" && target === "admin" && appt.status === "pending") ||
      (eventType === "request_approved" && target === "customer" && appt.status === "confirmed") ||
      (eventType === "request_rejected" && target === "customer" && appt.status === "cancelled");
    if (!validState) return Response.json({ ok: false, error: "event_state_mismatch" }, { status: 409 });

    const subQuery = target === "admin"
      ? db.from("nail_2nya_push_subscriptions").select("id,endpoint,p256dh,auth").eq("active", true)
      : db.from("nail_2nya_customer_push_subscriptions").select("id,endpoint,p256dh,auth").eq("appointment_id", appointmentId).eq("active", true);
    const { data: subs, error: subsError } = await subQuery;
    if (subsError) return Response.json({ ok: false, error: "subscription_lookup_failed" }, { status: 500 });
    if (!subs?.length) return Response.json({ ok: true, delivered: 0, no_subscription: true });

    const { data: claim, error: claimError } = await db.from("nail_2nya_notification_deliveries").insert({ appointment_id: appointmentId, event_type: eventType, target }).select("id").single();
    if (claimError) {
      if (claimError.code === "23505") return Response.json({ ok: true, duplicate: true, delivered: 0 });
      return Response.json({ ok: false, error: "claim_failed" }, { status: 500 });
    }

    const tz = business?.timezone || "UTC";
    const time = new Intl.DateTimeFormat("fa-IR", { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(appt.start_at));
    const service = Array.isArray(appt.nail_2nya_services) ? appt.nail_2nya_services[0]?.name : appt.nail_2nya_services?.name;
    const customer = Array.isArray(appt.nail_2nya_customers) ? appt.nail_2nya_customers[0]?.name : appt.nail_2nya_customers?.name;
    const payload = eventType === "booking_requested"
      ? { title: "درخواست وقت", body: `${customer || "مشتری"} · ${service || "خدمات ناخن"} · ${time}`, url: "/admin", tag: `2nya-request-${appointmentId}` }
      : eventType === "request_approved"
        ? { title: "وقت شما تأیید شد", body: `${service || "خدمات ناخن"} · ${time}`, url: "/", tag: `2nya-approved-${appointmentId}` }
        : { title: "درخواست وقت تأیید نشد", body: "برای انتخاب زمان دیگری دوباره وارد سایت شوید.", url: "/?book=", tag: `2nya-rejected-${appointmentId}` };

    let delivered = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600 });
        delivered++;
      } catch (err: any) {
        const status = Number(err?.statusCode || err?.status || 0);
        if (status === 404 || status === 410 || status === 403) {
          const table = target === "admin" ? "nail_2nya_push_subscriptions" : "nail_2nya_customer_push_subscriptions";
          await db.from(table).update({ active: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
        }
      }
    }
    if (!delivered && claim?.id) await db.from("nail_2nya_notification_deliveries").delete().eq("id", claim.id);
    return Response.json({ ok: true, delivered });
  } catch (error) {
    console.error("two_nya_push_exception", error instanceof Error ? error.message : "unknown");
    return Response.json({ ok: false, error: "unexpected" }, { status: 500 });
  }
});
