import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const allowed = new Set(["booking_requested","request_approved","request_rejected","contact_message"]);

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // verify_jwt=false is intentional for public-key GET, but POST is ALWAYS
    // authenticated with a short-lived HMAC signed by our server-only caller.
    // Authenticate before creating a service-role client or reading private keys.
    let verifiedBody: Record<string, unknown> | null = null;
    let eventType = "", target = "";
    if (req.method === "POST") {
      // A dedicated server-only secret is preferred. When not provisioned,
      // derive a purpose-bound HMAC key from the existing server-only Supabase
      // service role credential that is already available on BOTH platforms.
      // No service role token is ever transmitted to this public endpoint.
      const configuredSecret = Deno.env.get("TWO_NYA_PUSH_DISPATCH_SECRET");
      const serviceCredential = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      let secret = configuredSecret ?? "";
      if (configuredSecret === undefined && serviceCredential.length >= 32) {
        const derivationKey = await crypto.subtle.importKey(
          "raw", new TextEncoder().encode(serviceCredential),
          { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
        );
        const derived = new Uint8Array(await crypto.subtle.sign(
          "HMAC", derivationKey,
          new TextEncoder().encode("RYTHM/W06/two-nya-push/dispatch/v1"),
        ));
        secret = Array.from(derived, (byte) => byte.toString(16).padStart(2, "0")).join("");
      }
      if (secret.length < 32) return Response.json({ ok: false, error: "dispatch_not_configured" }, { status: 503 });
      const timestamp = req.headers.get("x-rythm-push-timestamp") || "";
      const signature = req.headers.get("x-rythm-push-signature") || "";
      const now = Math.floor(Date.now() / 1000);
      if (!/^\d{10}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/i.test(signature)) {
        return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
      }
      const rawBody = await req.text();
      if (new TextEncoder().encode(rawBody).byteLength > 10_240) {
        return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
      }
      const key = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
      );
      const signatureBytes = Uint8Array.from(signature.match(/.{2}/g) || [], (part) => parseInt(part, 16));
      const validSignature = await crypto.subtle.verify(
        "HMAC", key, signatureBytes, new TextEncoder().encode(timestamp + "." + rawBody),
      );
      if (!validSignature) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
      try {
        const value: unknown = JSON.parse(rawBody);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid payload");
        verifiedBody = value as Record<string, unknown>;
      } catch {
        return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
      }
      // Reject unsupported event types before opening ANY privileged client.
      // Authenticated invalid probes can therefore prove HMAC parity without
      // querying customers, changing state, or invoking an external provider.
      eventType = String(verifiedBody?.event_type ?? "booking_requested");
      target = String(verifiedBody?.target ??
        (eventType === "booking_requested" || eventType === "contact_message" ? "admin" : "customer"));
      if (!allowed.has(eventType) || !["admin", "customer"].includes(target)) {
        return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
      }
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const url = Deno.env.get("SUPABASE_URL");
    if (!serviceKey || !url) return Response.json({ ok: false, error: "server_config" }, { status: 500 });
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Anonymous GET only reads the PUBLIC VAPID key. No private read/creation.
    if (req.method === "GET") {
      const { data: publicKey, error: keyLookupError } = await db.from("nail_2nya_push_keys")
        .select("public_key").eq("singleton", true).maybeSingle();
      if (keyLookupError) return Response.json({ ok: false, error: "push_key_lookup_failed" }, { status: 500 });
      if (!publicKey?.public_key) return Response.json({ ok: false, error: "push_not_initialized" }, { status: 503 });
      return Response.json({ ok: true, public_key: publicKey.public_key }, { headers: { "Cache-Control": "no-store" } });
    }

    // HMAC-authenticated POST: existing business-state/idempotency checks below
    // remain authoritative after this trust gate.
    const { data: existingKey, error: keyError } = await db.from("nail_2nya_push_keys")
      .select("public_key,private_key").eq("singleton", true).maybeSingle();
    let keyRow = existingKey;
    if (keyError) return Response.json({ ok: false, error: "push_key_lookup_failed" }, { status: 500 });
    if (!keyRow) {
      const generated = webpush.generateVAPIDKeys();
      const inserted = await db.from("nail_2nya_push_keys").insert({
        singleton: true, public_key: generated.publicKey, private_key: generated.privateKey,
      }).select("public_key,private_key").single();
      if (inserted.error) {
        const fallback = await db.from("nail_2nya_push_keys").select("public_key,private_key")
          .eq("singleton", true).single();
        if (fallback.error || !fallback.data) return Response.json({ ok: false, error: "push_key_init_failed" }, { status: 500 });
        keyRow = fallback.data;
      } else keyRow = inserted.data;
      await db.from("nail_2nya_site_settings").upsert({
        key: "push_vapid_public", value: { key: keyRow.public_key },
      }, { onConflict: "key" });
    }
    webpush.setVapidDetails("mailto:admin@rythm-os.com", keyRow.public_key, keyRow.private_key);

    const body = verifiedBody;

    if(eventType==="contact_message"){
      const messageId=String(body?.message_id??"");
      if(!/^[0-9a-f-]{36}$/i.test(messageId)||target!=="admin")return Response.json({ok:false,error:"invalid_request"},{status:400});
      const {data:message,error:messageError}=await db.from("nail_2nya_contact_messages").select("id,name,subject,status,push_notified_at").eq("id",messageId).maybeSingle();
      if(messageError||!message)return Response.json({ok:false,error:"message_lookup_failed"},{status:404});
      const {data:subs,error:subsError}=await db.from("nail_2nya_push_subscriptions").select("id,endpoint,p256dh,auth").eq("active",true);
      if(subsError)return Response.json({ok:false,error:"subscription_lookup_failed"},{status:500});
      if(!subs?.length)return Response.json({ok:true,delivered:0,no_subscription:true});
      const {data:claimed,error:claimError}=await db.from("nail_2nya_contact_messages").update({push_notified_at:new Date().toISOString()}).eq("id",messageId).is("push_notified_at",null).select("id").maybeSingle();
      if(claimError)return Response.json({ok:false,error:"claim_failed"},{status:500});
      if(!claimed)return Response.json({ok:true,duplicate:true,delivered:0});
      const payload={title:"پیام جدید",body:`${message.name||"مشتری"} · ${message.subject||"پیام از سایت"}`,url:"/admin#inbox",tag:`2nya-contact-${messageId}`};
      let delivered=0;
      for(const sub of subs){
        try{await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify(payload),{TTL:3600});delivered++;}
        catch(err:any){const status=Number(err?.statusCode||err?.status||0);if(status===404||status===410||status===403)await db.from("nail_2nya_push_subscriptions").update({active:false,updated_at:new Date().toISOString()}).eq("id",sub.id);}
      }
      if(!delivered)await db.from("nail_2nya_contact_messages").update({push_notified_at:null}).eq("id",messageId);
      return Response.json({ok:true,delivered});
    }

    const appointmentId=String(body?.appointment_id??"");
    if(!/^[0-9a-f-]{36}$/i.test(appointmentId))return Response.json({ok:false,error:"invalid_request"},{status:400});
    const [{data:appt,error:apptError},{data:business}]=await Promise.all([
      db.from("nail_2nya_appointments").select("id,booking_reference,start_at,status,nail_2nya_services(name),nail_2nya_customers(name)").eq("id",appointmentId).maybeSingle(),
      db.from("nail_2nya_business_profile").select("timezone").limit(1).maybeSingle(),
    ]);
    if(apptError||!appt)return Response.json({ok:false,error:"booking_lookup_failed"},{status:404});
    const validState=(eventType==="booking_requested"&&target==="admin"&&appt.status==="pending")||(eventType==="request_approved"&&target==="customer"&&appt.status==="confirmed")||(eventType==="request_rejected"&&target==="customer"&&appt.status==="cancelled");
    if(!validState)return Response.json({ok:false,error:"event_state_mismatch"},{status:409});
    const subQuery=target==="admin"?db.from("nail_2nya_push_subscriptions").select("id,endpoint,p256dh,auth").eq("active",true):db.from("nail_2nya_customer_push_subscriptions").select("id,endpoint,p256dh,auth").eq("appointment_id",appointmentId).eq("active",true);
    const {data:subs,error:subsError}=await subQuery;if(subsError)return Response.json({ok:false,error:"subscription_lookup_failed"},{status:500});if(!subs?.length)return Response.json({ok:true,delivered:0,no_subscription:true});
    const {data:claim,error:claimError}=await db.from("nail_2nya_notification_deliveries").insert({appointment_id:appointmentId,event_type:eventType,target}).select("id").single();
    if(claimError){if(claimError.code==="23505")return Response.json({ok:true,duplicate:true,delivered:0});return Response.json({ok:false,error:"claim_failed"},{status:500});}
    const tz=business?.timezone||"UTC",time=new Intl.DateTimeFormat("fa-IR",{timeZone:tz,weekday:"long",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}).format(new Date(appt.start_at));
    const service=Array.isArray(appt.nail_2nya_services)?appt.nail_2nya_services[0]?.name:appt.nail_2nya_services?.name,customer=Array.isArray(appt.nail_2nya_customers)?appt.nail_2nya_customers[0]?.name:appt.nail_2nya_customers?.name;
    const payload=eventType==="booking_requested"?{title:"درخواست وقت",body:`${customer||"مشتری"} · ${service||"خدمات ناخن"} · ${time}`,url:"/admin",tag:`2nya-request-${appointmentId}`}:eventType==="request_approved"?{title:"وقت شما تأیید شد",body:`${service||"خدمات ناخن"} · ${time}`,url:"/",tag:`2nya-approved-${appointmentId}`}:{title:"درخواست وقت تأیید نشد",body:"برای انتخاب زمان دیگری دوباره وارد سایت شوید.",url:"/?book=",tag:`2nya-rejected-${appointmentId}`};
    let delivered=0;for(const sub of subs){try{await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify(payload),{TTL:3600});delivered++;}catch(err:any){const status=Number(err?.statusCode||err?.status||0);if(status===404||status===410||status===403){const table=target==="admin"?"nail_2nya_push_subscriptions":"nail_2nya_customer_push_subscriptions";await db.from(table).update({active:false,updated_at:new Date().toISOString()}).eq("id",sub.id);}}}
    if(!delivered&&claim?.id)await db.from("nail_2nya_notification_deliveries").delete().eq("id",claim.id);
    return Response.json({ok:true,delivered});
  }catch{console.error("two_nya_push_exception");return Response.json({ok:false,error:"unexpected"},{status:500});}
});
