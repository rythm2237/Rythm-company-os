import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveOrganizationContext, isOrganizationEntitlementActive } from "@/lib/auth/organization-context";
import {
  isOrganizationStoragePath,
  privateFileNameMatchesMime,
  privateFileContentMatchesMime,
} from "@/lib/security/private-file-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX = 15 * 1024 * 1024;
const unavailable = () => NextResponse.json({ error: "Document unavailable" }, {
  status: 404, headers: { "Cache-Control": "no-store" },
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await resolveOrganizationContext();
  if (!context || context.role !== "owner" || !isOrganizationEntitlementActive(context.entitlement)) return unavailable();
  const { id } = await params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return unavailable();

  // Do not rely on a cached session/JWT or on a previously signed bearer URL:
  // membership, row-level policy and Storage policy are checked at download.
  const { data: member, error: membershipError } = await context.supabase
    .from("organization_members").select("user_id")
    .eq("organization_id", context.organizationId)
    .eq("user_id", context.user.id)
    .eq("membership_status", "active")
    .eq("role", "owner").maybeSingle();
  if (membershipError || !member) return unavailable();

  const { data: doc, error } = await context.supabase
    .from("company_knowledge")
    .select("id,storage_path,source_filename,mime_type,file_size_bytes")
    .eq("organization_id", context.organizationId)
    .eq("source_type", "file")
    .eq("id", id).maybeSingle();
  if (error || !doc || !doc.storage_path || !isOrganizationStoragePath(context.organizationId, doc.storage_path)) return unavailable();

  // Membership and caller-scoped metadata RLS were checked above on THIS request.
  // Storage authenticated downloads may be served from CDN after revocation;
  // use privileged transport only after the fresh authorization checks.
  const transport = createServerSupabaseClient();
  if (!transport) return unavailable();
  const { data: file, error: downloadError } = await transport.storage
    .from("company-knowledge").download(doc.storage_path);
  if (downloadError || !file || !file.size || file.size > MAX) return unavailable();
  if (doc.file_size_bytes != null && Number(doc.file_size_bytes) !== file.size) return unavailable();

  const filename = String(doc.source_filename || "company-document").slice(0, 220);
  const mime = String(doc.mime_type || "");
  const sample = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  if (!privateFileNameMatchesMime(filename, mime) || !privateFileContentMatchesMime(sample, mime)) return unavailable();

  return new Response(file.stream(), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
