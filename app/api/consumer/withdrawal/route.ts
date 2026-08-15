import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function clean(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const name = clean(input.name, 200);
  const email = clean(input.email, 320).toLowerCase();
  const contractReference = clean(input.contractReference, 200);
  const honeypot = clean(input.companyWebsite, 200);

  if (honeypot) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  if (!name || !validEmail(email) || !contractReference) {
    return NextResponse.json({ error: "MISSING_OR_INVALID_FIELDS" }, { status: 400 });
  }

  let requesterUserId: string | null = null;
  try {
    const auth = await createAuthServerClient();
    const { data: { user } } = await auth.auth.getUser();
    requesterUserId = user?.id ?? null;
  } catch {
    requesterUserId = null;
  }

  const admin = createServerSupabaseClient();
  if (!admin) {
    console.error("consumer_withdrawal_storage_unavailable");
    return NextResponse.json({ error: "REQUEST_SERVICE_UNAVAILABLE" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("consumer_withdrawal_requests")
    .insert({
      requester_user_id: requesterUserId,
      consumer_name: name,
      consumer_email: email,
      contract_reference: contractReference,
    })
    .select("id,consumer_name,consumer_email,contract_reference,withdrawal_statement,submitted_at,status")
    .single();

  if (error || !data) {
    console.error("consumer_withdrawal_create_failed", { code: error?.code });
    return NextResponse.json({ error: "REQUEST_CREATE_FAILED" }, { status: 500 });
  }

  return NextResponse.json(
    {
      receipt: {
        id: data.id,
        name: data.consumer_name,
        email: data.consumer_email,
        contractReference: data.contract_reference,
        statement: data.withdrawal_statement,
        submittedAt: data.submitted_at,
        status: data.status,
        trader: "Tayyebialashti Yaser E.V. / RYTHM Company OS",
      },
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
