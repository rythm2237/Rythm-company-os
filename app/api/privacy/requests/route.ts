import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

const REQUEST_TYPES = new Set([
  "access",
  "export",
  "correction",
  "deletion",
  "restriction",
  "objection",
  "portability",
]);

function normalizeNote(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 2000) : null;
}

export async function GET() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { data, error } = await supabase
    .from("privacy_requests")
    .select("id,request_type,scope,organization_id,status,received_at,due_at,verified_at,completed_at,created_at,updated_at")
    .eq("requested_by_user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("privacy_requests_list_failed", { code: error.code });
    return NextResponse.json({ error: "REQUEST_LIST_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

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
  const requestType = typeof input.requestType === "string" ? input.requestType : "";
  const scope = input.scope === "organization" ? "organization" : "account";
  const requesterNote = normalizeNote(input.note);
  let organizationId: string | null = null;

  if (!REQUEST_TYPES.has(requestType)) {
    return NextResponse.json({ error: "INVALID_REQUEST_TYPE" }, { status: 400 });
  }

  if (scope === "organization") {
    if (typeof input.organizationId !== "string" || !input.organizationId.trim()) {
      return NextResponse.json({ error: "ORGANIZATION_REQUIRED" }, { status: 400 });
    }

    organizationId = input.organizationId.trim();

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .eq("role", "owner")
      .maybeSingle();

    if (membershipError) {
      console.error("privacy_request_membership_lookup_failed", { code: membershipError.code });
      return NextResponse.json({ error: "REQUEST_LOOKUP_FAILED" }, { status: 500 });
    }

    if (!membership) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from("privacy_requests")
    .insert({
      requested_by_user_id: user.id,
      organization_id: organizationId,
      request_type: requestType,
      scope,
      requester_note: requesterNote,
    })
    .select("id,request_type,scope,organization_id,status,received_at,due_at")
    .single();

  if (error) {
    console.error("privacy_request_create_failed", { code: error.code });
    return NextResponse.json({ error: "REQUEST_CREATE_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ request: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
