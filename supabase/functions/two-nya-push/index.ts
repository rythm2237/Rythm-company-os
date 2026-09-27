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

    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const { data: authData } = await db.auth.getUser(token);
    if (!authData.user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const admin = await db.from("nail_2nya_admin_users").select("user_id").eq("user_id", authData.user.id).maybeSingle();
    if (!admin.data) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const eventType = String(body?.event_type || "");
    if (!allowed.has(eventType)) return Response.json({ ok: false, error: "invalid_event_type" }, { status: 400 });
    const customerId = String(body?.customer_id || "");
    const title = String(body?.title || "2nya Nail Art");
    const message = String(body?.message || "");
    const urlPath = String(body?.url || "/2nya-nailart");
    if (!customerId || !message) return Response.json({ ok: false, error: "missing_fields" }, { status: 400 });

    const subs = await db.from("nail_2nya_customer_push_subscriptions").select("id,endpoint,p256dh,auth").eq("customer_id", customerId).eq("enabled", true);
    if (subs.error) return Response.json({ ok: false, error: "subscription_lookup_failed" }, { status: 500 });

    const payload = JSON.stringify({ title, body: message, url: urlPath, event_type: eventType });
    let sent = 0;
    let failed = 0;
    for (const sub of subs.data || []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        sent += 1;
        await db.from("nail_2nya_notification_deliveries").insert({ customer_id: customerId, event_type: eventType, channel: "push", status: "sent", subscription_id: sub.id });
      } catch (error) {
        failed += 1;
        const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
        await db.from("nail_2nya_notification_deliveries").insert({ customer_id: customerId, event_type: eventType, channel: "push", status: "failed", subscription_id: sub.id, error_message: String((error as Error)?.message || "push_failed") });
        if (statusCode === 404 || statusCode === 410) await db.from("nail_2nya_customer_push_subscriptions").update({ enabled: false }).eq("id", sub.id);
      }
    }
    return Response.json({ ok: true, sent, failed });
  } catch (error) {
    return Response.json({ ok: false, error: String((error as Error)?.message || "unknown_error") }, { status: 500 });
  }
});
