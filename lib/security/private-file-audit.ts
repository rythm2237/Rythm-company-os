import { createServerSupabaseClient } from "@/lib/supabase/server";

type FileAudit = {
  organizationId: string;
  userId: string;
  documentId: string;
  resource: "crm_document" | "company_library_document";
  outcome: "granted" | "denied";
  reason: "authorized" | "not_found" | "membership" | "forbidden" | "invalid_file";
};

/** Immutable, minimal audit record; no storage keys, signed URLs, or bytes. */
export async function logPrivateFileAccess(input: FileAudit): Promise<boolean> {
  try {
    const service = createServerSupabaseClient();
    if (!service) return false;
    const { error } = await service.from("audit_events").insert({
      organization_id: input.organizationId,
      actor_type: "user",
      actor_user_id: input.userId,
      event_type: input.outcome === "granted" ? "private_file.access_granted" : "private_file.access_denied",
      object_type: input.resource,
      object_id: input.documentId,
      risk_level: input.outcome === "granted" ? "low" : "medium",
      payload: { outcome: input.outcome, reason: input.reason, audit_version: "w05-v1" },
    });
    return !error;
  } catch {
    return false;
  }
}
