import { NextResponse } from "next/server";
import { resolveOrganizationContext } from "@/lib/auth/organization-context";
import { canCrm } from "@/lib/crm/access";
import { isProjectDocumentStoragePath, privateFileContentMatchesMime, privateFileNameMatchesMime } from "@/lib/security/private-file-validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logPrivateFileAccess } from "@/lib/security/private-file-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const unavailable = (status = 404) => NextResponse.json(
  { error: "Document unavailable" },
  { status, headers: { "Cache-Control": "no-store" } },
);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await resolveOrganizationContext();
  if (!context) return unavailable(401);

  const { id } = await params;
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) return unavailable();
  const denied = async (reason: "not_found" | "forbidden" | "invalid_file") => {
    // Denial logs only the invoking user's own organization and opaque input id.
    await logPrivateFileAccess({ organizationId: context.organizationId, userId: context.user.id,
      documentId: id, resource: "crm_document", outcome: "denied", reason });
    return unavailable();
  };

  // Caller-scoped RLS must authorize metadata before any privileged file access.
  const { data: doc, error } = await context.supabase.from("project_documents")
    .select("id,organization_id,file_name,mime_type,byte_size,storage_path,confidentiality,contract_id,project_id")
    .eq("organization_id", context.organizationId)
    .eq("id", id).maybeSingle();
  if (error || !doc || doc.organization_id !== context.organizationId) return denied("not_found");

  if (!isProjectDocumentStoragePath({
    organizationId: context.organizationId,
    projectId: doc.project_id,
    contractId: doc.contract_id,
    storagePath: doc.storage_path,
  })) return denied("forbidden");

  if (!doc.mime_type || !privateFileNameMatchesMime(doc.file_name, doc.mime_type)) return denied("invalid_file");

  if (doc.confidentiality !== "operational") {
    const resourceType = doc.contract_id ? "contract" : "project";
    const resourceId = doc.contract_id || doc.project_id;
    if (!resourceId || !await canCrm(
      context.supabase, context.organizationId, `${doc.confidentiality}.read`, resourceType, resourceId,
    )) return denied("forbidden");

    const { error: auditError } = await context.supabase.rpc("crm_log_sensitive_access", {
      p_organization_id: context.organizationId,
      p_domain: doc.confidentiality,
      p_resource_type: resourceType,
      p_resource_id: resourceId,
    });
    if (auditError) return unavailable(503);
  }

  // Service role is a storage transport ONLY. The organization+document/path
  // boundary and current capability have already been checked on this request.
  const service = createServerSupabaseClient();
  if (!service) return unavailable(503);
  const { data: file, error: downloadError } = await service.storage.from("project-files").download(doc.storage_path);
  if (downloadError || !file || file.size <= 0 || file.size > 50 * 1024 * 1024) return denied("invalid_file");

  if (doc.byte_size != null && Number(doc.byte_size) !== file.size) return denied("invalid_file");
  const sample = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  if (!privateFileContentMatchesMime(sample, doc.mime_type)) return denied("invalid_file");

  if (!await logPrivateFileAccess({ organizationId: context.organizationId, userId: context.user.id,
    documentId: id, resource: "crm_document", outcome: "granted", reason: "authorized" })) return unavailable(503);

  return new Response(file.stream(), {
    headers: {
      "Content-Type": doc.mime_type,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
