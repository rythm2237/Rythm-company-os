import { NextResponse } from "next/server";
import { isOrganizationEntitlementActive, resolveOrganizationContext } from "@/lib/auth/organization-context";
import { submitIndexNow } from "@/lib/integrations/adapters/indexnow";

export async function POST(request: Request) {
  const context = await resolveOrganizationContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (context.role !== "owner" || !isOrganizationEntitlementActive(context.entitlement)) {
    return NextResponse.json({ error: "Owner authorization with an active entitlement is required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }

  const urls = Array.isArray((body as { urls?: unknown })?.urls)
    ? (body as { urls: unknown[] }).urls.map((value) => String(value))
    : [];

  try {
    const result = await submitIndexNow(urls);
    const now = new Date().toISOString();

    await context.supabase.from("audit_events").insert({
      organization_id: context.organizationId,
      actor_type: "user",
      actor_user_id: context.user.id,
      event_type: "seo.indexnow_submission",
      object_type: "seo_submission",
      risk_level: "low",
      payload: {
        provider_key: "indexnow",
        submitted: result.submitted,
        provider_status: result.status,
        accepted: result.accepted,
        occurred_at: now,
      },
    });

    return NextResponse.json(result, { status: result.accepted ? 200 : 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "IndexNow submission failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
